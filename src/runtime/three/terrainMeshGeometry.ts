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
	mesh.groups.forEach((group, materialIndex) => {
		if (typeof geometry.addGroup === "function") {
			geometry.addGroup(group.start, group.count, materialIndex);
			return;
		}
		const geometryWithGroups = geometry as unknown as {
			groups?: Array<{
				count: number;
				materialIndex: number;
				start: number;
			}>;
		};
		geometryWithGroups.groups = [
			...(geometryWithGroups.groups ?? []),
			{ count: group.count, materialIndex, start: group.start },
		];
	});
	geometry.computeBoundingSphere();
	return geometry;
}
