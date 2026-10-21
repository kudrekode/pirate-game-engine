import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { migrateProject } from "../data/migrateProject";
import { createProjectFromPreset } from "../data/projectPresets";
import { ItemsEditor } from "../editor/sections/ItemsEditor";
import { useProjectStore } from "../store/useProjectStore";

afterEach(() =>
	useProjectStore.getState().setProject(createProjectFromPreset("blank")),
);
it("authors readable item details, icons and a removable stack limit, preserving them on reload", () => {
	act(() =>
		useProjectStore.getState().setProject(createProjectFromPreset("blank")),
	);
	render(<ItemsEditor />);
	fireEvent.click(screen.getByRole("button", { name: "Add item" }));
	expect(screen.queryByLabelText("ID")).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Name"), {
		target: { value: "Harbour Key" },
	});
	fireEvent.change(screen.getByLabelText("Description"), {
		target: { value: "Opens the shack." },
	});
	fireEvent.change(screen.getByLabelText("Category"), {
		target: { value: "key" },
	});
	fireEvent.change(screen.getByLabelText("Icon"), { target: { value: "key" } });
	expect(
		screen.queryByRole("option", { name: "Consumable" }),
	).not.toBeInTheDocument();
	fireEvent.click(screen.getByLabelText("Stackable"));
	fireEvent.change(screen.getByLabelText("Stack limit"), {
		target: { value: "3" },
	});
	expect(useProjectStore.getState().project.items[0].maxStack).toBe(3);
	fireEvent.change(screen.getByLabelText("Stack limit"), {
		target: { value: "" },
	});
	expect(useProjectStore.getState().project.items[0].maxStack).toBeUndefined();
	fireEvent.click(screen.getByLabelText("Stackable"));
	const saved = useProjectStore.getState().project;
	expect(
		migrateProject(JSON.parse(JSON.stringify(saved))).items[0],
	).toMatchObject({
		name: "Harbour Key",
		description: "Opens the shack.",
		category: "key",
		iconId: "key",
		stackable: false,
	});
});
