import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TARGET_TO_MIXAMO_BONE_MAP } from "../animation-retargeting/humanoid-retargeting-experiment.mjs";
import {
	buildBakeScriptArguments,
	loadRetargetProfile,
	parseCliArguments,
} from "./golden-animation-bake.mjs";

test("loads the deterministic V2 offline profile matching the accepted runtime map", async () => {
	const profile = await loadRetargetProfile();
	assert.equal(profile.version, "mixamo-to-quaternius-v2");
	assert.equal(Object.keys(profile.boneMap).length, 22);
	assert.deepEqual(profile.boneMap, TARGET_TO_MIXAMO_BONE_MAP);
	assert.equal(profile.sourceSkeleton.jointCount, 67);
	assert.equal(profile.targetSkeleton.jointCount, 65);
	assert.equal(
		profile.knownLimitations.some((value) => /Finger/u.test(value)),
		true,
	);
});

test("accepts npm-forwarded positional bake arguments on Windows", () => {
	assert.deepEqual(parseCliArguments(["idle", "C:\\Blender\\blender.exe"]), {
		blender: "C:\\Blender\\blender.exe",
		clip: "idle",
	});
});

test("builds an explicit Blender bake contract", async () => {
	const profile = JSON.parse(
		await readFile(
			"tools/blender-character/profiles/mixamo-to-quaternius-v2.json",
			"utf8",
		),
	);
	const args = buildBakeScriptArguments({
		clip: "idle",
		diagnosticsPath: "diagnostics.json",
		metadataPath: "metadata.json",
		outputPath: "idle.glb",
		profile,
	});
	for (const required of [
		"--source",
		"--target",
		"--clip",
		"--output",
		"--profile-version",
		"--frame-rate",
		"--root-motion-policy",
		"--metadata",
		"--diagnostics",
	])
		assert.ok(args.includes(required));
	assert.equal(args[args.indexOf("--clip") + 1], "idle");
});

for (const [clip, outputHash] of [
	["idle", "6379780d1d03f21c686a9c3416f461fbf075be67dfed2f59702b3a694b83c3af"],
	["walk", "00daa1044400d4f38a5d80ccb804bad3fe498d8cf5dd3ef73360bd5985ca6d7c"],
]) {
	test(`records deterministic ${clip} artifact metadata`, async () => {
		const metadata = JSON.parse(
			await readFile(
				`public/assets/derived/humanoid-animations/golden-reference-v0/${clip}.bake-metadata.json`,
				"utf8",
			),
		);
		assert.equal(metadata.outputHash, outputHash);
		assert.equal(metadata.artifactStatus, "offline-baked-validated");
		assert.equal(metadata.profileVersion, "mixamo-to-quaternius-v2");
		assert.equal(metadata.mappedBoneCount, 22);
		assert.equal(metadata.sourceImmutable, true);
		assert.equal(metadata.provenanceValidated, true);
		assert.equal(metadata.determinism.binaryDeterministic, true);
		assert.equal(metadata.determinism.normalizedAnimationDeterministic, true);
		assert.equal(
			metadata.compilerCommand.some((value) => /Temp/u.test(value)),
			false,
		);
	});
}
