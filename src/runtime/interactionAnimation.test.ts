import { expect, it } from "vitest";
import demo from "../../interaction-animation-demo.project.json";
import { migrateProject } from "../data/migrateProject";
import { createGameSave, restoreGameSave } from "./gameSave";
import {
	collectRuntimeObjectPickup,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
import { createRuntimeSession } from "./runtimeSession";
import { createRuntimeTraversal, createTraversalWorld } from "./traversal";

it("keeps chest and pickup transactions immediate, duplicate-safe, isolated and semantic across Continue", () => {
	const project = migrateProject(demo),
		authored = JSON.stringify(project),
		session = createRuntimeSession(project),
		area = session.project.areas[0];
	session.currentAreaId = area.id;
	session.playerPosition = { x: 4, y: 8 };
	session.traversal = createRuntimeTraversal(
		createTraversalWorld(session.project, area),
		area,
		session.project,
		session.playerPosition,
	);
	const world = session.traversal.world,
		sampler = world.sampler,
		events: RuntimeObjectInteractionEvent[] = [];
	const chest = area.objects.find((o) => o.id === "animated-chest")!;
	expect(runRuntimeObjectBehaviour(session, chest, (e) => events.push(e))).toBe(
		true,
	);
	expect(session.runtimeState.inventory.items.harbour_key).toBe(1);
	expect(session.openedObjectIds.has(chest.id)).toBe(true);
	expect(world.solids.some((s) => s.id === chest.id)).toBe(true);
	runRuntimeObjectBehaviour(session, chest, (e) => events.push(e));
	expect(events.filter((e) => e.type === "containerOpened")).toHaveLength(1);
	expect(session.runtimeState.inventory.items.harbour_key).toBe(1);
	expect(
		collectRuntimeObjectPickup(session, "physical-pickup", (e) =>
			events.push(e),
		),
	).toBe(true);
	expect(session.runtimeState.inventory.items.rope).toBe(1);
	expect(area.objects.some((o) => o.id === "physical-pickup")).toBe(false);
	expect(world.solids.some((s) => s.id === "physical-pickup")).toBe(false);
	expect(session.traversal.world).toBe(world);
	expect(world.sampler).toBe(sampler);
	expect(
		collectRuntimeObjectPickup(session, "physical-pickup", (e) =>
			events.push(e),
		),
	).toBe(false);
	const save = createGameSave(project, session);
	const restored = restoreGameSave(project, save);
	expect(restored.openedObjectIds.has(chest.id)).toBe(true);
	expect(
		restored.project.areas[0].objects.some((o) => o.id === "physical-pickup"),
	).toBe(false);
	expect(JSON.stringify(save)).not.toMatch(
		/mixer|clipTime|animationFrame|interactionTarget/,
	);
	expect(JSON.stringify(project)).toBe(authored);
});
