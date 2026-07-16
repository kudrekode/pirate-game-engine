import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	compileCreatorMannequin,
	createRecipeForHeight,
	validateCreatorCompileRequest,
} from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import { hashProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

async function fakeCompiler({ outputDirectory, recipePath }) {
	const recipe = JSON.parse(await readFile(recipePath, "utf8"));
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const outputHash =
		recipe.proportions.heightMetres === 1.82 ? "a".repeat(64) : "b".repeat(64);
	const manifest = {
		compilerVersion: "procedural-mannequin-blender-v0",
		deterministicBuild: true,
		generationDurationMs: 12,
		heightMetres: recipe.proportions.heightMetres,
		outputHash,
		recipeHash,
		validationVersion: "procedural-mannequin-roundtrip-v1",
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

test("validates the narrow creator compile request", () => {
	assert.equal(
		validateCreatorCompileRequest({ heightMetres: 1.82, version: 1 }).ok,
		true,
	);
	assert.deepEqual(
		validateCreatorCompileRequest({ heightMetres: "1.82", version: 1 }),
		{
			issues: [
				{
					message: "Expected a finite height in metres.",
					path: "$.heightMetres",
				},
			],
			ok: false,
		},
	);
});

test("adapts only height into a validated procedural recipe and stable hash", async () => {
	const first = await createRecipeForHeight({ heightMetres: 1.82 });
	const repeated = await createRecipeForHeight({ heightMetres: 1.82 });
	const taller = await createRecipeForHeight({ heightMetres: 1.96 });

	assert.equal(first.proportions.heightMetres, 1.82);
	assert.equal(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(repeated),
	);
	assert.notEqual(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(taller),
	);
	await assert.rejects(
		createRecipeForHeight({ heightMetres: 1.2 }),
		/Recipe validation failed.*heightMetres/u,
	);
});

test("publishes a successful compile and keeps it when a later compile fails", async () => {
	const generatedRoot = await mkdtemp(
		path.join(os.tmpdir(), "asset-studio-creator-test-"),
	);
	try {
		const successful = await compileCreatorMannequin({
			compileImpl: fakeCompiler,
			generatedRoot,
			heightMetres: 1.82,
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
				heightMetres: 1.96,
				requestId: "22222222-2222-4222-8222-222222222222",
			}),
			/synthetic validation failure/u,
		);
		assert.equal((await readFile(publishedGlb, "utf8")).length, 64);
	} finally {
		await rm(generatedRoot, { force: true, recursive: true });
	}
});
