import { useEffect, useRef, useState } from "react";
import type { ItemDefinition } from "../types/game";
import { itemCategoryLabels, itemIcon } from "./itemPresentation";

export function InventoryPanel({
	items,
	inventory,
	onClose,
	equippedWeaponId,
	onEquipWeapon,
}: {
	items: ItemDefinition[];
	inventory: Record<string, number>;
	onClose: () => void;
	equippedWeaponId?: string;
	onEquipWeapon?: (itemId: string | undefined) => void;
}) {
	const panelRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	const [selectedId, setSelectedId] = useState<string>();
	const entries = Object.entries(inventory).filter(
		([, quantity]) => quantity > 0,
	);
	const selected = entries.find(([id]) => id === selectedId) ?? entries[0];
	const item = items.find((definition) => definition.id === selected?.[0]);

	useEffect(() => {
		const previousFocus = document.activeElement;
		panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
		const handleKey = (event: KeyboardEvent) => {
			// Capture before either renderer's gameplay listeners; native buttons keep
			// Enter/Space and Tab, while held movement cannot leak into the scene.
			event.stopImmediatePropagation();
			if (["Escape", "i", "I"].includes(event.key)) {
				event.preventDefault();
				if (!event.repeat) closeRef.current();
			} else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
				event.preventDefault();
				const rows = [
					...(panelRef.current?.querySelectorAll<HTMLButtonElement>(
						".inventory-item",
					) ?? []),
				];
				const index = rows.indexOf(document.activeElement as HTMLButtonElement);
				const next =
					event.key === "Home"
						? 0
						: event.key === "End"
							? rows.length - 1
							: (index + (event.key === "ArrowUp" ? -1 : 1) + rows.length) %
								rows.length;
				rows[next]?.focus();
			} else if (event.key === "Tab") {
				const buttons = [
					...(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
						[]),
				];
				const first = buttons[0],
					last = buttons[buttons.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			} else if (
				["w", "a", "s", "d", "e", "arrowleft", "arrowright"].includes(
					event.key.toLowerCase(),
				)
			) {
				event.preventDefault();
			}
		};
		window.addEventListener("keydown", handleKey, true);
		return () => {
			window.removeEventListener("keydown", handleKey, true);
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
				previousFocus.focus();
		};
	}, []);

	return (
		<div className="inventory-backdrop">
			<dialog
				open
				aria-label="Inventory"
				aria-modal="true"
				className="item-inventory-panel"
				ref={panelRef}
			>
				<div className="inventory-heading">
					<h2>Inventory</h2>
					<button type="button" onClick={onClose}>
						Close <kbd>Esc</kbd>
					</button>
				</div>
				{selected ? (
					<div className="inventory-content">
						<div className="inventory-item-list">
							{entries.map(([id, quantity]) => {
								const definition = items.find((entry) => entry.id === id);
								return (
									<button
										type="button"
										key={id}
										className={`inventory-item ${id === selected[0] ? "selected" : ""}`}
										aria-label={`${definition?.name || "Unknown item"} ×${quantity}`}
										aria-pressed={id === selected[0]}
										onFocus={() => setSelectedId(id)}
										onClick={() => setSelectedId(id)}
									>
										<span className="item-icon" aria-hidden="true">
											{itemIcon(definition)}
										</span>
										<span>{definition?.name || "Unknown item"}</span>
										<strong>×{quantity}</strong>
									</button>
								);
							})}
						</div>
						<section className="inventory-inspection" aria-label="Item details">
							<span className="item-icon" aria-hidden="true">
								{itemIcon(item)}
							</span>
							<h3>{item?.name || "Unknown item"}</h3>
							<span className="inventory-category">
								{item ? itemCategoryLabels[item.category] : "General"}
							</span>
							<p>{item?.description || "No description provided."}</p>
							{item?.weapon && onEquipWeapon && (
								<div>
									<p>
										{equippedWeaponId === item.id ? "Equipped" : "Unequipped"}
									</p>
									<button
										type="button"
										onClick={() =>
											onEquipWeapon(
												equippedWeaponId === item.id ? undefined : item.id,
											)
										}
									>
										{equippedWeaponId === item.id ? "Unequip" : "Equip"}
									</button>
								</div>
							)}
							<dl>
								<dt>Quantity</dt>
								<dd>{selected[1]}</dd>
								<dt>Stack limit</dt>
								<dd>
									{item?.stackable === false
										? 1
										: (item?.maxStack ?? "Unlimited")}
								</dd>
							</dl>
						</section>
					</div>
				) : (
					<p className="inventory-empty">
						Your inventory is empty. Items you collect will appear here.
					</p>
				)}
				<p className="inventory-help">
					↑ ↓ Select · Tab Move focus · I / Esc Close
				</p>
			</dialog>
		</div>
	);
}
