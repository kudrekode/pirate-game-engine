// Original project-authored bow/arrow. Metres; bow grip origin, arrow tip origin.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";

async function build(name, pieces) {
	const mesh = mergeGeometries(pieces);
	mesh.computeBoundingBox();
	const arrays = ["position", "normal", "color"].map(
		(k) => mesh.attributes[k].array,
	);
	const chunks = arrays.map((a) =>
		Buffer.from(a.buffer, a.byteOffset, a.byteLength),
	);
	let offset = 0;
	const views = chunks.map((b) => {
		const view = {
			buffer: 0,
			byteOffset: offset,
			byteLength: b.length,
			target: 34962,
		};
		offset += b.length;
		return view;
	});
	const bin = Buffer.concat(chunks);
	const doc = {
		asset: { version: "2.0", generator: `Adventure Game Builder ${name}` },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ name, mesh: 0 }],
		meshes: [
			{
				primitives: [
					{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 },
				],
			},
		],
		materials: [
			{
				name: "WoodSteelFeathers",
				pbrMetallicRoughness: { metallicFactor: 0.1, roughnessFactor: 0.72 },
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
		pad = (4 - (json.length % 4)) % 4,
		header = Buffer.alloc(20),
		bh = Buffer.alloc(8);
	header.writeUInt32LE(0x46546c67);
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(28 + json.length + pad + bin.length, 8);
	header.writeUInt32LE(json.length + pad, 12);
	header.writeUInt32LE(0x4e4f534a, 16);
	bh.writeUInt32LE(bin.length);
	bh.writeUInt32LE(0x004e4942, 4);
	const bytes = Buffer.concat([header, json, Buffer.alloc(pad, 32), bh, bin]);
	const path = `public/assets/weapons/${name}.glb`;
	await writeFile(path, bytes);
	const result = await loadGlb(path);
	let triangles = 0;
	result.scene.traverse((o) => {
		if (o.isMesh) {
			assert([...o.geometry.attributes.position.array].every(Number.isFinite));
			triangles += o.geometry.attributes.position.count / 3;
		}
	});
	assert.equal(result.animations.length, 0);
	assert(triangles < 700);
	console.log(
		JSON.stringify({ path, bytes: bytes.length, triangles, roundTrip: true }),
	);
}
function colored(geometry, color) {
	const g = geometry.index ? geometry.toNonIndexed() : geometry;
	g.deleteAttribute("uv");
	const c = new THREE.Color(color),
		colors = [];
	for (let i = 0; i < g.attributes.position.count; i++)
		colors.push(c.r, c.g, c.b);
	g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	return g;
}
function rod(a, b, r, color, sides = 6) {
	const start = new THREE.Vector3(...a),
		end = new THREE.Vector3(...b),
		delta = end.clone().sub(start);
	const g = new THREE.CylinderGeometry(r, r, delta.length(), sides);
	g.applyQuaternion(
		new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			delta.clone().normalize(),
		),
	);
	g.translate(...start.add(end).multiplyScalar(0.5).toArray());
	return colored(g, color);
}
await mkdir("public/assets/weapons", { recursive: true });
const bow = [];
// Vertical limbs swept toward the archer (-Z); narrow pale string behind the grip.
for (const sign of [-1, 1]) {
	const points = [
		[0, 0, 0],
		[0, sign * 0.25, 0.025],
		[0, sign * 0.48, -0.055],
		[0, sign * 0.65, -0.2],
	];
	for (let i = 1; i < points.length; i++)
		bow.push(rod(points[i - 1], points[i], 0.025 - (i - 1) * 0.004, 0x84532c));
}
bow.push(rod([0, -0.09, 0], [0, 0.09, 0], 0.033, 0x3d2e25, 8));
bow.push(rod([0, -0.65, -0.2], [0, 0.65, -0.2], 0.004, 0xd5c5a3, 4));
await build("bow-v1", bow);
const arrow = [rod([0, 0, -0.66], [0, 0, -0.06], 0.009, 0xc4a070)];
const head = new THREE.ConeGeometry(0.026, 0.085, 4);
head.rotateX(Math.PI / 2);
head.translate(0, 0, -0.0425);
arrow.push(colored(head, 0xbacbd4));
for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
	const feather = new THREE.BoxGeometry(0.006, 0.065, 0.13);
	feather.translate(0, 0.022, -0.57);
	feather.rotateZ(angle);
	arrow.push(colored(feather, 0xe8dfcd));
}
await build("arrow-v1", arrow);
