import { expect, it } from "vitest";
import scene from "../../hollow-kingdom.project.json";
import { findNearestInteractableTarget } from "../runtime/interactionDiscovery";
import { attemptPlayerMove } from "../runtime/playerMovementTransaction";
import {
	dismountRuntimeVehicle,
	runRuntimeObjectBehaviour,
} from "../runtime/runtimeObjectInteractions";
import { createRuntimeSession } from "../runtime/runtimeSession";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	isTraversalBodyBlocked,
	resolveTraversalFloor,
} from "../runtime/traversal";
import { importProjectJson } from "./projectImport";

it.each([
	undefined,
	"walkable-floor",
] as const)("lets the wayfarer use Oswin's skiff from either jetty with dock override %s", (collision) => {
	const project = importProjectJson(JSON.stringify(scene));
	if (collision)
		project.areas[0].objects.find((object) => object.id === "dock-13")!.scene =
			{ collision };
	const session = createRuntimeSession(project);
	const area = session.project.areas[0];
	const world = createTraversalWorld(session.project, area);
	session.playerPosition = { x: 24, y: 30 };
	session.traversal = createRuntimeTraversal(
		world,
		area,
		session.project,
		session.playerPosition,
		{ ...session.playerPosition, height: 1.01 },
	);
	const skiff = area.objects.find((object) => object.id === "oswins-ferry")!;
	for (const berthY of [12, 30]) {
		session.playerFacing = { x: 1, y: 0 };
		const target = findNearestInteractableTarget({
			area,
			project: session.project,
			playerFacing: session.playerFacing,
			playerPosition: session.traversal.position,
			traversal: session.traversal,
			runtimeState: session.runtimeState,
		});
		expect(target?.id).toBe(skiff.id);
		runRuntimeObjectBehaviour(session, skiff, () => {});
		expect(session.playerVehicleState.vehicleType).toBe("boat");
		const direction = Math.sign(berthY - session.playerPosition.y);
		const result = attemptPlayerMove(
			session,
			{ x: 0, y: direction },
			session.nextMoveAt,
			18,
		);
		expect(result.type).toBe("moved");
		expect(session.traversal.lastReason).toBeUndefined();
		expect(session.playerPosition).toEqual({ x: 25, y: berthY });
		expect(dismountRuntimeVehicle(session, () => {})).toBe(true);
		expect(session.playerPosition).toEqual({ x: 24, y: berthY });
		expect(session.traversal.position.height).toBeCloseTo(1.01);
		expect(session.currentMovementMode).toBe("walk");
	}
});

it("uses authored collision overrides on the cottage and the dock while water stays blocked on foot", () => {
	const project = importProjectJson(JSON.stringify(scene));
	const area = project.areas[0];
	const cottage = area.objects.find((object) => object.id === "cottage-1")!;
	const dock = area.objects.find((object) => object.id === "dock-13")!;
	const doorstep = { x: 16, y: 49, height: 1 };
	const dockEdge = { x: 24, y: 30 };
	const water = { x: 25, y: 30 };
	const original = createTraversalWorld(project, area);
	const cottageColliders = original.solids.filter(
		(solid) => solid.id === cottage.id,
	);
	const dockFloor = original.floors.find((floor) => floor.id === dock.id);
	const defaultStep = isTraversalBodyBlocked(original, doorstep);
	expect(cottageColliders.length).toBeGreaterThan(0);
	expect(defaultStep).toBe(true);
	expect(dockFloor).toBeDefined();
	expect(
		resolveTraversalFloor(original, area, project, dockEdge, 1),
	).toMatchObject({ surface: dock.id });
	expect(
		resolveTraversalFloor(original, area, project, water, 1),
	).toBeUndefined();
	cottage.scene = { collision: "none" };
	dock.scene = { collision: "solid" };
	const overridden = createTraversalWorld(project, area);
	expect(isTraversalBodyBlocked(overridden, doorstep)).toBe(false);
	expect(overridden.solids.some((solid) => solid.id === dock.id)).toBe(true);
	expect(
		resolveTraversalFloor(overridden, area, project, dockEdge, 1),
	).toBeUndefined();
	expect(
		resolveTraversalFloor(overridden, area, project, water, 1),
	).toBeUndefined();
});

it("mounts Bracken from the Merewatch path, rides across land and dismounts", () => {
	const project = importProjectJson(JSON.stringify(scene));
	const session = createRuntimeSession(project);
	const area = session.project.areas[0];
	const world = createTraversalWorld(session.project, area);
	session.playerPosition = { x: 27, y: 50 };
	session.playerFacing = { x: 0, y: -1 };
	session.traversal = createRuntimeTraversal(
		world,
		area,
		session.project,
		session.playerPosition,
	);
	const horse = area.objects.find((object) => object.id === "bracken")!;
	const target = findNearestInteractableTarget({
		area,
		project: session.project,
		playerFacing: session.playerFacing,
		playerPosition: session.traversal.position,
		traversal: session.traversal,
		runtimeState: session.runtimeState,
	});
	expect(target?.id).toBe(horse.id);
	runRuntimeObjectBehaviour(session, horse, () => {});
	expect(session.playerVehicleState.vehicleType).toBe("horse");
	expect(session.currentMovementMode).toBe("ride");
	const mountedPosition = session.playerPosition.x;
	expect(
		attemptPlayerMove(session, { x: 1, y: 0 }, session.nextMoveAt, 18).type,
	).toBe("moved");
	expect(session.playerPosition.x).toBeGreaterThan(mountedPosition);
	expect(dismountRuntimeVehicle(session, () => {})).toBe(true);
	expect(session.currentMovementMode).toBe("walk");
});
