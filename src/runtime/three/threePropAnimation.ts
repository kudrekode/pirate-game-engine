import * as THREE from "three";
import { requestThreeVisualAssetAnimationClip } from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

/** One semantic closed -> opened prop, with independent cloned nodes and mixer. */
export function createThreePropAnimationController(
	asset: ThreeVisualAssetDefinition,
	root: THREE.Object3D,
	opened: boolean,
) {
	const mixer = new THREE.AnimationMixer(root);
	let action: THREE.AnimationAction | undefined;
	let disposed = false;
	let semanticOpened = opened;
	let pendingRestore = opened;
	let playCount = 0;
	const refresh = () => {
		if (disposed || action || !asset.propAnimations) return;
		const request = requestThreeVisualAssetAnimationClip(
			asset,
			asset.propAnimations.open,
			{ onStateChange: refresh },
		);
		if (
			request.status !== "loaded" ||
			!Number.isFinite(request.clip.duration) ||
			request.clip.duration <= 0
		)
			return;
		if (
			request.clip.tracks.some(
				(t) => !root.getObjectByName(t.name.slice(0, t.name.lastIndexOf("."))),
			)
		)
			return;
		action = mixer.clipAction(request.clip);
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		if (semanticOpened) {
			action.reset().play();
			if (pendingRestore) {
				action.time = request.clip.duration;
				mixer.update(0);
				action.paused = true;
			}
		}
	};
	refresh();
	return {
		setOpened(next: boolean) {
			if (disposed || next === semanticOpened) return;
			semanticOpened = next;
			pendingRestore = false;
			if (next) {
				playCount++;
				action?.reset().play();
			} else {
				action?.stop();
				mixer.update(0);
			}
		},
		update(delta: number) {
			if (!disposed) mixer.update(Math.max(0, delta));
		},
		getStats: () => ({
			opened: semanticOpened,
			playCount,
			time: action?.time,
			duration: action?.getClip().duration,
		}),
		dispose() {
			disposed = true;
			mixer.stopAllAction();
			mixer.uncacheRoot(root);
		},
	};
}

/** Presentation yaw only. World/grid coordinates and cardinal gameplay facing stay untouched. */
export function interactionFacingYaw(
	from: { x: number; y: number },
	to: { x: number; y: number },
	rotationOffset = 0,
): number | undefined {
	const dx = to.x - from.x,
		dz = to.y - from.y;
	return Math.hypot(dx, dz) < 0.001
		? undefined
		: Math.atan2(-dx, -dz) + THREE.MathUtils.degToRad(rotationOffset);
}
