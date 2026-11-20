import * as THREE from "three";

const families: Record<
	string,
	{ color?: number; roughness: number; metalness?: number }
> = {
	"weathered-wood": { roughness: 0.84 },
	"structural-wood": { roughness: 0.9 },
	iron: { color: 0x525b5c, roughness: 0.66, metalness: 0.28 },
	stone: { color: 0x898c80, roughness: 0.92 },
	canvas: { color: 0xc5bba3, roughness: 0.94 },
	"canvas-blue": { color: 0x627d82, roughness: 0.9 },
	leaf: { color: 0x63754e, roughness: 0.92 },
	"leaf-light": { color: 0x7d8b65, roughness: 0.92 },
};

// Only the curated kit participates. Character/imported/legacy materials and
// immutable cached GLTF resources keep their original settings and ownership.
export function applyWorldKitMaterials(
	root: THREE.Object3D,
	assetId: string,
	instanceId: string,
): () => void {
	if (!assetId.startsWith("world-")) return () => {};
	let hash = 2166136261;
	for (const char of `${assetId}:${instanceId}`)
		hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	const variation = 0.97 + (((hash >>> 0) % 1000) / 1000) * 0.06;
	const owned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
	const prepare = (source: THREE.Material) => {
		const family = families[source.name];
		if (!family || !(source instanceof THREE.MeshStandardMaterial))
			return source;
		const existing = owned.get(source);
		if (existing) return existing;
		const material = source.clone();
		if (family.color !== undefined) material.color.set(family.color);
		material.color.multiplyScalar(variation);
		material.roughness = family.roughness;
		if (family.metalness !== undefined) material.metalness = family.metalness;
		owned.set(source, material);
		return material;
	};
	root.traverse((object) => {
		if (object instanceof THREE.Mesh)
			object.material = Array.isArray(object.material)
				? object.material.map(prepare)
				: prepare(object.material);
	});
	return () => {
		for (const material of owned.values()) material.dispose();
		owned.clear();
	};
}
