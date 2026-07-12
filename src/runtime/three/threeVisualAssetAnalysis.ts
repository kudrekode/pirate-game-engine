import * as THREE from "three";

export type ThreeVisualAssetAnalysis = {
	animationClips: {
		duration: number;
		name: string;
		trackCount: number;
	}[];
	bounds: {
		center: { x: number; y: number; z: number };
		dimensions: { x: number; y: number; z: number };
		maxY: number;
		minY: number;
	};
	materialCount: number;
	materialTypes: string[];
	meshCount: number;
	boneCount: number;
	skeletonCount: number;
	skinnedMeshCount: number;
	triangleCount: number;
	sphere: {
		center: { x: number; y: number; z: number };
		radius: number;
	};
	textureCount: number;
	vertexCount: number;
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
	animationClips: readonly THREE.AnimationClip[] = [],
): ThreeVisualAssetAnalysis {
	const bounds = new THREE.Box3().setFromObject(root);
	const materials = new Set<THREE.Material>();
	const skeletons = new Set<THREE.Skeleton>();
	const textures = new Set<THREE.Texture>();
	let meshCount = 0;
	let skinnedMeshCount = 0;
	let triangleCount = 0;
	let vertexCount = 0;
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) {
			return;
		}
		meshCount += 1;
		const position = object.geometry.getAttribute("position");
		vertexCount += position?.count ?? 0;
		triangleCount += object.geometry.index
			? Math.floor(object.geometry.index.count / 3)
			: Math.floor((position?.count ?? 0) / 3);
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of objectMaterials) {
			materials.add(material);
			for (const value of Object.values(material)) {
				if (value instanceof THREE.Texture) {
					textures.add(value);
				}
			}
		}
		if (object instanceof THREE.SkinnedMesh) {
			skinnedMeshCount += 1;
			skeletons.add(object.skeleton);
		}
	});
	const animationClipSummaries = animationClips.map((clip) => ({
		duration: clip.duration,
		name: clip.name,
		trackCount: clip.tracks.length,
	}));
	const materialTypes = Array.from(
		materials,
		(material) => material.type,
	).sort();
	const boneCount = Array.from(skeletons).reduce(
		(count, skeleton) => count + skeleton.bones.length,
		0,
	);
	if (bounds.isEmpty()) {
		return {
			animationClips: animationClipSummaries,
			bounds: {
				center: { x: 0, y: 0, z: 0 },
				dimensions: { x: 0, y: 0, z: 0 },
				maxY: 0,
				minY: 0,
			},
			materialCount: materials.size,
			materialTypes,
			meshCount,
			boneCount,
			skeletonCount: skeletons.size,
			skinnedMeshCount,
			triangleCount,
			sphere: {
				center: { x: 0, y: 0, z: 0 },
				radius: 0,
			},
			textureCount: textures.size,
			vertexCount,
		};
	}

	const center = bounds.getCenter(new THREE.Vector3());
	const dimensions = bounds.getSize(new THREE.Vector3());
	const sphere = bounds.getBoundingSphere(new THREE.Sphere());
	return {
		animationClips: animationClipSummaries,
		bounds: {
			center: toPlainVector(center),
			dimensions: toPlainVector(dimensions),
			maxY: bounds.max.y,
			minY: bounds.min.y,
		},
		materialCount: materials.size,
		materialTypes,
		meshCount,
		boneCount,
		skeletonCount: skeletons.size,
		skinnedMeshCount,
		triangleCount,
		sphere: {
			center: toPlainVector(sphere.center),
			radius: sphere.radius,
		},
		textureCount: textures.size,
		vertexCount,
	};
}
