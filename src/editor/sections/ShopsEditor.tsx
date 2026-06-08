import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameAction, ShopDefinition } from "../../types/game";

function makeId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	}

	return `${prefix}_${Date.now().toString(36)}`;
}

function actionReferencesShop(action: GameAction, shopId: string): boolean {
	return action.type === "open_shop" && action.shopId === shopId;
}

export function isShopReferenced(
	rules: { actions: GameAction[]; elseActions?: GameAction[] }[],
	shopId: string,
): boolean {
	return rules.some((rule) =>
		[...rule.actions, ...(rule.elseActions ?? [])].some((action) =>
			actionReferencesShop(action, shopId),
		),
	);
}

export function ShopsEditor() {
	const project = useProjectStore((state) => state.project);
	const updateProject = useProjectStore((state) => state.updateProject);
	const [selectedShopId, setSelectedShopId] = useState(
		project.shops[0]?.id ?? "",
	);
	const [message, setMessage] = useState("");
	const selectedShop = project.shops.find((shop) => shop.id === selectedShopId);

	useEffect(() => {
		if (!selectedShop) {
			setSelectedShopId(project.shops[0]?.id ?? "");
		}
	}, [project.shops, selectedShop]);

	function updateShop(patch: Partial<ShopDefinition>) {
		if (!selectedShop) {
			return;
		}

		updateProject((draft) => {
			draft.shops = draft.shops.map((shop) =>
				shop.id === selectedShop.id ? { ...shop, ...patch } : shop,
			);
		});
	}

	function addShop() {
		const id = makeId("shop");
		updateProject((draft) => {
			draft.shops.push({
				id,
				name: `Shop ${draft.shops.length + 1}`,
				currencyItemId: draft.items[0]?.id ?? "",
				entries: [],
			});
		});
		setSelectedShopId(id);
		setMessage("");
	}

	function deleteShop() {
		if (!selectedShop) {
			return;
		}

		if (isShopReferenced(project.rules, selectedShop.id)) {
			setMessage(
				`${selectedShop.name} is still referenced by a rule. Remove that reference first.`,
			);
			return;
		}

		if (!window.confirm(`Delete shop "${selectedShop.name}"?`)) {
			return;
		}

		updateProject((draft) => {
			draft.shops = draft.shops.filter((shop) => shop.id !== selectedShop.id);
		});
		setMessage("");
	}

	function addEntry() {
		if (!selectedShop) {
			return;
		}

		updateShop({
			entries: [
				...selectedShop.entries,
				{
					id: makeId("shop_entry"),
					itemId: project.items[0]?.id ?? "",
					buyPrice: 1,
				},
			],
		});
	}

	function updateEntry(
		entryId: string,
		patch: Partial<ShopDefinition["entries"][number]>,
	) {
		if (!selectedShop) {
			return;
		}

		updateShop({
			entries: selectedShop.entries.map((entry) =>
				entry.id === entryId ? { ...entry, ...patch } : entry,
			),
		});
	}

	function deleteEntry(entryId: string) {
		if (!selectedShop) {
			return;
		}

		updateShop({
			entries: selectedShop.entries.filter((entry) => entry.id !== entryId),
		});
	}

	return (
		<section className="editor-panel items-editor">
			<aside className="tool-panel">
				<div className="panel-title">Shops</div>
				<p className="helper-text">
					Simple buy-only shops opened by friendly rules.
				</p>
				<button
					className="primary-button full-width"
					onClick={addShop}
					type="button"
				>
					Add shop
				</button>
				<div className="list-stack item-list">
					{project.shops.map((shop) => (
						<button
							className={`list-item ${shop.id === selectedShopId ? "selected" : ""}`}
							key={shop.id}
							onClick={() => {
								setSelectedShopId(shop.id);
								setMessage("");
							}}
							type="button"
						>
							<span className="item-icon">
								{shop.name.slice(0, 1).toUpperCase()}
							</span>
							<span>
								<strong>{shop.name}</strong>
								<small>
									{project.items.find((item) => item.id === shop.currencyItemId)
										?.name ?? "No currency"}
								</small>
							</span>
						</button>
					))}
					{project.shops.length === 0 ? (
						<p className="empty-state compact">No shops defined.</p>
					) : null}
				</div>
			</aside>

			<div className="content-panel">
				{selectedShop ? (
					<>
						<div className="panel-title">Shop Definition</div>
						<p className="helper-text">
							Shops use inventory currency items, not Game State variables.
							Runtime stock is copied per play session.
						</p>
						{message ? (
							<div className="validation-message">{message}</div>
						) : null}
						<div className="form-grid">
							<label>
								ID
								<input disabled value={selectedShop.id} />
							</label>
							<label>
								Name
								<input
									onChange={(event) => updateShop({ name: event.target.value })}
									value={selectedShop.name}
								/>
							</label>
							<label>
								Currency item
								<select
									onChange={(event) =>
										updateShop({ currencyItemId: event.target.value })
									}
									value={selectedShop.currencyItemId}
								>
									{project.items.map((item) => (
										<option key={item.id} value={item.id}>
											{item.name}
										</option>
									))}
								</select>
							</label>
						</div>

						<div className="panel-title secondary">Entries</div>
						<div className="list-stack">
							{selectedShop.entries.map((entry) => (
								<div className="logic-row" key={entry.id}>
									<select
										onChange={(event) =>
											updateEntry(entry.id, { itemId: event.target.value })
										}
										value={entry.itemId}
									>
										{project.items.map((item) => (
											<option key={item.id} value={item.id}>
												{item.name}
											</option>
										))}
									</select>
									<label>
										Price
										<input
											min={0}
											onChange={(event) =>
												updateEntry(entry.id, {
													buyPrice: Math.max(0, Number(event.target.value)),
												})
											}
											type="number"
											value={entry.buyPrice}
										/>
									</label>
									<label>
										Stock
										<input
											min={0}
											onChange={(event) =>
												updateEntry(entry.id, {
													stock:
														event.target.value === ""
															? undefined
															: Math.max(0, Number(event.target.value)),
												})
											}
											placeholder="Unlimited"
											type="number"
											value={entry.stock ?? ""}
										/>
									</label>
									<button
										className="danger-button compact"
										onClick={() => deleteEntry(entry.id)}
										type="button"
									>
										Delete
									</button>
								</div>
							))}
							{selectedShop.entries.length === 0 ? (
								<p className="empty-state compact">No items for sale.</p>
							) : null}
						</div>
						<div className="inline-actions">
							<button onClick={addEntry} type="button">
								Add entry
							</button>
							<button
								className="danger-button"
								onClick={deleteShop}
								type="button"
							>
								Delete shop
							</button>
						</div>
					</>
				) : (
					<p className="empty-state">
						Add a shop to sell inventory items for a currency item.
					</p>
				)}
			</div>
		</section>
	);
}
