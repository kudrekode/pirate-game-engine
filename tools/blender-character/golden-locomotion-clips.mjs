// Produce delivery copies of the two Golden locomotion bakes. The original
// rigged GLBs remain the inputs to Blender and the offline retarget round trip.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const bakeDirectory =
	"public/assets/derived/humanoid-animations/golden-reference-v0";
export const locomotionNames = ["idle", "walk-in-place"];

export function extractLocomotionClip(bytes) {
	assert.equal(bytes.toString("ascii", 0, 4), "glTF");
	const jsonEnd = 20 + bytes.readUInt32LE(12);
	const source = JSON.parse(bytes.toString("utf8", 20, jsonEnd));
	const binary = bytes.subarray(jsonEnd + 8);
	// Keep node indices, names and local transforms. Mesh attachment nodes
	// become empty nodes so channel bindings and the joint hierarchy stay exact.
	const nodes = source.nodes.map(
		({ mesh: _mesh, skin: _skin, ...node }) => node,
	);
	const accessors = [];
	const bufferViews = [];
	const parts = [];
	const accessorIds = new Map();
	const viewIds = new Map();
	let length = 0;
	function copyAccessor(id) {
		if (accessorIds.has(id)) return accessorIds.get(id);
		const accessor = source.accessors[id];
		assert.ok(!accessor.sparse && accessor.bufferView !== undefined);
		if (!viewIds.has(accessor.bufferView)) {
			const view = source.bufferViews[accessor.bufferView];
			assert.equal(view.buffer, 0);
			const offset = view.byteOffset ?? 0;
			viewIds.set(accessor.bufferView, bufferViews.length);
			bufferViews.push({ ...view, byteOffset: length });
			const data = binary.subarray(offset, offset + view.byteLength);
			assert.equal(data.length, view.byteLength);
			const padding = (4 - (data.length % 4)) % 4;
			parts.push(data, Buffer.alloc(padding));
			length += data.length + padding;
		}
		const index = accessors.length;
		accessorIds.set(id, index);
		accessors.push({
			...accessor,
			bufferView: viewIds.get(accessor.bufferView),
		});
		return index;
	}
	const animations = source.animations.map((a) => ({
		...a,
		samplers: a.samplers.map((s) => ({
			...s,
			input: copyAccessor(s.input),
			output: copyAccessor(s.output),
		})),
	}));
	const json = Buffer.from(
		JSON.stringify({
			asset: source.asset,
			scene: source.scene,
			scenes: source.scenes,
			nodes,
			animations,
			accessors,
			bufferViews,
			buffers: [{ byteLength: length }],
		}),
	);
	const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
	json.copy(padded);
	const header = Buffer.alloc(20);
	header.write("glTF");
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(28 + padded.length + length, 8);
	header.writeUInt32LE(padded.length, 12);
	header.write("JSON", 16);
	const chunk = Buffer.alloc(8);
	chunk.writeUInt32LE(length);
	chunk.write("BIN", 4);
	return Buffer.concat([header, padded, chunk, ...parts]);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const output = process.argv[2] ?? bakeDirectory;
	await mkdir(output, { recursive: true });
	for (const name of locomotionNames) {
		const bytes = await readFile(join(bakeDirectory, `${name}.glb`));
		const clip = extractLocomotionClip(bytes);
		await writeFile(join(output, `${name}.clip.glb`), clip);
		console.log(name, bytes.length, "->", clip.length, "bytes");
	}
}
