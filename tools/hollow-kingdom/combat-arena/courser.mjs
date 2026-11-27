// Create a clip-only GLB against Bracken's published rest joints. The model,
// textures, skin and gait clips remain shared with the existing horse.
import { readFileSync, writeFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const dir = new URL("../../../public/assets/hollow-kingdom/", import.meta.url);
const source = readFileSync(new URL("horse.glb", dir));
const rig = JSON.parse(source.subarray(20, 20 + source.readUInt32LE(12)));
const gltf = {
	asset: { version: "2.0" },
	scene: 0,
	scenes: [{ nodes: [] }],
	nodes: [],
	animations: [],
	accessors: [],
	bufferViews: [],
	buffers: [],
};
const bytes = [];
let length = 0;
function accessor(data, type, width) {
	const buffer = Buffer.alloc(4 * data.length);
	data.forEach((value, i) => {
		buffer.writeFloatLE(value, i * 4);
	});
	const view =
		gltf.bufferViews.push({
			buffer: 0,
			byteOffset: length,
			byteLength: buffer.length,
		}) - 1;
	bytes.push(buffer);
	length += buffer.length;
	return (
		gltf.accessors.push({
			bufferView: view,
			componentType: 5126,
			count: data.length / width,
			type,
			...(width === 1 && { min: [data[0]], max: [data.at(-1)] }),
		}) - 1
	);
}
const axis = new Vector3(1, 0, 0);
const joints = {
	Neck: -0.25,
	Head: 0.19,
	"foreUpper.L": -0.92,
	"foreCannon.L": 1.05,
	"foreUpper.R": -0.24,
	"foreCannon.R": 0.35,
};
for (const name of Object.keys(joints)) {
	const bone = rig.nodes.find((n) => n.name === name);
	if (!bone) throw Error(name);
	gltf.scenes[0].nodes.push(gltf.nodes.length);
	gltf.nodes.push({ name, rotation: bone.rotation ?? [0, 0, 0, 1] });
}
for (const [name, times, weights] of [
	["PawLift", [0, 0.22, 0.55, 0.8], [0, 0.12, 0.94, 1]],
	["PawStrike", [0, 0.08, 0.2, 0.36, 0.65], [1, 1.08, -0.16, 0.1, 0]],
]) {
	const input = accessor(times, "SCALAR", 1);
	const samplers = [],
		channels = [];
	for (const [node, bone] of gltf.nodes.entries()) {
		const rest = new Quaternion().fromArray(bone.rotation);
		const values = weights.flatMap((w) =>
			rest
				.clone()
				.multiply(
					new Quaternion().setFromAxisAngle(axis, joints[bone.name] * w),
				)
				.toArray(),
		);
		const output = accessor(values, "VEC4", 4);
		channels.push({
			sampler: samplers.length,
			target: { node, path: "rotation" },
		});
		samplers.push({ input, output, interpolation: "LINEAR" });
	}
	gltf.animations.push({ name, samplers, channels });
}
gltf.buffers.push({ byteLength: length });
const json = Buffer.from(JSON.stringify(gltf));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
json.copy(padded);
const header = Buffer.alloc(20),
	bin = Buffer.alloc(8);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + length, 8);
header.writeUInt32LE(padded.length, 12);
header.write("JSON", 16);
bin.writeUInt32LE(length);
bin.write("BIN", 4);
const file = Buffer.concat([header, padded, bin, ...bytes]);
const parsed = await new GLTFLoader().parseAsync(
	file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
	"",
);
if (
	parsed.animations.length !== 2 ||
	parsed.animations.some((c) => c.tracks.length !== 6 || !c.validate())
)
	throw Error("Courser clip round trip failed");
writeFileSync(new URL("courser-actions.glb", dir), file);
console.log(
	parsed.animations.map((c) => [c.name, c.duration, c.tracks.length]),
);
