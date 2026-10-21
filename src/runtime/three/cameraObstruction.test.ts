import { describe, expect, it } from "vitest";
import type { TraversalSolid } from "../traversal";
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
