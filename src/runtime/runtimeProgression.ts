import type { EventBlock } from "../types/game";
import type { InteractableTarget } from "./interactionDiscovery";
import {
	getQuestViews,
	markAreaEntered,
	type QuestView,
	updateQuestProgress,
} from "./questEngine";
import type { RuntimeSessionState } from "./runtimeSession";

export type RuntimeProgressionEvent =
	| {
			type: "spawnPlayer";
			areaId: string;
			eventBlockId: string;
			x: number;
			y: number;
	  }
	| { type: "areaChanged"; areaId: string }
	| { type: "cutsceneRequested"; cutsceneId: string }
	| { type: "status"; message: string }
	| { type: "flowLog"; message: string }
	| { type: "stateChanged" }
	| { type: "inventoryChanged"; inventory: Record<string, number> }
	| { type: "questSync" }
	| { type: "questsChanged"; quests: QuestView[] }
	| { type: "triggerWaiting"; areaId?: string; eventBlockId: string }
	| { type: "areaEnterTriggerRequested"; areaId: string }
	| { type: "vehicleLeft" }
	| { type: "endGame" };

export type RuntimeProgressionEventEmitter = (
	event: RuntimeProgressionEvent,
) => void;

function findArea(session: RuntimeSessionState, areaId: string) {
	return session.project.areas.find((area) => area.id === areaId);
}

function findEventBlock(
	session: RuntimeSessionState,
	eventBlockId: string,
	areaId = session.currentAreaId,
): EventBlock | undefined {
	return findArea(session, areaId)?.eventBlocks.find(
		(candidate) => candidate.id === eventBlockId,
	);
}

function emitInventoryChanged(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
): void {
	emit({
		type: "inventoryChanged",
		inventory: { ...session.runtimeState.inventory.items },
	});
}

function emitQuestsChanged(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
): void {
	emit({
		type: "questsChanged",
		quests: getQuestViews(session.runtimeQuestState, session.runtimeState),
	});
}

export function syncRuntimeQuestProgress(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
): void {
	const stateChanged = updateQuestProgress(
		session.runtimeQuestState,
		session.runtimeState,
		session.project.items,
	);
	emit({ type: "questSync" });
	if (stateChanged) {
		emitInventoryChanged(session, emit);
		emit({ type: "stateChanged" });
	}
	emitQuestsChanged(session, emit);
}

export function markRuntimeAreaEntered(
	session: RuntimeSessionState,
	areaId: string,
	emit: RuntimeProgressionEventEmitter,
): void {
	markAreaEntered(session.runtimeQuestState, areaId);
	syncRuntimeQuestProgress(session, emit);
}

export function transitionRuntimeArea(
	session: RuntimeSessionState,
	areaId: string,
	eventBlockId: string,
	emit: RuntimeProgressionEventEmitter,
): void {
	const nextArea = findArea(session, areaId);
	const eventBlock = findEventBlock(session, eventBlockId, areaId);
	if (!nextArea || !eventBlock) {
		return;
	}

	if (session.playerVehicleState.active) {
		session.playerVehicleState = { active: false };
		session.currentMovementMode = "walk";
		emit({ type: "vehicleLeft" });
	}

	const enteredNewArea = nextArea.id !== session.currentAreaId;
	session.currentAreaId = nextArea.id;
	if (enteredNewArea) {
		emit({ type: "areaChanged", areaId: nextArea.id });
	}

	session.playerPosition = { x: eventBlock.x, y: eventBlock.y };
	emit({
		type: "spawnPlayer",
		areaId: nextArea.id,
		eventBlockId: eventBlock.id,
		x: eventBlock.x,
		y: eventBlock.y,
	});

	markRuntimeAreaEntered(session, nextArea.id, emit);
	emit({
		type: "status",
		message: `${session.project.player.name} entered ${nextArea.name}.`,
	});
	emit({ type: "stateChanged" });
	emit({
		type: "flowLog",
		message: `${session.project.player.name} entered ${nextArea.name}.`,
	});

	if (enteredNewArea) {
		emit({ type: "areaEnterTriggerRequested", areaId: nextArea.id });
	}
}

export function processRuntimeProgression(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
): void {
	while (session.progressionIndex < session.project.progression.length) {
		const step = session.project.progression[session.progressionIndex];
		const action = step.action;

		if (action.type === "play_cutscene") {
			if (
				!session.project.cutscenes.some(
					(candidate) => candidate.id === action.cutsceneId,
				)
			) {
				session.progressionIndex += 1;
				continue;
			}

			emit({ type: "cutsceneRequested", cutsceneId: action.cutsceneId });
			return;
		}

		if (action.type === "spawn_player" || action.type === "teleport_player") {
			transitionRuntimeArea(session, action.areaId, action.eventBlockId, emit);
			session.progressionIndex += 1;
			continue;
		}

		if (action.type === "wait_for_trigger") {
			const eventBlock = findEventBlock(
				session,
				action.eventBlockId,
				action.areaId,
			);
			session.waitingForTrigger = {
				areaId: action.areaId,
				eventBlockId: action.eventBlockId,
			};
			emit({
				type: "triggerWaiting",
				areaId: action.areaId,
				eventBlockId: action.eventBlockId,
			});
			emit({
				type: "status",
				message: eventBlock
					? `Find trigger: ${eventBlock.name}`
					: "Find the trigger.",
			});
			return;
		}

		emit({ type: "endGame" });
		session.progressionIndex = session.project.progression.length;
		return;
	}

	emit({ type: "status", message: "Progression complete." });
}

export function completeRuntimeProgressionCutscene(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
): void {
	session.progressionIndex += 1;
	processRuntimeProgression(session, emit);
}

export function checkRuntimeWaitingTrigger(
	session: RuntimeSessionState,
	emit: RuntimeProgressionEventEmitter,
	triggerTargets: InteractableTarget[] = [],
): boolean {
	const waitingForTrigger = session.waitingForTrigger;
	if (!waitingForTrigger) {
		return false;
	}

	const triggerTarget = triggerTargets.find(
		(target) =>
			target.type === "eventBlock" &&
			target.id === waitingForTrigger.eventBlockId &&
			(!waitingForTrigger.areaId || waitingForTrigger.areaId === target.areaId),
	);
	if (triggerTarget) {
		session.waitingForTrigger = null;
		session.progressionIndex += 1;
		processRuntimeProgression(session, emit);
		return true;
	}

	const eventBlock = findEventBlock(
		session,
		waitingForTrigger.eventBlockId,
		waitingForTrigger.areaId,
	);
	if (!eventBlock) {
		session.waitingForTrigger = null;
		session.progressionIndex += 1;
		processRuntimeProgression(session, emit);
		return true;
	}

	const isInTargetArea =
		!waitingForTrigger.areaId ||
		waitingForTrigger.areaId === session.currentAreaId;
	if (
		isInTargetArea &&
		eventBlock.x === session.playerPosition.x &&
		eventBlock.y === session.playerPosition.y
	) {
		session.waitingForTrigger = null;
		session.progressionIndex += 1;
		processRuntimeProgression(session, emit);
		return true;
	}

	return false;
}
