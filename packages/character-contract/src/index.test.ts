import { describe, expect, it } from "vitest";
import {
	CHARACTER_BODY_PARAMETER_LIMITS,
	CHARACTER_COMPONENT_REGISTRY,
	CHARACTER_HAIR_COMPONENT_IDS,
	CHARACTER_SKIN_APPEARANCE_LIMITS,
	createDefaultCharacterRecipe,
	getCharacterComponentDefinition,
	HUMANOID_V1_CONTRACT,
	HUMANOID_V1_SKELETON_ID,
	parseCharacterRecipe,
	serializeCharacterRecipe,
	validateCharacterAnimationSetDefinition,
	validateCharacterComponentDefinition,
} from ".";

describe("CharacterRecipeV1", () => {
	it("creates a safe default recipe with stable humanoid identity", () => {
		const recipe = createDefaultCharacterRecipe();

		expect(recipe).toMatchObject({
			version: 1,
			id: "character-new",
			skeletonId: HUMANOID_V1_SKELETON_ID,
			body: {
				baseId: "humanoid-default",
				parameters: {
					height: 1.82,
					shoulderWidth: 0.5,
					torsoLength: 0.5,
					armLength: 0.5,
					legLength: 0.5,
					hipWidth: 0.5,
				},
			},
			components: { hair: "none" },
			appearance: { skin: { roughness: 0.72 } },
			animationSetId: "humanoid-basic-v1",
		});
	});

	it("defines and validates exactly the two compiled skin appearance controls", () => {
		expect(Object.keys(CHARACTER_SKIN_APPEARANCE_LIMITS)).toEqual([
			"skinColor",
			"skinRoughness",
		]);
		const recipe = createDefaultCharacterRecipe();
		recipe.palette.skin = "#C98F65";
		recipe.appearance.skin.roughness = 0.43;
		const parsed = parseCharacterRecipe(recipe);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.palette.skin).toBe("#c98f65");
			expect(parsed.value.appearance.skin.roughness).toBe(0.43);
		}
	});

	it("rejects malformed skin colors and non-finite or out-of-range roughness", () => {
		const malformed = createDefaultCharacterRecipe();
		malformed.palette.skin = "skin";
		malformed.appearance.skin.roughness = Number.NaN;
		const parsed = parseCharacterRecipe(malformed);
		expect(parsed.ok).toBe(false);
		expect(parsed.issues.map((entry) => entry.path)).toEqual(
			expect.arrayContaining(["$.palette.skin", "$.appearance.skin.roughness"]),
		);
	});

	it("defines range, default, units, and validation for exactly six body parameters", () => {
		expect(Object.keys(CHARACTER_BODY_PARAMETER_LIMITS)).toEqual([
			"height",
			"shoulderWidth",
			"torsoLength",
			"armLength",
			"legLength",
			"hipWidth",
		]);
		for (const limits of Object.values(CHARACTER_BODY_PARAMETER_LIMITS)) {
			expect(limits.defaultValue).toBeGreaterThanOrEqual(limits.min);
			expect(limits.defaultValue).toBeLessThanOrEqual(limits.max);
			expect(limits.units.length).toBeGreaterThan(0);
			expect(limits.validation.length).toBeGreaterThan(0);
		}
	});

	it("parses valid recipes and preserves stable JSON serialization", () => {
		const recipe = createDefaultCharacterRecipe({
			id: "captain",
			name: "Captain",
		});
		const parsed = parseCharacterRecipe(recipe);

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			throw new Error("Expected default recipe to parse.");
		}
		expect(JSON.parse(serializeCharacterRecipe(parsed.value))).toEqual(recipe);
	});

	it("rejects unsupported recipe versions", () => {
		const parsed = parseCharacterRecipe({
			...createDefaultCharacterRecipe(),
			version: 2,
		});

		expect(parsed.ok).toBe(false);
		expect(parsed.issues).toContainEqual(
			expect.objectContaining({ path: "$.version" }),
		);
	});

	it("rejects out-of-range body parameters instead of hiding bad input", () => {
		const parsed = parseCharacterRecipe({
			...createDefaultCharacterRecipe(),
			body: {
				baseId: "humanoid-default",
				parameters: {
					height: 0.4,
					shoulderWidth: 0.5,
					torsoLength: 0.5,
					armLength: 0.5,
					legLength: 0.5,
					hipWidth: 0.5,
				},
			},
		});

		expect(parsed.ok).toBe(false);
		expect(parsed.issues).toContainEqual(
			expect.objectContaining({ path: "$.body.parameters.height" }),
		);
	});

	it("migrates legacy saved recipes to default V1 proportions", () => {
		const legacy = createDefaultCharacterRecipe();
		delete (legacy as Partial<typeof legacy>).appearance;
		legacy.body.parameters = {
			height: 1.9,
			shoulderWidth: 0.2,
			build: 0.45,
			waist: 0.5,
			headScale: 1,
		} as unknown as typeof legacy.body.parameters;
		delete (legacy.components as Partial<typeof legacy.components>).hair;
		const parsed = parseCharacterRecipe(legacy);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.body.parameters).toEqual({
				height: 1.9,
				shoulderWidth: 0.2,
				torsoLength: 0.5,
				armLength: 0.5,
				legLength: 0.5,
				hipWidth: 0.5,
			});
			expect(parsed.value.appearance.skin.roughness).toBe(0.72);
			expect(parsed.value.components.hair).toBe("none");
		}
	});

	it("accepts the registered hairstyle and rejects unknown hair ids", () => {
		const parsed = parseCharacterRecipe({
			...createDefaultCharacterRecipe(),
			components: {
				hair: "quaternius-hair-v0",
				torso: "linen-shirt",
			},
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.components).toEqual({
				hair: "quaternius-hair-v0",
				torso: "linen-shirt",
			});
		}
		const unknown = parseCharacterRecipe({
			...createDefaultCharacterRecipe(),
			components: { hair: "filesystem/curl.gltf" },
		});
		expect(unknown.ok).toBe(false);
		expect(unknown.issues).toContainEqual(
			expect.objectContaining({ path: "$.components.hair" }),
		);
	});

	it("exposes exactly none and one validated V1 hairstyle registry entry", () => {
		expect(CHARACTER_HAIR_COMPONENT_IDS).toEqual([
			"none",
			"quaternius-hair-v0",
		]);
		expect(CHARACTER_COMPONENT_REGISTRY.version).toBe(1);
		expect(CHARACTER_COMPONENT_REGISTRY.components).toHaveLength(1);
		expect(getCharacterComponentDefinition("quaternius-hair-v0")).toMatchObject(
			{
				attachmentStrategy: "main-skeleton-head-surface-skinning",
				expectedAttachmentBone: "Head",
				fittingProfile: { id: "quaternius-buzzed-fit-v1", version: 1 },
				provider: "Quaternius",
				slot: "hair",
				sourceHash:
					"43752a4c8f2464eb2494a8ab179bf7ad237638a3d47fb3de0a38361db40e1451",
			},
		);
	});
});

describe("HumanoidV1 contract", () => {
	it("defines the provisional root and hips relationship without finger bones", () => {
		expect(HUMANOID_V1_CONTRACT).toMatchObject({
			identifier: "humanoid-v1",
			units: "metres",
			worldUp: "+Y",
			engineForward: "-Z",
			neutralPose: "A-pose",
			hipsParent: "Root",
			fingerBones: "deferred",
		});
		expect(HUMANOID_V1_CONTRACT.bones).toContainEqual({
			name: "Hips",
			parent: "Root",
		});
	});
});

describe("Component and animation contracts", () => {
	it("accepts valid component slot metadata", () => {
		const parsed = validateCharacterComponentDefinition({
			id: "linen-shirt",
			name: "Linen Shirt",
			slot: "torso",
			skeletonId: "humanoid-v1",
			compatibleBodyBaseIds: ["humanoid-default"],
			materialRegions: ["primary", "secondary"],
			bodyMaskRegions: ["torso-under-shirt"],
			sourceAsset: "components/linen-shirt.glb",
		});

		expect(parsed.ok).toBe(true);
	});

	it("rejects incompatible skeleton ids", () => {
		const parsed = validateCharacterComponentDefinition({
			id: "robot-hair",
			name: "Robot Hair",
			slot: "hair",
			skeletonId: "robot-v1",
			compatibleBodyBaseIds: ["humanoid-default"],
		});

		expect(parsed.ok).toBe(false);
		expect(parsed.issues).toContainEqual(
			expect.objectContaining({ path: "$.skeletonId" }),
		);
	});

	it("rejects duplicate or invalid material regions", () => {
		const parsed = validateCharacterComponentDefinition({
			id: "bad-shirt",
			name: "Bad Shirt",
			slot: "torso",
			skeletonId: "humanoid-v1",
			compatibleBodyBaseIds: ["humanoid-default"],
			materialRegions: ["primary", "primary", "shaderGraph"],
		});

		expect(parsed.ok).toBe(false);
		expect(parsed.issues.map((entry) => entry.path)).toEqual(
			expect.arrayContaining(["$.materialRegions[1]", "$.materialRegions"]),
		);
	});

	it("accepts semantic animation clip mappings without Three imports", () => {
		const parsed = validateCharacterAnimationSetDefinition({
			id: "humanoid-basic-v1",
			name: "Humanoid Basic",
			skeletonId: "humanoid-v1",
			clips: {
				idle: { clipName: "Idle" },
				walk: { assetId: "humanoid-walk-source", clipName: "Walk" },
				run: { assetId: "humanoid-run-source", clipName: "Run" },
				attack: { assetId: "humanoid-attack-source", clipName: "Attack" },
				defeated: { assetId: "humanoid-defeated-source", clipName: "Defeated" },
			},
		});

		expect(parsed.ok).toBe(true);
	});
});
