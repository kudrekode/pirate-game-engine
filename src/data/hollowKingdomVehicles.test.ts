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
} from "../runtime/traversal";
import { importProjectJson } from "./projectImport";

it("lets the wayfarer use Oswin's skiff from either jetty and return to the original dock", () => {
	const project = importProjectJson(JSON.stringify(scene));
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
