import { describe, expect, it, vi } from "vitest";
import harbour from "../../docs/assets/quest-objectives/tidewatch-harbour.project.json";
import courtyard from "../../docs/assets/runtime-parity/runtime-parity-demo.project.json";
import { defaultProject } from "../data/defaultProject";
import { DEFAULT_FOLIAGE_BRUSH_SETTINGS } from "../data/foliageBrushSettings";
import { cloneProject, migrateProject } from "../data/migrateProject";
import {
	assertGameSaveSafe,
	createGameSave,
	fnv128,
	GAME_SAVE_PREFIX,
	gameSaveProjectId,
	loadGameSave,
	parseGameSave,
	restoreGameSave,
	storeGameSave,
} from "./gameSave";
import { prepareInteractionMessage } from "./interactionMessages";
import { getQuestViews } from "./questEngine";
import { finishQuestConversation } from "./questInteractions";
import { attemptRuntimeCombatAttack } from "./runtimeCombat";
import {
	collectRuntimeObjectPickup,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
import {
	type RuntimeProgressionEvent,
	startRuntimeSession,
	syncRuntimeQuestProgress,
	transitionRuntimeArea,
} from "./runtimeProgression";
import type { RuntimeRuleEvent } from "./runtimeRuleActionDispatcher";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";
import { createRuntimeTraversal, createTraversalWorld } from "./traversal";

function bridge(session: RuntimeSessionState) {
	const emit = (
		event:
			| RuntimeObjectInteractionEvent
			| RuntimeProgressionEvent
			| RuntimeRuleEvent,
	) => {
		if (event.type === "teleportRequested")
			transitionRuntimeArea(session, event.areaId, event.eventBlockId, emit);
	};
	return emit;
}
const view = (s: RuntimeSessionState) =>
	getQuestViews(s.runtimeQuestState, s.runtimeState)[0];
function ready() {
	const project = migrateProject(harbour);
	const session = createRuntimeSession(project);
	startRuntimeSession(session, (done) => done(), bridge(session));
	return { project, session };
}

describe("renderer-neutral game saves", () => {
	it("matches the original 128-bit save checksum byte for byte", () => {
		for (const bytes of [
			new Uint8Array(),
			new TextEncoder().encode("Merewatch • 水"),
			Uint8Array.from({ length: 8192 }, (_, i) => i % 256),
		]) {
			let hash = 0x6c62272e07bb014262b821756295c58dn;
			for (const byte of bytes)
				hash = BigInt.asUintN(
					128,
					(hash ^ BigInt(byte)) * 0x1000000000000000000013bn,
				);
			expect(fnv128(bytes)).toBe(hash.toString(16).padStart(32, "0"));
		}
	});
	it("keeps the save identity when changing map brush and hierarchy preferences", () => {
		const project = migrateProject(harbour);
		const original = gameSaveProjectId(project);
		project.foliageBrush = { ...DEFAULT_FOLIAGE_BRUSH_SETTINGS, seed: 29 };
		project.areas[0].objects[0].scene = { locked: true, group: "Docks" };
		expect(gameSaveProjectId(project)).toBe(original);
		project.areas[0].objects[0].scene.hidden = true;
		expect(gameSaveProjectId(project)).not.toBe(original);
	});
	it("continues the actual Harbour Trouble chest/key/objective route and keeps completion latched", () => {
		const { project, session } = ready();
		const before = JSON.stringify(project);
		const area = session.project.areas[0];
		const keeper = area.npcs[0];
		session.pendingInteraction = {
			areaId: area.id,
			targetId: keeper.id,
			interaction: keeper.interactionOverride!,
		};
		finishQuestConversation(session, bridge(session), bridge(session));
		const chest = area.objects.find(
			(o) => o.behaviourOverride?.type === "container",
		)!;
		runRuntimeObjectBehaviour(session, chest, bridge(session));
		expect(
			view(session).objectives.find((o) => o.state === "active")?.description,
		).toBe("Enter the shack");
		session.playerPosition = { x: 6, y: 8 };
		session.playerFacing = { x: -1, y: 0 };
		const world = createTraversalWorld(session.project, area);
		session.traversal = createRuntimeTraversal(
			world,
			area,
			session.project,
			session.playerPosition,
			{ x: 5.8, y: 7.8, height: 1 },
		);
		const saved = createGameSave(project, session);
		expect(JSON.stringify(saved).length).toBeLessThan(10_000);
		const continued = restoreGameSave(project, saved);
		expect(continued.playerPosition).toEqual(session.playerPosition);
		expect(continued.playerFacing).toEqual(session.playerFacing);
		expect(continued.traversal?.position).toEqual(session.traversal.position);
		expect(continued.traversal?.path).toHaveLength(1);
		expect(continued.runtimeState.inventory).toEqual(
			session.runtimeState.inventory,
		);
		expect(view(continued)).toEqual(view(session));
		const quantity = { ...continued.runtimeState.inventory.items };
		runRuntimeObjectBehaviour(continued, chest, bridge(continued));
		expect(continued.runtimeState.inventory.items).toEqual(quantity);
		expect(continued.openedObjectIds.has(chest.id)).toBe(true);
		const door = continued.project.areas[0].objects.find(
			(o) => o.behaviourOverride?.type === "door",
		)!;
		runRuntimeObjectBehaviour(continued, door, bridge(continued));
		expect(view(continued).status).toBe("completed");
		const completed = restoreGameSave(
			project,
			createGameSave(project, continued),
		);
		syncRuntimeQuestProgress(completed, bridge(completed));
		expect(view(completed).status).toBe("completed");
		expect(completed.runtimeState.inventory.items).toEqual(quantity);
		expect(JSON.stringify(project)).toBe(before);
		expect(createRuntimeSession(project).runtimeState.inventory.items).toEqual(
			{},
		);
	});

	it("persists durable defeat/attributes but resets wander positions, timers, animation and dialogue", () => {
		const project = migrateProject(courtyard);
		const original = JSON.stringify(project);
		const s = createRuntimeSession(project);
		const area = s.project.areas[0];
		s.playerPosition = { x: 4, y: 7 };
		s.playerFacing = { x: 1, y: 0 };
		attemptRuntimeCombatAttack(s, area, 1000, () => {});
		attemptRuntimeCombatAttack(s, area, 2000, () => {});
		area.npcs.find((n) => n.id === "wander_west")!.x = 4;
		s.npcMovementStates.set("wander_west", {
			movement: { patrolIndex: 5, wanderTarget: { x: 1, y: 3 } },
			nextMoveAt: 9999,
		});
		s.enemyContactCooldowns.set("sparring_guard", 9999);
		s.runtimePlayerHealth = 80;
		const saved = createGameSave(project, s);
		const next = restoreGameSave(project, saved);
		expect(next.defeatedNpcIds.has("sparring_guard")).toBe(true);
		expect(
			next.project.areas[0].npcs.some((n) => n.id === "sparring_guard"),
		).toBe(false);
		expect(next.runtimeState.flags.npc_defeated_sparring_guard).toBe(true);
		expect(next.runtimePlayerHealth).toBe(80);
		expect(
			next.project.areas[0].npcs.find((n) => n.id === "wander_west")?.x,
		).toBe(2);
		expect(next.npcMovementStates.size + next.enemyContactCooldowns.size).toBe(
			0,
		);
		expect(next.nextAttackAt).toBe(0);
		expect(next.recentEnemy).toBeUndefined();
		expect(next.dialogue).toBeUndefined();
		expect(JSON.stringify(project)).toBe(original);
	});

	it("restores one-time message, rule/reward guards and shop stocks without replaying them", () => {
		const project = cloneProject(defaultProject);
		const s = createRuntimeSession(project);
		s.playerPosition = { x: 2, y: 2 };
		const rule = project.rules[0];
		if (rule) s.runtimeState.completedRuleIds.add(rule.id);
		const quest = s.runtimeQuestState.quests[0];
		quest.status = "completed";
		s.runtimeQuestState.rewardedQuestIds.add(quest.id);
		s.runtimeQuestState.completedActionIds.add(quest.id);
		const target = project.areas[0].npcs[0];
		const interaction = {
			type: "show_message" as const,
			once: true,
			lines: ["Once"],
			activationMode: "on_interact" as const,
		};
		expect(
			prepareInteractionMessage(s, interaction, target.id, "Once"),
		).toBeDefined();
		const shop = project.shops[0],
			entry = shop.entries[0];
		s.runtimeShopStocks[shop.id][entry.id] = 0;
		const next = restoreGameSave(project, createGameSave(project, s));
		expect(
			prepareInteractionMessage(next, interaction, target.id, "Once"),
		).toBeUndefined();
		expect(next.runtimeState.completedRuleIds).toEqual(
			s.runtimeState.completedRuleIds,
		);
		expect(next.runtimeQuestState.rewardedQuestIds).toEqual(
			s.runtimeQuestState.rewardedQuestIds,
		);
		expect(next.runtimeQuestState.completedActionIds).toEqual(
			s.runtimeQuestState.completedActionIds,
		);
		expect(next.runtimeShopStocks[shop.id][entry.id]).toBe(0);
	});

	it("removes collected prop pickups and restores moved object positions in a fresh world", () => {
		const { project } = ready();
		const area = project.areas[0],
			object = area.objects[0];
		object.interaction = {
			type: "collect_item",
			activationMode: "on_interact",
			itemId: project.items[0].id,
			quantity: 1,
		};
		const s = createRuntimeSession(project);
		expect(collectRuntimeObjectPickup(s, object.id, () => {})).toBe(true);
		const moved = s.project.areas[0].objects[0];
		moved.x = 3;
		moved.y = 8;
		const restored = restoreGameSave(project, createGameSave(project, s));
		expect(
			restored.project.areas[0].objects.some((o) => o.id === object.id),
		).toBe(false);
		expect(
			restored.project.areas[0].objects.find((o) => o.id === moved.id),
		).toMatchObject({ x: 3, y: 8 });
		expect(project.areas[0].objects.some((o) => o.id === object.id)).toBe(true);
	});

	it("detaches the snapshot and restored sessions, preserving project defaults", () => {
		const { project, session } = ready();
		session.runtimeState.flags.done = true;
		const saved = createGameSave(project, session);
		session.runtimeState.flags.done = false;
		const a = restoreGameSave(project, saved),
			b = restoreGameSave(project, saved);
		a.runtimeState.flags.done = false;
		expect(b.runtimeState.flags.done).toBe(true);
		expect(saved.state.flags.done).toBe(true);
		expect(project.gameState.flags.done).toBeUndefined();
	});

	it("uses a stable content identity across key ordering/imports and editor area selection", () => {
		const { project, session } = ready();
		const reordered = Object.fromEntries(
			Object.entries(project).reverse(),
		) as typeof project;
		reordered.activeAreaId = "editor-selection";
		expect(gameSaveProjectId(reordered)).toBe(gameSaveProjectId(project));
		expect(
			gameSaveProjectId(migrateProject(JSON.parse(JSON.stringify(project)))),
		).toBe(gameSaveProjectId(project));
		const other = cloneProject(project);
		other.areas[0].name = "Different revision";
		expect(() =>
			parseGameSave(JSON.stringify(createGameSave(project, session)), other),
		).toThrow(/different project/);
	});

	it("keeps playable identity when rule folders are collapsed or reorganized", () => {
		const project = cloneProject(defaultProject);
		const save = createGameSave(project, createRuntimeSession(project));
		const edited = cloneProject(project);
		edited.ruleGroups[0].collapsed = !edited.ruleGroups[0].collapsed;
		expect(gameSaveProjectId(edited)).toBe(save.projectId);
		edited.ruleGroups[0].name = "Renamed folder";
		edited.ruleGroups[0].description = "Editor notes";
		edited.rules[0].groupId = edited.ruleGroups[1].id;
		expect(gameSaveProjectId(edited)).toBe(save.projectId);
		expect(parseGameSave(JSON.stringify(save), edited)).toEqual(save);
		edited.rules[0].enabled = !edited.rules[0].enabled;
		expect(() => parseGameSave(JSON.stringify(save), edited)).toThrow(
			/different project/,
		);
	});

	it("recovers an existing save under its old folder-sensitive key", () => {
		const project = cloneProject(defaultProject);
		const save = createGameSave(project, createRuntimeSession(project));
		// Fingerprint of this fixture before rule organization was excluded.
		const legacyId = "c2e128a792c1db7a43679e94961576f8";
		const legacyKey = GAME_SAVE_PREFIX + legacyId;
		const legacyRaw = JSON.stringify({ ...save, projectId: legacyId });
		const slots = new Map([[legacyKey, legacyRaw]]);
		const storage = {
			getItem: (key: string) => slots.get(key) ?? null,
			setItem: (key: string, value: string) => {
				slots.set(key, value);
			},
		};
		expect(
			loadGameSave(project, {
				...storage,
				setItem: () => {
					throw new Error("Quota exceeded");
				},
			}),
		).toEqual(save);
		expect(slots.size).toBe(1);
		expect(loadGameSave(project, storage)).toEqual(save);
		expect(slots.get(legacyKey)).toBe(legacyRaw);
		expect(slots.has(GAME_SAVE_PREFIX + save.projectId)).toBe(true);
		project.ruleGroups[0].collapsed = !project.ruleGroups[0].collapsed;
		expect(loadGameSave(project, storage)).toEqual(save);
		project.rules[0].enabled = !project.rules[0].enabled;
		expect(loadGameSave(project, storage)).toBeNull();
	});

	it.each<{ name: string; path: string[]; value: unknown }>([
		{ name: "version", path: ["version"], value: 999 },
		{ name: "missing state", path: ["state"], value: undefined },
		{
			name: "negative inventory",
			path: ["state", "inventory", "bad"],
			value: -1,
		},
		{ name: "unknown item", path: ["state", "inventory", "bad"], value: 1 },
		{ name: "area", path: ["player", "areaId"], value: "absent" },
		{ name: "position", path: ["player", "position", "x"], value: 900 },
		{ name: "facing", path: ["player", "facing"], value: { x: 1, y: 1 } },
		{
			name: "quest status",
			path: ["quests", "statuses", "bad"],
			value: "completed",
		},
		{ name: "world id", path: ["world", "openedObjectIds"], value: ["absent"] },
		{ name: "facts", path: ["quests", "facts"], value: ["bad JSON"] },
		{ name: "transient extra", path: ["player", "keys"], value: ["Space"] },
	])("rejects corrupt $name cleanly", ({ path, value }) => {
		const { project, session } = ready();
		const saved = createGameSave(project, session);
		let target = saved as unknown as Record<string, unknown>;
		for (const key of path.slice(0, -1))
			target = target[key] as Record<string, unknown>;
		target[path[path.length - 1]] = value;
		expect(() => parseGameSave(JSON.stringify(saved), project)).toThrow(
			/Save game/,
		);
	});

	it("rejects broken JSON and prototype keys", () => {
		const { project } = ready();
		for (const raw of ["{", '{"__proto__":{"polluted":true}}'])
			expect(() => parseGameSave(raw, project)).toThrow(/corrupt/);
	});

	it("does not replace a prior slot when serialization or storage fails", () => {
		const { project, session } = ready();
		let raw: string | null = null;
		const storage = {
			getItem: () => raw,
			setItem: (_key: string, value: string) => {
				raw = value;
			},
		};
		expect(loadGameSave(project, storage)).toBeNull();
		const saved = createGameSave(project, session);
		storeGameSave(project, saved, storage);
		const first = raw;
		expect(loadGameSave(project, storage)).toEqual(saved);
		expect(() =>
			storeGameSave(project, saved, {
				...storage,
				setItem: () => {
					throw new Error("Quota exceeded");
				},
			}),
		).toThrow(/Quota/);
		expect(raw).toBe(first);
		const setter = vi.fn();
		expect(() =>
			storeGameSave(project, { ...saved, version: 2 } as never, {
				...storage,
				setItem: setter,
			}),
		).toThrow();
		expect(setter).not.toHaveBeenCalled();
		expect(GAME_SAVE_PREFIX).not.toBe("adventure-builder-project-v1");
	});

	it("refuses snapshots during modal/startup/quest transactions", () => {
		const { project, session } = ready();
		session.startupPending = true;
		expect(() => createGameSave(project, session)).toThrow(/before saving/);
		session.startupPending = false;
		session.runtimeQuestState.syncing = true;
		expect(() => createGameSave(project, session)).toThrow(/before saving/);
		session.runtimeQuestState.syncing = false;
		expect(() => assertGameSaveSafe(session, true)).toThrow(/before saving/);
	});
	it("restores progression waits, vehicle identity and parked coordinates without transient deadlines", () => {
		const project = cloneProject(defaultProject);
		const s = createRuntimeSession(project);
		const area = s.project.areas[0];
		const event = area.eventBlocks[0];
		s.playerPosition = { x: event.x, y: event.y };
		s.progressionIndex = 1;
		s.waitingForTrigger = { areaId: area.id, eventBlockId: event.id };
		const boat = area.objects.find(
			(o) => o.objectDefinitionId === "object_dock_marker",
		);
		expect(boat).toBeDefined();
		s.playerVehicleState = {
			active: true,
			vehicleObjectInstanceId: boat!.id,
			vehicleType: "boat",
			movementMode: "sail",
		};
		s.currentMovementMode = "sail";
		s.traversal = createRuntimeTraversal(
			createTraversalWorld(s.project, area),
			area,
			s.project,
			s.playerPosition,
		);
		s.playerPosition = { x: 14, y: 7 };
		boat!.x = 14;
		expect(createGameSave(project, s).player.traversal).toBeUndefined();
		s.nextMoveAt = 12345;
		const restored = restoreGameSave(project, createGameSave(project, s));
		expect(restored.playerVehicleState).toEqual(s.playerVehicleState);
		expect(restored.currentMovementMode).toBe("sail");
		expect(
			restored.project.areas[0].objects.find((o) => o.id === boat!.id)?.x,
		).toBe(14);
		expect(restored.progressionIndex).toBe(1);
		expect(restored.waitingForTrigger).toEqual(s.waitingForTrigger);
		expect(restored.nextMoveAt).toBe(0);
	});
});
