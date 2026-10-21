import * as THREE from "three";
import type { GameArea } from "../../types/game";
import type { TraversalWorld } from "../traversal";

// Optional runtime inspection only; disposed by the owning scene like other meshes.
export function createTraversalDebugGroup(
	world: TraversalWorld,
	area: GameArea,
): THREE.Group {
	const group = new THREE.Group();
	group.visible = false;
	group.position.set(-(area.width - 1) / 2, 0, -(area.height - 1) / 2);
	for (const solid of world.solids) {
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(
				...(solid.half.map((v) => v * 2) as [number, number, number]),
			),
			new THREE.MeshBasicMaterial({
				color: 0xff7040,
				wireframe: true,
				depthTest: false,
			}),
		);
		const basis = new THREE.Matrix4().makeBasis(
			...(solid.axes.map((a) => new THREE.Vector3(...a)) as [
				THREE.Vector3,
				THREE.Vector3,
				THREE.Vector3,
			]),
		);
		mesh.setRotationFromMatrix(basis);
		mesh.position.set(...solid.center);
		group.add(mesh);
	}
	for (const floor of world.floors) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(floor.corners.flat(), 3),
		);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		group.add(
			new THREE.Mesh(
				geometry,
				new THREE.MeshBasicMaterial({
					color: 0x50ff90,
					wireframe: true,
					depthTest: false,
					side: THREE.DoubleSide,
				}),
			),
		);
	}
	return group;
}
