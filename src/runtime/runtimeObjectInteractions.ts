import type {
	Cutscene,
	GameArea,
	ObjectInstance,
	PickupObject,
} from "../types/game";
import {
	isPickupCollected,
	resolveObjectBehaviour,
} from "./interactionDiscovery";
import { collectPickup } from "./inventory";
import { findDismountTile, type VehicleMovementConfig } from "./movement";
import { runObjectBehaviour } from "./objectBehaviour";
import {
	getQuestViews,
	type QuestView,
	updateQuestProgress,
} from "./questEngine";
import type { RuntimeSessionState } from "./runtimeSession";
import { buyShopEntry } from "./shopRuntime";
import { createBoardedVehicleState } from "./vehicleRuntime";

export type RuntimeObjectInteractionEvent =
	| { type: "status"; message: string }
	| { type: "flowLog"; message: string }
	| { type: "stateChanged" }
	| { type: "inventoryChanged"; inventory: Record<string, number> }
	| { type: "questsChanged"; quests: QuestView[] }
	| {
			type: "cutsceneRequested";
			cutsceneId?: string;
			cutscene?: Cutscene;
	  }
	| { type: "teleportRequested"; areaId: string; eventBlockId: string }
	| { type: "shopChanged"; message?: string }
	| { type: "shopClosed" }
	| { type: "pickupCollected"; pickupId: string; once: boolean }
	| { type: "vehicleBoarded"; behaviour: VehicleMovementConfig }
	| { type: "vehicleDismounted" }
	| {
			type: "movementModeChanged";
			mode: RuntimeSessionState["currentMovementMode"];
	  }
	| { type: "objectMoved"; objectId: string; x: number; y: number }
	| { type: "playerMoved"; x: number; y: number };

export type RuntimeObjectInteractionEventEmitter = (
	event: RuntimeObjectInteractionEvent,
) => void;

function emitInventoryChanged(
	session: RuntimeSessionState,
	emit: RuntimeObjectInteractionEventEmitter,
): void {
	emit({
		type: "inventoryChanged",
		inventory: { ...session.runtimeState.inventory.items },
	});
}

function emitQuestsChanged(
	session: RuntimeSessionState,
	emit: RuntimeObjectInteractionEventEmitter,
): void {
	emit({
		type: "questsChanged",
		quests: getQuestViews(session.runtimeQuestState, session.runtimeState),
	});
}

function emitStateChanged(emit: RuntimeObjectInteractionEventEmitter): void {
	emit({ type: "stateChanged" });
	emit({ type: "flowLog", message: "Runtime state changed." });
}

function syncQuestProgress(
	session: RuntimeSessionState,
	emit: RuntimeObjectInteractionEventEmitter,
): void {
	const stateChanged = updateQuestProgress(
		session.runtimeQuestState,
		session.runtimeState,
		session.project.items,
	);
	if (stateChanged) {
		emitInventoryChanged(session, emit);
		emitStateChanged(emit);
	}
	emitQuestsChanged(session, emit);
}

function findCurrentArea(session: RuntimeSessionState): GameArea | undefined {
	return session.project.areas.find(
		(candidate) => candidate.id === session.currentAreaId,
	);
}

function findEventBlock(
	session: RuntimeSessionState,
	areaId: string,
	eventBlockId: string,
) {
	return session.project.areas
		.find((area) => area.id === areaId)
		?.eventBlocks.find((eventBlock) => eventBlock.id === eventBlockId);
}

function findItemName(
	session: RuntimeSessionState,
	itemId: string,
): string | undefined {
	return session.project.items.find((candidate) => candidate.id === itemId)
		?.name;
}

export function runRuntimeObjectBehaviour(
	session: RuntimeSessionState,
	object: ObjectInstance,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	const behaviour = resolveObjectBehaviour(session.project, object);
	const result = runObjectBehaviour(behaviour, {
		itemDefinitions: session.project.items,
		objectId: object.id,
		openedObjectIds: session.openedObjectIds,
		state: session.runtimeState,
	});

	if (!result.handled) {
		return false;
	}

	if (result.type === "container") {
		emitInventoryChanged(session, emit);
		syncQuestProgress(session, emit);
		emitStateChanged(emit);
		emit({ type: "status", message: result.message });
		return true;
	}

	if (result.type === "door") {
		if (!result.allowed) {
			if (
				result.lockedCutsceneId &&
				session.project.cutscenes.some(
					(candidate) => candidate.id === result.lockedCutsceneId,
				)
			) {
				emit({
					type: "cutsceneRequested",
					cutsceneId: result.lockedCutsceneId,
				});
				return true;
			}

			emit({ type: "status", message: result.message });
			return true;
		}

		if (result.targetAreaId && result.targetEventBlockId) {
			if (
				findEventBlock(session, result.targetAreaId, result.targetEventBlockId)
			) {
				emit({
					type: "teleportRequested",
					areaId: result.targetAreaId,
					eventBlockId: result.targetEventBlockId,
				});
			} else {
				emit({
					type: "status",
					message: `Door target missing: ${object.id}.`,
				});
			}
			return true;
		}

		emit({ type: "status", message: result.message });
		return true;
	}

	if (result.type === "sign") {
		const definition = session.project.objects.find(
			(candidate) => candidate.id === object.objectDefinitionId,
		);
		const name = object.nameOverride ?? definition?.name ?? "Sign";
		emit({
			type: "cutsceneRequested",
			cutscene: {
				id: `object_sign_${object.id}`,
				name,
				backgroundImageId: "forest_path",
				speakerName: name,
				text: result.text,
			},
		});
		return true;
	}

	if (result.type === "vehicle") {
		return boardRuntimeVehicle(
			session,
			object,
			result.behaviour,
			result.message,
			emit,
		);
	}

	return false;
}

export function collectRuntimePickup(
	session: RuntimeSessionState,
	pickup: PickupObject,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	if (
		isPickupCollected(pickup, session.runtimeState, session.collectedPickupIds)
	) {
		return false;
	}

	const collected = collectPickup(
		pickup,
		session.runtimeState.inventory,
		session.project.items,
		session.collectedPickupIds,
	);
	if (!collected) {
		return false;
	}

	if (pickup.collectedFlag) {
		session.runtimeState.flags[pickup.collectedFlag] = true;
	}

	if (pickup.once) {
		emit({ type: "pickupCollected", pickupId: pickup.id, once: true });
	}
	emitInventoryChanged(session, emit);
	syncQuestProgress(session, emit);
	emitStateChanged(emit);
	emit({
		type: "status",
		message: `Picked up ${findItemName(session, pickup.itemId) ?? pickup.itemId} x${pickup.quantity}.`,
	});
	return true;
}

export function openRuntimeShop(
	session: RuntimeSessionState,
	shopId: string,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	const shop = session.project.shops.find(
		(candidate) => candidate.id === shopId,
	);
	if (!shop) {
		emit({ type: "status", message: `Shop missing: ${shopId}.` });
		return false;
	}

	session.activeShopId = shopId;
	emit({ type: "shopChanged" });
	emit({ type: "status", message: `Opened ${shop.name}.` });
	return true;
}

export function closeRuntimeShop(
	session: RuntimeSessionState,
	emit: RuntimeObjectInteractionEventEmitter,
): void {
	session.activeShopId = undefined;
	emit({ type: "shopClosed" });
}

export function buyRuntimeShopEntry(
	session: RuntimeSessionState,
	entryId: string,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	if (!session.activeShopId) {
		return false;
	}

	const shop = session.project.shops.find(
		(candidate) => candidate.id === session.activeShopId,
	);
	if (!shop) {
		closeRuntimeShop(session, emit);
		return false;
	}

	const stock = session.runtimeShopStocks[shop.id] ?? {};
	session.runtimeShopStocks[shop.id] = stock;
	const result = buyShopEntry(
		shop,
		entryId,
		session.runtimeState.inventory,
		session.project.items,
		stock,
	);
	emit({ type: "status", message: result.message });
	emitInventoryChanged(session, emit);
	syncQuestProgress(session, emit);
	emitStateChanged(emit);
	emit({ type: "shopChanged", message: result.message });
	return result.success;
}

export function boardRuntimeVehicle(
	session: RuntimeSessionState,
	object: ObjectInstance,
	behaviour: VehicleMovementConfig,
	message: string,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	if (behaviour.vehicleType !== "boat") {
		emit({ type: "status", message });
		return true;
	}

	session.playerVehicleState = createBoardedVehicleState(object.id, behaviour);
	session.currentMovementMode = behaviour.movementMode;
	emit({ type: "vehicleBoarded", behaviour });
	emit({ type: "movementModeChanged", mode: behaviour.movementMode });
	emitStateChanged(emit);
	emit({ type: "status", message: "Boarded boat." });
	return true;
}

export function leaveRuntimeVehicle(
	session: RuntimeSessionState,
	showMessage: boolean,
	emit: RuntimeObjectInteractionEventEmitter,
): boolean {
	if (!session.playerVehicleState.active) {
		return false;
	}

	session.playerVehicleState = { active: false };
	session.currentMovementMode = "walk";
	emit({ type: "vehicleDismounted" });
	emit({ type: "movementModeChanged", mode: "walk" });
	emitStateChanged(emit);
	if (showMessage) {
		emit({ type: "status", message: "Dismounted." });
	}
	return true;
}

export function getRuntimeActiveVehicleBehaviour(
	session: RuntimeSessionState,
	area: GameArea,
): VehicleMovementConfig | undefined {
	if (
		!session.playerVehicleState.active ||
		!session.playerVehicleState.vehicleObjectInstanceId
	) {
		return undefined;
	}

	const object = area.objects.find(
		(candidate) =>
			candidate.id === session.playerVehicleState.vehicleObjectInstanceId,
	);
	const behaviour = object
		? resolveObjectBehaviour(session.project, object)
		: undefined;
	return behaviour?.type === "vehicle" ? behaviour : undefined;
}

export function dismountRuntimeVehicle(
	session: RuntimeSessionState,
	emit: RuntimeObjectInteractionEventEmitter,
	area: GameArea = findCurrentArea(session) ?? session.project.areas[0],
): boolean {
	const behaviour = getRuntimeActiveVehicleBehaviour(session, area);
	const vehicleObjectId = session.playerVehicleState.vehicleObjectInstanceId;
	const vehicleObject = vehicleObjectId
		? area.objects.find((candidate) => candidate.id === vehicleObjectId)
		: undefined;

	if (!behaviour || !vehicleObject) {
		leaveRuntimeVehicle(session, false, emit);
		emit({ type: "status", message: "Vehicle missing." });
		return false;
	}

	const waterTile = { ...session.playerPosition };
	const target = findDismountTile(
		area,
		session.playerPosition,
		session.playerFacing,
		behaviour,
	);
	if (!target.canDismount) {
		emit({ type: "status", message: target.reason });
		return false;
	}

	vehicleObject.x = waterTile.x;
	vehicleObject.y = waterTile.y;
	emit({
		type: "objectMoved",
		objectId: vehicleObject.id,
		x: vehicleObject.x,
		y: vehicleObject.y,
	});

	session.playerPosition = { x: target.x, y: target.y };
	emit({ type: "playerMoved", x: target.x, y: target.y });
	leaveRuntimeVehicle(session, true, emit);
	return true;
}
