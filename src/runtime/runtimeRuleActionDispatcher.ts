import type { MovementMode } from "../types/game";
import {
	activateQuest,
	completeQuest,
	failQuest,
	getQuestViews,
	type QuestView,
	updateQuestProgress,
} from "./questEngine";
import type { RuleActionContext } from "./ruleEngine";
import type { RuntimeSessionState } from "./runtimeSession";

export type RuntimeRuleEvent =
	| { type: "status"; message: string }
	| { type: "flowLog"; message: string }
	| { type: "stateChanged" }
	| { type: "inventoryChanged"; inventory: Record<string, number> }
	| { type: "questsChanged"; quests: QuestView[] }
	| { type: "questRewardsGranted"; questIds: string[] }
	| { type: "shopOpened"; shopId: string; message: string }
	| { type: "cutsceneRequested"; cutsceneId: string; onDone: () => void }
	| { type: "dialogueRequested"; dialogueId: string }
	| { type: "teleportRequested"; areaId: string; eventBlockId: string }
	| { type: "gameEnded" }
	| { type: "gameOver" }
	| {
			type: "movementModeChanged";
			mode: Exclude<MovementMode, "swim">;
	  };

export type RuntimeRuleEventEmitter = (event: RuntimeRuleEvent) => void;

function emitInventoryChanged(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): void {
	emit({
		type: "inventoryChanged",
		inventory: { ...session.runtimeState.inventory.items },
	});
}

function emitQuestsChanged(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): void {
	emit({
		type: "questsChanged",
		quests: getQuestViews(session.runtimeQuestState, session.runtimeState),
	});
}

function emitStateChanged(emit: RuntimeRuleEventEmitter): void {
	emit({ type: "stateChanged" });
	emit({ type: "flowLog", message: "Runtime state changed." });
}

function emitNewQuestRewards(
	beforeRewardedQuestIds: Set<string>,
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): void {
	const questIds = [...session.runtimeQuestState.rewardedQuestIds].filter(
		(questId) => !beforeRewardedQuestIds.has(questId),
	);
	if (questIds.length > 0) {
		emit({ type: "questRewardsGranted", questIds });
	}
}

function syncQuestProgress(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): void {
	const beforeRewardedQuestIds = new Set(
		session.runtimeQuestState.rewardedQuestIds,
	);
	const stateChanged = updateQuestProgress(
		session.runtimeQuestState,
		session.runtimeState,
		session.project.items,
	);

	if (stateChanged) {
		emitInventoryChanged(session, emit);
		emitStateChanged(emit);
	}

	emitNewQuestRewards(beforeRewardedQuestIds, session, emit);
	emitQuestsChanged(session, emit);
}

function handleStateChanged(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): void {
	emitStateChanged(emit);
	emitInventoryChanged(session, emit);
	syncQuestProgress(session, emit);
}

export function createRuntimeRuleContext(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
): RuleActionContext {
	return {
		state: session.runtimeState,
		playCutscene: (cutsceneId, onDone) => {
			if (
				!session.project.cutscenes.some(
					(candidate) => candidate.id === cutsceneId,
				)
			) {
				emit({
					type: "status",
					message: `Rule cutscene missing: ${cutsceneId}.`,
				});
				onDone();
				return;
			}

			emit({ type: "cutsceneRequested", cutsceneId, onDone });
		},
		teleport: (areaId, eventBlockId) => {
			const eventBlock = session.project.areas
				.find((area) => area.id === areaId)
				?.eventBlocks.find((candidate) => candidate.id === eventBlockId);
			if (!eventBlock) {
				emit({
					type: "status",
					message: `Rule teleport target missing: ${eventBlockId}.`,
				});
				return;
			}

			emit({ type: "teleportRequested", areaId, eventBlockId });
		},
		changeMovementMode: (mode) => {
			session.currentMovementMode = mode;
			emit({ type: "movementModeChanged", mode });
			emit({ type: "status", message: `Movement mode: ${mode}.` });
		},
		endGame: () => {
			emit({ type: "gameEnded" });
		},
		activateQuest: (questId) => {
			activateQuest(session.runtimeQuestState, questId);
			syncQuestProgress(session, emit);
		},
		completeQuest: (questId) => {
			const beforeRewardedQuestIds = new Set(
				session.runtimeQuestState.rewardedQuestIds,
			);
			if (
				completeQuest(
					session.runtimeQuestState,
					questId,
					session.runtimeState,
					session.project.items,
				)
			) {
				emitInventoryChanged(session, emit);
				emitStateChanged(emit);
				emitNewQuestRewards(beforeRewardedQuestIds, session, emit);
			}
			syncQuestProgress(session, emit);
		},
		failQuest: (questId) => {
			failQuest(session.runtimeQuestState, questId);
			syncQuestProgress(session, emit);
		},
		openShop: (shopId) => {
			const shop = session.project.shops.find(
				(candidate) => candidate.id === shopId,
			);
			if (!shop) {
				emit({ type: "status", message: `Shop missing: ${shopId}.` });
				return;
			}

			session.activeShopId = shopId;
			emit({
				type: "shopOpened",
				shopId,
				message: `Opened ${shop.name}.`,
			});
			emit({ type: "status", message: `Opened ${shop.name}.` });
		},
		itemDefinitions: session.project.items,
		stateChanged: () => handleStateChanged(session, emit),
	};
}
