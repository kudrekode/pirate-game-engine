import { Euler, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import harbour from "../../docs/assets/world-kit/tidewatch-harbour.project.json";
import { migrateProject } from "../data/migrateProject";
import { createProjectFromPreset } from "../data/projectPresets";
import type { GameProject, MapEntityTransform } from "../types/game";
import { attemptPlayerMove } from "./playerMovementTransaction";
import { createRuntimeSession } from "./runtimeSession";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	floorHeightAt,
	intersectsTraversalSolid,
	MAX_STEP_HEIGHT,
	resolveTraversalFloor,
	sampleTraversalMotion,
	sweepTraversal,
	transformTraversalBox,
	transformTraversalPoint,
	traversalFrame,
} from "./traversal";

function fixture() {
	const project = createProjectFromPreset("blank"),
		area = project.areas[0];
	area.width = 20;
	area.height = 15;
	area.objects = [];
	area.npcs = [];
	area.structures = [];
	area.eventBlocks = [];
	area.overlayTiles = [];
	area.terrainTiles = Array.from({ length: 300 }, (_, i) => ({
		x: i % 20,
		y: Math.floor(i / 20),
		tileId: "sand",
	}));
	project.player.canWalkOn = ["sand"];
	return { project, area };
}
function place(
	project: GameProject,
	asset: string,
	x = 5,
	y = 5,
	patch: Partial<MapEntityTransform> = {},
) {
	const area = project.areas[0],
		id = `${asset}-${area.objects.length}`;
	project.objects.push({
		id,
		name: asset,
		category: "prop",
		widthTiles: 1,
		heightTiles: 1,
		blocksMovement: false,
		threeVisual: { mode: "asset", assetId: asset },
	});
	area.objects.push({
		id,
		objectDefinitionId: id,
		areaId: area.id,
		x,
		y,
		transform: {
			position: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			...patch,
		},
	});
	return area.objects[area.objects.length - 1];
}

describe("shared traversal", () => {
	it("treats upright floor pieces as barriers and preserves subcell position on a terrain-mode rebuild", () => {
		const { project, area } = fixture();
		place(project, "world-floor", 5, 5, { rotation: { x: 90, y: 0, z: 0 } });
		const world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 5, y: 3, height: 1 },
				{ x: 0, y: 4 },
			).reason,
		).toContain("Blocked by");
		const rebuilt = createRuntimeTraversal(
			createTraversalWorld(project, area, "blocky"),
			area,
			project,
			{ x: 2, y: 2 },
			{ x: 2.2, y: 2.3, height: 1 },
		);
		expect(rebuilt.position).toEqual({ x: 2.2, y: 2.3, height: 1 });
		expect(rebuilt.grid).toEqual({ x: 2, y: 2 });
	});
	it("retains cardinal gameplay facing for grid combat after a continuous diagonal move", () => {
		const { project } = fixture();
		place(project, "world-floor", 10, 10);
		const session = createRuntimeSession(project),
			runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 2, y: 2 };
		session.traversal = createRuntimeTraversal(
			createTraversalWorld(session.project, runtimeArea),
			runtimeArea,
			session.project,
			session.playerPosition,
		);
		const move = attemptPlayerMove(
			session,
			{ x: Math.SQRT1_2, y: Math.SQRT1_2 },
			1000,
			0.2,
		);
		expect(move.type).toBe("moved");
		expect(session.playerFacing).toEqual({ x: 0, y: 1 });
		expect(move.facing).toEqual({ x: Math.SQRT1_2, y: Math.SQRT1_2 });
		expect(session.playerPosition).toEqual({ x: 2, y: 2 });
	});
	it("matches renderer XYZ rotation, per-axis scale, position and visual defaults", () => {
		const t: MapEntityTransform = {
			position: { x: 0.2, y: 0.4, z: -0.3 },
			rotation: { x: 17, y: 38, z: -12 },
			scale: { x: 2, y: 0.7, z: 1.4 },
		};
		const frame = traversalFrame([5, 1, 7], t, {
			scale: 1.2,
			rotationOffset: 10,
			heightOffset: 0.1,
		});
		const matrix = new Matrix4().makeRotationFromEuler(
			new Euler(
				(17 * Math.PI) / 180,
				(48 * Math.PI) / 180,
				(-12 * Math.PI) / 180,
			),
		);
		const expected = new Vector3(0.4, 0.8, -0.2)
			.multiply(new Vector3(2.4, 0.84, 1.68))
			.applyMatrix4(matrix)
			.add(new Vector3(5.2, 1.5, 6.7));
		transformTraversalPoint(frame, [0.4, 0.8, -0.2]).forEach((v, i) => {
			expect(v).toBeCloseTo(expected.toArray()[i], 10);
		});
	});
	it("rejects rotated/scaled solids, respects elevation and does not use their AABB corners", () => {
		const frame = traversalFrame([5, 1, 5], {
			position: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: 45, z: 0 },
			scale: { x: 2, y: 1, z: 1 },
		});
		const solid = transformTraversalBox("wall", frame, {
			min: [-1, 0, -0.1],
			max: [1, 2, 0.1],
		});
		expect(intersectsTraversalSolid(solid, { x: 5, y: 5, height: 1 })).toBe(
			true,
		);
		expect(intersectsTraversalSolid(solid, { x: 6.3, y: 6.3, height: 1 })).toBe(
			false,
		);
		expect(intersectsTraversalSolid(solid, { x: 5, y: 5, height: 3 })).toBe(
			false,
		);
	});
	it("blocks thin walls and diagonal corner cuts along the whole path", () => {
		const { project, area } = fixture();
		place(project, "world-wall", 5, 5, { rotation: { x: 0, y: 90, z: 0 } });
		const world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 3, y: 5, height: 1 },
				{ x: 4, y: 0 },
			).position.x,
		).toBeLessThan(4.8);
		const corner = sweepTraversal(
			world,
			area,
			project,
			{ x: 4, y: 3.5, height: 1 },
			{ x: 2, y: 2 },
		);
		expect(corner.reason).toContain("Blocked by");
	});
	it("chooses the highest reachable floor, blocks tall platforms and never selects roofs", () => {
		const { project, area } = fixture();
		const floor = place(project, "world-floor", 5, 5);
		floor.transform!.position.y = MAX_STEP_HEIGHT - 0.157895;
		let world = createTraversalWorld(project, area);
		expect(
			resolveTraversalFloor(world, area, project, { x: 5, y: 5 }, 1)?.height,
		).toBeCloseTo(1 + MAX_STEP_HEIGHT);
		floor.transform!.position.y += 0.02;
		world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 3, y: 5, height: 1 },
				{ x: 2, y: 0 },
			).reason,
		).toContain("Raised floor");
		floor.transform!.position.y = 3;
		world = createTraversalWorld(project, area);
		expect(
			resolveTraversalFloor(world, area, project, { x: 5, y: 5 }, 1)?.height,
		).toBe(1);
	});
	it("samples tilted and scaled floors in transformed space", () => {
		const { project, area } = fixture();
		place(project, "world-floor", 5, 5, {
			rotation: { x: 15, y: 35, z: 8 },
			scale: { x: 1.5, y: 2, z: 1 },
		});
		const world = createTraversalWorld(project, area),
			floor = world.floors[0];
		const corner = floor.corners[0];
		expect(floorHeightAt(floor, corner[0], corner[2])).toBeCloseTo(corner[1]);
		expect(floorHeightAt(floor, 0, 0)).toBeUndefined();
	});
	it("walks off-centre up stairs, stays at rest and descends without jumping", () => {
		const { project, area } = fixture();
		place(project, "world-stairs", 5, 5);
		const world = createTraversalWorld(project, area);
		const up = sweepTraversal(
			world,
			area,
			project,
			{ x: 5.2, y: 6, height: 1 },
			{ x: 0, y: -1.4 },
		);
		expect(up.reason).toBeUndefined();
		expect(up.position.height).toBeCloseTo(1.54);
		const state = createRuntimeTraversal(world, area, project, up.position);
		state.position = up.position;
		state.path = [up.position];
		expect(sampleTraversalMotion(state, 1000)).toEqual(up.position);
		const down = sweepTraversal(world, area, project, up.position, {
			x: 0,
			y: 1.4,
		});
		expect(down.reason).toBeUndefined();
		expect(down.position.height).toBe(1);
	});
	it("crosses adjacent floor seams and dock seams over water without dropping", () => {
		for (const asset of ["world-floor", "world-dock"]) {
			const { project, area } = fixture();
			area.terrainTiles.forEach((t) => {
				t.tileId = "water";
			});
			place(project, asset, 5, 5);
			place(project, asset, 5, 7);
			const world = createTraversalWorld(project, area),
				height = world.floors[0].corners[0][1];
			const result = sweepTraversal(
				world,
				area,
				project,
				{ x: 5, y: 5, height },
				{ x: 0, y: 2 },
			);
			expect(result.reason, asset).toBeUndefined();
			expect(
				result.path.every((p) => Math.abs(p.height - height) < 0.001),
			).toBe(true);
		}
	});
	it("blocks deep water, void, the backdrop and large drops", () => {
		const { project, area } = fixture();
		area.terrainTiles.find((t) => t.x === 6 && t.y === 5)!.tileId = "water";
		let world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 5, y: 5, height: 1 },
				{ x: 2, y: 0 },
			).reason,
		).toContain("No reachable floor");
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 19, y: 4, height: 1 },
				{ x: 2, y: 0 },
			).reason,
		).toBe("Out of bounds.");
		area.terrainTiles = area.terrainTiles.filter(
			(t) => !(t.x === 6 && t.y === 5),
		);
		world = createTraversalWorld(project, area);
		expect(
			sweepTraversal(
				world,
				area,
				project,
				{ x: 5, y: 5, height: 1 },
				{ x: 2, y: 0 },
			).reason,
		).toContain("No reachable floor");
	});
	it("allows the shack doorway and interior while blocking side/back walls and lintel", () => {
		const { project, area } = fixture();
		place(project, "world-shack", 5, 5);
		const world = createTraversalWorld(project, area);
		const entry = sweepTraversal(
			world,
			area,
			project,
			{ x: 5, y: 7, height: 1 },
			{ x: 0, y: -2 },
		);
		expect(entry.reason).toBeUndefined();
		expect(
			sweepTraversal(world, area, project, entry.position, { x: 3, y: 0 })
				.reason,
		).toContain("Blocked by");
		expect(
			sweepTraversal(world, area, project, entry.position, { x: 0, y: -3 })
				.reason,
		).toContain("Blocked by");
		expect(
			world.solids.some((s) =>
				intersectsTraversalSolid(s, { x: 5, y: 6.1, height: 1.5 }),
			),
		).toBe(true);
	});
	it("keeps legacy movement, definitions/instance overrides and project persistence", () => {
		const { project, area } = fixture();
		const object = place(project, "world-crate", 5, 5);
		object.threeVisual = { mode: "placeholder" };
		expect(createTraversalWorld(project, area).profiledObjects.size).toBe(0);
		delete object.threeVisual;
		const saved = JSON.stringify(project),
			reloaded = migrateProject(JSON.parse(saved));
		expect(createTraversalWorld(reloaded, reloaded.areas[0]).solids).toEqual(
			createTraversalWorld(project, area).solids,
		);
		const legacy = createRuntimeSession(project);
		legacy.playerPosition = { x: 5, y: 4 };
		expect(attemptPlayerMove(legacy, { x: 0, y: 1 }).type).toBe("moved");
		const session = createRuntimeSession(project);
		session.playerPosition = { x: 5, y: 3 };
		session.traversal = createRuntimeTraversal(
			createTraversalWorld(session.project, session.project.areas[0]),
			session.project.areas[0],
			session.project,
			session.playerPosition,
		);
		attemptPlayerMove(session, { x: 0, y: 1 }, 0, 0.2);
		expect(session.playerPosition).toEqual({ x: 5, y: 3 });
		expect(session.traversal.position.y).toBeCloseTo(3.2);
		expect(JSON.stringify(project)).toBe(saved);
	});
	it("retains input timing, emits cell triggers once, resets after teleports, and leaves Play data isolated", () => {
		const { project, area } = fixture();
		place(project, "world-floor", 10, 10);
		area.pickups = [
			{
				id: "coin",
				itemId: "gold_coin",
				quantity: 1,
				areaId: area.id,
				x: 5,
				y: 4,
				pickupMode: "on_touch",
				once: true,
			},
		];
		const saved = JSON.stringify(project),
			session = createRuntimeSession(project),
			runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 5, y: 3 };
		session.traversal = createRuntimeTraversal(
			createTraversalWorld(session.project, runtimeArea),
			runtimeArea,
			session.project,
			session.playerPosition,
		);
		let touches = 0;
		for (let i = 0; i < 5; i++) {
			const move = attemptPlayerMove(session, { x: 0, y: 1 }, i * 100, 0.2);
			if (move.type === "moved") touches += move.touchTargets.length;
		}
		expect(touches).toBe(1);
		expect(attemptPlayerMove(session, { x: 1, y: 0 }, 401, 0.2).type).toBe(
			"blocked",
		);
		session.playerPosition = { x: 2, y: 2 };
		attemptPlayerMove(session, { x: 1, y: 0 }, 1000, 0.2);
		expect(session.traversal.position.x).toBeCloseTo(2.2);
		expect(JSON.stringify(project)).toBe(saved);
	});
	it("runs the unchanged Tidewatch beach/stairs/dock round trip through shared transactions", () => {
		const project = migrateProject(harbour),
			session = createRuntimeSession(project),
			area = session.project.areas[0];
		session.playerPosition = { x: 9, y: 8 };
		session.traversal = createRuntimeTraversal(
			createTraversalWorld(session.project, area),
			area,
			session.project,
			session.playerPosition,
		);
		let time = 1000;
		const go = (x: number, y: number) => {
			for (let i = 0; i < 300; i++) {
				const p = session.traversal!.position,
					dx = x - p.x,
					dy = y - p.y,
					d = Math.hypot(dx, dy);
				if (d < 0.001) return;
				const move = attemptPlayerMove(
					session,
					{ x: dx / d, y: dy / d },
					time,
					Math.min(0.2, d),
				);
				time += 100;
				expect(move.type, JSON.stringify({ target: [x, y], at: p, move })).toBe(
					"moved",
				);
			}
			throw new Error("Route did not finish");
		};
		go(8.8, 9.3);
		go(8.8, 9.8);
		expect(session.traversal.position.height).toBeGreaterThan(1.2);
		go(8.8, 11.5);
		go(8.8, 13.5);
		expect(session.traversal.position.height).toBeCloseTo(0.625782);
		go(8.8, 10.5);
		go(8.8, 9.3);
		go(9, 8);
		expect(session.traversal.position.height).toBe(1);
	});
});
