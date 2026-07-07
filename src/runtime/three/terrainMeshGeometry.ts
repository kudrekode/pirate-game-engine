import * as THREE from "three";
import type { SmoothTerrainMesh } from "../../editor/sections/terrainBlocks";

export function createSmoothTerrainBufferGeometry(
	mesh: SmoothTerrainMesh,
): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(mesh.vertices, 3),
	);
	geometry.setAttribute(
		"normal",
		new THREE.Float32BufferAttribute(mesh.normals, 3),
	);
	geometry.setIndex(mesh.indices);
	geometry.computeBoundingSphere();
	return geometry;
}
