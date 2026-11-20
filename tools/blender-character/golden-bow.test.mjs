import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateGoldenInteraction } from "./golden-interaction-roundtrip.mjs";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";

test("installed Bow Fire round-trips the exact Golden skeleton with recovered pose and no horizontal root motion", async () => {
	const dir = "public/assets/derived/humanoid-animations/golden-bow-v1";
	const report = await validateGoldenInteraction(
		`${dir}/actions.glb`,
		undefined,
		{ Fire: { name: "GoldenBow_Fire_V1", duration: 0.9 } },
	);
	const metadata = JSON.parse(await readFile(`${dir}/metadata.json`, "utf8"));
	assert.equal(report.sha256, metadata.sha256);
	assert.equal(metadata.binaryDeterministic, true);
	for (const [path, hash] of Object.entries(metadata.sourceHashes))
		assert.equal(
			createHash("sha256")
				.update(await readFile(path))
				.digest("hex"),
			hash,
			path,
		);
});
test("bow and arrow round-trip as lightweight finite geometry without animations or textures", async () => {
	for (const name of ["bow-v1", "arrow-v1"]) {
		const model = await loadGlb(`public/assets/weapons/${name}.glb`);
		let triangles = 0,
			meshes = 0;
		model.scene.traverse((o) => {
			if (o.isMesh) {
				meshes++;
				triangles += o.geometry.attributes.position.count / 3;
				assert(
					[...o.geometry.attributes.position.array].every(Number.isFinite),
				);
				assert.equal(o.material.map, null);
			}
		});
		assert.equal(meshes, 1);
		assert(triangles < 700);
		assert.equal(model.animations.length, 0);
	}
});
