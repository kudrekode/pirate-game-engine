import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	gameCharacterImportPlugin,
	importFinalisedCharacter,
} from "./game-character-import.mjs";
import { createRecipeForProportions } from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import { hashProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

async function fixture(t) {
	const root = await mkdtemp(path.join(os.tmpdir(), "game-character-import-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const options = {
		generatedRoot: path.join(root, "generated"),
		assetRoot: path.join(root, "assets"),
	};
	const requestId = "00000000-0000-4000-a000-000000000000";
	const source = path.join(options.generatedRoot, requestId, "output");
	await mkdir(source, { recursive: true });
	const compilerRecipe = await createRecipeForProportions();
	const recipe = {
		name: "My character",
		body: { parameters: compilerRecipe.proportions },
		components: { hair: compilerRecipe.components.hair },
		palette: {
			skin: compilerRecipe.appearance.skin.color,
			hair: compilerRecipe.appearance.hair.color,
		},
		appearance: {
			face: { eyeColor: compilerRecipe.appearance.face.eyeColor },
			skin: { roughness: compilerRecipe.appearance.skin.roughness },
		},
	};
	const bytes = Buffer.alloc(16);
	bytes.writeUInt32LE(0x46546c67, 0);
	bytes.writeUInt32LE(2, 4);
	bytes.writeUInt32LE(16, 8);
	const outputHash = createHash("sha256").update(bytes).digest("hex");
	const manifest = {
		validationLevel: "full",
		deterministicBuild: true,
		outputHash,
		recipeHash: hashProceduralMannequinRecipe(compilerRecipe),
		skeletonContract: "golden-humanoid-v0",
	};
	await writeFile(path.join(source, "mannequin.glb"), bytes);
	await writeFile(
		path.join(source, "recipe.snapshot.json"),
		JSON.stringify(compilerRecipe),
	);
	await writeFile(path.join(source, "manifest.json"), JSON.stringify(manifest));
	return {
		options,
		source,
		manifest,
		input: { requestId, artifactHash: outputHash, recipe },
	};
}

test("promotes a finalised immutable artifact, deduplicates reimport, and survives compiler cleanup", async (t) => {
	const { options, source, input } = await fixture(t);
	const first = await importFinalisedCharacter(input, options);
	const second = await importFinalisedCharacter(input, options);
	assert.deepEqual(second, first);
	assert.match(first.id, /^character-[a-f0-9]{64}$/);
	assert.equal(first.name, "My character");
	await rm(source, { recursive: true, force: true });
	const saved = JSON.parse(JSON.stringify(first));
	assert.ok(
		(await readFile(path.join(options.assetRoot, saved.id, "character.glb")))
			.length,
	);
	assert.equal(
		JSON.parse(
			await readFile(
				path.join(options.assetRoot, saved.id, "character.recipe.json"),
			),
		).name,
		input.recipe.name,
	);
});

for (const [label, patch, message] of [
	[
		"preview",
		{ validationLevel: "preview", deterministicBuild: false },
		/Finalise Character/,
	],
	["unsupported rig", { skeletonContract: "other" }, /rig is not supported/],
	["corrupt hash", { outputHash: "a".repeat(64) }, /integrity/],
])
	test(`rejects ${label} without registering an asset`, async (t) => {
		const { options, source, input, manifest } = await fixture(t);
		await writeFile(
			path.join(source, "manifest.json"),
			JSON.stringify({ ...manifest, ...patch }),
		);
		await assert.rejects(importFinalisedCharacter(input, options), message);
	});

test("rejects missing GLB/manifest and mismatched editable recipe", async (t) => {
	const { options, source, input } = await fixture(t);
	input.recipe.palette.skin = "#112233";
	await assert.rejects(
		importFinalisedCharacter(input, options),
		/changed since finalisation/,
	);
	await rm(path.join(source, "mannequin.glb"));
	await assert.rejects(
		importFinalisedCharacter(input, options),
		/missing or corrupt/,
	);
	await writeFile(path.join(source, "manifest.json"), "broken");
	await assert.rejects(
		importFinalisedCharacter(input, options),
		/missing or corrupt/,
	);
	await assert.rejects(
		importFinalisedCharacter({ ...input, requestId: "../escape" }, options),
		/reference is invalid/,
	);
});

test("never overwrites a damaged imported revision", async (t) => {
	const { options, input } = await fixture(t);
	const first = await importFinalisedCharacter(input, options);
	await writeFile(
		path.join(options.assetRoot, first.id, "character.glb"),
		"damaged",
	);
	await assert.rejects(importFinalisedCharacter(input, options), /damaged/);
});

test("imports changed finalised bytes as a new asset and preserves the old revision", async (t) => {
	const { options, source, input, manifest } = await fixture(t);
	const first = await importFinalisedCharacter(input, options);
	const changed = await readFile(path.join(source, "mannequin.glb"));
	changed[15] = 1;
	const outputHash = createHash("sha256").update(changed).digest("hex");
	await writeFile(path.join(source, "mannequin.glb"), changed);
	await writeFile(
		path.join(source, "manifest.json"),
		JSON.stringify({ ...manifest, outputHash }),
	);
	const next = await importFinalisedCharacter(
		{ ...input, artifactHash: outputHash },
		options,
	);
	assert.notEqual(next.id, first.id);
	assert.equal(
		(
			await readFile(path.join(options.assetRoot, first.id, "character.glb"))
		)[15],
		0,
	);
});

test("serves newly imported files without a server restart and rejects cross-origin writes", async (t) => {
	const { options, input } = await fixture(t);
	let middleware;
	gameCharacterImportPlugin(options).configureServer({
		middlewares: {
			use(fn) {
				middleware = fn;
			},
		},
	});
	const asset = await importFinalisedCharacter(input, options);
	for (const method of ["GET", "HEAD"]) {
		let body;
		const headers = {};
		await middleware(
			{ url: asset.glbUrl, method },
			{
				setHeader(key, value) {
					headers[key] = value;
				},
				end(value) {
					body = value;
				},
			},
			() => assert.fail("Not served"),
		);
		assert.equal(headers["Content-Type"], "model/gltf-binary");
		assert.equal(headers["Content-Length"], 16);
		assert.equal(body?.length, method === "GET" ? 16 : undefined);
	}
	const response = {
		setHeader() {},
		end(body) {
			this.body = body;
		},
	};
	await middleware(
		{
			url: "/__game/characters/import",
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://example.com",
				host: "localhost:5173",
			},
		},
		response,
		() => assert.fail("Not handled"),
	);
	assert.equal(response.statusCode, 400);
	assert.match(response.body, /same-origin/);
});
