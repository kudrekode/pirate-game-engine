import { expect, it } from "vitest";
import demo from "../../hollow-kingdom.project.json";
import { findNearestInteractableTarget } from "../runtime/interactionDiscovery";
import { createRuntimeSession } from "../runtime/runtimeSession";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	sweepTraversal,
} from "../runtime/traversal";
import { importProjectJson } from "./projectImport";

it("lets the player reach both the skiff and the dispatch box from their jetties", () => {
	const project = importProjectJson(JSON.stringify(demo));
	const session = createRuntimeSession(project);
	const area = project.areas[0];
	const world = createTraversalWorld(project, area);
	function targetFrom(
		x: number,
		y: number,
		height: number,
		facing: { x: number; y: number },
	) {
		const playerPosition = { x, y, height };
		return findNearestInteractableTarget({
			project,
			area,
			playerPosition,
			playerFacing: facing,
			runtimeState: session.runtimeState,
			traversal: createRuntimeTraversal(
				world,
				area,
				project,
				{ x: Math.round(x), y: Math.round(y) },
				playerPosition,
			),
		})?.id;
	}
	expect(targetFrom(24, 30, 1.01, { x: 1, y: 0 })).toBe("oswins-ferry");

	let position = { x: 24, y: 12, height: 1.01 };
	// Start at the tile the boat dismounts onto, clear the jetty posts, then
	// follow the dirt up to the box and back down the same slope.
	const path = [
		[23.45, 12],
		[23.45, 10],
		[23, 9],
		[22.7, 7],
		[22.5, 5],
	];
	const walk = ([x, y]: number[]) => {
		const step = sweepTraversal(world, area, project, position, {
			x: x - position.x,
			y: y - position.y,
		});
		expect(step.reason).toBeUndefined();
		position = step.position;
	};
	path.forEach(walk);
	expect(
		targetFrom(position.x, position.y, position.height, { x: 0, y: -1 }),
	).toBe("tower-dispatch-box");
	path.reverse().forEach(walk);
	walk([24, 12]);
	expect(position.height).toBeCloseTo(1.01);
});
