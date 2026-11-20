import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";
import {
	validateGoldenMovement,
	validateMovementTracks,
} from "./golden-movement-roundtrip.mjs";
const artifact =
	"public/assets/derived/humanoid-animations/golden-movement-v1/actions.glb";
test("installed Golden movement library round-trips through production GLTFLoader", async () => {
	const report = await validateGoldenMovement(artifact);
	assert.equal(report.meshCount, 0);
	assert.equal(report.targets[0].clips.length, 4);
});
test("movement channel gate rejects missing clips, horizontal travel and a broken Run seam", async () => {
	const { animations } = await loadGlb(artifact);
	assert.throws(() => validateMovementTracks(animations.slice(1)));
	const broken = animations.map((c) => c.clone());
	const run = broken.find((c) => c.name.includes("_Run_"));
	const root = run.tracks.find((t) => t.name === "pelvis.position");
	root.values[3] += 0.1;
	assert.throws(() => validateMovementTracks(broken));
	const seam = animations.map((c) => c.clone());
	seam.find((c) => c.name.includes("_Run_")).tracks[0].values[0] += 0.1;
	assert.throws(() => validateMovementTracks(seam));
});
