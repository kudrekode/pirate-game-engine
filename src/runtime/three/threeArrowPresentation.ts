import * as THREE from "three";
import { BOW } from "../../data/bow";
import type { ArrowProjectile } from "../projectileRuntime";
import { disposePlaceholderObject } from "./placeholderMeshes";
import type { ThreePerformanceDiagnostics } from "./threePerformanceDiagnostics";
import {
	createThreeVisualMarkerGroup,
	type ThreeVisualRenderResult,
} from "./threeVisualRenderer";
import { resolveThreeVisual } from "./threeVisuals";

/** Prewarmed world arrows bounded by lifetime/cooldown. One cached asset, no mixer or RAF. */
export function createThreeArrowPresentation(
	scene: THREE.Scene,
	offset: { x: number; z: number },
	diagnostics?: ThreePerformanceDiagnostics,
) {
	const pool: ThreeVisualRenderResult[] = [];
	let pending = false,
		disposed = false,
		unavailable = false;
	const prepare = () => {
		if (disposed || pending || unavailable) return;
		while (pool.length < Math.ceil(BOW.lifetimeMs / BOW.attackCooldownMs) + 1) {
			const result = createThreeVisualMarkerGroup(
				{
					id: `arrow_${pool.length}`,
					kind: "object",
					shape: "box",
					color: 0xd6b77a,
					opacity: 1,
					gridX: 0,
					gridY: 0,
					width: 0.05,
					height: 0.05,
					depth: 0.7,
					threeX: 0,
					threeY: 0,
					threeZ: 0,
					visualType: "genericObject",
					visual: resolveThreeVisual({
						kind: "object",
						threeVisual: { mode: "asset", assetId: BOW.projectileAssetId },
					}),
				},
				{
					diagnostics,
					preserveAssetOrigin: true,
					onAssetStateChange: () => {
						pending = false;
						prepare();
					},
				},
			);
			pending = result.assetStatus === "loading";
			if (!result.usedAsset) {
				disposePlaceholderObject(result.group);
				result.disposePresentation?.();
				unavailable = !pending;
				return;
			}
			result.group.name = "runtime_arrow";
			result.group.visible = false;
			scene.add(result.group);
			pool.push(result);
		}
	};
	prepare();
	const forward = new THREE.Vector3(0, 0, 1),
		direction = new THREE.Vector3();
	return {
		sync(arrows: ArrowProjectile[]) {
			if (disposed) return;
			pool.forEach((entry, i) => {
				const arrow = arrows[i];
				entry.group.visible = !!arrow;
				if (!arrow) return;
				entry.group.position.set(
					arrow.position.x + offset.x,
					arrow.position.y,
					arrow.position.z + offset.z,
				);
				direction
					.set(arrow.velocity.x, arrow.velocity.y, arrow.velocity.z)
					.normalize();
				entry.group.quaternion.setFromUnitVectors(forward, direction);
			});
		},
		getStats: () => ({
			pooled: pool.length,
			visible: pool.filter((p) => p.group.visible).length,
		}),
		dispose() {
			disposed = true;
			for (const entry of pool) {
				entry.group.removeFromParent();
				entry.disposePresentation?.();
			}
			pool.length = 0;
		},
	};
}
