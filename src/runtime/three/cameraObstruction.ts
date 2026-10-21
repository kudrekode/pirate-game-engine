import type { TraversalWorld } from "../traversal";
import type { CameraRig, CameraVector3 } from "./cameraControls";
import { getFrameLerpAlpha } from "./visualSmoothing";

/** Small near-plane clearance against the already cached, transformed world boxes.
 * No player/NPC bodies or decorative meshes participate. No world is built here.
 */
export function getCameraClearFraction(
	world: Pick<TraversalWorld, "solids">,
	from: CameraVector3,
	to: CameraVector3,
	worldOffset: { x: number; z: number } = { x: 0, z: 0 },
): number {
	let fraction = 1;
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
	const focusLift = Math.min(0.45, Math.max(0, 0.65 - fraction));
	return {
		lookAt: { ...rig.lookAt, y: rig.lookAt.y + focusLift },
		position: {
			x: rig.lookAt.x + (rig.position.x - rig.lookAt.x) * fraction,
			y: rig.lookAt.y + (rig.position.y - rig.lookAt.y) * fraction,
			z: rig.lookAt.z + (rig.position.z - rig.lookAt.z) * fraction,
		},
	};
}
