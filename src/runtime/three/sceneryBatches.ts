import {
	type DirectionalLight,
	Group,
	InstancedMesh,
	type Material,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	type Scene,
	Vector3,
} from "three";
import { createFoliageLodCell, fixedSunShadowFrustum } from "./foliageLod";
import { staticShadowAssetIds } from "./staticScenery";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

export function isStaticSceneryAsset(
	asset: ThreeVisualAssetDefinition | undefined,
) {
	return (
		asset?.category === "environment" &&
		!asset.variant &&
		!asset.animations &&
		!asset.propAnimations &&
		(staticShadowAssetIds.has(asset.id) ||
			asset.tags?.includes("static-scenery"))
	);
}

export type SceneryMarker = { id: string; group: Group; farModelId?: string };

// Small spatial cells keep Three's camera and shadow frustum culling effective.
const CELL_SIZE = 12;

function supportsInstancing(mesh: Mesh) {
	const material = mesh.material;
	return (
		mesh.constructor === Mesh &&
		(material instanceof MeshStandardMaterial ||
			material instanceof MeshBasicMaterial) &&
		!material.transparent &&
		!("transmission" in material && material.transmission) &&
		!mesh.customDepthMaterial &&
		!mesh.customDistanceMaterial &&
		!mesh.morphTargetInfluences &&
		mesh.frustumCulled
	);
}

function collectMeshes(root: Group) {
	const meshes: Mesh[] = [];
	let supported = true;
	root.updateWorldMatrix(true, true);
	const x = new Vector3(),
		y = new Vector3(),
		z = new Vector3();
	root.traverseVisible((node: Object3D) => {
		if (!supported) return;
		if (node.animations.length || node.renderOrder !== 0) {
			supported = false;
			return;
		}
		if (node instanceof Mesh && supportsInstancing(node)) {
			// The instanced normal shader supports rotated/scaled axes but cannot
			// invert a sheared basis. Mirrored instance matrices are unsupported.
			node.matrixWorld.extractBasis(x, y, z);
			x.normalize();
			y.normalize();
			z.normalize();
			supported =
				node.matrixWorld.determinant() > 0 &&
				Math.max(Math.abs(x.dot(y)), Math.abs(y.dot(z)), Math.abs(z.dot(x))) <
					1e-5;
			meshes.push(node);
		} else if (!["Group", "Object3D", "Scene"].includes(node.type)) {
			// Keep the complete original hierarchy for lights, skin, lines, etc.
			supported = false;
		}
	});
	return supported && meshes.length ? meshes : undefined;
}

export function batchStaticScenery(
	scene: Scene,
	candidates: SceneryMarker[],
	farMeshes?: ReadonlyMap<string, Mesh>,
) {
	const cells = new Map<string, { marker: SceneryMarker; meshes: Mesh[] }[]>();
	for (const marker of candidates) {
		const meshes = collectMeshes(marker.group);
		if (!meshes) continue;
		const { x, z } = marker.group.position;
		// Only group identical ordered sets of cached geometry/material objects.
		// Clone-local tints and differing shadow/layer settings stay distinct.
		const key = [
			Math.floor(x / CELL_SIZE),
			Math.floor(z / CELL_SIZE),
			marker.farModelId,
			...meshes.map((mesh) =>
				[
					mesh.geometry.uuid,
					(mesh.material as Material).uuid,
					mesh.castShadow,
					mesh.receiveShadow,
					mesh.layers.mask,
				].join("/"),
			),
		].join("|");
		const cell = cells.get(key);
		if (cell) cell.push({ marker, meshes });
		else cells.set(key, [{ marker, meshes }]);
	}

	const roots: Group[] = [];
	const replaced = new Set<Group>();
	const batches: InstancedMesh[] = [];
	let instances = 0;
	let lodTrees = 0;
	const lodCells: ReturnType<typeof createFoliageLodCell>[] = [];
	for (const cell of cells.values()) {
		const farId = cell[0].marker.farModelId;
		const farMesh = farId && farMeshes?.get(farId);
		if (cell.length < 2 && !farMesh) continue;
		const root = new Group();
		root.name = "Static scenery instances";
		const ids = cell.map(({ marker }) => marker.id);
		const detailed: InstancedMesh[] = [];
		for (const [index, source] of cell[0].meshes.entries()) {
			const batch = new InstancedMesh(
				source.geometry,
				source.material,
				cell.length,
			);
			batch.name = source.name;
			batch.castShadow = source.castShadow;
			batch.receiveShadow = source.receiveShadow;
			batch.layers.mask = source.layers.mask;
			batch.userData.sceneryMarkerIds = ids;
			for (const [slot, entry] of cell.entries())
				batch.setMatrixAt(slot, entry.meshes[index].matrixWorld);
			batch.instanceMatrix.needsUpdate = true;
			batch.computeBoundingSphere();
			root.add(batch);
			detailed.push(batch);
			batches.push(batch);
			instances += cell.length;
		}
		if (farMesh) {
			// The cards were projected from the complete source scene. Its root
			// includes marker scale, rotation, offsets and Y normalization.
			const lod = createFoliageLodCell(
				detailed,
				farMesh,
				cell.map(({ marker }) => marker.group.children[0].matrixWorld),
			);
			root.add(lod.far);
			lodCells.push(lod);
			lodTrees += cell.length;
		}
		for (const { marker } of cell) {
			scene.remove(marker.group);
			replaced.add(marker.group);
		}
		scene.add(root);
		roots.push(root);
	}
	return {
		roots,
		replaced,
		stats: {
			markers: replaced.size,
			instances,
			draws: batches.length,
			lodTrees,
		},
		setShadowLight(sun: DirectionalLight) {
			if (!lodCells.length) return;
			const frustum = fixedSunShadowFrustum(sun);
			for (const cell of lodCells) cell.setShadowFrustum(frustum);
		},
		updateLod(cameraPosition: Vector3) {
			for (const cell of lodCells) cell.update(cameraPosition);
		},
		dispose() {
			for (const root of roots) root.removeFromParent();
			// InstancedMesh owns its instance buffer. Geometry, material and textures
			// are still owned by the normal GLTF cache and marker lifecycle.
			for (const batch of batches) batch.dispose();
			for (const cell of lodCells) cell.far.dispose();
		},
	};
}
