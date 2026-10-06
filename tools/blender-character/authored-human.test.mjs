import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	validateCreatorCompileRequest,
	createRecipeForProportions,
} from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import {
	hashProceduralMannequinRecipe,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";
import { validateAuthoredHumanArtifact } from "./authored-human-roundtrip.mjs";

const recipe = JSON.parse(
	await readFile(
		new URL(
			"./recipes/authored-human-canonical-v1.recipe.json",
			import.meta.url,
		),
		"utf8",
	),
);
test("authored creator dispatch preserves identity, hashes edits, and rejects unsupported inputs", async () => {
	const input = {
		version: 6,
		geometrySource: recipe.geometrySource,
		proportions: recipe.proportions,
		components: recipe.components,
		appearance: {
			skinColor: "#ffffff",
			skinRoughness: 0.72,
			hairColor: "#3b2a1f",
			eyeColor: "#4b5d67",
		},
	};
	const parsed = validateCreatorCompileRequest(input);
	assert(parsed.ok);
	const generated = await createRecipeForProportions({
		...parsed.value,
		hairComponentId: parsed.value.components.hair,
	});
	assert.deepEqual(generated.geometrySource, recipe.geometrySource);
	const edited = structuredClone(generated);
	edited.geometrySource.values.jaw = 1;
	assert.notEqual(
		hashProceduralMannequinRecipe(generated),
		hashProceduralMannequinRecipe(edited),
	);
	for (const mutate of [
		(v) => (v.geometrySource.values.mass = -1),
		(v) => (v.geometrySource.rigProfile = "new"),
		(v) => (v.geometrySource.baseRevision = "old"),
		(v) => (v.components.hair = "quaternius-hair-long-v1"),
		(v) => (v.proportions.armLength = 0.8),
	]) {
		const invalid = structuredClone(input);
		mutate(invalid);
		assert.equal(validateCreatorCompileRequest(invalid).ok, false);
	}
	const legacy = structuredClone(recipe);
	delete legacy.geometrySource;
	assert(validateProceduralMannequinRecipe(legacy).ok);
	assert.notEqual(
		hashProceduralMannequinRecipe(legacy),
		hashProceduralMannequinRecipe(recipe),
	);
});
test("installed canonical fixture passes Golden, inverse-bind, UV, weight and animation round trips", async () => {
	const validation = await validateAuthoredHumanArtifact({
		artifactPath:
			"public/assets/derived/authored-humans/canonical-v1/mannequin.glb",
		recipe,
	});
	assert(validation.passed);
	const manifest = JSON.parse(
		await readFile(
			"public/assets/derived/authored-humans/canonical-v1/manifest.json",
			"utf8",
		),
	);
	assert.equal(manifest.outputHash, validation.outputHash);
	assert.equal(manifest.topology.fingerprint, validation.topologyFingerprint);
	assert.equal(manifest.deterministicBuild, true);
	const wrongHeight = structuredClone(recipe);
	wrongHeight.proportions.height = 1.5;
	await assert.rejects(
		() =>
			validateAuthoredHumanArtifact({
				artifactPath:
					"public/assets/derived/authored-humans/canonical-v1/mannequin.glb",
				recipe: wrongHeight,
			}),
		/Height/,
	);
	const wrongHair = structuredClone(recipe);
	wrongHair.components.hair = "none";
	await assert.rejects(() =>
		validateAuthoredHumanArtifact({
			artifactPath:
				"public/assets/derived/authored-humans/canonical-v1/mannequin.glb",
			recipe: wrongHair,
		}),
	);
});
