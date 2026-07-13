import * as THREE from "three";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

function copyStandardMaterialProperties(
	source: THREE.MeshPhysicalMaterial,
): THREE.MeshStandardMaterial {
	const material = new THREE.MeshStandardMaterial({
		alphaMap: source.alphaMap,
		alphaTest: source.alphaTest,
		aoMap: source.aoMap,
		color: source.color,
		depthFunc: source.depthFunc,
		depthTest: source.depthTest,
		depthWrite: source.depthWrite,
		dithering: source.dithering,
		emissive: source.emissive,
		emissiveIntensity: source.emissiveIntensity,
		emissiveMap: source.emissiveMap,
		fog: source.fog,
		lightMap: source.lightMap,
		map: source.map,
		metalness: source.metalness,
		metalnessMap: source.metalnessMap,
		name: source.name,
		normalMap: source.normalMap,
		normalMapType: source.normalMapType,
		normalScale: source.normalScale,
		opacity: source.opacity,
		premultipliedAlpha: source.premultipliedAlpha,
		roughness: source.roughness,
		roughnessMap: source.roughnessMap,
		side: source.side,
		transparent: source.transparent,
		vertexColors: source.vertexColors,
	});
	material.blending = source.blending;
	material.blendDst = source.blendDst;
	material.blendDstAlpha = source.blendDstAlpha;
	material.blendEquation = source.blendEquation;
	material.blendEquationAlpha = source.blendEquationAlpha;
	material.blendSrc = source.blendSrc;
	material.blendSrcAlpha = source.blendSrcAlpha;
	material.colorWrite = source.colorWrite;
	material.clipIntersection = source.clipIntersection;
	material.clipShadows = source.clipShadows;
	material.clippingPlanes = source.clippingPlanes;
	material.polygonOffset = source.polygonOffset;
	material.polygonOffsetFactor = source.polygonOffsetFactor;
	material.polygonOffsetUnits = source.polygonOffsetUnits;
	material.shadowSide = source.shadowSide;
	material.stencilWrite = source.stencilWrite;
	material.stencilWriteMask = source.stencilWriteMask;
	material.stencilFunc = source.stencilFunc;
	material.stencilRef = source.stencilRef;
	material.stencilFuncMask = source.stencilFuncMask;
	material.stencilFail = source.stencilFail;
	material.stencilZFail = source.stencilZFail;
	material.stencilZPass = source.stencilZPass;
	material.toneMapped = source.toneMapped;
	return material;
}

function prepareMaterial(
	material: THREE.Material,
	profile: ThreeVisualAssetDefinition["materialProfile"],
	preparedMaterials: Map<THREE.Material, THREE.Material>,
): THREE.Material {
	const existing = preparedMaterials.get(material);
	if (existing) {
		return existing;
	}
	const prepared =
		profile === "standard" && material instanceof THREE.MeshPhysicalMaterial
			? copyStandardMaterialProperties(material)
			: material;
	preparedMaterials.set(material, prepared);
	return prepared;
}

/**
 * Prepares one registry-scoped cached source. SkeletonUtils clones share the
 * resulting immutable geometry, material, and textures while retaining their
 * own bones and skeleton state.
 */
export function prepareThreeVisualAssetMaterials(
	root: THREE.Object3D,
	definition: Pick<ThreeVisualAssetDefinition, "materialProfile">,
): void {
	if (definition.materialProfile !== "standard") {
		return;
	}
	const preparedMaterials = new Map<THREE.Material, THREE.Material>();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) {
			return;
		}
		object.material = Array.isArray(object.material)
			? object.material.map((material) =>
					prepareMaterial(
						material,
						definition.materialProfile,
						preparedMaterials,
					),
				)
			: prepareMaterial(
					object.material,
					definition.materialProfile,
					preparedMaterials,
				);
	});
}
