import * as THREE from "three";

export type ThreeVisualAssetAnalysis = {
	bounds: {
		center: { x: number; y: number; z: number };
		dimensions: { x: number; y: number; z: number };
		maxY: number;
		minY: number;
	};
	sphere: {
		center: { x: number; y: number; z: number };
		radius: number;
	};
};

function toPlainVector(vector: THREE.Vector3): {
	x: number;
	y: number;
	z: number;
} {
	return { x: vector.x, y: vector.y, z: vector.z };
}

export function analyzeThreeVisualAssetRoot(
	root: THREE.Object3D,
): ThreeVisualAssetAnalysis {
	const bounds = new THREE.Box3().setFromObject(root);
	if (bounds.isEmpty()) {
		return {
			bounds: {
				center: { x: 0, y: 0, z: 0 },
				dimensions: { x: 0, y: 0, z: 0 },
				maxY: 0,
				minY: 0,
			},
			sphere: {
				center: { x: 0, y: 0, z: 0 },
				radius: 0,
			},
		};
	}

	const center = bounds.getCenter(new THREE.Vector3());
	const dimensions = bounds.getSize(new THREE.Vector3());
	const sphere = bounds.getBoundingSphere(new THREE.Sphere());
	return {
		bounds: {
			center: toPlainVector(center),
			dimensions: toPlainVector(dimensions),
			maxY: bounds.max.y,
			minY: bounds.min.y,
		},
		sphere: {
			center: toPlainVector(sphere.center),
			radius: sphere.radius,
		},
	};
}
