// Original project-authored low-poly sword. One vertex-colour material, no textures.
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const pieces = [];
function part(geometry, color, y = 0) {
	geometry = geometry.index ? geometry.toNonIndexed() : geometry;
	geometry.deleteAttribute("uv");
	geometry.translate(0, y, 0);
	const c = new THREE.Color(color),
		colors = [];
	for (let i = 0; i < geometry.attributes.position.count; i++)
		colors.push(c.r, c.g, c.b);
	geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	pieces.push(geometry);
}
// Grip-centred origin. +Y blade; +Z flat face. Metres at unit scale.
part(new THREE.CylinderGeometry(0.025, 0.028, 0.2, 8), 0x493323);
part(new THREE.CylinderGeometry(0.043, 0.035, 0.045, 8), 0xc6a15a, -0.12);
part(new THREE.BoxGeometry(0.25, 0.045, 0.065), 0xc6a15a, 0.115);
const blade = new THREE.BufferGeometry();
const rings = [
	[-0.05, 0.14, 0],
	[0, 0.14, 0.017],
	[0.05, 0.14, 0],
	[0, 0.14, -0.017],
	[-0.042, 0.72, 0],
	[0, 0.72, 0.014],
	[0.042, 0.72, 0],
	[0, 0.72, -0.014],
	[0, 0.88, 0],
];
const vertices = [];
function tri(a, b, c) {
	for (const i of [a, b, c]) vertices.push(...rings[i]);
}
for (let i = 0; i < 4; i++) {
	const j = (i + 1) % 4;
	tri(i, j, i + 4);
	tri(j, j + 4, i + 4);
	tri(i + 4, j + 4, 8);
}
tri(0, 2, 1);
tri(0, 3, 2);
blade.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
blade.computeVertexNormals();
part(blade, 0xc1d2db);
const mesh = mergeGeometries(pieces);
mesh.computeBoundingBox();
const arrays = ["position", "normal", "color"].map(
	(k) => mesh.attributes[k].array,
);
const chunks = arrays.map((a) =>
	Buffer.from(a.buffer, a.byteOffset, a.byteLength),
);
const bin = Buffer.concat(chunks);
let offset = 0;
const views = chunks.map((b) => {
	const v = {
		buffer: 0,
		byteOffset: offset,
		byteLength: b.length,
		target: 34962,
	};
	offset += b.length;
	return v;
});
const doc = {
	asset: { version: "2.0", generator: "Adventure Game Builder sword-v1" },
	scene: 0,
	scenes: [{ nodes: [0] }],
	nodes: [{ name: "Sword_GripOrigin", mesh: 0 }],
	meshes: [
		{
			primitives: [
				{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 },
			],
		},
	],
	materials: [
		{
			name: "SwordVertexColour",
			pbrMetallicRoughness: { metallicFactor: 0.3, roughnessFactor: 0.65 },
		},
	],
	buffers: [{ byteLength: bin.length }],
	bufferViews: views,
	accessors: arrays.map((a, i) => ({
		bufferView: i,
		componentType: 5126,
		count: a.length / 3,
		type: "VEC3",
		...(i === 0
			? {
					min: mesh.boundingBox.min.toArray(),
					max: mesh.boundingBox.max.toArray(),
				}
			: {}),
	})),
};
const json = Buffer.from(JSON.stringify(doc)),
	pad = (4 - (json.length % 4)) % 4;
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + pad + 8 + bin.length, 8);
header.writeUInt32LE(json.length + pad, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length);
bh.writeUInt32LE(0x004e4942, 4);
await mkdir("public/assets/weapons", { recursive: true });
await writeFile(
	"public/assets/weapons/sword-v1.glb",
	Buffer.concat([header, json, Buffer.alloc(pad, 32), bh, bin]),
);
console.log(
	JSON.stringify({
		vertices: arrays[0].length / 3,
		triangles: arrays[0].length / 9,
		materials: 1,
		bytes: 20 + json.length + pad + 8 + bin.length,
	}),
);
