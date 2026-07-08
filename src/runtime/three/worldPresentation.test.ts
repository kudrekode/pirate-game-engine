import { describe, expect, it } from "vitest";
import {
	createWorldMaterial,
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
	THREE_WORLD_MATERIALS,
	terrainBlockKindToMaterialKey,
} from "./worldPresentation";
import worldPresentationSource from "./worldPresentation.ts?raw";

describe("Three world presentation helpers", () => {
	it("exposes the core material palette keys", () => {
		expect(Object.keys(THREE_WORLD_MATERIALS)).toEqual(
			expect.arrayContaining([
				"default",
				"dirt",
				"foliage",
				"grass",
				"hostile",
				"roof",
				"sand",
				"stone",
				"water",
				"wood",
			]),
		);
	});

	it("resolves terrain material keys with a safe fallback", () => {
		expect(resolveTerrainMaterialKey("grass")).toBe("grass");
		expect(resolveTerrainMaterialKey("stone_floor")).toBe("stone");
		expect(resolveTerrainMaterialKey("deep_water")).toBe("water");
		expect(resolveTerrainMaterialKey("mystery")).toBe("default");
		expect(terrainBlockKindToMaterialKey("unknown")).toBe("default");
	});

	it("creates water as a transparent readable material", () => {
		const material = createWorldMaterial("water");

		expect(material.color.getHex()).toBe(getWorldMaterialColor("water"));
		expect(material.transparent).toBe(true);
		expect(material.opacity).toBeLessThan(1);
		expect(material.depthWrite).toBe(false);
	});

	it("uses the supported PCF shadow map type", () => {
		expect(worldPresentationSource).toContain("THREE.PCFShadowMap");
		expect(worldPresentationSource).not.toContain("THREE.PCFSoftShadowMap");
	});

	it("keeps presentation helpers independent from gameplay runtime helpers", () => {
		expect(worldPresentationSource).not.toMatch(/runtimeSession/);
		expect(worldPresentationSource).not.toMatch(/playerMovementTransaction/);
		expect(worldPresentationSource).not.toMatch(/runtimeNpcTick/);
		expect(worldPresentationSource).not.toMatch(/ruleEngine/);
	});
});
