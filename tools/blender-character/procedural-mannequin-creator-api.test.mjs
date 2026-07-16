import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	compileCreatorMannequin,
	createRecipeForProportions,
	validateCreatorCompileRequest,
} from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import { hashProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const DEFAULT_PROPORTIONS = Object.freeze({
	height: 1.82,
	shoulderWidth: 0.5,
	torsoLength: 0.5,
	armLength: 0.5,
	legLength: 0.5,
	hipWidth: 0.5,
});
const DEFAULT_APPEARANCE = Object.freeze({
	skinColor: "#c98f65",
	skinRoughness: 0.72,
});

async function fakeCompiler({ outputDirectory, recipePath }) {
	const recipe = JSON.parse(await readFile(recipePath, "utf8"));
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const outputHash =
		recipe.proportions.height === 1.82 ? "a".repeat(64) : "b".repeat(64);
	const manifest = {
		appearance: {
			skin: {
				authoredColor: recipe.appearance.skin.color,
				authoredRoughness: recipe.appearance.skin.roughness,
			},
		},
		compilerVersion: "procedural-mannequin-blender-v3",
		deterministicBuild: true,
		generationDurationMs: 12,
		heightMetres: recipe.proportions.height,
		proportions: recipe.proportions,
		outputHash,
		recipeHash,
		validationVersion: "procedural-mannequin-roundtrip-v4",
	};
	await mkdir(outputDirectory, { recursive: true });
	await Promise.all([
		writeFile(path.join(outputDirectory, "mannequin.glb"), outputHash),
		writeFile(
			path.join(outputDirectory, "manifest.json"),
			JSON.stringify(manifest),
		),
	]);
	return { manifest };
}

test("validates the six-parameter creator compile request", () => {
	assert.equal(
		validateCreatorCompileRequest({
			appearance: DEFAULT_APPEARANCE,
			proportions: DEFAULT_PROPORTIONS,
			version: 3,
		}).ok,
		true,
	);
	assert.deepEqual(
		validateCreatorCompileRequest({
			appearance: DEFAULT_APPEARANCE,
			proportions: { ...DEFAULT_PROPORTIONS, height: "1.82" },
			version: 3,
		}),
		{
			issues: [
				{
					message: "Expected a finite number between 1.5 and 2.1 metres.",
					path: "$.proportions.height",
				},
			],
			ok: false,
		},
	);
});

test("validates and canonicalizes creator skin appearance", () => {
	const parsed = validateCreatorCompileRequest({
		appearance: { skinColor: "#C98F65", skinRoughness: 0.41 },
		proportions: DEFAULT_PROPORTIONS,
		version: 3,
	});
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.appearance.skinColor, "#c98f65");
	const invalid = validateCreatorCompileRequest({
		appearance: { skinColor: "red", skinRoughness: Number.NaN },
		proportions: DEFAULT_PROPORTIONS,
		version: 3,
	});
	assert.equal(invalid.ok, false);
	assert.deepEqual(
		invalid.issues.map((issue) => issue.path),
		["$.appearance.skinColor", "$.appearance.skinRoughness"],
	);
});

test("adapts all body parameters into a validated recipe and stable hash", async () => {
	const first = await createRecipeForProportions({
		appearance: DEFAULT_APPEARANCE,
		proportions: DEFAULT_PROPORTIONS,
	});
	const repeated = await createRecipeForProportions({
		appearance: DEFAULT_APPEARANCE,
		proportions: DEFAULT_PROPORTIONS,
	});
	const taller = await createRecipeForProportions({
		appearance: DEFAULT_APPEARANCE,
		proportions: { ...DEFAULT_PROPORTIONS, height: 1.96 },
	});

	assert.deepEqual(first.proportions, DEFAULT_PROPORTIONS);
	assert.equal(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(repeated),
	);
	assert.notEqual(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(taller),
	);
	const differentSkin = await createRecipeForProportions({
		appearance: { skinColor: "#503126", skinRoughness: 0.41 },
		proportions: DEFAULT_PROPORTIONS,
	});
	assert.notEqual(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(differentSkin),
	);
	await assert.rejects(
		createRecipeForProportions({
			proportions: { ...DEFAULT_PROPORTIONS, height: 1.2 },
		}),
		/Recipe validation failed.*height/u,
	);
});

test("publishes a successful compile and keeps it when a later compile fails", async () => {
	const generatedRoot = await mkdtemp(
		path.join(os.tmpdir(), "asset-studio-creator-test-"),
	);
	try {
		const successful = await compileCreatorMannequin({
			appearance: DEFAULT_APPEARANCE,
			compileImpl: fakeCompiler,
			generatedRoot,
			proportions: DEFAULT_PROPORTIONS,
			now: () => new Date("2026-07-16T12:00:00.000Z"),
			requestId: "11111111-1111-4111-8111-111111111111",
		});
		assert.equal(successful.status, "succeeded");
		assert.equal(successful.manifest.heightMetres, 1.82);
		assert.equal(successful.generatedAt, "2026-07-16T12:00:00.000Z");
		assert.match(successful.assetUrl, /11111111.*mannequin\.glb$/u);
		const publishedGlb = path.join(
			generatedRoot,
			successful.requestId,
			"output",
			"mannequin.glb",
		);
		assert.equal((await readFile(publishedGlb, "utf8")).length, 64);

		await assert.rejects(
			compileCreatorMannequin({
				compileImpl: async () => {
					throw new Error("synthetic validation failure");
				},
				generatedRoot,
				proportions: { ...DEFAULT_PROPORTIONS, height: 1.96 },
				requestId: "22222222-2222-4222-8222-222222222222",
			}),
			/synthetic validation failure/u,
		);
		assert.equal((await readFile(publishedGlb, "utf8")).length, 64);
	} finally {
		await rm(generatedRoot, { force: true, recursive: true });
	}
});
