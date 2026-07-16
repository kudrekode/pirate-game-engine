import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	buildProceduralMannequinScriptArguments,
	PROCEDURAL_MANNEQUIN_PATHS,
	parseCliArguments,
	validateInstalledProceduralMannequin,
} from "./procedural-mannequin-compiler.mjs";
import {
	canonicalizeProceduralMannequinRecipe,
	deriveProceduralMannequinMeasurements,
	GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
	hashProceduralMannequinRecipe,
	PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";
import { proceduralMannequinTopologyMatrixCases } from "./procedural-mannequin-topology-matrix.mjs";

const RECIPE_PATH = PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe;

async function loadRecipe() {
	return JSON.parse(await readFile(RECIPE_PATH, "utf8"));
}

test("validates and stably hashes all six authored V1 parameters", async () => {
	const recipe = await loadRecipe();
	const parsed = validateProceduralMannequinRecipe(recipe);
	assert.equal(parsed.ok, true);
	assert.equal(hashProceduralMannequinRecipe(recipe).length, 64);
	assert.equal(
		createHash("sha256")
			.update(canonicalizeProceduralMannequinRecipe(recipe))
			.digest("hex"),
		hashProceduralMannequinRecipe(recipe),
	);
	for (const key of [
		"height",
		"shoulderWidth",
		"torsoLength",
		"armLength",
		"legLength",
		"hipWidth",
	]) {
		const changed = structuredClone(recipe);
		changed.proportions[key] += 0.01;
		assert.notEqual(
			hashProceduralMannequinRecipe(changed),
			hashProceduralMannequinRecipe(recipe),
			`${key} must change the recipe hash`,
		);
	}
});

test("rejects unsupported contracts and invalid numeric ranges", async () => {
	const recipe = await loadRecipe();
	const invalid = structuredClone(recipe);
	invalid.proportions.height = 4;
	invalid.geometry.radialSegments = 7.5;
	invalid.material.roughness = -1;
	invalid.skeleton.contract = "parallel-rig-v0";
	const parsed = validateProceduralMannequinRecipe(invalid);
	assert.equal(parsed.ok, false);
	const issuePaths = parsed.issues.map((entry) => entry.path);
	for (const path of [
		"$.proportions.height",
		"$.geometry.radialSegments",
		"$.material.roughness",
		"$.skeleton.contract",
	]) {
		assert.ok(
			issuePaths.includes(path),
			`Missing validation issue for ${path}`,
		);
	}
});

test("rejects anatomically impossible parameter combinations", async () => {
	const recipe = await loadRecipe();
	const invalid = structuredClone(recipe);
	invalid.proportions.armLength = 0;
	invalid.proportions.torsoLength = 1;
	invalid.proportions.legLength = 0;
	const parsed = validateProceduralMannequinRecipe(invalid);
	assert.equal(parsed.ok, false);
	assert.ok(
		parsed.issues.some(
			(issue) =>
				issue.path === "$.proportions.armLength" &&
				issue.message.includes("impossibly short"),
		),
	);
	assert.ok(
		parsed.issues.some((issue) => issue.path === "$.proportions.legLength"),
	);
});

test("migrates a height-only V0 procedural recipe", async () => {
	const recipe = await loadRecipe();
	const legacy = {
		...recipe,
		geometry: { profile: "ellipsoid", radialSegments: 8 },
		version: 0,
		proportions: { heightMetres: 1.9 },
	};
	const parsed = validateProceduralMannequinRecipe(legacy);
	assert.equal(parsed.ok, true);
	assert.deepEqual(parsed.value.proportions, {
		height: 1.9,
		shoulderWidth: 0.5,
		torsoLength: 0.5,
		armLength: 0.5,
		legLength: 0.5,
		hipWidth: 0.5,
	});
	assert.equal(parsed.value.version, 2);
	assert.equal(parsed.value.geometry.profile, "voxel-union");
	assert.equal(
		parsed.value.geometry.topologyVersion,
		PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	);
});

test("migrates the disconnected V1 recipe and derives deterministic topology measurements", async () => {
	const recipe = await loadRecipe();
	const legacy = structuredClone(recipe);
	legacy.version = 1;
	legacy.geometry = { profile: "ellipsoid", radialSegments: 8 };
	const parsed = validateProceduralMannequinRecipe(legacy);
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.version, 2);
	assert.equal(parsed.value.geometry.profile, "voxel-union");
	const measurements = deriveProceduralMannequinMeasurements(
		parsed.value.proportions,
	);
	assert.equal(
		measurements.topologyVersion,
		PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	);
	assert.equal(measurements.voxelSizeMetres, 0.035);
	assert.ok(measurements.chestHalfWidth > measurements.pelvisHalfWidth);
});

test("builds a narrow headless Blender invocation and parses compiler modes", () => {
	const arguments_ = buildProceduralMannequinScriptArguments({
		outputPath: "stage/mannequin.glb",
		recipePath: RECIPE_PATH,
		reportPath: "stage/report.json",
	});
	assert.equal(arguments_[0], "--recipe");
	assert.ok(arguments_.includes("--template"));
	assert.ok(arguments_.includes("--compiler-version"));
	assert.deepEqual(
		parseCliArguments([
			"--recipe",
			RECIPE_PATH,
			"--clean",
			"--staging",
			"--output-dir",
			"stage",
		]),
		{
			clean: true,
			"output-dir": "stage",
			recipe: RECIPE_PATH,
			staging: true,
		},
	);
});

test("records a reproducible 21-body topology matrix", async () => {
	const recipe = await loadRecipe();
	const first = proceduralMannequinTopologyMatrixCases(recipe.proportions);
	const repeated = proceduralMannequinTopologyMatrixCases(recipe.proportions);
	assert.deepEqual(repeated, first);
	assert.equal(first.length, 21);
	assert.equal(
		first.filter(([name]) => name.startsWith("seed-topology-")).length,
		5,
	);
	for (const [name, proportions] of first) {
		const parsed = validateProceduralMannequinRecipe({
			...recipe,
			proportions,
		});
		assert.equal(parsed.ok, true, `${name} must be a valid compiler recipe`);
	}
});

test("round-trips the committed artifact and its canonical animations", async () => {
	const result = await validateInstalledProceduralMannequin();
	assert.equal(result.passed, true);
	assert.equal(result.manifest.deterministicBuild, true);
	assert.equal(result.manifest.sourceImmutable, true);
	assert.equal(result.manifest.meshCount, 1);
	assert.equal(result.manifest.materialCount, 1);
	assert.equal(result.manifest.jointCount, 65);
	assert.equal(result.manifest.influenceStatistics.unweightedVertexCount, 0);
	assert.equal(result.manifest.heightMetres, 1.82);
	assert.equal(result.manifest.proportions.shoulderWidth, 0.5);
	assert.equal(
		result.manifest.validationVersion,
		"procedural-mannequin-roundtrip-v3",
	);
	assert.equal(result.manifest.recipeVersion, 2);
	assert.equal(
		result.manifest.topologyVersion,
		PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	);
	assert.deepEqual(result.manifest.topology, {
		boundaryEdgeCount: 0,
		connectedComponentCount: 1,
		degenerateFaceCount: 0,
		edgeCount: 8166,
		eulerCharacteristic: 2,
		faceCount: 5444,
		genus: 0,
		manifold: true,
		nonManifoldEdgeCount: 0,
		unreferencedVertexCount: 0,
	});
	assert.equal(
		result.manifest.skeletonSignature,
		GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
	);
	assert.ok(result.manifest.vertexCount >= 2_000);
	assert.ok(result.manifest.vertexCount <= 8_000);
	assert.ok(result.manifest.triangleCount >= 4_000);
	assert.ok(result.manifest.triangleCount <= 15_000);
	assert.ok(result.manifest.generationDurationMs > 0);
	assert.equal(result.validation.animations.idle.passed, true);
	assert.equal(result.validation.animations.walk.passed, true);
	assert.equal(result.validation.cloneIndependence.passed, true);
	assert.ok(
		Math.hypot(
			result.validation.animations.walk.rootMotionResidual.x,
			result.validation.animations.walk.rootMotionResidual.z,
		) <= 0.00001,
	);
});
