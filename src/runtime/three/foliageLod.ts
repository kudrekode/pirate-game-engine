import {
	type DirectionalLight,
	type Frustum,
	InstancedMesh,
	type Matrix4,
	Mesh,
	Sphere,
	type Vector3,
} from "three";
import { requestThreeVisualAsset } from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

export function loadDistantFoliageMeshes(
	models: Set<ThreeVisualAssetDefinition>,
) {
	const meshes = new Map<string, Mesh>();
	for (const model of models) {
		const request = requestThreeVisualAsset(model);
		if (request.status !== "loaded") continue;
		request.object.updateWorldMatrix(false, true);
		const mesh = request.object.getObjectByProperty("isMesh", true);
		if (mesh instanceof Mesh) meshes.set(model.id, mesh);
	}
	return meshes;
}

// Decide on the closest edge of the complete cell, in world units. Five units
// of hysteresis keep a stationary canopy stable during camera orbit and travel.
const FAR_DISTANCE = 44;
const NEAR_DISTANCE = 39;

export function createFoliageLodCell(
	detailed: InstancedMesh[],
	source: Mesh,
	sourceRoots: Matrix4[],
) {
	const first = detailed[0];
	const far = new InstancedMesh(
		source.geometry,
		source.material,
		sourceRoots.length,
	);
	far.name = source.name;
	far.receiveShadow = first.receiveShadow;
	far.layers.mask = first.layers.mask;
	far.visible = false;
	far.userData.sceneryMarkerIds = first.userData.sceneryMarkerIds;
	far.userData.sceneryLod = "far";
	const transform = source.matrixWorld.clone();
	for (const [slot, root] of sourceRoots.entries())
		far.setMatrixAt(slot, transform.multiplyMatrices(root, source.matrixWorld));
	far.instanceMatrix.needsUpdate = true;
	far.computeBoundingSphere();
	const bounds = new Sphere();
	for (const mesh of detailed) {
		if (mesh.boundingSphere) bounds.union(mesh.boundingSphere);
	}
	let inShadowFrustum = true;
	return {
		far,
		setShadowFrustum(frustum: Frustum) {
			inShadowFrustum = frustum.intersectsSphere(bounds);
		},
		update(cameraPosition: Vector3) {
			// Native depth is always made from full geometry. While the sun still
			// needs these casters, keep visible any cell in its shadow frustum.
			// Once native depth is cached it stays independent of camera LOD.
			const useFar =
				!(inShadowFrustum && detailed.some((mesh) => mesh.castShadow)) &&
				bounds.distanceToPoint(cameraPosition) >
					(far.visible ? NEAR_DISTANCE : FAR_DISTANCE);
			if (useFar === far.visible) return;
			far.visible = useFar;
			for (const mesh of detailed) mesh.visible = !useFar;
		},
	};
}

export function fixedSunShadowFrustum(sun: DirectionalLight) {
	sun.updateWorldMatrix(true, false);
	sun.target.updateWorldMatrix(true, false);
	sun.shadow.camera.updateProjectionMatrix();
	sun.shadow.updateMatrices(sun);
	return sun.shadow.getFrustum();
}
