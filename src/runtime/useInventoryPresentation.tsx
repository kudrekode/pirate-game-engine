import { useCallback, useEffect, useRef, useState } from "react";
import type { ItemDefinition } from "../types/game";
import { itemIcon } from "./itemPresentation";

type Notice = {
	itemId: string;
	quantity: number;
	direction: "added" | "removed";
	message?: string;
};

// Presentation observes the existing inventory snapshots, including rules and
// quest rewards. No renderer owns a second gameplay inventory or saved state.
export function useInventoryPresentation(
	defaults: Record<string, number> = {},
) {
	const previous = useRef({ ...defaults });
	const [inventory, setInventory] = useState({ ...defaults });
	const [notices, setNotices] = useState<Notice[]>([]);
	const updateInventory = useCallback((next: Record<string, number>) => {
		const changes: Notice[] = [];
		for (const itemId of new Set([
			...Object.keys(previous.current),
			...Object.keys(next),
		])) {
			const delta = (next[itemId] ?? 0) - (previous.current[itemId] ?? 0);
			if (delta)
				changes.push({
					itemId,
					quantity: Math.abs(delta),
					direction: delta > 0 ? "added" : "removed",
				});
		}
		previous.current = { ...next };
		setInventory({ ...next });
		if (changes.length)
			setNotices((pending) => {
				const result = pending.map((notice) => ({ ...notice }));
				for (const change of changes) {
					const existing = result.find(
						(notice) =>
							notice.itemId === change.itemId &&
							notice.direction === change.direction,
					);
					if (existing) existing.quantity += change.quantity;
					else result.push(change);
				}
				return result;
			});
	}, []);
	const resetInventory = useCallback((initial: Record<string, number>) => {
		previous.current = { ...initial };
		setInventory({ ...initial });
		setNotices([]);
	}, []);
	const showItemFeedback = useCallback((message: string) => {
		setNotices((pending) =>
			pending.some((notice) => notice.message === message)
				? pending
				: [
						...pending,
						{ itemId: message, quantity: 0, direction: "added", message },
					],
		);
	}, []);
	const first = notices[0];
	useEffect(() => {
		if (!first) return;
		const timer = window.setTimeout(
			() => setNotices((pending) => pending.slice(1)),
			4500,
		);
		return () => window.clearTimeout(timer);
	}, [first]);
	return {
		inventory,
		updateInventory,
		resetInventory,
		showItemFeedback,
		notices,
	};
}

export function InventoryNotifications({
	items,
	notices,
}: {
	items: ItemDefinition[];
	notices: Notice[];
}) {
	return (
		<div
			className="inventory-notifications"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			{notices.slice(0, 3).map((notice) => {
				if (notice.message)
					return (
						<div className="inventory-notice" key={notice.message}>
							{notice.message}
						</div>
					);
				const item = items.find((entry) => entry.id === notice.itemId);
				return (
					<div
						className="inventory-notice"
						key={`${notice.itemId}-${notice.direction}`}
					>
						<span className="item-icon" aria-hidden="true">
							{itemIcon(item)}
						</span>
						<span>
							{item?.name || "Item"}
							{notice.quantity > 1 ? ` ×${notice.quantity}` : ""}{" "}
							{notice.direction === "added" ? "acquired" : "removed"}
						</span>
					</div>
				);
			})}
		</div>
	);
}
