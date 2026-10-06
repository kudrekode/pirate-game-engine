import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectAnimationSource } from "./animation-source-inspection.mjs";
import {
	compareSkeletonReports,
	runRuntimeRetargetExperiment,
	runSkeletonUtilsOptionExperiments,
	serializeClip,
	TARGET_TO_MIXAMO_BONE_MAP,
} from "./humanoid-retargeting-experiment.mjs";

const IDLE =
	"public/assets/source/humanoid-animations/retarget-spike/idle/source.fbx";
const WALK =
	"public/assets/source/humanoid-animations/retarget-spike/walk/source.fbx";
const TARGET =
	"public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf";
const EXPECTED_HASHES = {
	idle: "42f1b0d7b82337ded5d93412afdd2fff8a04727393a086afc4432a2c8ed102a0",
	walk: "17c86280998e4a948b37485d08a156b36798a82d22a3f3a34fa0de774926d56e",
};

async function hash(filePath) {
	return createHash("sha256")
		.update(await readFile(filePath))
		.digest("hex");
}

test("inspects the immutable Mixamo idle and walk FBX sources", async () => {
	const [idle, walk] = await Promise.all([
		inspectAnimationSource(IDLE),
		inspectAnimationSource(WALK),
	]);
	assert.equal(idle.asset.fileHash, EXPECTED_HASHES.idle);
	assert.equal(walk.asset.fileHash, EXPECTED_HASHES.walk);
	for (const report of [idle, walk]) {
		assert.equal(report.asset.sourceFormat, "fbx");
		assert.equal(report.nodeCount, 122);
		assert.equal(report.skeletons[0].jointCount, 67);
		assert.equal(report.skeletons[0].skeletonRoot, "mixamorigHips");
		assert.equal(
			report.animations.filter((clip) => clip.duration > 0).length,
			1,
		);
		const clip = report.animations.find((candidate) => candidate.duration > 0);
		assert.equal(clip.frameRate, 30);
		assert.equal(clip.trackCount, 53);
		assert.deepEqual(clip.trackPropertyCounts, {
			rotation: 52,
			scale: 0,
			translation: 1,
		});
	}
	assert.equal(
		idle.animations.find((clip) => clip.duration > 0).rootMotion
			.hasLocomotionDisplacement,
		false,
	);
	assert.equal(
		walk.animations.find((clip) => clip.duration > 0).rootMotion
			.hasLocomotionDisplacement,
		true,
	);
});

test("maps Mixamo to Quaternius deterministically and reports missing bones", async () => {
	const [source, target] = await Promise.all([
		inspectAnimationSource(IDLE),
		inspectAnimationSource(TARGET),
	]);
	const first = compareSkeletonReports(source, target);
	const second = compareSkeletonReports(source, target);
	assert.deepEqual(first, second);
	assert.equal(Object.keys(TARGET_TO_MIXAMO_BONE_MAP).length, 22);
	assert.equal(first.exactNameMatches.length, 0);
	assert.equal(first.normalizedNameMatches.length, 1);
	assert.equal(first.semanticMatches.length, 22);
	assert.ok(first.unmatchedSourceBones.includes("mixamorigLeftHandIndex1"));
	assert.ok(first.unmatchedTargetBones.includes("index_01_l"));
	assert.ok(first.unmatchedTargetBones.includes("root"));
	assert.equal(first.directBinding.viable, false);

	const missingSource = structuredClone(source);
	missingSource.skeletons[0].joints = missingSource.skeletons[0].joints.filter(
		(joint) => joint.name !== "mixamorigLeftArm",
	);
	const missing = compareSkeletonReports(missingSource, target);
	assert.deepEqual(missing.missingMappedSourceBones, ["mixamorigLeftArm"]);
	assert.equal(missing.semanticMatches.length, 21);
});

test("proves SkeletonUtils option changes do not correct the clavicle rest-frame failure", async () => {
	const experiment = await runSkeletonUtilsOptionExperiments({
		sourcePath: IDLE,
		targetPath: TARGET,
	});
	assert.equal(experiment.results.length, 7);
	for (const result of experiment.results) {
		assert.equal(result.quality.passed, false);
		assert.ok(result.quality.maxClavicleRestRotationDegrees > 160);
	}
	assert.equal(experiment.unsupportedCurrentOption.name, "preserveHipPosition");
});

test("retargets real clips without mutating sources and keeps clone mixers independent", async () => {
	const before = { idle: await hash(IDLE), walk: await hash(WALK) };
	const [idle, walk] = await Promise.all([
		runRuntimeRetargetExperiment({
			semanticState: "idle",
			sourcePath: IDLE,
			targetPath: TARGET,
		}),
		runRuntimeRetargetExperiment({
			semanticState: "walk",
			sourcePath: WALK,
			targetPath: TARGET,
		}),
	]);
	assert.deepEqual({ idle: await hash(IDLE), walk: await hash(WALK) }, before);
	for (const result of [idle, walk]) {
		const firstSerialization = serializeClip(result.clip);
		assert.deepEqual(serializeClip(result.clip), firstSerialization);
		assert.match(
			firstSerialization.uuid,
			/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
		);
		assert.equal(result.report.clip.trackCount, 23);
		assert.equal(result.report.validation.allTracksTargetGoldenBones, true);
		assert.equal(result.report.validation.finiteValues, true);
		assert.equal(result.report.validation.independentBeforeSecondUpdate, true);
		assert.equal(result.report.validation.restRestored, true);
		assert.equal(result.report.validation.separateSkeletons, true);
		assert.ok(Math.abs(result.report.rootMotion.after.x) < 0.000001);
		assert.ok(Math.abs(result.report.rootMotion.after.z) < 0.000001);
		assert.equal(result.report.quality.summary.passed, true);
		assert.ok(
			result.report.quality.summary.maxClavicleRestRotationDegrees < 26,
		);
		assert.equal(result.report.quality.samples.length, 4);
		for (const sample of result.report.quality.samples) {
			assert.equal(Object.keys(sample.joints).length, 18);
			assert.ok(sample.invariants.shoulderToNeckDistance.left > 0);
			assert.ok(sample.invariants.elbowChainContinuity.left > 0);
			assert.ok(sample.invariants.hipKneeAnkleContinuity.left > 0);
		}
	}
	assert.ok(Math.abs(walk.report.rootMotion.before.z) > 1.6);
	assert.ok(walk.report.clip.maxLoopEndpointDifference < 0.001);
});
