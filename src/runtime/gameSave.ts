import type {
	GameProject,
	NPCAttributes,
	PlayerVehicleState,
	QuestStatus,
} from "../types/game";
import { getPlayerCombatStats } from "./combat";
import { isPlayerAirborne } from "./playerLocomotion";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";
import { createRuntimeTraversal, createTraversalWorld } from "./traversal";
import { getEquippedWeapon } from "./weaponRuntime";

export const GAME_SAVE_PREFIX = "adventure-builder-game-save-v1:";
export const MAX_GAME_SAVE_CHARS = 1_000_000;

// An exact authored-revision identity avoids assigning a new ID every time an old
// JSON project is imported. Active editor area is a selection, not game identity.
// FNV-1a 128 is an identity checksum, not a security/authentication mechanism.
export function gameSaveProjectId(project: GameProject): string {
	const canonical = (value: unknown): string => {
		if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
		if (value && typeof value === "object")
			return `{${Object.entries(value)
				.filter(([, v]) => v !== undefined)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
				.join(",")}}`;
		return JSON.stringify(value);
	};
	const { activeAreaId: _selection, ...authored } = project;
	let hash = 0x6c62272e07bb014262b821756295c58dn;
	for (const byte of new TextEncoder().encode(canonical(authored))) {
		hash = BigInt.asUintN(
			128,
			(hash ^ BigInt(byte)) * 0x1000000000000000000013bn,
		);
	}
	return hash.toString(16).padStart(32, "0");
}

export type GameSave = {
	version: 1;
	projectId: string;
	projectVersion: string;
	savedAt: string;
	player: {
		areaId: string;
		position: { x: number; y: number };
		facing: { x: number; y: number };
		health: number;
		movementMode: RuntimeSessionState["currentMovementMode"];
		vehicle: PlayerVehicleState;
		equippedWeaponId?: string;
		// Optional shared traversal coordinates; no world descriptors or motion path.
		traversal?: {
			x: number;
			y: number;
			height: number;
			mode: "smooth" | "blocky";
		};
	};
	state: {
		flags: Record<string, boolean>;
		variables: Record<string, string | number>;
		inventory: Record<string, number>;
		npcs: Record<string, NPCAttributes>;
		completedRuleIds: string[];
	};
	quests: {
		statuses: Record<string, QuestStatus>;
		enteredAreaIds: string[];
		rewardedQuestIds: string[];
		completedObjectiveIds: string[];
		facts: string[];
		completedActionIds: string[];
	};
	world: {
		collectedPickupIds: string[];
		openedObjectIds: string[];
		defeatedNpcIds: string[];
		firedInteractionIds: string[];
		objectPositions: { areaId: string; id: string; x: number; y: number }[];
	};
	shops: RuntimeSessionState["runtimeShopStocks"];
	progression: {
		index: number;
		waiting: RuntimeSessionState["waitingForTrigger"];
	};
};

export function assertGameSaveSafe(
	session: RuntimeSessionState,
	presentationBlocked = false,
): void {
	if (isPlayerAirborne(session))
		throw new Error("Land before saving the game.");
	if (
		presentationBlocked ||
		session.startupPending ||
		session.dialogue ||
		session.pendingInteraction ||
		session.activeShopId ||
		session.runtimeQuestState.syncing ||
		session.runtimePlayerHealth <= 0
	)
		throw new Error(
			"Finish the conversation, menu or transition before saving.",
		);
}

export function createGameSave(
	project: GameProject,
	session: RuntimeSessionState,
): GameSave {
	assertGameSaveSafe(session);
	const q = session.runtimeQuestState;
	const traversal = session.playerVehicleState.active
		? undefined
		: session.traversal;
	const save: GameSave = {
		version: 1,
		projectId: gameSaveProjectId(project),
		projectVersion: project.metadata.version,
		savedAt: new Date().toISOString(),
		player: {
			areaId: session.currentAreaId,
			position: session.playerPosition,
			facing: session.playerFacing,
			health: session.runtimePlayerHealth,
			movementMode: session.currentMovementMode,
			vehicle: session.playerVehicleState,
			...(getEquippedWeapon(session)
				? { equippedWeaponId: session.equippedWeaponId }
				: {}),
			...(traversal
				? {
						traversal: {
							...traversal.position,
							mode: traversal.world.mode,
						},
					}
				: {}),
		},
		state: {
			flags: session.runtimeState.flags,
			variables: session.runtimeState.variables,
			inventory: session.runtimeState.inventory.items,
			npcs: session.runtimeState.npcs,
			completedRuleIds: [...session.runtimeState.completedRuleIds],
		},
		quests: {
			statuses: Object.fromEntries(
				q.quests.map((quest) => [quest.id, quest.status]),
			),
			enteredAreaIds: [...q.enteredAreaIds],
			rewardedQuestIds: [...q.rewardedQuestIds],
			completedObjectiveIds: [...q.completedObjectiveIds],
			facts: [...q.facts],
			completedActionIds: [...q.completedActionIds],
		},
		world: {
			collectedPickupIds: [...session.collectedPickupIds],
			openedObjectIds: [...session.openedObjectIds],
			defeatedNpcIds: [...session.defeatedNpcIds],
			firedInteractionIds: [...session.firedInteractionIds],
			objectPositions: session.project.areas.flatMap((area) =>
				area.objects.flatMap((object) => {
					const original = project.areas
						.find((a) => a.id === area.id)
						?.objects.find((o) => o.id === object.id);
					return original &&
						(original.x !== object.x || original.y !== object.y)
						? [{ areaId: area.id, id: object.id, x: object.x, y: object.y }]
						: [];
				}),
			),
		},
		shops: session.runtimeShopStocks,
		progression: {
			index: session.progressionIndex,
			waiting: session.waitingForTrigger,
		},
	};
	// Detach all mutable records and validate our own output before storage.
	return parseGameSave(JSON.stringify(save), project);
}

type Check = (value: unknown) => boolean;
const text: Check = (v) => typeof v === "string" && v.length <= 10_000;
const number: Check = (v) => typeof v === "number" && Number.isFinite(v);
const count: Check = (v) =>
	number(v) && Number.isSafeInteger(v) && (v as number) >= 0;
const boolean: Check = (v) => typeof v === "boolean";
const oneOf =
	(...values: unknown[]): Check =>
	(v) =>
		values.includes(v);
const optional =
	(check: Check): Check =>
	(v) =>
		v === undefined || check(v);
const record =
	(check: Check): Check =>
	(v) =>
		!!v &&
		typeof v === "object" &&
		!Array.isArray(v) &&
		Object.values(v).every(check);
const shape =
	(checks: Record<string, Check>): Check =>
	(v) =>
		record(() => true)(v) &&
		Object.keys(v as object).every((key) =>
			Object.keys(checks).includes(key),
		) &&
		Object.entries(checks).every(([key, check]) =>
			check((v as Record<string, unknown>)[key]),
		);
const list =
	(check: Check): Check =>
	(v) =>
		Array.isArray(v) && v.every(check);
const ids = list(text);
const point = shape({ x: number, y: number });
const vehicle = shape({
	active: boolean,
	vehicleObjectInstanceId: optional(text),
	vehicleType: optional(oneOf("boat", "horse", "cart")),
	movementMode: optional(oneOf("sail", "ride", "drive")),
});
const npc = shape({
	maxHealth: count,
	health: count,
	faction: text,
	alignment: oneOf("friendly", "neutral", "hostile"),
	canInteract: boolean,
	movementSpeed: optional(number),
});
const saveShape = shape({
	version: oneOf(1),
	projectId: text,
	projectVersion: text,
	savedAt: text,
	player: shape({
		areaId: text,
		position: point,
		facing: point,
		health: count,
		movementMode: oneOf("walk", "sail", "ride", "drive"),
		vehicle,
		equippedWeaponId: optional(text),
		traversal: optional(
			shape({
				x: number,
				y: number,
				height: number,
				mode: oneOf("smooth", "blocky"),
			}),
		),
	}),
	state: shape({
		flags: record(boolean),
		variables: record((v) => text(v) || number(v)),
		inventory: record(count),
		npcs: record(npc),
		completedRuleIds: ids,
	}),
	quests: shape({
		statuses: record(oneOf("inactive", "active", "completed", "failed")),
		enteredAreaIds: ids,
		rewardedQuestIds: ids,
		completedObjectiveIds: ids,
		facts: ids,
		completedActionIds: ids,
	}),
	world: shape({
		collectedPickupIds: ids,
		openedObjectIds: ids,
		defeatedNpcIds: ids,
		firedInteractionIds: ids,
		objectPositions: list(
			shape({ areaId: text, id: text, x: number, y: number }),
		),
	}),
	shops: record(record(count)),
	progression: shape({
		index: count,
		waiting: (v) =>
			v === null || shape({ areaId: optional(text), eventBlockId: text })(v),
	}),
});

export function parseGameSave(raw: string, project: GameProject): GameSave {
	if (raw.length > MAX_GAME_SAVE_CHARS)
		throw new Error("Save game is too large.");
	let value: unknown;
	try {
		value = JSON.parse(raw, (key, v) => {
			if (["__proto__", "prototype", "constructor"].includes(key))
				throw new Error("Invalid key");
			return v;
		});
	} catch {
		throw new Error("Save game is corrupt. Start a New Game to play.");
	}
	if (!saveShape(value))
		throw new Error("Save game has an unsupported version or invalid format.");
	const save = value as GameSave;
	if (
		save.projectId !== gameSaveProjectId(project) ||
		save.projectVersion !== project.metadata.version
	)
		throw new Error(
			"Save game belongs to a different project or authored revision.",
		);
	const valid = (condition: unknown) => {
		if (!condition)
			throw new Error("Save game contains invalid progress or references.");
	};
	const area = project.areas.find((a) => a.id === save.player.areaId);
	valid(area);
	const inArea = (p: { x: number; y: number }, a = area!) =>
		p.x >= -0.5 && p.y >= -0.5 && p.x < a.width - 0.5 && p.y < a.height - 0.5;
	valid(
		inArea(save.player.position) &&
			Number.isInteger(save.player.position.x) &&
			Number.isInteger(save.player.position.y),
	);
	const f = save.player.facing;
	valid(
		Number.isInteger(f.x) &&
			Number.isInteger(f.y) &&
			Math.abs(f.x) + Math.abs(f.y) === 1,
	);
	valid(
		save.player.health <= getPlayerCombatStats(project.player).maxHealth &&
			save.player.health > 0,
	);
	valid(Number.isFinite(Date.parse(save.savedAt)));
	if (save.player.traversal) {
		valid(inArea(save.player.traversal));
		valid(
			Math.round(save.player.traversal.x) === save.player.position.x &&
				Math.round(save.player.traversal.y) === save.player.position.y,
		);
	}
	const includesAll = (values: string[], known: string[]) =>
		values.every((id) => known.includes(id));
	if (save.player.equippedWeaponId !== undefined) {
		valid(
			project.items.some(
				(item) =>
					item.id === save.player.equippedWeaponId &&
					(item.weapon === "sword" || item.weapon === "bow") &&
					(save.state.inventory[item.id] ?? 0) > 0,
			),
		);
	}
	const npcIds = project.areas.flatMap((a) => a.npcs.map((n) => n.id));
	const objects = project.areas.flatMap((a) => a.objects);
	const objectIds = objects.map((o) => o.id);
	const questIds = project.quests.map((q) => q.id);
	valid(
		includesAll(
			Object.keys(save.state.inventory),
			project.items.map((i) => i.id),
		),
	);
	valid(
		includesAll(Object.keys(save.state.npcs), npcIds) &&
			includesAll(npcIds, Object.keys(save.state.npcs)),
	);
	valid(
		Object.values(save.state.npcs).every(
			(n) =>
				n.health <= n.maxHealth &&
				(n.movementSpeed === undefined || n.movementSpeed > 0),
		),
	);
	valid(
		includesAll(
			save.state.completedRuleIds,
			project.rules.map((r) => r.id),
		),
	);
	valid(
		includesAll(Object.keys(save.quests.statuses), questIds) &&
			includesAll(questIds, Object.keys(save.quests.statuses)),
	);
	valid(
		includesAll(
			save.quests.enteredAreaIds,
			project.areas.map((a) => a.id),
		),
	);
	valid(
		includesAll(save.quests.rewardedQuestIds, questIds) &&
			includesAll(save.quests.completedActionIds, questIds),
	);
	valid(
		includesAll(
			save.quests.completedObjectiveIds,
			project.quests.flatMap((q) => q.objectives.map((o) => `${q.id}:${o.id}`)),
		),
	);
	valid(
		includesAll(save.world.openedObjectIds, objectIds) &&
			includesAll(save.world.defeatedNpcIds, npcIds),
	);
	valid(
		includesAll(save.world.collectedPickupIds, [
			...objectIds,
			...project.areas.flatMap((a) => a.pickups.map((p) => p.id)),
		]),
	);
	valid(
		includesAll(
			save.world.firedInteractionIds,
			project.areas.flatMap((a) =>
				[...a.objects, ...a.npcs, ...a.eventBlocks, ...a.structures].map(
					(e) => `${a.id}:${e.id}`,
				),
			),
		),
	);
	valid(save.progression.index <= project.progression.length);
	if (save.progression.waiting)
		valid(
			project.areas.some(
				(a) =>
					(!save.progression.waiting?.areaId ||
						a.id === save.progression.waiting.areaId) &&
					a.eventBlocks.some(
						(e) => e.id === save.progression.waiting?.eventBlockId,
					),
			),
		);
	for (const p of save.world.objectPositions) {
		const a = project.areas.find((a) => a.id === p.areaId);
		valid(a && a.objects.some((o) => o.id === p.id) && inArea(p, a));
	}
	if (save.player.vehicle.active)
		valid(
			area!.objects.some(
				(o) => o.id === save.player.vehicle.vehicleObjectInstanceId,
			) &&
				save.player.vehicle.vehicleType &&
				save.player.vehicle.movementMode,
		);
	for (const [shopId, stock] of Object.entries(save.shops)) {
		const shop = project.shops.find((s) => s.id === shopId);
		valid(
			shop &&
				includesAll(
					Object.keys(stock),
					shop.entries.filter((e) => e.stock !== undefined).map((e) => e.id),
				),
		);
	}
	for (const fact of save.quests.facts) {
		let parts: unknown;
		try {
			parts = JSON.parse(fact);
		} catch {
			valid(false);
		}
		valid(
			Array.isArray(parts) &&
				parts.length === 3 &&
				parts.every((p) => typeof p === "string"),
		);
		const [kind, areaId, targetId] = parts as string[];
		const a = project.areas.find((a) => a.id === areaId);
		valid(
			a &&
				[
					"interaction_completed",
					"container_opened",
					"enter_event",
					"door_used",
				].includes(kind) &&
				[
					...a.objects,
					...a.npcs,
					...a.eventBlocks,
					...a.structures,
					...a.pickups,
				].some((e) => e.id === targetId),
		);
	}
	return save;
}

export function restoreGameSave(
	project: GameProject,
	input: GameSave,
): RuntimeSessionState {
	const save = parseGameSave(JSON.stringify(input), project);
	const s = createRuntimeSession(project);
	s.currentAreaId = save.player.areaId;
	s.playerPosition = save.player.position;
	s.playerFacing = save.player.facing;
	s.runtimePlayerHealth = save.player.health;
	s.currentMovementMode = save.player.movementMode;
	s.playerVehicleState = save.player.vehicle;
	s.equippedWeaponId = save.player.equippedWeaponId;
	s.runtimeState = {
		...save.state,
		inventory: { items: save.state.inventory },
		completedRuleIds: new Set(save.state.completedRuleIds),
	};
	const q = s.runtimeQuestState;
	q.quests.forEach((quest) => {
		quest.status = save.quests.statuses[quest.id];
	});
	q.enteredAreaIds = new Set(save.quests.enteredAreaIds);
	q.rewardedQuestIds = new Set(save.quests.rewardedQuestIds);
	q.completedObjectiveIds = new Set(save.quests.completedObjectiveIds);
	q.facts = new Set(save.quests.facts);
	q.completedActionIds = new Set(save.quests.completedActionIds);
	s.collectedPickupIds = new Set(save.world.collectedPickupIds);
	s.openedObjectIds = new Set(save.world.openedObjectIds);
	s.defeatedNpcIds = new Set(save.world.defeatedNpcIds);
	s.firedInteractionIds = new Set(save.world.firedInteractionIds);
	s.runtimeShopStocks = save.shops;
	s.progressionIndex = save.progression.index;
	s.waitingForTrigger = save.progression.waiting;
	for (const area of s.project.areas) {
		area.npcs = area.npcs.filter((n) => !s.defeatedNpcIds.has(n.id));
		area.objects = area.objects.filter((o) => !s.collectedPickupIds.has(o.id));
		for (const object of area.objects) {
			const p = save.world.objectPositions.find(
				(p) => p.areaId === area.id && p.id === object.id,
			);
			if (p) {
				object.x = p.x;
				object.y = p.y;
			}
		}
	}
	if (save.player.traversal) {
		const area = s.project.areas.find((a) => a.id === s.currentAreaId)!;
		const world = createTraversalWorld(
			s.project,
			area,
			save.player.traversal.mode,
		);
		const { x, y, height } = save.player.traversal;
		s.traversal = createRuntimeTraversal(
			world,
			area,
			s.project,
			s.playerPosition,
			{ x, y, height },
		);
	}
	return s;
}

export type GameSaveStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
};
export function loadGameSave(
	project: GameProject,
	storage: GameSaveStorage,
): GameSave | null {
	const raw = storage.getItem(GAME_SAVE_PREFIX + gameSaveProjectId(project));
	return raw === null ? null : parseGameSave(raw, project);
}
export function storeGameSave(
	project: GameProject,
	save: GameSave,
	storage: GameSaveStorage,
): void {
	const raw = JSON.stringify(save);
	parseGameSave(raw, project);
	storage.setItem(GAME_SAVE_PREFIX + gameSaveProjectId(project), raw);
}
