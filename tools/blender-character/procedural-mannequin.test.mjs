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
	hashProceduralMannequinRecipe,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";

const RECIPE_PATH = PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe;

async function loadRecipe() {
	return JSON.parse(await readFile(RECIPE_PATH, "utf8"));
}

test("validates and stably hashes the authored V0 recipe", async () => {
	const recipe = await loadRecipe();
	const parsed = validateProceduralMannequinRecipe(recipe);
	assert.equal(parsed.ok, true);
	assert.equal(
		hashProceduralMannequinRecipe(recipe),
		"48d66f2ceba6baa946dbaaceb91045b694647734e50c57c49837eb670e7769ed",
	);
	assert.equal(
		createHash("sha256")
			.update(canonicalizeProceduralMannequinRecipe(recipe))
			.digest("hex"),
		hashProceduralMannequinRecipe(recipe),
	);
	const taller = structuredClone(recipe);
	taller.proportions.heightMetres = 1.96;
	assert.notEqual(
		hashProceduralMannequinRecipe(taller),
		hashProceduralMannequinRecipe(recipe),
	);
});

test("rejects unsupported contracts and invalid numeric ranges", async () => {
	const recipe = await loadRecipe();
	const invalid = structuredClone(recipe);
	invalid.proportions.heightMetres = 4;
	invalid.geometry.radialSegments = 7.5;
	invalid.material.roughness = -1;
	invalid.skeleton.contract = "parallel-rig-v0";
	const parsed = validateProceduralMannequinRecipe(invalid);
	assert.equal(parsed.ok, false);
	const issuePaths = parsed.issues.map((entry) => entry.path);
	for (const path of [
		"$.proportions.heightMetres",
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
	assert.equal(
		result.manifest.validationVersion,
		"procedural-mannequin-roundtrip-v1",
	);
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
