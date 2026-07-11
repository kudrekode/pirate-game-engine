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

export type AtmospherePresetId = "clear-day" | "golden-hour" | "overcast";

export type AtmospherePreset = {
	id: AtmospherePresetId;
	label: string;
	fog: {
		far: number;
		near: number;
	};
	lighting: {
		ambientGroundColor: number;
		ambientIntensity: number;
		ambientSkyColor: number;
		sunAzimuthDegrees: number;
		sunColor: number;
		sunElevationDegrees: number;
		sunIntensity: number;
	};
	palette: {
		fog: number;
		horizon: number;
		sky: number;
	};
	renderer: {
		toneMappingExposure: number;
	};
};

export type ApplyAtmosphereOptions = {
	enableShadows?: boolean;
	fog?: boolean;
	preset?: AtmospherePresetId | string;
};

export type AppliedAtmosphere = {
	dispose: () => void;
	lights: {
		ambient: THREE.HemisphereLight;
		sun: THREE.DirectionalLight;
	};
	preset: AtmospherePreset;
	sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
};

export const DEFAULT_ATMOSPHERE_PRESET_ID: AtmospherePresetId = "clear-day";

export const ATMOSPHERE_PRESETS: Record<AtmospherePresetId, AtmospherePreset> =
	{
		"clear-day": {
			fog: { far: 58, near: 16 },
			id: "clear-day",
			label: "Clear Day",
			lighting: {
				ambientGroundColor: 0x53654d,
				ambientIntensity: 0.9,
				ambientSkyColor: 0xd9eeff,
				sunAzimuthDegrees: 38,
				sunColor: 0xfff2d2,
				sunElevationDegrees: 48,
				sunIntensity: 1.35,
			},
			palette: {
				fog: 0xb9d6e8,
				horizon: 0xb9d6e8,
				sky: 0x4f8fc8,
			},
			renderer: { toneMappingExposure: 1.05 },
		},
		"golden-hour": {
			fog: { far: 52, near: 14 },
			id: "golden-hour",
			label: "Golden Hour",
			lighting: {
				ambientGroundColor: 0x55463d,
				ambientIntensity: 0.76,
				ambientSkyColor: 0xf5c9aa,
				sunAzimuthDegrees: 24,
				sunColor: 0xffc97f,
				sunElevationDegrees: 18,
				sunIntensity: 1.45,
			},
			palette: {
				fog: 0xe6b991,
				horizon: 0xe6b991,
				sky: 0x5d78a6,
			},
			renderer: { toneMappingExposure: 1 },
		},
		overcast: {
			fog: { far: 46, near: 12 },
			id: "overcast",
			label: "Overcast",
			lighting: {
				ambientGroundColor: 0x637064,
				ambientIntensity: 1.05,
				ambientSkyColor: 0xd7e0e4,
				sunAzimuthDegrees: 42,
				sunColor: 0xe9eef1,
				sunElevationDegrees: 56,
				sunIntensity: 0.82,
			},
			palette: {
				fog: 0xc4d0d8,
				horizon: 0xc4d0d8,
				sky: 0x8294a7,
			},
			renderer: { toneMappingExposure: 0.96 },
		},
	};

export function resolveAtmospherePreset(
	presetId: AtmospherePresetId | string | undefined,
): AtmospherePreset {
	return (
		ATMOSPHERE_PRESETS[presetId as AtmospherePresetId] ??
		ATMOSPHERE_PRESETS[DEFAULT_ATMOSPHERE_PRESET_ID]
	);
}

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

function createAtmosphereSky(
	preset: AtmospherePreset,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
	const geometry = new THREE.SphereGeometry(280, 16, 8);
	const material = new THREE.ShaderMaterial({
		depthWrite: false,
		fog: false,
		fragmentShader: `
			uniform vec3 horizonColor;
			uniform vec3 skyColor;
			varying vec3 vDirection;

			void main() {
				float skyBlend = smoothstep(-0.18, 0.38, normalize(vDirection).y);
				gl_FragColor = vec4(mix(horizonColor, skyColor, skyBlend), 1.0);
			}
		`,
		side: THREE.BackSide,
		toneMapped: false,
		uniforms: {
			horizonColor: { value: new THREE.Color(preset.palette.horizon) },
			skyColor: { value: new THREE.Color(preset.palette.sky) },
		},
		vertexShader: `
			varying vec3 vDirection;

			void main() {
				vDirection = (modelMatrix * vec4(position, 0.0)).xyz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
	});
	const sky = new THREE.Mesh(geometry, material);
	sky.frustumCulled = false;
	sky.renderOrder = -1;
	sky.userData.atmosphereSky = true;
	return sky;
}

function getSunPosition(
	azimuthDegrees: number,
	elevationDegrees: number,
): THREE.Vector3 {
	const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
	const elevation = THREE.MathUtils.degToRad(elevationDegrees);
	const distance = 80;
	const horizontalDistance = Math.cos(elevation) * distance;
	return new THREE.Vector3(
		Math.sin(azimuth) * horizontalDistance,
		Math.sin(elevation) * distance,
		Math.cos(azimuth) * horizontalDistance,
	);
}

function configureAtmosphereRenderer(
	renderer: THREE.WebGLRenderer,
	preset: AtmospherePreset,
	enableShadows: boolean,
): void {
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = preset.renderer.toneMappingExposure;
	renderer.setClearColor(preset.palette.horizon, 1);
	renderer.shadowMap.enabled = enableShadows;
	if (enableShadows) {
		renderer.shadowMap.type = THREE.PCFShadowMap;
	}
}

export function applyAtmosphere(
	scene: THREE.Scene,
	renderer: THREE.WebGLRenderer,
	options: ApplyAtmosphereOptions = {},
): AppliedAtmosphere {
	const preset = resolveAtmospherePreset(options.preset);
	const enableShadows = options.enableShadows ?? false;
	scene.background = new THREE.Color(preset.palette.horizon);
	scene.fog =
		options.fog === false
			? null
			: new THREE.Fog(preset.palette.fog, preset.fog.near, preset.fog.far);

	const sky = createAtmosphereSky(preset);
	const ambient = new THREE.HemisphereLight(
		preset.lighting.ambientSkyColor,
		preset.lighting.ambientGroundColor,
		preset.lighting.ambientIntensity,
	);
	const sun = new THREE.DirectionalLight(
		preset.lighting.sunColor,
		preset.lighting.sunIntensity,
	);
	sun.position.copy(
		getSunPosition(
			preset.lighting.sunAzimuthDegrees,
			preset.lighting.sunElevationDegrees,
		),
	);
	sun.castShadow = enableShadows;
	if (enableShadows) {
		sun.shadow.mapSize.set(1024, 1024);
		sun.shadow.camera.bottom = -20;
		sun.shadow.camera.far = 96;
		sun.shadow.camera.left = -20;
		sun.shadow.camera.near = 0.5;
		sun.shadow.camera.right = 20;
		sun.shadow.camera.top = 20;
		sun.shadow.normalBias = 0.02;
		sun.shadow.radius = 2;
	}
	scene.add(sky, ambient, sun);
	configureAtmosphereRenderer(renderer, preset, enableShadows);

	return {
		dispose: () => {
			scene.remove(sky, ambient, sun);
			sky.geometry.dispose();
			sky.material.dispose();
		},
		lights: { ambient, sun },
		preset,
		sky,
	};
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
