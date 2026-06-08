import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import type { GameProject } from "../types/game";
import { AdventureScene } from "./AdventureScene";
import { getPlayerCombatStats, type RuntimeCombatHudState } from "./combat";
import type { RuntimeDebugEvent } from "./debugLog";
import type { QuestView } from "./questEngine";
import { getCurrencyHudEntries, getQuestTrackerState } from "./runtimeHud";
import type { RuntimeShopPanelState } from "./shopRuntime";

const RUNTIME_SCREEN_WIDTH = 640;
const RUNTIME_SCREEN_HEIGHT = 480;

type RuntimePanelProps = {
	project: GameProject;
	onClose: () => void;
};

export function RuntimePanel({ project, onClose }: RuntimePanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<AdventureScene | null>(null);
	const [inventory, setInventory] = useState<Record<string, number>>({});
	const [isInventoryOpen, setIsInventoryOpen] = useState(false);
	const [quests, setQuests] = useState<QuestView[]>([]);
	const [isQuestPanelOpen, setIsQuestPanelOpen] = useState(false);
	const [shopState, setShopState] = useState<RuntimeShopPanelState | null>(
		null,
	);
	const [debugEvents, setDebugEvents] = useState<RuntimeDebugEvent[]>([]);
	const [runtimeKey, setRuntimeKey] = useState(0);
	const initialCombat = getPlayerCombatStats(project.player);
	const [combat, setCombat] = useState<RuntimeCombatHudState>({
		playerHealth: initialCombat.health,
		playerMaxHealth: initialCombat.maxHealth,
		gameOver: false,
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "i") {
				setIsInventoryOpen((isOpen) => !isOpen);
			}
			if (event.key.toLowerCase() === "j") {
				setIsQuestPanelOpen((isOpen) => !isOpen);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		if (!containerRef.current) {
			return undefined;
		}
		void runtimeKey;

		setInventory({});
		setQuests([]);
		setShopState(null);
		setDebugEvents([]);
		setCombat({
			playerHealth: initialCombat.health,
			playerMaxHealth: initialCombat.maxHealth,
			gameOver: false,
		});

		const scene = new AdventureScene(
			project,
			setInventory,
			setQuests,
			setShopState,
			setCombat,
			setDebugEvents,
		);
		sceneRef.current = scene;
		const game = new Phaser.Game({
			type: Phaser.AUTO,
			parent: containerRef.current,
			width: RUNTIME_SCREEN_WIDTH,
			height: RUNTIME_SCREEN_HEIGHT,
			backgroundColor: "#111827",
			scene: [scene],
			scale: {
				mode: Phaser.Scale.FIT,
				autoCenter: Phaser.Scale.CENTER_BOTH,
			},
		});

		return () => {
			game.destroy(true);
			sceneRef.current = null;
		};
	}, [initialCombat.health, initialCombat.maxHealth, project, runtimeKey]);

	const inventoryItems = Object.entries(inventory)
		.filter(([, quantity]) => quantity > 0)
		.map(([itemId, quantity]) => ({
			item: project.items.find((candidate) => candidate.id === itemId),
			itemId,
			quantity,
		}));
	const currencyHudEntries = getCurrencyHudEntries(project, inventory);
	const activeQuests = quests.filter((quest) => quest.status === "active");
	const completedQuests = quests.filter(
		(quest) => quest.status === "completed",
	);
	const questTracker = getQuestTrackerState(project, quests);
	const activeShop = shopState
		? project.shops.find((shop) => shop.id === shopState.shopId)
		: undefined;
	const shopCurrency = activeShop
		? project.items.find((item) => item.id === activeShop.currencyItemId)
		: undefined;

	function renderQuest(quest: QuestView) {
		return (
			<div className="quest-runtime-entry" key={quest.id}>
				<strong>{quest.name}</strong>
				{quest.description ? <p>{quest.description}</p> : null}
				<div className="quest-runtime-objectives">
					{quest.objectives.map((objective) => (
						<span key={objective.id}>
							[{objective.complete ? "x" : " "}] {objective.description}
						</span>
					))}
				</div>
			</div>
		);
	}

	return (
		<section className="runtime-panel">
			<div className="runtime-toolbar">
				<div>
					<strong>Play Test</strong>
					<span>{project.metadata.name}</span>
				</div>
				<button onClick={onClose} type="button">
					Back to editor
				</button>
			</div>
			<div className="runtime-stage">
				<div className="phaser-host" ref={containerRef} />
				<div className="inventory-hud">
					{currencyHudEntries.length > 0 ? (
						currencyHudEntries.map((entry) => (
							<span key={entry.id}>
								{entry.name}: {entry.quantity}
							</span>
						))
					) : (
						<span>Currency: none</span>
					)}
				</div>
				<div className="combat-hud">
					<strong>
						Health {combat.playerHealth}/{combat.playerMaxHealth}
					</strong>
					{combat.recentEnemy ? (
						<span>
							{combat.recentEnemy.name} {combat.recentEnemy.health}/
							{combat.recentEnemy.maxHealth}
						</span>
					) : (
						<span>Space: attack</span>
					)}
				</div>
				{combat.gameOver ? (
					<button
						className="runtime-restart-button"
						onClick={() => setRuntimeKey((key) => key + 1)}
						type="button"
					>
						Restart
					</button>
				) : null}
				<details className="runtime-debug-log">
					<summary>Flow Log ({debugEvents.length})</summary>
					<div className="runtime-debug-events">
						{debugEvents.length > 0 ? (
							debugEvents.map((event) => (
								<div className="runtime-debug-event" key={event.id}>
									{event.message}
								</div>
							))
						) : (
							<p>No events yet.</p>
						)}
					</div>
				</details>
				{questTracker.kind === "quest" ? (
					<aside className="quest-tracker">
						<span>{questTracker.label}</span>
						{renderQuest(questTracker.quest)}
					</aside>
				) : (
					<aside className="quest-tracker empty">
						<span>{questTracker.label}</span>
						<strong>{questTracker.title}</strong>
						<p>{questTracker.message}</p>
					</aside>
				)}
				{isInventoryOpen ? (
					<aside className="inventory-panel">
						<div className="inventory-heading">
							<strong>Inventory</strong>
							<span>Press I to close</span>
						</div>
						{inventoryItems.length > 0 ? (
							<div className="inventory-list">
								{inventoryItems.map(({ item, itemId, quantity }) => (
									<div className="inventory-row" key={itemId}>
										<span>{item?.name ?? itemId}</span>
										<strong>x{quantity}</strong>
									</div>
								))}
							</div>
						) : (
							<p className="inventory-empty">No items collected.</p>
						)}
					</aside>
				) : null}
				{isQuestPanelOpen ? (
					<aside className="quest-panel">
						<div className="inventory-heading">
							<strong>Quests</strong>
							<span>Press J to close</span>
						</div>
						<div className="quest-runtime-section">
							<strong>Active Quests</strong>
							{activeQuests.length > 0 ? (
								activeQuests.map(renderQuest)
							) : (
								<p>No active quests.</p>
							)}
						</div>
						<div className="quest-runtime-section">
							<strong>Completed Quests</strong>
							{completedQuests.length > 0 ? (
								completedQuests.map(renderQuest)
							) : (
								<p>No completed quests.</p>
							)}
						</div>
					</aside>
				) : null}
				{activeShop && shopState ? (
					<aside className="shop-panel">
						<div className="inventory-heading">
							<strong>{activeShop.name}</strong>
							<button
								onClick={() => sceneRef.current?.closeShop()}
								type="button"
							>
								Close
							</button>
						</div>
						<p className="shop-currency">
							{shopCurrency?.name ?? activeShop.currencyItemId}:{" "}
							{inventory[activeShop.currencyItemId] ?? 0}
						</p>
						{shopState.message ? (
							<p className="validation-message">{shopState.message}</p>
						) : null}
						<div className="inventory-list">
							{activeShop.entries.map((entry) => {
								const item = project.items.find(
									(candidate) => candidate.id === entry.itemId,
								);
								const stock =
									entry.stock === undefined
										? undefined
										: (shopState.stockByEntryId[entry.id] ?? 0);
								const disabled = stock !== undefined && stock <= 0;
								return (
									<div className="shop-row" key={entry.id}>
										<span>
											<strong>{item?.name ?? entry.itemId}</strong>
											<small>
												Price: {entry.buyPrice}
												{stock !== undefined ? ` | Stock: ${stock}` : ""}
											</small>
										</span>
										<button
											disabled={disabled}
											onClick={() => sceneRef.current?.buyShopEntry(entry.id)}
											type="button"
										>
											Buy
										</button>
									</div>
								);
							})}
							{activeShop.entries.length === 0 ? (
								<p className="inventory-empty">No shop entries.</p>
							) : null}
						</div>
					</aside>
				) : null}
			</div>
		</section>
	);
}
