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
	assert.equal(validation.components.length, 5);
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

test("rejects unsupported or unsafe geometry-aware fitting profiles", async () => {
	const wrongVersion = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	wrongVersion.components[0].fittingProfile.version = 1;
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: wrongVersion }),
		/invalid fitting profile/u,
	);
	const unsafeScale = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	unsafeScale.components[0].fittingProfile.scaleLimits.width = [2, 1];
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: unsafeScale }),
		/width fit limits.*ordered finite interval/u,
	);
	const missingCoverage = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	delete missingCoverage.components[0].fittingProfile.coverageRatios
		.heightFromWidth;
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: missingCoverage }),
		/height-from-width coverage ratio/u,
	);
	const unsafeProportion = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	unsafeProportion.components[0].fittingProfile.validation.minimumCloseToScalpRatio = 1.1;
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: unsafeProportion }),
		/minimumCloseToScalpRatio validation/u,
	);
	const negativeClearance = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	negativeClearance.components[0].fittingProfile.validation.minimumShoulderClearanceMetres =
		-0.01;
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: negativeClearance }),
		/minimumShoulderClearanceMetres validation/u,
	);
	const negativeOffset = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	negativeOffset.components[0].fittingProfile.verticalSeatingOffsetMetres =
		-0.01;
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: negativeOffset }),
		/vertical seating offset/u,
	);
	const mismatchedScaleMode = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	mismatchedScaleMode.components[0].fittingProfile.verticalScaleMode =
		"head-height";
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: mismatchedScaleMode }),
		/incompatible fit class and vertical scale mode/u,
	);

	const unsafeLong = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	const longProfile = unsafeLong.components.find(
		(component) => component.fittingProfile.fitClass === "long",
	)?.fittingProfile;
	assert.ok(longProfile, "expected a registered long-hair profile");
	longProfile.validation.neckExtensionMetres = [0, 0.2];
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: unsafeLong }),
		/neck extension validation.*ordered finite interval/u,
	);

	const unsafeUpdo = structuredClone(CHARACTER_COMPONENT_REGISTRY);
	const updoProfile = unsafeUpdo.components.find(
		(component) => component.fittingProfile.fitClass === "updo",
	)?.fittingProfile;
	assert.ok(updoProfile, "expected a registered updo profile");
	updoProfile.validation.widthRatio = [1, 1.4];
	await assert.rejects(
		validateCharacterComponentRegistry({ registryData: unsafeUpdo }),
		/updo width validation must start above one/u,
	);
});

test("every library entry resolves and has distinct source geometry and fit identity", async () => {
	const result = await validateCharacterComponentRegistry();
	assert.equal(new Set(result.components.map((c) => c.sourceHash)).size, 5);
	assert.equal(
		new Set(result.components.map((c) => c.fittingProfile.id)).size,
		5,
	);
	for (const component of result.components)
		assert.equal(resolveCharacterComponent(component.id), component);
});
