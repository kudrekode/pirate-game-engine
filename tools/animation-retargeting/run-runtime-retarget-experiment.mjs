import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	BONE_MAP_VERSION,
	buildComparisonReport,
	runLegacySkeletonUtilsRetargetExperiment,
	runRuntimeRetargetExperiment,
	runSkeletonUtilsOptionExperiments,
	serializeClip,
} from "./humanoid-retargeting-experiment.mjs";

const IDLE_SOURCE =
	"public/assets/source/humanoid-animations/retarget-spike/Idle.fbx";
const WALK_SOURCE =
	"public/assets/source/humanoid-animations/retarget-spike/Walking.fbx";
const TARGET_SOURCE =
	"public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf";
const DEFAULT_OUTPUT =
	"public/assets/derived/humanoid-animations/golden-reference-v0";

async function hash(filePath) {
	return createHash("sha256")
		.update(await readFile(filePath))
		.digest("hex");
}

const outputDirectory = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT);
await mkdir(outputDirectory, { recursive: true });
await mkdir(path.join(outputDirectory, "diagnostics"), { recursive: true });

const [
	idleComparison,
	walkComparison,
	idle,
	walk,
	optionExperiments,
	legacyIdle,
	legacyWalk,
] = await Promise.all([
	buildComparisonReport(IDLE_SOURCE, TARGET_SOURCE),
	buildComparisonReport(WALK_SOURCE, TARGET_SOURCE),
	runRuntimeRetargetExperiment({
		semanticState: "idle",
		sourcePath: IDLE_SOURCE,
		targetPath: TARGET_SOURCE,
	}),
	runRuntimeRetargetExperiment({
		semanticState: "walk",
		sourcePath: WALK_SOURCE,
		targetPath: TARGET_SOURCE,
	}),
	runSkeletonUtilsOptionExperiments({
		sourcePath: IDLE_SOURCE,
		targetPath: TARGET_SOURCE,
	}),
	runLegacySkeletonUtilsRetargetExperiment({
		semanticState: "idle",
		sourcePath: IDLE_SOURCE,
		targetPath: TARGET_SOURCE,
	}),
	runLegacySkeletonUtilsRetargetExperiment({
		semanticState: "walk",
		sourcePath: WALK_SOURCE,
		targetPath: TARGET_SOURCE,
	}),
]);

const hashes = {
	idleSource: await hash(IDLE_SOURCE),
	targetSource: await hash(TARGET_SOURCE),
	walkSource: await hash(WALK_SOURCE),
};
const metadata = {
	artifactStatus: "experimental-runtime-retarget-diagnostic",
	boneMapVersion: BONE_MAP_VERSION,
	hashes,
	idle: idle.report,
	idleComparison,
	legacyFailedBaseline: {
		idleQuality: legacyIdle.quality,
		walkQuality: legacyWalk.quality,
	},
	optionExperiments,
	provenance: {
		licenseSidecarsPresent: false,
		note: "The continuation brief states Mixamo licensing/provenance, but LICENSE.txt and SOURCE.md are absent from the workspace.",
		provider: "Adobe Mixamo (per supplied continuation brief)",
	},
	targetSkeletonId: "golden-reference-quaternius-superhero-male",
	walk: walk.report,
	walkComparison,
};

await Promise.all([
	writeFile(
		path.join(outputDirectory, "idle.runtime-retarget.json"),
		`${JSON.stringify(serializeClip(idle.clip), null, 2)}\n`,
	),
	writeFile(
		path.join(outputDirectory, "walk-in-place.runtime-retarget.json"),
		`${JSON.stringify(serializeClip(walk.clip), null, 2)}\n`,
	),
	writeFile(
		path.join(outputDirectory, "runtime-retarget-report.json"),
		`${JSON.stringify(metadata, null, 2)}\n`,
	),
	writeFile(
		path.join(outputDirectory, "diagnostics", "failed-v1-idle.json"),
		`${JSON.stringify(serializeClip(legacyIdle.clip), null, 2)}\n`,
	),
	writeFile(
		path.join(outputDirectory, "diagnostics", "failed-v1-walk.json"),
		`${JSON.stringify(serializeClip(legacyWalk.clip), null, 2)}\n`,
	),
]);

console.log(JSON.stringify(metadata, null, 2));
