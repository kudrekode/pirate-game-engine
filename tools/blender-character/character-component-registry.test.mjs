import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	CHARACTER_COMPONENT_REGISTRY,
	resolveCharacterComponent,
	validateCharacterComponentRegistry,
} from "./character-component-registry.mjs";

test("validates the immutable Quaternius hairstyle source and provenance", async () => {
	const before = await readFile(
		CHARACTER_COMPONENT_REGISTRY.components[0].sourceAsset,
	);
	const validation = await validateCharacterComponentRegistry();
	const after = await readFile(
		CHARACTER_COMPONENT_REGISTRY.components[0].sourceAsset,
	);

	assert.equal(validation.passed, true);
	assert.equal(validation.version, 1);
	assert.equal(validation.components.length, 1);
	assert.deepEqual(after, before);
	assert.equal(
		validation.sourceHashes[
			"public/assets/source/quaternius/License_Standard.txt"
		],
		"0f4beaf0fe360a7732e58bbe3dbf60a2422367fbea60cb9ea4add968f383268e",
	);
});

test("rejects unknown components and changed source hashes", async () => {
	assert.throws(
		() => resolveCharacterComponent("local-hair.glb"),
		/Unknown hair component/u,
	);
	const changed = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	changed.components[0].sourceFiles[0].sha256 = "0".repeat(64);
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: changed }),
		/Component source hash mismatch/u,
	);
});
