import { describe, expect, it } from "vitest";
import demo from "../../hollow-kingdom.project.json";
import { createTraversalWorld, sweepTraversal } from "../runtime/traversal";
import { importProjectJson } from "./projectImport";

describe("Merewatch", () => {
	it("imports a moonlit area and retains legacy atmosphere defaults", () => {
		const project = importProjectJson(JSON.stringify(demo));
		expect(project.areas[0].theme?.atmosphere).toBe("moonlit");
		expect(
			importProjectJson(
				JSON.stringify(demo).replace('"moonlit"', '"unknown-weather"'),
			).areas[0].theme?.atmosphere,
		).toBeUndefined();
		delete project.areas[0].theme?.atmosphere;
		expect(
			importProjectJson(JSON.stringify(project)).areas[0].theme?.atmosphere,
		).toBeUndefined();
	});
	it("keeps the cottage solid and the lane open at character scale", () => {
		const project = importProjectJson(JSON.stringify(demo));
		const area = project.areas[0];
		const world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 20, y: 48, height: 1 },
				{ x: -4, y: 0 },
			).reason,
		).toContain("Crooked Cottage");
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 20, y: 52, height: 1 },
				{ x: 0.75, y: -8 },
			).reason,
		).toBeUndefined();
	});
	it("grounds both dock sections and rejects open water and the well", () => {
		const project = importProjectJson(JSON.stringify(demo));
		const area = project.areas[0];
		const world = createTraversalWorld(project, area);
		let position = { x: 20, y: 56, height: 1 };
		for (const [x, y] of [
			[20, 47],
			[21, 43],
			[22, 39],
			[23.45, 37],
			[23.45, 33],
			[23.45, 29],
		]) {
			const step = sweepTraversal(world, area, project, position, {
				x: x - position.x,
				y: y - position.y,
			});
			expect(step.reason).toBeUndefined();
			position = step.position;
		}
		expect(position.height).toBeCloseTo(1.01);
		expect(
			sweepTraversal(world, area, project, position, { x: 0, y: -3 }).reason,
		).toMatch(/floor|water/i);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 24.45, y: 44, height: 1 },
				{ x: 0, y: -3 },
			).reason,
		).toContain("Well");
	});
});
