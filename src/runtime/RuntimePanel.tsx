import Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProject } from "../types/game";
import { AdventureScene } from "./AdventureScene";
import { getPlayerCombatStats, type RuntimeCombatHudState } from "./combat";
import type { RuntimeDebugEvent } from "./debugLog";
import {
	createGameSave,
	type GameSave,
	loadGameSave,
	storeGameSave,
} from "./gameSave";
import { InventoryPanel } from "./InventoryPanel";
import {
	QuestObjectiveTracker,
	useQuestPresentation,
} from "./QuestPresentation";
import type { QuestView } from "./questEngine";
import { getCurrencyHudEntries } from "./runtimeHud";
import type { RuntimeSessionState } from "./runtimeSession";
import type { RuntimeShopPanelState } from "./shopRuntime";
import { ThreeRuntimePanel } from "./three/ThreeRuntimePanel";
import {
	InventoryNotifications,
	useInventoryPresentation,
} from "./useInventoryPresentation";

const RUNTIME_SCREEN_WIDTH = 640;
const RUNTIME_SCREEN_HEIGHT = 480;

type RuntimePanelProps = {
	initialMode?: "2d" | "3d";
	project: GameProject;
	onClose: () => void;
};

export function RuntimePanel(props: RuntimePanelProps) {
	const [entry, setEntry] = useState(() => {
		try {
			const save = loadGameSave(props.project, localStorage);
			return { save, choosing: !!save, error: "" };
		} catch (error) {
			return {
				save: null,
				choosing: true,
				error:
					error instanceof Error ? error.message : "Could not read save game.",
			};
		}
	});
	const [continued, setContinued] = useState<GameSave | undefined>();
	if (entry.choosing)
		return (
			<section className="runtime-panel">
				<div className="runtime-toolbar">
					<strong>{props.project.metadata.name}</strong>
					<button type="button" onClick={props.onClose}>
						Back to Edit
					</button>
				</div>
				<div className="runtime-entry">
					<h2>Ready to play</h2>
					{entry.error && <p role="alert">{entry.error}</p>}
					{entry.save && (
						<button
							type="button"
							onClick={() => {
								setContinued(entry.save!);
								setEntry({ ...entry, choosing: false });
							}}
						>
							Continue
						</button>
					)}
					<button
						type="button"
						onClick={() => {
							setContinued(undefined);
							setEntry({ ...entry, choosing: false });
						}}
					>
						New Game
					</button>
					<p>
						New Game keeps your previous save. Save Game will ask before
						replacing it.
					</p>
				</div>
			</section>
		);
	return (
		<RuntimePlayPanel
			{...props}
			initialSave={continued}
			protectPreviousSave={!continued && (!!entry.save || !!entry.error)}
		/>
	);
}

function RuntimePlayPanel({
	project,
	onClose,
	initialMode = "2d",
	initialSave,
	protectPreviousSave,
}: RuntimePanelProps & {
	initialSave?: GameSave;
	protectPreviousSave: boolean;
}) {
	const [resumeSave, setResumeSave] = useState(initialSave);
	const [protectSave, setProtectSave] = useState(protectPreviousSave);
	const [saveMessage, setSaveMessage] = useState("");
	const [replacePending, setReplacePending] = useState(false);
	const saveSessionRef = useRef<(() => RuntimeSessionState) | null>(null);
	function saveGame(replace = false) {
		try {
			const session = saveSessionRef.current?.();
			if (!session) throw new Error("Game is still starting.");
			if (protectSave && !replace) {
				setReplacePending(true);
				return;
			}
			storeGameSave(project, createGameSave(project, session), localStorage);
			setProtectSave(false);
			setReplacePending(false);
			setSaveMessage("Game saved.");
		} catch (error) {
			setSaveMessage(
				error instanceof Error ? error.message : "Could not save game.",
			);
		}
	}
	function restartGame() {
		setResumeSave(undefined);
		setProtectSave(true);
		setSaveMessage("");
		setRuntimeKey((key) => key + 1);
	}
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<AdventureScene | null>(null);
	const [playMode, setPlayMode] = useState<"2d" | "3d">(initialMode);
	const {
		inventory,
		updateInventory: setInventory,
		resetInventory,
		showItemFeedback,
		notices,
	} = useInventoryPresentation(project.gameState.inventory);
	const [isInventoryOpen, setIsInventoryOpen] = useState(false);
	const inventoryOpenRef = useRef(false);
	const { quests, setQuests, resetQuests } =
		useQuestPresentation(showItemFeedback);
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

	const toggleInventory = useCallback(() => {
		const next = !inventoryOpenRef.current;
		if (!sceneRef.current?.setInventoryOpen(next)) return;
		inventoryOpenRef.current = next;
		setIsInventoryOpen(next);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				playMode !== "2d" ||
				event.repeat ||
				event.defaultPrevented ||
				(event.target instanceof HTMLElement &&
					/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))
			)
				return;
			if (event.key.toLowerCase() === "i") {
				event.preventDefault();
				toggleInventory();
			}
			if (event.key.toLowerCase() === "j") {
				setIsQuestPanelOpen((isOpen) => !isOpen);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [playMode, toggleInventory]);

	useEffect(() => {
		// Restart signal for Phaser sessions.
		void runtimeKey;
		if (!containerRef.current || playMode !== "2d") {
			return undefined;
		}
		void runtimeKey;

		resetInventory(
			resumeSave?.state.inventory ?? project.gameState.inventory ?? {},
		);
		inventoryOpenRef.current = false;
		setIsInventoryOpen(false);
		resetQuests([]);
		setShopState(null);
		setDebugEvents([]);
		setCombat({
			playerHealth: initialCombat.health,
			playerMaxHealth: initialCombat.maxHealth,
			gameOver: false,
		});

		let restoringQuests = !!resumeSave;
		const presentQuests = (next: QuestView[]) => {
			if (restoringQuests) {
				resetQuests(next);
				restoringQuests = false;
			} else setQuests(next);
		};
		const scene = new AdventureScene(
			project,
			setInventory,
			presentQuests,
			setShopState,
			setCombat,
			setDebugEvents,
			showItemFeedback,
			resumeSave,
		);
		sceneRef.current = scene;
		saveSessionRef.current = () => scene.getSaveSession();
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
			saveSessionRef.current = null;
		};
	}, [
		initialCombat.health,
		initialCombat.maxHealth,
		playMode,
		project,
		runtimeKey,
		resumeSave,
		resetInventory,
		resetQuests,
		setInventory,
		setQuests,
		showItemFeedback,
	]);

	const currencyHudEntries = getCurrencyHudEntries(project, inventory);
	const activeQuests = quests.filter((quest) => quest.status === "active");
	const completedQuests = quests.filter(
		(quest) => quest.status === "completed",
	);
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
			<div className="runtime-toolbar-shell">
				<div className="runtime-toolbar">
					<div>
						<strong className="play-mode-badge">Playing</strong>
						<span>{project.metadata.name}</span>
					</div>
					<div className="runtime-mode-selector">
						<button
							className={playMode === "2d" ? "selected" : ""}
							onClick={() => {
								if (playMode !== "2d") {
									setPlayMode("2d");
									setProtectSave(true);
									setSaveMessage("");
								}
							}}
							type="button"
						>
							Play 2D
						</button>
						<button
							className={playMode === "3d" ? "selected" : ""}
							onClick={() => {
								if (playMode !== "3d") {
									setPlayMode("3d");
									setProtectSave(true);
									setSaveMessage("");
								}
							}}
							type="button"
						>
							Play 3D Experimental
						</button>
					</div>
					<button type="button" onClick={() => saveGame()}>
						Save Game
					</button>
					<button onClick={onClose} type="button">
						Back to Edit
					</button>
				</div>
				<div className="runtime-save-status" role="status">
					{saveMessage}
				</div>
				{replacePending && (
					<div
						role="dialog"
						aria-label="Replace saved game"
						className="runtime-save-confirm"
					>
						<p>Replace your previous saved progress with this game?</p>
						<button type="button" onClick={() => saveGame(true)}>
							Replace save
						</button>
						<button type="button" onClick={() => setReplacePending(false)}>
							Cancel
						</button>
					</div>
				)}
			</div>
			<div className="runtime-stage">
				{playMode === "3d" ? (
					<ThreeRuntimePanel
						key={runtimeKey}
						onRestart={restartGame}
						initialSave={resumeSave}
						saveSessionRef={saveSessionRef}
						project={project}
					/>
				) : (
					<>
						<div className="phaser-host" ref={containerRef} />
						<div className="inventory-hud">
							<button type="button" onClick={toggleInventory}>
								Inventory <kbd>I</kbd>
							</button>
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
								onClick={restartGame}
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
						<QuestObjectiveTracker project={project} quests={quests} />
						<InventoryNotifications items={project.items} notices={notices} />
						{isInventoryOpen && (
							<InventoryPanel
								items={project.items}
								inventory={inventory}
								onClose={toggleInventory}
							/>
						)}
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
													onClick={() =>
														sceneRef.current?.buyShopEntry(entry.id)
													}
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
					</>
				)}
			</div>
		</section>
	);
}
