import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InventoryPanel } from "../runtime/InventoryPanel";
import {
	InventoryNotifications,
	useInventoryPresentation,
} from "../runtime/useInventoryPresentation";
import type { ItemDefinition } from "../types/game";

const items: ItemDefinition[] = [
	{
		id: "key",
		name: "Harbour Key",
		category: "key",
		description: "Opens the harbour shack.",
		stackable: false,
	},
	{
		id: "rope",
		name: "Rope",
		category: "misc",
		stackable: true,
		maxStack: 9,
		iconId: "missing-legacy-icon",
	},
];
afterEach(() => vi.useRealTimers());

it("shows an empty state and closes with Escape, restoring focus", () => {
	const close = vi.fn();
	const trigger = document.createElement("button");
	document.body.append(trigger);
	trigger.focus();
	const view = render(
		<InventoryPanel items={items} inventory={{ key: 0 }} onClose={close} />,
	);
	expect(screen.getByText(/Your inventory is empty/)).toBeVisible();
	expect(screen.queryByText("Harbour Key")).not.toBeInTheDocument();
	fireEvent.keyDown(window, { key: "Escape" });
	expect(close).toHaveBeenCalledOnce();
	view.unmount();
	expect(trigger).toHaveFocus();
	trigger.remove();
});

it("inspects names, quantities and descriptions, selects by keyboard, and never exposes missing ids", () => {
	const view = render(
		<InventoryPanel
			items={items}
			inventory={{ key: 1, rope: 2, private_id: 1 }}
			onClose={() => {}}
		/>,
	);
	const details = screen.getByRole("region", { name: "Item details" });
	expect(details).toHaveTextContent("Harbour Key");
	expect(details).toHaveTextContent("Key Item");
	expect(details).toHaveTextContent("Opens the harbour shack.");
	fireEvent.keyDown(window, { key: "ArrowDown" });
	fireEvent.keyDown(window, { key: "ArrowDown" });
	expect(screen.getByRole("button", { name: /Rope/ })).toHaveFocus();
	expect(details).toHaveTextContent("General");
	view.rerender(
		<InventoryPanel items={items} inventory={{ rope: 3 }} onClose={() => {}} />,
	);
	expect(screen.getByRole("button", { name: "Rope ×3" })).toBeVisible();
	expect(within(details).getByText("3")).toBeVisible();
	expect(screen.queryByText("private_id")).not.toBeInTheDocument();
});

it("isolates keyboard input and keeps focus inside inventory", () => {
	const gameplay = vi.fn();
	window.addEventListener("keydown", gameplay);
	const close = vi.fn();
	const view = render(
		<InventoryPanel items={items} inventory={{ key: 1 }} onClose={close} />,
	);
	fireEvent.keyDown(window, { key: "e" });
	fireEvent.keyDown(window, { key: "ArrowUp" });
	expect(gameplay).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "Tab" });
	expect(screen.getByRole("button", { name: /Close/ })).toHaveFocus();
	fireEvent.keyDown(window, { key: "i", repeat: true });
	expect(close).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "i" });
	expect(close).toHaveBeenCalledOnce();
	view.unmount();
	window.removeEventListener("keydown", gameplay);
});

it("queues actual acquisitions and removals, merges rapid changes, and expires without announcing defaults or duplicate snapshots", () => {
	vi.useFakeTimers();
	const { result } = renderHook(() => useInventoryPresentation({ rope: 2 }));
	expect(result.current.notices).toEqual([]);
	act(() => {
		result.current.updateInventory({ rope: 2, key: 1 });
		result.current.updateInventory({ rope: 2, key: 1 });
		result.current.updateInventory({ rope: 3, key: 1 });
		result.current.updateInventory({ rope: 5, key: 1 });
	});
	expect(result.current.notices).toHaveLength(2);
	const view = render(
		<InventoryNotifications items={items} notices={result.current.notices} />,
	);
	expect(screen.getByRole("status")).toHaveTextContent("Harbour Key acquired");
	expect(screen.getByRole("status")).toHaveTextContent("Rope ×3 acquired");
	act(() => result.current.updateInventory({ rope: 5 }));
	view.rerender(
		<InventoryNotifications items={items} notices={result.current.notices} />,
	);
	expect(screen.getByRole("status")).toHaveTextContent("Harbour Key removed");
	act(() => vi.advanceTimersByTime(4500));
	expect(result.current.notices).toHaveLength(2);
	act(() => result.current.resetInventory({ rope: 2 }));
	expect(result.current.inventory).toEqual({ rope: 2 });
	expect(result.current.notices).toEqual([]);
});
