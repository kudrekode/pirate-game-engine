import { readFile } from "node:fs/promises";
import path from "node:path";

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

function usage() {
	return [
		"Usage:",
		"  node tools/animation-retargeting/inspect-animation-source.mjs <source.glb|source.gltf> [...]",
		"",
		"The command is read-only and prints one JSON report per input file.",
	].join("\n");
}

function decodeDataUri(uri) {
	const match = /^data:.*?(;base64)?,(.*)$/s.exec(uri);
	if (!match) throw new Error("Invalid data URI.");
	return match[1]
		? Buffer.from(match[2], "base64")
		: Buffer.from(decodeURIComponent(match[2]));
}

function parseGlb(buffer, filePath) {
	if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
		throw new Error(`${filePath} is not a valid GLB file.`);
	}
	const declaredLength = buffer.readUInt32LE(8);
	if (declaredLength > buffer.length)
		throw new Error(`${filePath} is truncated.`);
	let json;
	const binaryChunks = [];
	let offset = 12;
	while (offset + 8 <= declaredLength) {
		const chunkLength = buffer.readUInt32LE(offset);
		const chunkType = buffer.readUInt32LE(offset + 4);
		const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
		if (chunkType === GLB_JSON_CHUNK) {
			json = JSON.parse(chunk.toString("utf8").trim());
		} else if (chunkType === GLB_BIN_CHUNK) {
			binaryChunks.push(chunk);
		}
		offset += 8 + chunkLength;
	}
	if (!json) throw new Error(`${filePath} has no JSON chunk.`);
	return { binaryChunks, document: json };
}

async function loadGltf(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (extension !== ".glb" && extension !== ".gltf") {
		throw new Error(
			`Unsupported format "${extension || "unknown"}"; use .glb or .gltf.`,
		);
	}
	const input = await readFile(filePath);
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

function inspectSkeletons(document) {
	const nodes = document.nodes ?? [];
	const parents = createParentIndexes(nodes);
	return (document.skins ?? []).map((skin, skinIndex) => {
		const joints = skin.joints ?? [];
		const jointIndexes = new Set(joints);
		return {
			index: skinIndex,
			name: skin.name || `skin_${skinIndex}`,
			jointCount: joints.length,
			skeletonRoot:
				skin.skeleton === undefined ? null : nodeName(nodes, skin.skeleton),
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
		};
	});
}

function range(values, componentIndex) {
	const components = values.map((value) =>
		Array.isArray(value) ? value[componentIndex] : value,
	);
	return { max: Math.max(...components), min: Math.min(...components) };
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

function inspectAnimations(document, buffers) {
	const nodes = document.nodes ?? [];
	const parents = createParentIndexes(nodes);
	return (document.animations ?? []).map((animation, animationIndex) => {
		let duration = 0;
		const tracks = (animation.channels ?? []).map((channel) => {
			const sampler = animation.samplers?.[channel.sampler];
			if (!sampler) {
				throw new Error(
					`Animation ${animationIndex} references missing sampler ${channel.sampler}.`,
				);
			}
			const times = readAccessor(document, buffers, sampler.input);
			const outputValues = readAccessor(document, buffers, sampler.output);
			const interpolation = sampler.interpolation ?? "LINEAR";
			const values =
				interpolation === "CUBICSPLINE"
					? outputValues.filter((_value, index) => index % 3 === 1)
					: outputValues;
			const trackDuration = times.length > 0 ? Math.max(...times) : 0;
			duration = Math.max(duration, trackDuration);
			return {
				interpolation,
				keyframeCount: times.length,
				node: nodeName(nodes, channel.target.node),
				nodeIndex: channel.target.node,
				path: channel.target.path,
				timeRange:
					times.length > 0 ? [Math.min(...times), trackDuration] : [0, 0],
				values,
			};
		});
		const translationTracks = tracks
			.filter(
				(track) => track.path === "translation" && track.values.length > 0,
			)
			.map((track) => {
				const first = track.values[0];
				const last = track.values[track.values.length - 1];
				const x = range(track.values, 0);
				const y = range(track.values, 1);
				const z = range(track.values, 2);
				const displacement = {
					x: last[0] - first[0],
					y: last[1] - first[1],
					z: last[2] - first[2],
				};
				const horizontalRange = Math.hypot(x.max - x.min, z.max - z.min);
				const isHierarchyRoot = !parents.has(track.nodeIndex);
				const isNamedRoot = isRootMotionName(track.node);
				return {
					displacement,
					horizontalRange,
					isHierarchyRoot,
					isNamedRoot,
					node: track.node,
					verticalRange: y.max - y.min,
				};
			});
		const rootMotionTracks = translationTracks.filter(
			(track) => track.isHierarchyRoot || track.isNamedRoot,
		);
		return {
			duration,
			index: animationIndex,
			name: animation.name || `animation_${animationIndex}`,
			rootMotion: {
				candidates: rootMotionTracks,
				detected: rootMotionTracks.some(
					(track) =>
						track.horizontalRange > 0.0001 ||
						Math.hypot(track.displacement.x, track.displacement.z) > 0.0001,
				),
			},
			trackCount: tracks.length,
			tracks: tracks.map(({ values: _values, ...track }) => track),
		};
	});
}

async function inspect(filePath) {
	const absolutePath = path.resolve(filePath);
	const { buffers, document } = await loadGltf(absolutePath);
	return {
		asset: {
			absolutePath,
			generator: document.asset?.generator ?? null,
			version: document.asset?.version ?? null,
		},
		animations: inspectAnimations(document, buffers),
		nodeCount: document.nodes?.length ?? 0,
		skeletons: inspectSkeletons(document),
	};
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
	console.log(usage());
	process.exit(args.length === 0 ? 1 : 0);
}

let failed = false;
for (const filePath of args) {
	try {
		console.log(JSON.stringify(await inspect(filePath), null, 2));
	} catch (error) {
		failed = true;
		console.error(
			JSON.stringify(
				{
					error: error instanceof Error ? error.message : String(error),
					file: path.resolve(filePath),
				},
				null,
				2,
			),
		);
	}
}

process.exitCode = failed ? 1 : 0;
