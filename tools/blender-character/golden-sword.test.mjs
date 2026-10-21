import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateGoldenInteraction } from "./golden-interaction-roundtrip.mjs";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";

test("installed sword library round-trips the unchanged Golden rig with one recovered in-place action", async () => {
	const dir = "public/assets/derived/humanoid-animations/golden-sword-v1";
	const report = await validateGoldenInteraction(
		`${dir}/actions.glb`,
		undefined,
		{ Attack: { name: "GoldenSword_Attack_V1", duration: 0.75 } },
	);
	const metadata = JSON.parse(await readFile(`${dir}/metadata.json`, "utf8"));
	assert.equal(report.sha256, metadata.sha256);
	assert.equal(metadata.binaryDeterministic, true);
	assert.equal(report.targets[0].clips[0].tracks, 53);
	for (const [path, hash] of Object.entries(metadata.sourceHashes))
		assert.equal(
			createHash("sha256")
				.update(await readFile(path))
				.digest("hex"),
			hash,
			path,
		);
});
test("sword asset is finite, lightweight, grip-centred and contains no physics/animation payload", async () => {
	const model = await loadGlb("public/assets/weapons/sword-v1.glb");
	let meshes = 0,
		triangles = 0;
	const materials = new Set();
	model.scene.traverse((o) => {
		if (!o.isMesh) return;
		meshes++;
		materials.add(o.material);
		triangles += o.geometry.attributes.position.count / 3;
		assert([...o.geometry.attributes.position.array].every(Number.isFinite));
		o.geometry.computeBoundingBox();
		assert(o.geometry.boundingBox.min.y < 0);
		assert(o.geometry.boundingBox.max.y > 0.8);
	});
	assert.equal(meshes, 1);
	assert.equal(materials.size, 1);
	assert.equal(triangles, 90);
	assert.equal(model.animations.length, 0);
});
