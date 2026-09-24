import assert from "node:assert/strict";
import test from "node:test";
import { loadRetargetProfile } from "./golden-animation-bake.mjs";
import { validateOfflineBakedArtifact } from "./offline-bake-roundtrip.mjs";

for (const clipId of ["idle", "walk"]) {
	test(`round trips the offline-baked ${clipId} through Three.js`, async () => {
		const result = await validateOfflineBakedArtifact(
			clipId,
			await loadRetargetProfile(),
		);
		assert.equal(result.passed, true);
		assert.equal(result.checks.noMixamoRig, true);
		assert.equal(result.checks.targetOnlyTracks, true);
		assert.equal(result.checks.rootMotion, true);
		assert.equal(result.cloneValidation.passed, true);
		assert.equal(result.poseComparison.passed, true);
	});
}
