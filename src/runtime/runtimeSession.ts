import { cloneProject } from "../data/migrateProject";
import type {
	GameArea,
	GameProject,
	MovementMode,
	PlayerCombatStats,
	PlayerVehicleState,
} from "../types/game";
import { getPlayerCombatStats } from "./combat";
import type { NPCMovementState } from "./npcMovement";
import { createRuntimeQuestState, type RuntimeQuestState } from "./questEngine";
import { createRuntimeState, type RuntimeGameState } from "./ruleEngine";
import { createRuntimeShopStocks, type RuntimeShopStocks } from "./shopRuntime";

export type RuntimeGridPosition = { x: number; y: number };

export type RuntimeWaitingTrigger = {
	areaId?: string;
	eventBlockId: string;
};

export type RuntimeNpcMovementTiming = {
	movement: NPCMovementState;
	nextMoveAt: number;
};

export type RuntimeRecentEnemyState = {
	id: string;
	name: string;
	health: number;
	maxHealth: number;
};

export type RuntimeSessionState = {
	project: GameProject;
	currentAreaId: string;
	playerPosition: RuntimeGridPosition;
	playerFacing: RuntimeGridPosition;
	currentMovementMode: Exclude<MovementMode, "swim">;
	playerVehicleState: PlayerVehicleState;
	playerCombat: PlayerCombatStats;
	runtimePlayerHealth: number;
	runtimeState: RuntimeGameState;
	runtimeQuestState: RuntimeQuestState;
	runtimeShopStocks: RuntimeShopStocks;
	progressionIndex: number;
	waitingForTrigger: RuntimeWaitingTrigger | null;
	collectedPickupIds: Set<string>;
	openedObjectIds: Set<string>;
	defeatedNpcIds: Set<string>;
	npcMovementStates: Map<string, RuntimeNpcMovementTiming>;
	enemyOrigins: Map<string, RuntimeGridPosition>;
	enemyContactCooldowns: Map<string, number>;
	activeShopId?: string;
	nextAttackAt: number;
	recentEnemy?: RuntimeRecentEnemyState;
};

export function getInitialRuntimeArea(project: GameProject): GameArea {
	const fallbackArea = project.areas[0];
	if (!fallbackArea) {
		throw new Error("Project must include at least one area.");
	}

	return (
		project.areas.find((area) => area.id === project.activeAreaId) ??
		fallbackArea
	);
}

export function createRuntimeSession(
	project: GameProject,
): RuntimeSessionState {
	const projectSnapshot = cloneProject(project);
	const currentArea = getInitialRuntimeArea(projectSnapshot);
	const playerCombat = getPlayerCombatStats(projectSnapshot.player);

	return {
		project: projectSnapshot,
		currentAreaId: currentArea.id,
		playerPosition: { x: 0, y: 0 },
		playerFacing: { x: 0, y: 1 },
		currentMovementMode: "walk",
		playerVehicleState: { active: false },
		playerCombat,
		runtimePlayerHealth: playerCombat.health,
		runtimeState: createRuntimeState(
			projectSnapshot.gameState,
			projectSnapshot.areas.flatMap((area) => area.npcs),
			projectSnapshot.npcs,
		),
		runtimeQuestState: createRuntimeQuestState(projectSnapshot.quests),
		runtimeShopStocks: createRuntimeShopStocks(projectSnapshot.shops),
		progressionIndex: 0,
		waitingForTrigger: null,
		collectedPickupIds: new Set<string>(),
		openedObjectIds: new Set<string>(),
		defeatedNpcIds: new Set<string>(),
		npcMovementStates: new Map<string, RuntimeNpcMovementTiming>(),
		enemyOrigins: new Map<string, RuntimeGridPosition>(),
		enemyContactCooldowns: new Map<string, number>(),
		nextAttackAt: 0,
	};
}
