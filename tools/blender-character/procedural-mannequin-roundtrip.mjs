import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { inspectAnimationSource } from "../animation-retargeting/animation-source-inspection.mjs";

const REQUIRED_BONES = [
	"root",
	"pelvis",
	"spine_01",
	"spine_02",
	"spine_03",
	"neck_01",
	"Head",
	"clavicle_l",
	"clavicle_r",
	"upperarm_l",
	"upperarm_r",
	"lowerarm_l",
	"lowerarm_r",
	"hand_l",
	"hand_r",
	"thigh_l",
	"thigh_r",
	"calf_l",
	"calf_r",
	"foot_l",
	"foot_r",
	"ball_l",
	"ball_r",
];
const EXPECTED_WEIGHTED_BONES = REQUIRED_BONES.filter(
	(name) => name !== "root",
);
const DIAGNOSTIC_BONES = [
	"pelvis",
	"spine_03",
	"neck_01",
	"Head",
	"upperarm_l",
	"upperarm_r",
	"lowerarm_l",
	"lowerarm_r",
	"hand_l",
	"hand_r",
	"thigh_l",
	"thigh_r",
	"calf_l",
	"calf_r",
	"foot_l",
	"foot_r",
];
const LENGTH_CHAINS = [
	["clavicle_l", "upperarm_l"],
	["upperarm_l", "lowerarm_l"],
	["lowerarm_l", "hand_l"],
	["clavicle_r", "upperarm_r"],
	["upperarm_r", "lowerarm_r"],
	["lowerarm_r", "hand_r"],
	["thigh_l", "calf_l"],
	["calf_l", "foot_l"],
	["thigh_r", "calf_r"],
	["calf_r", "foot_r"],
];
const SYMMETRY_CHAINS = [
	[
		["clavicle_l", "upperarm_l"],
		["clavicle_r", "upperarm_r"],
	],
	[
		["upperarm_l", "lowerarm_l"],
		["upperarm_r", "lowerarm_r"],
	],
	[
		["lowerarm_l", "hand_l"],
		["lowerarm_r", "hand_r"],
	],
	[
		["thigh_l", "calf_l"],
		["thigh_r", "calf_r"],
	],
	[
		["calf_l", "foot_l"],
		["calf_r", "foot_r"],
	],
];
const ANIMATIONS = {
	idle: {
		clipName: "GoldenReference_Idle",
		path: "public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb",
	},
	walk: {
		clipName: "GoldenReference_Walk_InPlace",
		path: "public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb",
	},
};

const sha256 = (input) => createHash("sha256").update(input).digest("hex");
const rounded = (value, digits = 7) => Number(value.toFixed(digits));

function toArrayBuffer(input) {
	return input.buffer.slice(
		input.byteOffset,
		input.byteOffset + input.byteLength,
	);
}

async function loadGlb(filePath) {
	globalThis.self ??= globalThis;
	globalThis.createImageBitmap ??= async () => ({
		close() {},
		height: 1,
		width: 1,
	});
	return new GLTFLoader().parseAsync(
		toArrayBuffer(await readFile(filePath)),
		"",
	);
}

function typedArrayHash(attribute) {
	const array = attribute?.array;
	if (!array) return undefined;
	return sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
}

function indexHash(index) {
	if (!index) return undefined;
	return typedArrayHash(index);
}

function uniqueSkeletons(root) {
	const skeletons = new Set();
	root.traverse((object) => {
		if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
	});
	return [...skeletons];
}

function hierarchySnapshot(root) {
	const snapshot = [];
	root.traverse((object) => {
		snapshot.push({
			name: object.name,
			parent: object.parent?.name,
			position: object.position.toArray().map((value) => rounded(value)),
			quaternion: object.quaternion.toArray().map((value) => rounded(value)),
			scale: object.scale.toArray().map((value) => rounded(value)),
			type: object.type,
		});
	});
	return snapshot;
}

function semanticMeshSnapshot(name, geometry) {
	return {
		attributes: Object.fromEntries(
			Object.entries(geometry.attributes)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([attributeName, attribute]) => [
					attributeName,
					{
						count: attribute.count,
						hash: typedArrayHash(attribute),
						itemSize: attribute.itemSize,
					},
				]),
		),
		index: {
			count: geometry.index?.count ?? 0,
			hash: indexHash(geometry.index),
		},
		name,
	};
}

function semanticSnapshot(root) {
	const materials = new Set();
	const meshes = [];
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		for (const material of Array.isArray(object.material)
			? object.material
			: [object.material]) {
			materials.add(material);
		}
		meshes.push(semanticMeshSnapshot(object.name, object.geometry));
	});
	return {
		hierarchy: hierarchySnapshot(root),
		materials: [...materials]
			.map((material) => ({
				color:
					material instanceof THREE.MeshStandardMaterial
						? material.color.getHexString()
						: undefined,
				name: material.name,
				linearColor:
					material instanceof THREE.MeshStandardMaterial
						? material.color.toArray().map((value) => rounded(value))
						: undefined,
				metallic:
					material instanceof THREE.MeshStandardMaterial
						? rounded(material.metalness)
						: undefined,
				roughness:
					material instanceof THREE.MeshStandardMaterial
						? rounded(material.roughness)
						: undefined,
				type: material.type,
			}))
			.sort((left, right) => left.name.localeCompare(right.name)),
		meshes,
	};
}

function analyzeSkinMaterial(root, expected) {
	const materials = new Set();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		for (const material of Array.isArray(object.material)
			? object.material
			: [object.material]) {
			materials.add(material);
		}
	});
	const material = expected
		? [...materials].find((candidate) => candidate.name === expected.name)
		: [...materials][0];
	const standard = material instanceof THREE.MeshStandardMaterial;
	const exportedLinearColor = standard
		? material.color.toArray().map((value) => rounded(value))
		: [];
	const exportedRoughness = standard ? rounded(material.roughness) : undefined;
	const exportedMetallic = standard ? rounded(material.metalness) : undefined;
	const finite =
		exportedLinearColor.every(Number.isFinite) &&
		Number.isFinite(exportedRoughness) &&
		Number.isFinite(exportedMetallic);
	const maximumColorError =
		expected && exportedLinearColor.length === 3
			? Math.max(
					...exportedLinearColor.map((value, index) =>
						Math.abs(value - expected.linearColor[index]),
					),
				)
			: expected
				? Number.POSITIVE_INFINITY
				: 0;
	return {
		exportedLinearColor,
		exportedMetallic,
		exportedRoughness,
		finite,
		materialCount: material ? 1 : 0,
		materialName: material?.name,
		materialType: material?.type,
		maximumColorError: Number.isFinite(maximumColorError)
			? rounded(maximumColorError)
			: null,
		passed:
			Boolean(material) &&
			standard &&
			finite &&
			(!expected ||
				(material.name === expected.name &&
					maximumColorError <= 0.00001 &&
					Math.abs(exportedRoughness - expected.roughness) <= 0.00001 &&
					exportedMetallic === 0)),
	};
}

function analyzeArtifact(root) {
	const materials = new Set();
	const textures = new Set();
	let meshCount = 0;
	let triangleCount = 0;
	let vertexCount = 0;
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		meshCount += 1;
		const position = object.geometry.getAttribute("position");
		vertexCount += position?.count ?? 0;
		triangleCount += object.geometry.index
			? Math.floor(object.geometry.index.count / 3)
			: Math.floor((position?.count ?? 0) / 3);
		for (const material of Array.isArray(object.material)
			? object.material
			: [object.material]) {
			materials.add(material);
			for (const value of Object.values(material)) {
				if (value instanceof THREE.Texture) textures.add(value);
			}
		}
	});
	return {
		materialCount: materials.size,
		meshCount,
		textureCount: textures.size,
		triangleCount,
		vertexCount,
	};
}

function headRelativeHairVertex(root, meshName, vertexIndex) {
	root.updateMatrixWorld(true);
	const head = root.getObjectByName("Head");
	const hair = root.getObjectByName(meshName);
	if (!head || !(hair instanceof THREE.SkinnedMesh)) return undefined;
	const position = hair.geometry.getAttribute("position");
	if (!position?.count) return undefined;
	const point = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
	hair.applyBoneTransform(vertexIndex, point).applyMatrix4(hair.matrixWorld);
	return point.applyMatrix4(head.matrixWorld.clone().invert());
}

function validateHairAttachmentAnimation(root, clips, meshName, vertexIndex) {
	const rest = headRelativeHairVertex(root, meshName, vertexIndex);
	if (!rest) return { maximumRelativeVertexDifference: null, passed: false };
	let maximumRelativeVertexDifference = 0;
	for (const clip of Object.values(clips)) {
		for (const normalizedTime of [0, 0.25, 0.5, 0.75]) {
			const clone = cloneSkeleton(root);
			const mixer = new THREE.AnimationMixer(clone);
			mixer.clipAction(clip).play();
			mixer.setTime(clip.duration * normalizedTime);
			const relative = headRelativeHairVertex(clone, meshName, vertexIndex);
			if (!relative)
				return { maximumRelativeVertexDifference: null, passed: false };
			maximumRelativeVertexDifference = Math.max(
				maximumRelativeVertexDifference,
				rest.distanceTo(relative),
			);
			mixer.stopAllAction();
			mixer.uncacheRoot(clone);
		}
	}
	return {
		maximumRelativeVertexDifference,
		passed: maximumRelativeVertexDifference <= 0.02,
	};
}

function analyzeHair(root, expected, clips, glbResources) {
	if (expected.componentId === "none") {
		const unexpected = [];
		root.traverse((object) => {
			if (object.name.startsWith("Hair_")) unexpected.push(object.name);
		});
		return {
			attachmentBone: null,
			componentId: "none",
			materialCount: 0,
			materialNames: [],
			meshCount: 0,
			objectName: null,
			passed: unexpected.length === 0,
			textureCount: 0,
			textureNames: [],
			triangleCount: 0,
			vertexCount: 0,
		};
	}
	const definition = expected.definition;
	let mesh;
	root.traverse((object) => {
		if (!(object instanceof THREE.SkinnedMesh)) return;
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		if (
			objectMaterials.some(
				(material) => material.name === definition.material.name,
			)
		) {
			mesh = object;
		}
	});
	const objectName = mesh?.name ?? "ProceduralMannequinMesh_2";
	const materials = mesh
		? Array.isArray(mesh.material)
			? mesh.material
			: [mesh.material]
		: [];
	const materialNames = materials.map((material) => material.name).sort();
	const textureNames = glbResources.imageNames.slice().sort();
	const expectedTextureNames = definition.material.textures
		.map((name) => name.replace(/\.[^.]+$/u, ""))
		.sort();
	const position = mesh?.geometry.getAttribute("position");
	const hairVertexIndices = new Set(
		Array.from({ length: position?.count ?? 0 }, (_, index) => index),
	);
	const skinIndex = mesh?.geometry.getAttribute("skinIndex");
	const skinWeight = mesh?.geometry.getAttribute("skinWeight");
	let fullHeadWeights = Boolean(
		mesh instanceof THREE.SkinnedMesh && skinIndex && skinWeight,
	);
	const attachmentWeightBones = new Set();
	if (mesh instanceof THREE.SkinnedMesh && skinIndex && skinWeight) {
		for (const vertex of hairVertexIndices) {
			let sum = 0;
			for (let component = 0; component < skinWeight.itemSize; component += 1) {
				const weight = skinWeight.getComponent(vertex, component);
				if (weight <= 0.000001) continue;
				sum += weight;
				const jointIndex = skinIndex.getComponent(vertex, component);
				const boneName = mesh.skeleton.bones[jointIndex]?.name;
				if (boneName) attachmentWeightBones.add(boneName);
			}
			fullHeadWeights &&= Math.abs(sum - 1) <= 0.000001;
		}
	}
	fullHeadWeights &&=
		attachmentWeightBones.has(definition.expectedAttachmentBone) &&
		attachmentWeightBones.size <= 4;
	const hairBounds = new THREE.Box3();
	if (mesh && position) {
		mesh.updateMatrixWorld(true);
		for (const vertex of hairVertexIndices) {
			const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
			mesh.applyBoneTransform(vertex, point).applyMatrix4(mesh.matrixWorld);
			hairBounds.expandByPoint(point);
		}
	}
	const hairDimensions = hairBounds.getSize(new THREE.Vector3());
	const triangleCount = mesh?.geometry.index
		? Math.floor(mesh.geometry.index.count / 3)
		: Math.floor((position?.count ?? 0) / 3);
	const attachmentAnimation = validateHairAttachmentAnimation(
		root,
		clips,
		objectName,
		[...hairVertexIndices][0] ?? 0,
	);
	const cloneOne = cloneSkeleton(root).getObjectByName(objectName);
	const cloneTwo = cloneSkeleton(root).getObjectByName(objectName);
	const cloneIndependent =
		cloneOne instanceof THREE.SkinnedMesh &&
		cloneTwo instanceof THREE.SkinnedMesh &&
		cloneOne !== cloneTwo &&
		cloneOne.skeleton !== cloneTwo.skeleton;
	return {
		attachmentAnimation,
		attachmentBone: fullHeadWeights ? definition.expectedAttachmentBone : null,
		attachmentWeightBones: [...attachmentWeightBones].sort(),
		bounds: {
			dimensions: hairDimensions.toArray().map((value) => rounded(value)),
			maximum: hairBounds.max.toArray().map((value) => rounded(value)),
			minimum: hairBounds.min.toArray().map((value) => rounded(value)),
		},
		cloneIndependent,
		componentId: expected.componentId,
		materialCount: materialNames.length,
		materialNames,
		meshCount: mesh ? 1 : 0,
		objectName: mesh?.name ?? null,
		passed:
			mesh instanceof THREE.SkinnedMesh &&
			fullHeadWeights &&
			materialNames.length === 1 &&
			materialNames[0] === definition.material.name &&
			textureNames.length === expectedTextureNames.length &&
			expectedTextureNames.every((name) => textureNames.includes(name)) &&
			attachmentAnimation.passed &&
			cloneIndependent,
		textureCount: textureNames.length,
		textureNames,
		triangleCount,
		vertexCount: hairVertexIndices.size,
	};
}

async function inspectGlbResources(filePath) {
	const buffer = await readFile(filePath);
	if (buffer.toString("utf8", 0, 4) !== "glTF") {
		throw new Error("Expected a GLB artifact for resource inspection.");
	}
	const jsonLength = buffer.readUInt32LE(12);
	const jsonType = buffer.toString("utf8", 16, 20);
	if (jsonType !== "JSON") throw new Error("GLB JSON chunk is missing.");
	const document = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
	return {
		imageCount: document.images?.length ?? 0,
		imageNames: (document.images ?? [])
			.map((image) => image.name)
			.filter(Boolean),
		materialNames: (document.materials ?? [])
			.map((material) => material.name)
			.filter(Boolean),
		meshCount: document.meshes?.length ?? 0,
		nodeCount: document.nodes?.length ?? 0,
		skinCount: document.skins?.length ?? 0,
	};
}

function skeletonSignature(inspection) {
	const joints = inspection.skeletons[0]?.joints ?? [];
	const normalized = joints
		.map((joint) => ({
			name: joint.name,
			parent: joint.parentIsJoint ? joint.parent : null,
			rest: {
				rotation: joint.rest.rotation.map((value) => rounded(value, 4)),
				scale: joint.rest.scale.map((value) => rounded(value, 4)),
				translation: joint.rest.translation.map((value) => rounded(value, 4)),
			},
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
	return { hash: sha256(JSON.stringify(normalized)), joints: normalized };
}

function indexedTopology(geometry) {
	const position = geometry.getAttribute("position");
	const indexes = geometry.index
		? [...geometry.index.array]
		: Array.from({ length: position?.count ?? 0 }, (_, index) => index);
	const referenced = new Set(indexes);
	const adjacency = new Map([...referenced].map((index) => [index, new Set()]));
	const edgeUse = new Map();
	let degenerateFaceCount = 0;
	for (let offset = 0; offset + 2 < indexes.length; offset += 3) {
		const face = indexes.slice(offset, offset + 3);
		const first = new THREE.Vector3().fromBufferAttribute(position, face[0]);
		const second = new THREE.Vector3().fromBufferAttribute(position, face[1]);
		const third = new THREE.Vector3().fromBufferAttribute(position, face[2]);
		if (
			new Set(face).size !== 3 ||
			new THREE.Triangle(first, second, third).getArea() <= 1e-10
		) {
			degenerateFaceCount += 1;
		}
		for (const [left, right] of [
			[face[0], face[1]],
			[face[1], face[2]],
			[face[2], face[0]],
		]) {
			adjacency.get(left)?.add(right);
			adjacency.get(right)?.add(left);
			const edge = left < right ? `${left}:${right}` : `${right}:${left}`;
			edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
		}
	}
	const remaining = new Set(referenced);
	let connectedComponentCount = 0;
	while (remaining.size > 0) {
		connectedComponentCount += 1;
		const pending = [remaining.values().next().value];
		remaining.delete(pending[0]);
		while (pending.length > 0) {
			const current = pending.pop();
			for (const neighbor of adjacency.get(current) ?? []) {
				if (!remaining.delete(neighbor)) continue;
				pending.push(neighbor);
			}
		}
	}
	const boundaryEdgeCount = [...edgeUse.values()].filter(
		(count) => count === 1,
	).length;
	const nonManifoldEdgeCount = [...edgeUse.values()].filter(
		(count) => count !== 2,
	).length;
	const faceCount = Math.floor(indexes.length / 3);
	const eulerCharacteristic = referenced.size - edgeUse.size + faceCount;
	return {
		boundaryEdgeCount,
		connectedComponentCount,
		degenerateFaceCount,
		edgeCount: edgeUse.size,
		eulerCharacteristic,
		faceCount,
		genus: (2 * connectedComponentCount - eulerCharacteristic) / 2,
		manifold: nonManifoldEdgeCount === 0,
		nonManifoldEdgeCount,
		unreferencedVertexCount: (position?.count ?? 0) - referenced.size,
	};
}

function compareSkeletonContracts(templateInspection, generatedInspection) {
	const template = new Map(
		templateInspection.skeletons[0].joints.map((joint) => [joint.name, joint]),
	);
	let maximumRestRotationDegrees = 0;
	let maximumRestScaleDifference = 0;
	let maximumRestTranslationDifference = 0;
	const hierarchyMismatches = [];
	for (const joint of generatedInspection.skeletons[0].joints) {
		const expected = template.get(joint.name);
		if (!expected) continue;
		if (joint.name !== "root" && joint.parent !== expected.parent) {
			hierarchyMismatches.push({
				actual: joint.parent,
				expected: expected.parent,
				name: joint.name,
			});
		}
		maximumRestTranslationDifference = Math.max(
			maximumRestTranslationDifference,
			new THREE.Vector3()
				.fromArray(joint.rest.translation)
				.distanceTo(new THREE.Vector3().fromArray(expected.rest.translation)),
		);
		maximumRestScaleDifference = Math.max(
			maximumRestScaleDifference,
			...joint.rest.scale.map((value, index) =>
				Math.abs(value - expected.rest.scale[index]),
			),
		);
		maximumRestRotationDegrees = Math.max(
			maximumRestRotationDegrees,
			THREE.MathUtils.radToDeg(
				new THREE.Quaternion()
					.fromArray(joint.rest.rotation)
					.angleTo(new THREE.Quaternion().fromArray(expected.rest.rotation)),
			),
		);
	}
	return {
		hierarchyMismatches,
		maximumRestRotationDegrees,
		maximumRestScaleDifference,
		maximumRestTranslationDifference,
		passed:
			hierarchyMismatches.length === 0 &&
			maximumRestRotationDegrees <= 0.05 &&
			maximumRestScaleDifference <= 0.0001 &&
			maximumRestTranslationDifference <= 0.0001,
	};
}

function analyzeGeometry(root, expectedHeight) {
	const materials = new Set();
	const weightedBones = new Set();
	let finiteNormals = true;
	let finitePositions = true;
	let indexRangeValid = true;
	let materialCount = 0;
	let maximumInfluences = 0;
	let maximumWeightSumError = 0;
	let meshCount = 0;
	let outOfRangeJointCount = 0;
	let skinnedMeshCount = 0;
	let triangleCount = 0;
	const topology = {
		boundaryEdgeCount: 0,
		connectedComponentCount: 0,
		degenerateFaceCount: 0,
		edgeCount: 0,
		eulerCharacteristic: 0,
		faceCount: 0,
		genus: 0,
		manifold: true,
		nonManifoldEdgeCount: 0,
		unreferencedVertexCount: 0,
	};
	let unweightedVertexCount = 0;
	let vertexCount = 0;
	root.updateMatrixWorld(true);
	for (const skeleton of uniqueSkeletons(root)) skeleton.pose();
	let bodyObject;
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		const skinMaterial = objectMaterials.find(
			(material) => material.name === "ProceduralSkinMaterial",
		);
		if (!skinMaterial) return;
		const geometry = object.geometry;
		bodyObject = object;
		meshCount += 1;
		materials.add(skinMaterial);
		const position = geometry.getAttribute("position");
		const normal = geometry.getAttribute("normal");
		vertexCount += position?.count ?? 0;
		for (const value of position?.array ?? [])
			finitePositions &&= Number.isFinite(value);
		for (const value of normal?.array ?? [])
			finiteNormals &&= Number.isFinite(value);
		const index = geometry.index;
		triangleCount += index
			? Math.floor(index.count / 3)
			: Math.floor((position?.count ?? 0) / 3);
		if (index) {
			for (const value of index.array) {
				if (value < 0 || value >= position.count) indexRangeValid = false;
			}
		}
		const meshTopology = indexedTopology(geometry);
		for (const key of [
			"boundaryEdgeCount",
			"connectedComponentCount",
			"degenerateFaceCount",
			"edgeCount",
			"eulerCharacteristic",
			"faceCount",
			"genus",
			"nonManifoldEdgeCount",
			"unreferencedVertexCount",
		]) {
			topology[key] += meshTopology[key];
		}
		topology.manifold &&= meshTopology.manifold;
		if (!(object instanceof THREE.SkinnedMesh)) return;
		skinnedMeshCount += 1;
		const skinIndex = geometry.getAttribute("skinIndex");
		const skinWeight = geometry.getAttribute("skinWeight");
		if (!skinIndex || !skinWeight || skinIndex.count !== position.count) {
			unweightedVertexCount += position.count;
			return;
		}
		for (let vertex = 0; vertex < skinWeight.count; vertex += 1) {
			let sum = 0;
			let influences = 0;
			for (let component = 0; component < skinWeight.itemSize; component += 1) {
				const weight = skinWeight.getComponent(vertex, component);
				const jointIndex = skinIndex.getComponent(vertex, component);
				if (weight > 0.000001) {
					sum += weight;
					influences += 1;
					if (jointIndex < 0 || jointIndex >= object.skeleton.bones.length) {
						outOfRangeJointCount += 1;
					} else {
						weightedBones.add(object.skeleton.bones[jointIndex].name);
					}
				}
			}
			if (influences === 0) unweightedVertexCount += 1;
			maximumInfluences = Math.max(maximumInfluences, influences);
			maximumWeightSumError = Math.max(
				maximumWeightSumError,
				Math.abs(sum - 1),
			);
		}
	});
	materialCount = materials.size;
	const bounds = bodyObject
		? new THREE.Box3().setFromObject(bodyObject, true)
		: new THREE.Box3();
	const dimensions = bounds.getSize(new THREE.Vector3());
	const missingWeightedBones = EXPECTED_WEIGHTED_BONES.filter(
		(name) => !weightedBones.has(name),
	);
	return {
		bounds: {
			dimensions: dimensions.toArray().map((value) => rounded(value)),
			maximumY: rounded(bounds.max.y),
			minimumY: rounded(bounds.min.y),
		},
		finiteNormals,
		finitePositions,
		indexRangeValid,
		materialCount,
		maximumInfluences,
		maximumWeightSumError,
		meshCount,
		missingWeightedBones,
		outOfRangeJointCount,
		passed:
			finiteNormals &&
			finitePositions &&
			indexRangeValid &&
			materialCount === 1 &&
			maximumInfluences <= 4 &&
			maximumWeightSumError <= 0.00001 &&
			meshCount === 1 &&
			missingWeightedBones.length === 0 &&
			outOfRangeJointCount === 0 &&
			skinnedMeshCount === 1 &&
			unweightedVertexCount === 0 &&
			topology.connectedComponentCount === 1 &&
			topology.degenerateFaceCount === 0 &&
			topology.manifold &&
			topology.genus === 0 &&
			topology.unreferencedVertexCount === 0 &&
			Math.abs(bounds.min.y) <= 0.002 &&
			Math.abs(dimensions.y - expectedHeight) <= 0.01,
		skinnedMeshCount,
		triangleCount,
		topology,
		unweightedVertexCount,
		vertexCount,
		weightedBones: [...weightedBones].sort(),
	};
}

function worldPosition(root, name) {
	const object = root.getObjectByName(name);
	if (!object) throw new Error(`Missing animation diagnostic bone ${name}.`);
	return object.getWorldPosition(new THREE.Vector3());
}

function lengthSnapshot(root) {
	root.updateMatrixWorld(true);
	return Object.fromEntries(
		LENGTH_CHAINS.map(([parent, child]) => [
			`${parent}->${child}`,
			worldPosition(root, parent).distanceTo(worldPosition(root, child)),
		]),
	);
}

function poseSnapshot(root) {
	root.updateMatrixWorld(true);
	return DIAGNOSTIC_BONES.flatMap((name) => {
		const bone = root.getObjectByName(name);
		if (!bone) throw new Error(`Missing animation diagnostic bone ${name}.`);
		return [
			...bone.getWorldPosition(new THREE.Vector3()).toArray(),
			...bone.getWorldQuaternion(new THREE.Quaternion()).toArray(),
		];
	});
}

function sampleAnimation(root, clip, normalizedTime) {
	const clone = cloneSkeleton(root);
	const mixer = new THREE.AnimationMixer(clone);
	const action = mixer.clipAction(clip);
	action.setLoop(THREE.LoopOnce, 1);
	action.clampWhenFinished = true;
	action.play();
	mixer.setTime(clip.duration * normalizedTime);
	clone.updateMatrixWorld(true);
	const result = {
		bounds: new THREE.Box3().setFromObject(clone, true),
		lengths: lengthSnapshot(clone),
		pelvis: worldPosition(clone, "pelvis"),
		pose: poseSnapshot(clone),
	};
	mixer.stopAllAction();
	mixer.uncacheRoot(clone);
	return result;
}

function validateAnimation(root, clip) {
	const rootNames = new Set();
	root.traverse((object) => object.name && rootNames.add(object.name));
	const missingTrackTargets = clip.tracks
		.map((track) => track.name.slice(0, track.name.lastIndexOf(".")))
		.filter((name) => !rootNames.has(name));
	const restLengths = lengthSnapshot(root);
	let maximumBoneLengthRelativeError = 0;
	let maximumBoundsExpansion = 0;
	let minimumBoundsExpansion = Number.POSITIVE_INFINITY;
	const restBounds = new THREE.Box3().setFromObject(root, true);
	const restSize = restBounds.getSize(new THREE.Vector3()).length();
	const samples = [0, 0.25, 0.5, 0.75, 1].map((normalizedTime) => {
		const sample = sampleAnimation(root, clip, normalizedTime);
		for (const [key, value] of Object.entries(sample.lengths)) {
			maximumBoneLengthRelativeError = Math.max(
				maximumBoneLengthRelativeError,
				Math.abs(value / restLengths[key] - 1),
			);
		}
		const expansion =
			sample.bounds.getSize(new THREE.Vector3()).length() / restSize;
		maximumBoundsExpansion = Math.max(maximumBoundsExpansion, expansion);
		minimumBoundsExpansion = Math.min(minimumBoundsExpansion, expansion);
		return {
			boundsExpansion: expansion,
			normalizedTime,
			pelvis: sample.pelvis,
			pose: sample.pose,
		};
	});
	const first = samples[0];
	const last = samples.at(-1);
	const poseAdvancement = Math.max(
		...samples[1].pose.map((value, index) =>
			Math.abs(value - samples[3].pose[index]),
		),
	);
	const rootMotionResidual = {
		x: last.pelvis.x - first.pelvis.x,
		z: last.pelvis.z - first.pelvis.z,
	};
	return {
		finiteKeyframes: clip.tracks.every((track) =>
			Array.from(track.values).every(Number.isFinite),
		),
		maximumBoneLengthRelativeError,
		maximumBoundsExpansion,
		minimumBoundsExpansion,
		missingTrackTargets,
		passed:
			missingTrackTargets.length === 0 &&
			clip.tracks.every((track) =>
				Array.from(track.values).every(Number.isFinite),
			) &&
			maximumBoneLengthRelativeError <= 0.00001 &&
			minimumBoundsExpansion >= 0.65 &&
			maximumBoundsExpansion <= 1.5 &&
			poseAdvancement > 0.0001 &&
			Math.hypot(rootMotionResidual.x, rootMotionResidual.z) <= 0.00001,
		poseAdvancement,
		rootMotionResidual,
	};
}

function validateCloneAndRest(root, clip) {
	const first = cloneSkeleton(root);
	const second = cloneSkeleton(root);
	const firstSkeletons = uniqueSkeletons(first);
	const secondSkeletons = uniqueSkeletons(second);
	const firstPelvis = first.getObjectByName("pelvis");
	const secondPelvis = second.getObjectByName("pelvis");
	const secondInitial = secondPelvis.matrix.clone();
	const restMatrices = new Map();
	first.traverse((object) => {
		if (object instanceof THREE.Bone)
			restMatrices.set(object.name, object.matrix.clone());
	});
	const firstMixer = new THREE.AnimationMixer(first);
	const secondMixer = new THREE.AnimationMixer(second);
	firstMixer.clipAction(clip).play();
	secondMixer.clipAction(clip).play();
	firstMixer.update(clip.duration * 0.35);
	const secondUnaffected = secondPelvis.matrix.equals(secondInitial);
	secondMixer.update(clip.duration * 0.7);
	firstMixer.stopAllAction();
	for (const skeleton of firstSkeletons) skeleton.pose();
	first.updateMatrixWorld(true);
	let maximumRestMatrixDifference = 0;
	first.traverse((object) => {
		if (!(object instanceof THREE.Bone)) return;
		const expected = restMatrices.get(object.name);
		if (!expected) return;
		maximumRestMatrixDifference = Math.max(
			maximumRestMatrixDifference,
			...object.matrix.elements.map((value, index) =>
				Math.abs(value - expected.elements[index]),
			),
		);
	});
	const result = {
		maximumRestMatrixDifference,
		passed:
			firstPelvis !== secondPelvis &&
			firstMixer !== secondMixer &&
			secondUnaffected &&
			firstSkeletons.every((skeleton) => !secondSkeletons.includes(skeleton)) &&
			maximumRestMatrixDifference <= 0.000001,
		restRestored: maximumRestMatrixDifference <= 0.000001,
		secondUnaffected,
		separateBones: firstPelvis !== secondPelvis,
		separateMixers: firstMixer !== secondMixer,
		separateSkeletons: firstSkeletons.every(
			(skeleton) => !secondSkeletons.includes(skeleton),
		),
	};
	firstMixer.uncacheRoot(first);
	secondMixer.stopAllAction();
	secondMixer.uncacheRoot(second);
	return result;
}

function validateSymmetry(root) {
	const lengths = lengthSnapshot(root);
	let maximumRelativeDifference = 0;
	for (const [
		[leftParent, leftChild],
		[rightParent, rightChild],
	] of SYMMETRY_CHAINS) {
		const left = lengths[`${leftParent}->${leftChild}`];
		const right = lengths[`${rightParent}->${rightChild}`];
		maximumRelativeDifference = Math.max(
			maximumRelativeDifference,
			Math.abs(left - right) / Math.max(left, right),
		);
	}
	return {
		maximumRelativeDifference,
		passed: maximumRelativeDifference <= 0.0001,
	};
}

export async function validateProceduralMannequinArtifact({
	artifactPath,
	expectedHeightMetres,
	expectedHairComponent = { componentId: "none", definition: undefined },
	expectedSkinMaterial,
	templatePath,
	workspaceRoot = process.cwd(),
}) {
	const [
		gltf,
		inspection,
		templateInspection,
		idleGltf,
		walkGltf,
		glbResources,
	] = await Promise.all([
		loadGlb(artifactPath),
		inspectAnimationSource(artifactPath),
		inspectAnimationSource(templatePath),
		loadGlb(path.resolve(workspaceRoot, ANIMATIONS.idle.path)),
		loadGlb(path.resolve(workspaceRoot, ANIMATIONS.walk.path)),
		inspectGlbResources(artifactPath),
	]);
	const clips = {
		idle: idleGltf.animations.find(
			(clip) => clip.name === ANIMATIONS.idle.clipName,
		),
		walk: walkGltf.animations.find(
			(clip) => clip.name === ANIMATIONS.walk.clipName,
		),
	};
	if (!clips.idle || !clips.walk) {
		throw new Error("Canonical Golden Idle or Walk clip is missing.");
	}
	const semantic = semanticSnapshot(gltf.scene);
	const names = new Set();
	gltf.scene.traverse((object) => object.name && names.add(object.name));
	const missingRequiredBones = REQUIRED_BONES.filter(
		(name) => !names.has(name),
	);
	const generatedSkeleton = skeletonSignature(inspection);
	const geometry = analyzeGeometry(gltf.scene, expectedHeightMetres);
	const artifact = analyzeArtifact(gltf.scene);
	const material = analyzeSkinMaterial(gltf.scene, expectedSkinMaterial);
	const skeletonContract = compareSkeletonContracts(
		templateInspection,
		inspection,
	);
	const animations = {
		idle: validateAnimation(gltf.scene, clips.idle),
		walk: validateAnimation(gltf.scene, clips.walk),
	};
	const hair = analyzeHair(
		gltf.scene,
		expectedHairComponent,
		clips,
		glbResources,
	);
	const cloneIndependence = validateCloneAndRest(gltf.scene, clips.walk);
	const symmetry = validateSymmetry(gltf.scene);
	const noVendorPresentation = ![...names].some((name) =>
		/Face|Retopology|Sphere\.005|mixamo/iu.test(name),
	);
	const checks = {
		animationBinding: animations.idle.passed && animations.walk.passed,
		cloneIndependence: cloneIndependence.passed,
		geometry: geometry.passed,
		hair: hair.passed,
		material: material.passed,
		jointCount:
			inspection.skeletons.length === 1 &&
			inspection.skeletons[0].jointCount === 65 &&
			glbResources.skinCount === 1,
		missingRequiredBones: missingRequiredBones.length === 0,
		noEmbeddedAnimations: gltf.animations.length === 0,
		noMixamoOrVendorPresentation: noVendorPresentation,
		skeletonContract: skeletonContract.passed,
		symmetry: symmetry.passed,
	};
	let bodyGeometry;
	gltf.scene.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		if (
			objectMaterials.some(
				(material) => material.name === "ProceduralSkinMaterial",
			)
		) {
			bodyGeometry = object.geometry;
		}
	});
	const bodySemantic = bodyGeometry
		? semanticMeshSnapshot("ProceduralMannequinMesh", bodyGeometry)
		: undefined;
	if (bodySemantic) delete bodySemantic.attributes.uv;
	return {
		animations,
		artifact,
		checks,
		cloneIndependence,
		geometry,
		geometrySemanticHash: sha256(
			JSON.stringify({
				mesh: bodySemantic,
				skeleton: generatedSkeleton,
			}),
		),
		glbResources,
		hair,
		inspection: {
			embeddedAnimationCount: gltf.animations.length,
			jointCount: inspection.skeletons[0]?.jointCount,
			missingRequiredBones,
			nodeCount: inspection.nodeCount,
			skeletonCount: inspection.skeletons.length,
			warnings: inspection.warnings,
		},
		passed: Object.values(checks).every(Boolean),
		material,
		materialSemanticHash: sha256(
			JSON.stringify(
				semantic.materials.filter(
					(candidate) => candidate.name === expectedSkinMaterial?.name,
				),
			),
		),
		semanticHash: sha256(JSON.stringify(semantic)),
		semanticSnapshot: semantic,
		skeletonContract,
		skeletonSignature: generatedSkeleton.hash,
		symmetry,
	};
}
