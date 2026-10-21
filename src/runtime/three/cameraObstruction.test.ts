import { describe, expect, it } from "vitest";
import demo from "../../../movement-v2-demo.project.json";
import { migrateProject } from "../../data/migrateProject";
import type { TraversalSolid } from "../traversal";
import {
	createTraversalWorld,
	floorHeightAt,
	sampleTraversalTerrain,
} from "../traversal";
import { getThirdPersonCameraRig } from "./cameraControls";
import {
	advanceCameraClearance,
	applyCameraClearance,
	getCameraClearFraction,
} from "./cameraObstruction";

const wall: TraversalSolid = {
	id: "wall",
	center: [0, 2, 3],
	half: [2, 2, 0.1],
	axes: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
};
const rig = { lookAt: { x: 0, y: 2, z: 0 }, position: { x: 0, y: 2, z: 6 } };
describe("camera clearance using cached traversal boxes", () => {
	it.each([
		"blocky",
		"smooth",
	] as const)("clears actual %s terrain, stairs and platform supports without flattening sky-look", (mode) => {
		const project = migrateProject(demo);
		const world = createTraversalWorld(project, project.areas[0], mode);
		const points = [
			{ x: 3, y: 8 },
			{ x: 8, y: 11 },
			{ x: 12, y: 12 },
			{ x: 1.4, y: 8 },
		];
		for (const point of points) {
			let foot = sampleTraversalTerrain(world, point);
			for (const candidate of world.candidates(point.x, point.y)) {
				if (candidate.floor)
					foot = Math.max(
						foot,
						floorHeightAt(candidate.floor, point.x, point.y) ?? foot,
					);
			}
			for (let yaw = 0; yaw < 360; yaw += 45) {
				const desired = getThirdPersonCameraRig(
					{ x: point.x, y: foot + 0.625, z: point.y },
					{
						distance: 6,
						height: 1.5,
						lookAtHeight: 0.3,
						pitchDegrees: -82,
						yawDegrees: yaw,
					},
				);
				const fraction = getCameraClearFraction(
					world,
					desired.lookAt,
					desired.position,
				);
				const actual = applyCameraClearance(desired, fraction);
				expect(actual.position.y).toBeGreaterThanOrEqual(
					sampleTraversalTerrain(world, {
						x: actual.position.x,
						y: actual.position.z,
					}) + 0.219,
				);
				if (fraction > 0)
					expect(
						(actual.lookAt.y - actual.position.y) /
							Math.hypot(
								actual.lookAt.x - actual.position.x,
								actual.lookAt.z - actual.position.z,
							),
					).toBeCloseTo(Math.tan((82 * Math.PI) / 180));
			}
		}
	});

	it("contracts for a floor-crossing segment with footprint clearance, but ordinary sky-look clears flat ground", () => {
		const project = migrateProject(demo);
		const world = createTraversalWorld(project, project.areas[0]);
		world.solids.length = 0;
		const from = { x: 3, y: 2, z: 8 };
		const to = { x: 3, y: 0, z: 9 };
		const fraction = getCameraClearFraction(world, from, to);
		expect(fraction).toBeGreaterThan(0);
		expect(fraction).toBeLessThan(1);
		expect(
			applyCameraClearance({ lookAt: from, position: to }, fraction).position.y,
		).toBeCloseTo(1.22, 3);
		const desired = getThirdPersonCameraRig(
			{ x: 3, y: 1.625, z: 8 },
			{
				distance: 6,
				height: 1.5,
				lookAtHeight: 0.3,
				pitchDegrees: -82,
				yawDegrees: 0,
			},
		);
		expect(
			getCameraClearFraction(world, desired.lookAt, desired.position),
		).toBe(1);
	});

	it("still contracts a sky-looking boom at a true wall without changing its aim", () => {
		const sky = {
			lookAt: { x: 0, y: 2, z: 0 },
			position: { x: 0, y: 0.3, z: 1 },
		};
		const blocker = {
			...wall,
			center: [0, 1, 0.6] as [number, number, number],
		};
		const fraction = getCameraClearFraction(
			{ solids: [blocker] },
			sky.lookAt,
			sky.position,
		);
		expect(fraction).toBeGreaterThan(0);
		expect(fraction).toBeLessThan(1);
		const actual = applyCameraClearance(sky, fraction);
		expect(actual.lookAt).toEqual(sky.lookAt);
		expect(
			(actual.lookAt.y - actual.position.y) / actual.position.z,
		).toBeCloseTo(1.7);
	});
	it("stops in front of a wall with near-plane clearance and leaves inputs untouched", () => {
		const boxes = [wall];
		const before = JSON.stringify({ boxes, rig });
		const fraction = getCameraClearFraction(
			{ solids: boxes },
			rig.lookAt,
			rig.position,
		);
		expect(fraction).toBeCloseTo(2.72 / 6);
		expect(applyCameraClearance(rig, fraction).position.z).toBeCloseTo(2.72);
		expect(applyCameraClearance(rig, 0.2).lookAt.y).toBeCloseTo(
			rig.lookAt.y + 0.45,
		);
		expect(applyCameraClearance(rig, 1)).toEqual(rig);
		expect(JSON.stringify({ boxes, rig })).toBe(before);
	});
	it("ignores boxes off the segment, handles rotation and chooses the nearest solid", () => {
		expect(
			getCameraClearFraction(
				{ solids: [{ ...wall, center: [8, 2, 3] }] },
				rig.lookAt,
				rig.position,
			),
		).toBe(1);
		const rotated: TraversalSolid = {
			...wall,
			axes: [
				[0, 0, 1],
				[0, 1, 0],
				[-1, 0, 0],
			],
			half: [0.1, 2, 2],
		};
		expect(
			getCameraClearFraction({ solids: [rotated] }, rig.lookAt, rig.position),
		).toBeCloseTo(2.72 / 6);
		expect(
			getCameraClearFraction(
				{ solids: [wall, { ...wall, center: [0, 2, 2] }] },
				rig.lookAt,
				rig.position,
			),
		).toBeLessThan(0.3);
	});
	it("queries grid-space solids from the centered render world without copying them", () => {
		const offset = { x: -14.5, z: -8.5 };
		const from = { x: offset.x, y: 2, z: offset.z };
		const to = { x: offset.x, y: 2, z: offset.z + 6 };
		expect(
			getCameraClearFraction({ solids: [wall] }, from, to, offset),
		).toBeCloseTo(2.72 / 6);
	});
	it("contracts immediately and restores smoothly at 30/60/120 FPS without oscillation", () => {
		expect(advanceCameraClearance(1, 0.3, 16)).toBe(0.3);
		const result = [30, 60, 120].map((fps) => {
			let value = 0.3;
			for (let i = 0; i < fps; i++)
				value = advanceCameraClearance(value, 1, 1000 / fps);
			return value;
		});
		for (const v of result) {
			expect(v).toBeCloseTo(result[0], 10);
			expect(v).toBeGreaterThan(0.999);
			expect(v).toBeLessThan(1);
		}
		expect(advanceCameraClearance(result[0], 0.3, 16)).toBe(0.3);
	});
});
