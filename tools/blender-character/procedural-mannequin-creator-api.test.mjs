import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Readable } from "node:stream";
import {
	compileCreatorMannequin,
	createRecipeForProportions,
	createProceduralMannequinCompileMiddleware,
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

test("identifies the local Studio without invoking compilation", async () => {
	const headers = {};
	let body;
	const middleware = createProceduralMannequinCompileMiddleware({
		compileJob: () => {
			throw new Error("health must not compile");
		},
	});
	await middleware(
		{ method: "GET", url: "/__asset-studio/health" },
		{
			setHeader: (name, value) => {
				headers[name] = value;
			},
			end: (value) => {
				body = JSON.parse(value);
			},
		},
		() => {
			throw new Error("health must be handled");
		},
	);
	assert.deepEqual(body, { app: "asset-studio" });
	assert.equal(headers["Access-Control-Allow-Origin"], "*");
});
const DEFAULT_APPEARANCE = Object.freeze({
	hairColor: "#3b2a1f",
	eyeColor: "#4b5d67",
	skinColor: "#c98f65",
	skinRoughness: 0.72,
});
const DEFAULT_COMPONENTS = Object.freeze({ hair: "none" });

test("routes preview and full requests separately and exposes concise failures with logs", async () => {
	const modes = [];
	const middleware = createProceduralMannequinCompileMiddleware({
		compileJob: async ({ mode }) => {
			modes.push(mode);
			throw Object.assign(
				new Error("Human foundation lost its neck or waist taper"),
				{ stderr: "Blender traceback" },
			);
		},
	});
	for (const endpoint of ["preview", "compile"]) {
		const request = Readable.from([
			Buffer.from(
				JSON.stringify({
					version: 6,
					proportions: DEFAULT_PROPORTIONS,
					appearance: DEFAULT_APPEARANCE,
					components: DEFAULT_COMPONENTS,
				}),
			),
		]);
		request.method = "POST";
		request.url = `/__asset-studio/procedural-mannequin/${endpoint}`;
		let payload;
		await middleware(
			request,
			{
				setHeader() {},
				end(body) {
					payload = JSON.parse(body);
				},
			},
			() => assert.fail("Endpoint was not handled"),
		);
		assert.match(
			payload.error,
			/selected body proportions produced an invalid torso shape/,
		);
		assert.doesNotMatch(payload.error, /traceback/);
		assert.match(payload.technicalDetails, /Blender traceback/);
	}
	assert.deepEqual(modes, ["preview", "full"]);
});

async function fakeCompiler({ outputDirectory, recipePath }) {
	const recipe = JSON.parse(await readFile(recipePath, "utf8"));
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const outputHash =
		recipe.proportions.height === 1.82 ? "a".repeat(64) : "b".repeat(64);
	const manifest = {
		appearance: {
			hair: { authoredColor: recipe.appearance.hair.color },
			face: { authoredEyeColor: recipe.appearance.face.eyeColor },
			skin: {
				authoredColor: recipe.appearance.skin.color,
				authoredRoughness: recipe.appearance.skin.roughness,
			},
		},
		compilerVersion: "procedural-mannequin-blender-v8",
		face: { version: "procedural-face-readability-v0" },
		components: { hair: { componentId: recipe.components.hair } },
		deterministicBuild: true,
		generationDurationMs: 12,
		heightMetres: recipe.proportions.height,
		proportions: recipe.proportions,
		outputHash,
		recipeHash,
		validationVersion: "procedural-mannequin-roundtrip-v9",
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
			components: DEFAULT_COMPONENTS,
			proportions: DEFAULT_PROPORTIONS,
			version: 6,
		}).ok,
		true,
	);
	assert.deepEqual(
		validateCreatorCompileRequest({
			appearance: DEFAULT_APPEARANCE,
			components: DEFAULT_COMPONENTS,
			proportions: { ...DEFAULT_PROPORTIONS, height: "1.82" },
			version: 6,
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

test("validates and canonicalizes creator face and skin appearance", () => {
	const parsed = validateCreatorCompileRequest({
		appearance: {
			eyeColor: "#405C72",
			hairColor: "#BD955B",
			skinColor: "#C98F65",
			skinRoughness: 0.41,
		},
		components: DEFAULT_COMPONENTS,
		proportions: DEFAULT_PROPORTIONS,
		version: 6,
	});
	assert.equal(parsed.ok, true);
	assert.equal(parsed.value.appearance.skinColor, "#c98f65");
	assert.equal(parsed.value.appearance.eyeColor, "#405c72");
	const invalid = validateCreatorCompileRequest({
		appearance: {
			eyeColor: "grey",
			hairColor: "bad",
			skinColor: "red",
			skinRoughness: Number.NaN,
		},
		components: DEFAULT_COMPONENTS,
		proportions: DEFAULT_PROPORTIONS,
		version: 6,
	});
	assert.equal(invalid.ok, false);
	assert.deepEqual(
		invalid.issues.map((issue) => issue.path),
		[
			"$.appearance.hairColor",
			"$.appearance.eyeColor",
			"$.appearance.skinColor",
			"$.appearance.skinRoughness",
		],
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
	const haired = await createRecipeForProportions({
		appearance: DEFAULT_APPEARANCE,
		hairComponentId: "quaternius-hair-v0",
		proportions: DEFAULT_PROPORTIONS,
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
	assert.notEqual(
		hashProceduralMannequinRecipe(first),
		hashProceduralMannequinRecipe(haired),
	);
	const differentSkin = await createRecipeForProportions({
		appearance: {
			eyeColor: "#405c72",
			hairColor: "#bd955b",
			skinColor: "#503126",
			skinRoughness: 0.41,
		},
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
