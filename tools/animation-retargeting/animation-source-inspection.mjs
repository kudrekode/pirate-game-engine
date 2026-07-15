import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const COMPONENTS_BY_TYPE = {
	MAT2: 4,
	MAT3: 9,
	MAT4: 16,
	SCALAR: 1,
	VEC2: 2,
	VEC3: 3,
	VEC4: 4,
};
const COMPONENT_READERS = {
	5120: { bytes: 1, read: "getInt8" },
	5121: { bytes: 1, read: "getUint8" },
	5122: { bytes: 2, read: "getInt16" },
	5123: { bytes: 2, read: "getUint16" },
	5125: { bytes: 4, read: "getUint32" },
	5126: { bytes: 4, read: "getFloat32" },
};

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

function parseGlb(buffer, filePath) {
	if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
		throw new Error(`${filePath} is not a valid GLB file.`);
	}
	const declaredLength = buffer.readUInt32LE(8);
	if (declaredLength > buffer.length)
		throw new Error(`${filePath} is truncated.`);
	let document;
	const binaryChunks = [];
	let offset = 12;
	while (offset + 8 <= declaredLength) {
		const chunkLength = buffer.readUInt32LE(offset);
		const chunkType = buffer.readUInt32LE(offset + 4);
		const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
		if (chunkType === GLB_JSON_CHUNK) {
			document = JSON.parse(chunk.toString("utf8").trim());
		} else if (chunkType === GLB_BIN_CHUNK) {
			binaryChunks.push(chunk);
		}
		offset += 8 + chunkLength;
	}
	if (!document) throw new Error(`${filePath} has no JSON chunk.`);
	return { binaryChunks, document };
}

function decodeDataUri(uri) {
	const match = /^data:.*?(;base64)?,(.*)$/s.exec(uri);
	if (!match) throw new Error("Invalid data URI.");
	return match[1]
		? Buffer.from(match[2], "base64")
		: Buffer.from(decodeURIComponent(match[2]));
}

async function loadGltf(filePath, input) {
	const extension = path.extname(filePath).toLowerCase();
	const parsed =
		extension === ".glb"
			? parseGlb(input, filePath)
			: { binaryChunks: [], document: JSON.parse(input.toString("utf8")) };
	const buffers = [];
	let binaryChunkIndex = 0;
	for (const definition of parsed.document.buffers ?? []) {
		if (definition.uri?.startsWith("data:")) {
			buffers.push(decodeDataUri(definition.uri));
		} else if (definition.uri) {
			buffers.push(
				await readFile(
					path.resolve(path.dirname(filePath), decodeURI(definition.uri)),
				),
			);
		} else {
			const chunk = parsed.binaryChunks[binaryChunkIndex];
			if (!chunk) {
				throw new Error(
					`Missing GLB binary chunk for buffer ${buffers.length}.`,
				);
			}
			buffers.push(chunk);
			binaryChunkIndex += 1;
		}
	}
	return { buffers, document: parsed.document };
}

function normalizeInteger(value, componentType) {
	switch (componentType) {
		case 5120:
			return Math.max(value / 127, -1);
		case 5121:
			return value / 255;
		case 5122:
			return Math.max(value / 32767, -1);
		case 5123:
			return value / 65535;
		case 5125:
			return value / 4294967295;
		default:
			return value;
	}
}

function readAccessor(document, buffers, accessorIndex) {
	const accessor = document.accessors?.[accessorIndex];
	if (!accessor) throw new Error(`Missing accessor ${accessorIndex}.`);
	if (accessor.sparse) {
		throw new Error(
			`Sparse accessor ${accessorIndex} is not supported by this inspector.`,
		);
	}
	const view = document.bufferViews?.[accessor.bufferView];
	if (!view)
		throw new Error(`Accessor ${accessorIndex} has no readable buffer view.`);
	const component = COMPONENT_READERS[accessor.componentType];
	const componentCount = COMPONENTS_BY_TYPE[accessor.type];
	if (!component || !componentCount) {
		throw new Error(
			`Accessor ${accessorIndex} has an unsupported component or value type.`,
		);
	}
	const buffer = buffers[view.buffer];
	if (!buffer)
		throw new Error(
			`Missing buffer ${view.buffer} for accessor ${accessorIndex}.`,
		);
	const stride = view.byteStride ?? component.bytes * componentCount;
	const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const dataView = new DataView(
		buffer.buffer,
		buffer.byteOffset,
		buffer.byteLength,
	);
	const values = [];
	for (let item = 0; item < accessor.count; item += 1) {
		const tuple = [];
		for (
			let componentIndex = 0;
			componentIndex < componentCount;
			componentIndex += 1
		) {
			const byteOffset =
				start + item * stride + componentIndex * component.bytes;
			const value = dataView[component.read](byteOffset, true);
			tuple.push(
				accessor.normalized
					? normalizeInteger(value, accessor.componentType)
					: value,
			);
		}
		values.push(componentCount === 1 ? tuple[0] : tuple);
	}
	return values;
}

function createParentIndexes(nodes) {
	const parents = new Map();
	nodes.forEach((node, parentIndex) => {
		for (const childIndex of node.children ?? [])
			parents.set(childIndex, parentIndex);
	});
	return parents;
}

function nodeName(nodes, index) {
	return nodes[index]?.name || `node_${index}`;
}

function isRootMotionName(name) {
	const normalized = name.toLowerCase().replace(/[^a-z0-9]/gu, "");
	return (
		["root", "hip", "hips", "pelvis", "motion"].includes(normalized) ||
		normalized.endsWith("hips") ||
		normalized.endsWith("pelvis") ||
		normalized.endsWith("root")
	);
}

function range(values, componentIndex) {
	const components = values.map((value) =>
		Array.isArray(value) ? value[componentIndex] : value,
	);
	return { max: Math.max(...components), min: Math.min(...components) };
}

function rootMotionEvidence(name, values) {
	if (!isRootMotionName(name) || values.length === 0) return undefined;
	const first = values[0];
	const last = values.at(-1);
	const x = range(values, 0);
	const y = range(values, 1);
	const z = range(values, 2);
	const displacement = {
		x: last[0] - first[0],
		y: last[1] - first[1],
		z: last[2] - first[2],
	};
	return {
		displacement,
		horizontalExcursion: Math.hypot(x.max - x.min, z.max - z.min),
		netHorizontalDisplacement: Math.hypot(displacement.x, displacement.z),
		node: name,
		returnsToHorizontalStart:
			Math.hypot(displacement.x, displacement.z) <= 0.0001,
		verticalExcursion: y.max - y.min,
	};
}

function frameRateFromTracks(tracks) {
	const deltas = [];
	for (const track of tracks) {
		for (let index = 1; index < track.times.length; index += 1) {
			const delta = track.times[index] - track.times[index - 1];
			if (delta > 0.000001) deltas.push(delta);
		}
	}
	if (deltas.length === 0) return null;
	deltas.sort((left, right) => left - right);
	const median = deltas[Math.floor(deltas.length / 2)];
	return Math.round((1 / median) * 1000) / 1000;
}

function summarizeThreeClip(clip) {
	const propertyCounts = { rotation: 0, scale: 0, translation: 0 };
	const rootMotionCandidates = [];
	const tracks = clip.tracks.map((track) => {
		const separator = track.name.lastIndexOf(".");
		const target = separator < 0 ? track.name : track.name.slice(0, separator);
		const property =
			separator < 0 ? "unknown" : track.name.slice(separator + 1);
		if (property === "position") propertyCounts.translation += 1;
		else if (property === "quaternion") propertyCounts.rotation += 1;
		else if (property === "scale") propertyCounts.scale += 1;
		if (property === "position") {
			const values = [];
			for (let index = 0; index < track.values.length; index += 3) {
				values.push(Array.from(track.values.slice(index, index + 3)));
			}
			const evidence = rootMotionEvidence(target, values);
			if (evidence) rootMotionCandidates.push(evidence);
		}
		return {
			keyframeCount: track.times.length,
			name: track.name,
			property,
			target,
			timeRange:
				track.times.length === 0
					? [0, 0]
					: [track.times[0], track.times.at(-1)],
		};
	});
	return {
		duration: clip.duration,
		frameRate: frameRateFromTracks(clip.tracks),
		frameCount: Math.max(0, ...clip.tracks.map((track) => track.times.length)),
		name: clip.name,
		rootMotion: {
			candidates: rootMotionCandidates,
			hasHorizontalExcursion: rootMotionCandidates.some(
				(candidate) => candidate.horizontalExcursion > 0.0001,
			),
			hasLocomotionDisplacement: rootMotionCandidates.some(
				(candidate) => candidate.netHorizontalDisplacement > 0.0001,
			),
		},
		trackCount: tracks.length,
		trackPropertyCounts: propertyCounts,
		tracks,
	};
}

function inspectGltfSkeletons(document) {
	const nodes = document.nodes ?? [];
	const parents = createParentIndexes(nodes);
	return (document.skins ?? []).map((skin, skinIndex) => {
		const joints = skin.joints ?? [];
		const jointIndexes = new Set(joints);
		return {
			index: skinIndex,
			jointCount: joints.length,
			joints: joints.map((jointIndex) => {
				const node = nodes[jointIndex] ?? {};
				const parentIndex = parents.get(jointIndex);
				return {
					index: jointIndex,
					name: nodeName(nodes, jointIndex),
					parent:
						parentIndex === undefined ? null : nodeName(nodes, parentIndex),
					parentIsJoint:
						parentIndex === undefined ? false : jointIndexes.has(parentIndex),
					rest: node.matrix
						? { matrix: node.matrix }
						: {
								rotation: node.rotation ?? [0, 0, 0, 1],
								scale: node.scale ?? [1, 1, 1],
								translation: node.translation ?? [0, 0, 0],
							},
				};
			}),
			name: skin.name || `skin_${skinIndex}`,
			skeletonRoot:
				skin.skeleton === undefined ? null : nodeName(nodes, skin.skeleton),
		};
	});
}

function inspectGltfAnimations(document, buffers) {
	return (document.animations ?? []).map((animation, animationIndex) => {
		const tracks = (animation.channels ?? []).map((channel) => {
			const sampler = animation.samplers?.[channel.sampler];
			if (!sampler) {
				throw new Error(
					`Animation ${animationIndex} references missing sampler ${channel.sampler}.`,
				);
			}
			const times = readAccessor(document, buffers, sampler.input);
			const values = readAccessor(document, buffers, sampler.output);
			return {
				name: `${nodeName(document.nodes ?? [], channel.target.node)}.${channel.target.path}`,
				times: Float32Array.from(times),
				values: Float32Array.from(values.flat()),
			};
		});
		const duration = Math.max(
			0,
			...tracks.map((track) => Math.max(0, ...track.times)),
		);
		return summarizeThreeClip({
			duration,
			name: animation.name || `animation_${animationIndex}`,
			tracks,
		});
	});
}

function installFbxToolingGlobals() {
	const previousDocument = globalThis.document;
	const previousWindow = globalThis.window;
	if (!globalThis.document) {
		globalThis.document = {
			createElementNS: () => ({
				addEventListener() {},
				removeEventListener() {},
				setAttribute() {},
			}),
		};
	}
	if (!globalThis.window) {
		globalThis.window = { URL: { createObjectURL: () => "data:," } };
	}
	return () => {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
	};
}

export function parseFbxAnimationSource(input) {
	const restoreGlobals = installFbxToolingGlobals();
	const previousWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.map(String).join(" "));
	try {
		const arrayBuffer = input.buffer.slice(
			input.byteOffset,
			input.byteOffset + input.byteLength,
		);
		const root = new FBXLoader().parse(arrayBuffer, "");
		return { root, warnings: Array.from(new Set(warnings)).sort() };
	} finally {
		console.warn = previousWarn;
		restoreGlobals();
	}
}

function inspectFbxSkeleton(root) {
	const skinnedMeshes = [];
	root.traverse((object) => {
		if (object instanceof THREE.SkinnedMesh) skinnedMeshes.push(object);
	});
	const primary = skinnedMeshes.sort(
		(left, right) => right.skeleton.bones.length - left.skeleton.bones.length,
	)[0];
	if (!primary) throw new Error("FBX source has no skinned mesh skeleton.");
	root.updateMatrixWorld(true);
	const boneSet = new Set(primary.skeleton.bones);
	const boneNames = new Set(primary.skeleton.bones.map((bone) => bone.name));
	const getSkeletonParentName = (bone) => {
		let parent = bone.parent;
		while (parent instanceof THREE.Bone) {
			if (parent.name !== bone.name && boneNames.has(parent.name)) {
				return parent.name;
			}
			parent = parent.parent;
		}
		return null;
	};
	return {
		index: 0,
		jointCount: primary.skeleton.bones.length,
		joints: primary.skeleton.bones.map((bone, index) => ({
			index,
			name: bone.name,
			originalName: bone.userData.originalName ?? bone.name,
			parent: getSkeletonParentName(bone),
			parentIsJoint:
				bone.parent instanceof THREE.Bone && boneSet.has(bone.parent),
			rest: {
				matrixWorld: bone.matrixWorld.toArray(),
				rotation: bone.quaternion.toArray(),
				scale: bone.scale.toArray(),
				translation: bone.position.toArray(),
			},
		})),
		name: primary.name || "primary-skinned-mesh",
		skeletonRoot:
			primary.skeleton.bones.find(
				(bone) =>
					!(bone.parent instanceof THREE.Bone) || !boneSet.has(bone.parent),
			)?.name ?? null,
	};
}

function countNodes(root) {
	let count = 0;
	root.traverse(() => {
		count += 1;
	});
	return count;
}

export async function inspectAnimationSource(filePath) {
	const absolutePath = path.resolve(filePath);
	const extension = path.extname(absolutePath).toLowerCase();
	const input = await readFile(absolutePath);
	const asset = {
		byteLength: input.byteLength,
		fileHash: sha256(input),
		sourcePath: path
			.relative(process.cwd(), absolutePath)
			.replaceAll(path.sep, "/"),
		sourceFormat: extension.slice(1),
	};
	if (extension === ".fbx") {
		const { root, warnings } = parseFbxAnimationSource(input);
		return {
			asset: {
				...asset,
				axis: {
					loaderOutputUp: "+Y",
					sourceAxisMetadata: "not exposed by Three.js FBXLoader",
				},
				unitScaleFactor: root.userData.unitScaleFactor ?? null,
			},
			animations: root.animations.map(summarizeThreeClip),
			nodeCount: countNodes(root),
			skeletons: [inspectFbxSkeleton(root)],
			warnings,
		};
	}
	if (extension === ".glb" || extension === ".gltf") {
		const { buffers, document } = await loadGltf(absolutePath, input);
		return {
			asset: {
				...asset,
				axis: { loaderOutputUp: "+Y", sourceAxisMetadata: "glTF 2.0 +Y up" },
				generator: document.asset?.generator ?? null,
				unitScaleFactor: 1,
				version: document.asset?.version ?? null,
			},
			animations: inspectGltfAnimations(document, buffers),
			nodeCount: document.nodes?.length ?? 0,
			skeletons: inspectGltfSkeletons(document),
			warnings: [],
		};
	}
	throw new Error(
		`Unsupported format "${extension || "unknown"}"; use .fbx, .glb, or .gltf.`,
	);
}

export function findPrimaryFbxSkinnedMesh(root) {
	let primary;
	root.traverse((object) => {
		if (
			object instanceof THREE.SkinnedMesh &&
			(!primary || object.skeleton.bones.length > primary.skeleton.bones.length)
		) {
			primary = object;
		}
	});
	return primary;
}
