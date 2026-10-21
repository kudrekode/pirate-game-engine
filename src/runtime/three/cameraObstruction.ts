import {
	floorHeightAt,
	sampleTraversalTerrain,
	type TraversalWorld,
} from "../traversal";
import type { CameraRig, CameraVector3 } from "./cameraControls";
import { getFrameLerpAlpha } from "./visualSmoothing";

type CameraWorld = Pick<TraversalWorld, "solids"> &
	Partial<Pick<TraversalWorld, "sampler" | "mode" | "candidates">>;
const CAMERA_FOOTPRINT = [
	[0, 0],
	[-0.18, -0.18],
	[-0.18, 0.18],
	[0.18, -0.18],
	[0.18, 0.18],
] as const;

/** Sweep the near-plane footprint over the cached terrain and support surfaces.
 * Ground contracts the boom along its view ray; it never clamps mouse pitch.
 * Floors above the focus are ceilings, and remain the solid-box check's job.
 */
function getCameraFloorFraction(
	world: CameraWorld,
	from: CameraVector3,
	to: CameraVector3,
	offset: { x: number; z: number },
): number {
	if (!world.sampler || !world.mode) return 1;
	const terrain = world as TraversalWorld;
	// Repeated footprint samples in the same blocky cell need only one terrain
	// lookup per query. Smooth mode already reuses cached triangle corners.
	const cellHeights = new Map<string, number>();
	const safe = (fraction: number) => {
		const x = from.x + (to.x - from.x) * fraction - offset.x;
		const z = from.z + (to.z - from.z) * fraction - offset.z;
		const y = from.y + (to.y - from.y) * fraction;
		for (const [dx, dz] of CAMERA_FOOTPRINT) {
			const point = { x: x + dx, y: z + dz };
			const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
			let floor = world.mode === "blocky" ? cellHeights.get(key) : undefined;
			if (floor === undefined) {
				floor = sampleTraversalTerrain(terrain, point);
				if (world.mode === "blocky") cellHeights.set(key, floor);
			}
			for (const candidate of world.candidates?.(point.x, point.y) ?? []) {
				if (!candidate.floor) continue;
				const height = floorHeightAt(candidate.floor, point.x, point.y);
				if (height !== undefined && height <= from.y - 0.22)
					floor = Math.max(floor, height);
			}
			if (y < floor + 0.22) return false;
		}
		return true;
	};
	const steps = Math.max(
		1,
		Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 0.15),
	);
	let previous = 0;
	for (let step = 1; step <= steps; step++) {
		const fraction = step / steps;
		if (!safe(fraction)) {
			let end = fraction;
			for (let i = 0; i < 8; i++) {
				const middle = (previous + end) / 2;
				if (safe(middle)) previous = middle;
				else end = middle;
			}
			return previous;
		}
		previous = fraction;
	}
	return 1;
}

/** Small near-plane clearance against the already cached, transformed world boxes.
 * No player/NPC bodies or decorative meshes participate. No world is built here.
 */
export function getCameraClearFraction(
	world: CameraWorld,
	from: CameraVector3,
	to: CameraVector3,
	worldOffset: { x: number; z: number } = { x: 0, z: 0 },
): number {
	let fraction = getCameraFloorFraction(world, from, to, worldOffset);
	for (const box of world.solids) {
		let near = 0,
			far = 1;
		for (let i = 0; i < 3; i++) {
			const axis = box.axes[i];
			const start =
				(from.x - box.center[0] - worldOffset.x) * axis[0] +
				(from.y - box.center[1]) * axis[1] +
				(from.z - box.center[2] - worldOffset.z) * axis[2];
			const delta =
				(to.x - from.x) * axis[0] +
				(to.y - from.y) * axis[1] +
				(to.z - from.z) * axis[2];
			const half = box.half[i] + 0.18;
			if (Math.abs(delta) < 1e-8) {
				if (Math.abs(start) > half) {
					near = Infinity;
					break;
				}
			} else {
				const a = (-half - start) / delta,
					b = (half - start) / delta;
				near = Math.max(near, Math.min(a, b));
				far = Math.min(far, Math.max(a, b));
				if (near > far) {
					near = Infinity;
					break;
				}
			}
		}
		if (near <= far && far >= 0)
			fraction = Math.min(fraction, Math.max(0, near));
	}
	return fraction;
}

/** Contract immediately to stay in front of a blocker; restore with time-safe damping. */
export function advanceCameraClearance(
	current: number,
	clear: number,
	deltaMs: number,
): number {
	return clear < current
		? clear
		: current + (clear - current) * getFrameLerpAlpha(deltaMs, 8);
}

export function applyCameraClearance(
	rig: CameraRig,
	fraction: number,
): CameraRig {
	// A short boom frames the upper body. Moving the look target leaves the
	// collision-tested camera position intact and keeps the head in view.
	// Do not add another look-target lift to an already upward-facing short boom.
	const focusLift =
		rig.position.y < rig.lookAt.y
			? 0
			: Math.min(0.45, Math.max(0, 0.65 - fraction));
	return {
		lookAt: { ...rig.lookAt, y: rig.lookAt.y + focusLift },
		position: {
			x: rig.lookAt.x + (rig.position.x - rig.lookAt.x) * fraction,
			y: rig.lookAt.y + (rig.position.y - rig.lookAt.y) * fraction,
			z: rig.lookAt.z + (rig.position.z - rig.lookAt.z) * fraction,
		},
	};
}
