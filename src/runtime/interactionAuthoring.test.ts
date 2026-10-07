import { describe, expect, it } from "vitest";
import { defaultMapEntityTransform } from "../data/mapEntityTransform";
import { migrateProject } from "../data/migrateProject";
import { createProjectFromPreset } from "../data/projectPresets";
import { validateProject } from "../data/validateProject";
import type { Interaction } from "../types/game";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	getDialogueNode,
} from "./dialogueEngine";
import {
	findNearestInteractableTarget,
	findTouchInteractableTarget,
} from "./interactionDiscovery";
import { prepareInteractionMessage } from "./interactionMessages";
import { interactionPrompt } from "./interactionPrompt";
import { attemptPlayerMove } from "./playerMovementTransaction";
import {
	collectRuntimeObjectPickup,
	collectRuntimePickup,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
import { createRuntimeSession } from "./runtimeSession";
import { createRuntimeTraversal, createTraversalWorld } from "./traversal";

const message: Interaction = {
	type: "show_message",
	activationMode: "on_interact",
	prompt: "Read sign",
	lines: ["Welcome to Tidewatch."],
};
function setup() {
	const project = createProjectFromPreset("blank");
	const area = project.areas[0];
	area.objects = [
		{
			id: "sign",
			objectDefinitionId: "sign",
			areaId: area.id,
			x: 4,
			y: 4,
			interaction: { ...message },
		},
	];
	area.npcs = [];
	area.eventBlocks = [];
	area.pickups = [];
	project.objects = [
		{
			id: "sign",
			name: "Sign",
			category: "sign",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
		},
	];
	const session = createRuntimeSession(project);
	session.playerPosition = { x: 4, y: 5 };
	session.playerFacing = { x: 0, y: -1 };
	session.traversal = createRuntimeTraversal(
		createTraversalWorld(session.project, session.project.areas[0], "smooth"),
		session.project.areas[0],
		session.project,
		session.playerPosition,
	);
	return { project, session, area: session.project.areas[0] };
}
function target(
	session: ReturnType<typeof createRuntimeSession>,
	range?: number,
) {
	return findNearestInteractableTarget({
		project: session.project,
		area: session.project.areas[0],
		playerPosition: session.traversal?.position ?? session.playerPosition,
		playerFacing: session.playerFacing,
		traversal: session.traversal,
		runtimeState: session.runtimeState,
		firedInteractionIds: session.firedInteractionIds,
		range,
	});
}

describe("interaction authoring contract", () => {
	it("reports a missing pickup item and preserves the collectible until its definition is repaired", () => {
		const { session, area } = setup();
		area.objects[0].interaction = {
			type: "collect_item",
			activationMode: "on_interact",
			itemId: "missing",
			quantity: 1,
		};
		expect(
			validateProject(session.project).some((issue) =>
				issue.message.includes('missing item "missing"'),
			),
		).toBe(true);
		expect(collectRuntimeObjectPickup(session, "sign", () => {})).toBe(false);
		expect(area.objects).toHaveLength(1);
		expect(session.collectedPickupIds.size).toBe(0);
	});
	it("collects an authored prop through inventory and removes only its session collider and visual source", () => {
		const { project } = setup();
		project.items = [
			{ id: "supplies", name: "Supplies", category: "misc", stackable: true },
		];
		project.objects[0].threeVisual = { mode: "asset", assetId: "world-barrel" };
		project.areas[0].objects[0].interaction = {
			type: "collect_item",
			activationMode: "on_interact",
			itemId: "supplies",
			quantity: 3,
		};
		const authored = JSON.stringify(project);
		const session = createRuntimeSession(migrateProject(JSON.parse(authored)));
		const area = session.project.areas[0];
		session.traversal = createRuntimeTraversal(
			createTraversalWorld(session.project, area, "smooth"),
			area,
			session.project,
			{ x: 4, y: 5 },
		);
		expect(session.traversal.world.profiledObjects.has("sign")).toBe(true);
		expect(collectRuntimeObjectPickup(session, "sign", () => {})).toBe(true);
		expect(session.runtimeState.inventory.items.supplies).toBe(3);
		expect(area.objects).toHaveLength(0);
		expect(session.traversal.world.profiledObjects.has("sign")).toBe(false);
		expect(collectRuntimeObjectPickup(session, "sign", () => {})).toBe(false);
		expect(JSON.stringify(project)).toBe(authored);
		expect(createRuntimeSession(project).project.areas[0].objects).toHaveLength(
			1,
		);
	});
	it("targets transformed nearby entities with metre range, facing and stable ties", () => {
		const { session, area } = setup();
		area.objects[0].transform = defaultMapEntityTransform();
		area.objects[0].transform.position.z = -0.6;
		expect(target(session)?.id).toBe("sign");
		expect(target(session, 1.5)).toBeNull();
		session.playerFacing.y = 1;
		expect(target(session)).toBeNull();
		session.playerFacing.y = -1;
		area.objects.push({ ...area.objects[0], id: "a" });
		expect(target(session)?.id).toBe("a");
	});
	it("blocks interaction through an existing solid while allowing the target's own collider", () => {
		const { session } = setup();
		const world = session.traversal!.world;
		world.solids.push({
			id: "wall",
			center: [4, 0.9, 4.5],
			axes: [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			],
			half: [1, 2, 0.04],
		});
		expect(target(session)).toBeNull();
		world.solids[0].id = "sign";
		expect(target(session)?.id).toBe("sign");
	});
	it("shows one friendly prompt and uses the existing dialogue progression", () => {
		const { session } = setup();
		expect(interactionPrompt(session, target(session))).toBe("E — Read sign");
		const definition = prepareInteractionMessage(
			session,
			{
				...message,
				speaker: "Keeper",
				lines: ["Storm came through.", "Keep the key."],
			},
			"sign",
			"Keeper",
		)!;
		const state = createRuntimeDialogueState(definition);
		expect(getDialogueNode(definition, state.nodeId)?.text).toBe(
			"Storm came through.",
		);
		advanceDialogue(definition, state);
		expect(getDialogueNode(definition, state.nodeId)?.text).toBe(
			"Keep the key.",
		);
		expect(advanceDialogue(definition, state)).toBeUndefined();
	});
	it("does not activate explicitly enabled containers by touching and grants only once", () => {
		const { project, session, area } = setup();
		session.project.items.push({
			id: "key",
			name: "Harbour Key",
			category: "key",
			stackable: false,
		});
		const chest = area.objects[0];
		chest.interaction = {
			type: "object_behaviour",
			activationMode: "on_interact",
			prompt: "Open chest",
		};
		chest.behaviourOverride = {
			type: "container",
			contents: [{ itemId: "key", quantity: 1 }],
			once: true,
		};
		const saved = JSON.stringify(project);
		expect(
			runRuntimeObjectBehaviour(session, chest, () => {}, "on_touch"),
		).toBe(false);
		runRuntimeObjectBehaviour(session, chest, () => {});
		runRuntimeObjectBehaviour(session, chest, () => {});
		expect(session.runtimeState.inventory.items.key).toBe(1);
		expect(session.openedObjectIds.has(chest.id)).toBe(true);
		expect(interactionPrompt(session, target(session))).toBe("E — Empty chest");
		chest.interaction.activationMode = "disabled";
		expect(target(session)).toBeNull();
		expect(JSON.stringify(project)).toBe(saved);
		expect(createRuntimeSession(project).openedObjectIds.size).toBe(0);
	});
	it("collects an existing pickup once and excludes it after collection", () => {
		const { session, area } = setup();
		session.project.items.push({
			id: "key",
			name: "Harbour Key",
			category: "key",
			stackable: false,
		});
		const pickup = {
			id: "key-drop",
			itemId: "key",
			quantity: 1,
			areaId: area.id,
			x: 4,
			y: 5,
			once: true,
			pickupMode: "on_touch" as const,
		};
		area.pickups.push(pickup);
		expect(collectRuntimePickup(session, pickup, () => {})).toBe(true);
		expect(collectRuntimePickup(session, pickup, () => {})).toBe(false);
		expect(
			findTouchInteractableTarget({
				project: session.project,
				area,
				playerPosition: session.playerPosition,
				runtimeState: session.runtimeState,
				collectedPickupIds: session.collectedPickupIds,
			}),
		).toBeNull();
	});
	it("fires a trigger on cell entry, never on an unchanged cell, and remembers once per session", () => {
		const { session, area } = setup();
		area.objects = [];
		const interaction: Interaction = {
			...message,
			activationMode: "on_touch",
			once: true,
		};
		area.eventBlocks.push({
			id: "trigger",
			name: "Quay",
			kind: "trigger",
			tag: "",
			x: 4,
			y: 4,
			interaction,
		});
		let move = attemptPlayerMove(session, { x: 0, y: -1 }, 1000, 0.2);
		expect(move.type === "moved" && move.touchTargets.length).toBe(0);
		attemptPlayerMove(session, { x: 0, y: -1 }, 2000, 0.2);
		move = attemptPlayerMove(session, { x: 0, y: -1 }, 3000, 0.2);
		expect(move.type === "moved" && move.touchTargets[0]?.id).toBe("trigger");
		expect(
			prepareInteractionMessage(session, interaction, "trigger", "Quay"),
		).toBeDefined();
		expect(
			prepareInteractionMessage(session, interaction, "trigger", "Quay"),
		).toBeUndefined();
	});
	it("round trips authored messages, preserves disabled state, and rejects malformed text", () => {
		const { project } = setup();
		project.areas[0].objects[0].interaction = {
			...message,
			speaker: "",
			once: false,
		};
		const loaded = migrateProject(JSON.parse(JSON.stringify(project)));
		expect(loaded.areas[0].objects[0].interaction).toEqual(
			project.areas[0].objects[0].interaction,
		);
		const raw = JSON.parse(JSON.stringify(project));
		raw.areas[0].objects[0].interaction = {
			type: "show_message",
			lines: [42, "Good", null],
			activationMode: "disabled",
		};
		expect(migrateProject(raw).areas[0].objects[0].interaction).toMatchObject({
			lines: ["Good"],
			activationMode: "disabled",
		});
		delete raw.areas[0].objects[0].interaction;
		expect(migrateProject(raw).areas[0].objects[0].interaction).toBeUndefined();
	});
});
