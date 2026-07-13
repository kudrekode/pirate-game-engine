import * as THREE from "three";
import { describe, expect, it } from "vitest";
import threeDPreviewSource from "../../editor/sections/ThreeDPreview.tsx?raw";
import threeRuntimePanelSource from "./ThreeRuntimePanel.tsx?raw";
import {
	ATMOSPHERE_PRESETS,
	applyAtmosphere,
	createWorldMaterial,
	DEFAULT_ATMOSPHERE_PRESET_ID,
	getWorldMaterialColor,
	resolveAtmospherePreset,
	resolveTerrainMaterialKey,
	THREE_WORLD_MATERIALS,
	terrainBlockKindToMaterialKey,
} from "./worldPresentation";
import worldPresentationSource from "./worldPresentation.ts?raw";

function createRendererStub(): THREE.WebGLRenderer {
	return {
		setClearColor: () => undefined,
		shadowMap: { enabled: false, type: THREE.BasicShadowMap },
	} as unknown as THREE.WebGLRenderer;
}

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

	it("resolves all static atmosphere presets with a clear-day fallback", () => {
		expect(Object.keys(ATMOSPHERE_PRESETS)).toEqual([
			"clear-day",
			"golden-hour",
			"overcast",
		]);
		expect(resolveAtmospherePreset("golden-hour").label).toBe("Golden Hour");
		expect(resolveAtmospherePreset("unknown")).toBe(
			ATMOSPHERE_PRESETS[DEFAULT_ATMOSPHERE_PRESET_ID],
		);
		for (const preset of Object.values(ATMOSPHERE_PRESETS)) {
			expect(preset.fog.far).toBeGreaterThan(preset.fog.near);
			expect(preset.palette.fog).toBe(preset.palette.horizon);
			expect(preset.renderer.toneMappingExposure).toBeGreaterThan(0);
		}
	});

	it("applies matched sky, fog, lighting, shadows, and renderer presentation", () => {
		const scene = new THREE.Scene();
		const renderer = createRendererStub();
		const atmosphere = applyAtmosphere(scene, renderer, {
			enableShadows: true,
			preset: "golden-hour",
		});
		const background = scene.background as THREE.Color;
		const fog = scene.fog as THREE.Fog;

		expect(atmosphere.preset.id).toBe("golden-hour");
		expect(scene.background).toMatchObject({
			isColor: true,
		});
		expect(background.getHex()).toBe(
			ATMOSPHERE_PRESETS["golden-hour"].palette.horizon,
		);
		expect(fog.color.getHex()).toBe(
			ATMOSPHERE_PRESETS["golden-hour"].palette.fog,
		);
		expect(fog.near).toBe(ATMOSPHERE_PRESETS["golden-hour"].fog.near);
		expect(fog.far).toBe(ATMOSPHERE_PRESETS["golden-hour"].fog.far);
		expect(atmosphere.sky.userData.atmosphereSky).toBe(true);
		expect(atmosphere.lights.ambient.intensity).toBe(
			ATMOSPHERE_PRESETS["golden-hour"].lighting.ambientIntensity,
		);
		expect(atmosphere.lights.sun.castShadow).toBe(true);
		expect(atmosphere.lights.sun.shadow.radius).toBe(2);
		expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
		expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
		expect(renderer.toneMappingExposure).toBe(
			ATMOSPHERE_PRESETS["golden-hour"].renderer.toneMappingExposure,
		);
		expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);

		atmosphere.dispose();
		expect(scene.children).toHaveLength(0);
	});

	it("makes editor and runtime consume the identical atmosphere helper", () => {
		expect(threeDPreviewSource).toContain("applyAtmosphere(scene, renderer");
		expect(threeRuntimePanelSource).toContain(
			"applyAtmosphere(scene, renderer",
		);
		expect(threeDPreviewSource).not.toContain("configureThreeWorldScene");
		expect(threeRuntimePanelSource).not.toContain("configureThreeWorldScene");
	});

	it("keeps presentation helpers independent from gameplay runtime helpers", () => {
		expect(worldPresentationSource).not.toMatch(/runtimeSession/);
		expect(worldPresentationSource).not.toMatch(/playerMovementTransaction/);
		expect(worldPresentationSource).not.toMatch(/runtimeNpcTick/);
		expect(worldPresentationSource).not.toMatch(/ruleEngine/);
	});
});
