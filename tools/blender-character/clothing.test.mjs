import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateClothingSources } from "./clothing-contract.mjs";
import {
	createRecipeForProportions,
	validateCreatorCompileRequest,
} from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import {
	hashProceduralMannequinRecipe,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";
const recipe = JSON.parse(
	await readFile(
		"tools/blender-character/recipes/authored-human-everyday-v1.recipe.json",
		"utf8",
	),
);
test("clothing survives API normalization and changes compilation identity", async () => {
	const request = {
		version: 6,
		geometrySource: recipe.geometrySource,
		clothing: recipe.clothing,
		proportions: recipe.proportions,
		components: recipe.components,
		appearance: {
			skinColor: "#ffffff",
			skinRoughness: 0.72,
			hairColor: "#3b2a1f",
			eyeColor: "#4b5d67",
		},
	};
	const parsed = validateCreatorCompileRequest(request);
	assert(parsed.ok);
	const compiled = await createRecipeForProportions({
		...parsed.value,
		hairComponentId: parsed.value.components.hair,
	});
	assert.deepEqual(compiled.clothing, recipe.clothing);
	const changed = structuredClone(compiled);
	changed.clothing.top.color = "#ffffff";
	assert.notEqual(
		hashProceduralMannequinRecipe(compiled),
		hashProceduralMannequinRecipe(changed),
	);
	changed.clothing.top.revision = "2";
	assert.equal(validateProceduralMannequinRecipe(changed).ok, false);
	const invalid = structuredClone(request);
	invalid.clothing.top.revision = "2";
	assert.equal(validateCreatorCompileRequest(invalid).ok, false);
	delete invalid.geometrySource;
	assert.equal(validateCreatorCompileRequest(invalid).ok, false);
});
test("clothing provenance verifies actual source, authoring and mask bytes", async () => {
	assert(Object.keys(await validateClothingSources()).length >= 5);
	const registry = JSON.parse(
		await readFile(
			"packages/character-contract/src/character-component-registry.json",
			"utf8",
		),
	);
	registry.clothingComponents[0].sourceFiles[0].sha256 = "0".repeat(64);
	await assert.rejects(
		() => validateClothingSources(process.cwd(), registry.clothingComponents),
		/hash mismatch/,
	);
});

test("installed dressed default round-trips and rejects wrong clothing appearance", async () => {
	const { validateAuthoredHumanArtifact } = await import(
		"./authored-human-roundtrip.mjs"
	);
	const artifactPath =
		"public/assets/derived/authored-humans/everyday-v1/mannequin.glb";
	const result = await validateAuthoredHumanArtifact({ artifactPath, recipe });
	assert(result.passed);
	const manifest = JSON.parse(
		await readFile(
			"public/assets/derived/authored-humans/everyday-v1/manifest.json",
			"utf8",
		),
	);
	assert.equal(result.outputHash, manifest.outputHash);
	assert.equal(manifest.deterministicBuild, true);
	assert.deepEqual(manifest.clothing, recipe.clothing);
	const wrong = structuredClone(recipe);
	wrong.clothing.top.color = "#ffffff";
	await assert.rejects(
		() => validateAuthoredHumanArtifact({ artifactPath, recipe: wrong }),
		/Garment tint/,
	);
	wrong.clothing.top = "none";
	await assert.rejects(
		() => validateAuthoredHumanArtifact({ artifactPath, recipe: wrong }),
		/Garment primitives/,
	);
});
