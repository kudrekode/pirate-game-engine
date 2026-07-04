import * as THREE from "three";

export type WorldMaterialKey =
	| "default"
	| "dirt"
	| "event"
	| "foliage"
	| "friendly"
	| "grass"
	| "hostile"
	| "houseWall"
	| "itemAccent"
	| "marketCanopy"
	| "roof"
	| "sand"
	| "skin"
	| "stone"
	| "water"
	| "waterAccent"
	| "wood";

export type WorldMaterialPreset = {
	color: number;
	metalness?: number;
	opacity?: number;
	roughness?: number;
	transparent?: boolean;
};

export const THREE_WORLD_MATERIALS: Record<
	WorldMaterialKey,
	WorldMaterialPreset
> = {
	default: { color: 0x94a3b8, roughness: 0.82 },
	dirt: { color: 0x8a5a32, roughness: 0.95 },
	event: { color: 0xb95fd9, opacity: 0.72, roughness: 0.7, transparent: true },
	foliage: { color: 0x2f7d43, roughness: 0.88 },
	friendly: { color: 0x2f6fed, roughness: 0.55 },
	grass: { color: 0x4f8f45, roughness: 0.92 },
	hostile: { color: 0xc2413d, roughness: 0.62 },
	houseWall: { color: 0xd0bd91, roughness: 0.86 },
	itemAccent: { color: 0xf7c948, roughness: 0.45 },
	marketCanopy: { color: 0xd84c45, roughness: 0.58 },
	roof: { color: 0x9f342c, roughness: 0.72 },
	sand: { color: 0xd7c47a, roughness: 0.98 },
	skin: { color: 0xf2c6a6, roughness: 0.68 },
	stone: { color: 0x7d8791, roughness: 0.9 },
	water: {
		color: 0x2f9fd8,
		metalness: 0.02,
		opacity: 0.68,
		roughness: 0.18,
		transparent: true,
	},
	waterAccent: { color: 0x1687a7, metalness: 0.03, roughness: 0.35 },
	wood: { color: 0x7c4a24, roughness: 0.78 },
};

export type WorldMaterialOptions = {
	color?: number;
	opacity?: number;
	selected?: boolean;
};

export type WorldSceneOptions = {
	background?: number;
	fog?: boolean;
	fogFar?: number;
	fogNear?: number;
};

export type WorldLightingOptions = {
	enableShadows?: boolean;
	sunIntensity?: number;
};

export const DEFAULT_WORLD_BACKGROUND = 0xbdd7ed;
const DEFAULT_WORLD_FOG = 0xc7d9ea;

export function getWorldMaterialColor(key: WorldMaterialKey): number {
	return (
		THREE_WORLD_MATERIALS[key]?.color ?? THREE_WORLD_MATERIALS.default.color
	);
}

export function resolveTerrainMaterialKey(tileId: string): WorldMaterialKey {
	const value = tileId.toLowerCase();
	if (value === "grass" || value.includes("grass")) {
		return "grass";
	}
	if (value === "dirt" || value.includes("dirt") || value.includes("soil")) {
		return "dirt";
	}
	if (value === "sand" || value.includes("sand") || value.includes("beach")) {
		return "sand";
	}
	if (value === "water" || value.includes("water") || value.includes("sea")) {
		return "water";
	}
	if (
		value === "stone" ||
		value.includes("stone") ||
		value.includes("rock") ||
		value.includes("floor")
	) {
		return "stone";
	}
	return "default";
}

export function terrainBlockKindToMaterialKey(kind: string): WorldMaterialKey {
	return kind === "grass" ||
		kind === "dirt" ||
		kind === "sand" ||
		kind === "stone" ||
		kind === "water"
		? kind
		: "default";
}

export function createWorldMaterial(
	key: WorldMaterialKey,
	options: WorldMaterialOptions = {},
): THREE.MeshStandardMaterial {
	const preset = THREE_WORLD_MATERIALS[key] ?? THREE_WORLD_MATERIALS.default;
	const opacity = options.opacity ?? preset.opacity ?? 1;
	return new THREE.MeshStandardMaterial({
		color: options.color ?? preset.color,
		depthWrite: opacity >= 1,
		emissive: options.selected ? 0xfef08a : 0x000000,
		emissiveIntensity: options.selected ? 0.5 : 0,
		metalness: preset.metalness ?? 0,
		opacity,
		roughness: preset.roughness ?? 0.75,
		transparent: opacity < 1 || preset.transparent === true,
	});
}

export function createTerrainMaterial(
	kind: string,
	options: WorldMaterialOptions = {},
): THREE.MeshStandardMaterial {
	return createWorldMaterial(terrainBlockKindToMaterialKey(kind), options);
}

export function configureThreeWorldScene(
	scene: THREE.Scene,
	options: WorldSceneOptions = {},
): void {
	const background = options.background ?? DEFAULT_WORLD_BACKGROUND;
	scene.background = new THREE.Color(background);
	scene.fog =
		options.fog === false
			? null
			: new THREE.Fog(
					options.background ?? DEFAULT_WORLD_FOG,
					options.fogNear ?? 18,
					options.fogFar ?? 42,
				);
}

export function addThreeWorldLighting(
	scene: THREE.Scene,
	options: WorldLightingOptions = {},
): THREE.Light[] {
	const hemi = new THREE.HemisphereLight(0xddeeff, 0x4f5f3d, 0.82);
	const sun = new THREE.DirectionalLight(
		0xfff3d0,
		options.sunIntensity ?? 1.25,
	);
	sun.position.set(5, 9, 6);
	sun.castShadow = options.enableShadows ?? false;
	if (sun.castShadow) {
		sun.shadow.mapSize.width = 1024;
		sun.shadow.mapSize.height = 1024;
		sun.shadow.camera.near = 0.5;
		sun.shadow.camera.far = 48;
	}
	scene.add(hemi, sun);
	return [hemi, sun];
}

export function configureThreeRenderer(
	renderer: THREE.WebGLRenderer,
	options: { enableShadows?: boolean } = {},
): void {
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1;
	renderer.setClearColor(DEFAULT_WORLD_BACKGROUND, 1);
	renderer.shadowMap.enabled = options.enableShadows ?? false;
	if (renderer.shadowMap.enabled) {
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	}
}

export function applyShadowRole(
	object: THREE.Object3D,
	options: { cast?: boolean; receive?: boolean },
): void {
	object.traverse((child) => {
		child.castShadow = options.cast ?? child.castShadow;
		child.receiveShadow = options.receive ?? child.receiveShadow;
	});
}
