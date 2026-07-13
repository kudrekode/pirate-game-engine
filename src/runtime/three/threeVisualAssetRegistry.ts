export type ThreeVisualAssetCategory =
	| "character"
	| "object"
	| "vehicle"
	| "environment"
	| "item";

export type ThreeCharacterAnimationState =
	| "idle"
	| "walk"
	| "attack"
	| "defeated";

export type ThreeCharacterAnimationMapping = {
	assetId?: string;
	clipName: string;
};

export type ThreeVisualAssetDefinition = {
	id: string;
	name: string;
	kind: "gltf" | "glb";
	url: string;
	category?: ThreeVisualAssetCategory;
	/** Animation-only registry sources are never offered as character visuals. */
	animationOnly?: boolean;
	animations?: Partial<
		Record<ThreeCharacterAnimationState, ThreeCharacterAnimationMapping>
	>;
	/**
	 * Optional presentation-only material preparation for this cached source.
	 * It never changes authored project data or gameplay state.
	 */
	materialProfile?: "preserve" | "standard";
	defaultScale?: number;
	defaultHeightOffset?: number;
	defaultRotationOffset?: number;
	castShadow?: boolean;
	receiveShadow?: boolean;
	tags?: string[];
};

// Built-in/demo registry only. These assets live under public/ so Vite serves
// them from the same stable URLs in dev and production builds.
export const THREE_VISUAL_ASSET_REGISTRY: ThreeVisualAssetDefinition[] = [
	{
		category: "object",
		defaultHeightOffset: 0.45,
		defaultScale: 0.45,
		tags: ["demo", "primitive"],
		id: "demo-box",
		kind: "glb",
		name: "Demo Box",
		url: "/assets/demo/Box.glb",
	},
	{
		category: "object",
		castShadow: true,
		defaultScale: 0.22,
		id: "pirate-chest",
		kind: "glb",
		name: "Pirate Chest",
		receiveShadow: true,
		tags: ["container", "treasure"],
		url: "/assets/pirate-demo/chest.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-barrel",
		kind: "glb",
		name: "Pirate Barrel",
		receiveShadow: true,
		tags: ["prop", "storage"],
		url: "/assets/pirate-demo/barrel.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-crate",
		kind: "glb",
		name: "Pirate Crate",
		receiveShadow: true,
		tags: ["prop", "storage"],
		url: "/assets/pirate-demo/crate.glb",
	},
	{
		category: "environment",
		castShadow: true,
		defaultScale: 0.24,
		id: "pirate-palm",
		kind: "glb",
		name: "Pirate Palm",
		receiveShadow: true,
		tags: ["foliage", "land"],
		url: "/assets/pirate-demo/palm-straight.glb",
	},
	{
		category: "environment",
		castShadow: true,
		defaultScale: 0.35,
		id: "pirate-rocks",
		kind: "glb",
		name: "Pirate Rocks",
		receiveShadow: true,
		tags: ["environment", "land", "shore"],
		url: "/assets/pirate-demo/rocks-a.glb",
	},
	{
		category: "vehicle",
		castShadow: true,
		defaultScale: 0.12,
		id: "pirate-small-ship",
		kind: "glb",
		name: "Pirate Small Ship",
		receiveShadow: true,
		tags: ["boat", "pirate", "water"],
		url: "/assets/pirate-demo/ship-pirate-small.glb",
	},
	{
		category: "object",
		defaultScale: 0.4,
		id: "pirate-dock",
		kind: "glb",
		name: "Pirate Dock",
		receiveShadow: true,
		tags: ["platform", "waterfront"],
		url: "/assets/pirate-demo/structure-platform-dock.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-flag",
		kind: "glb",
		name: "Pirate Flag",
		receiveShadow: true,
		tags: ["decoration", "flag"],
		url: "/assets/pirate-demo/flag-pirate.glb",
	},
	{
		category: "character",
		animations: {
			attack: {
				assetId: "pirate-character-attack",
				clipName: "Armature|Attack|baselayer",
			},
			defeated: {
				assetId: "pirate-character-dead",
				clipName: "Armature|Dead|baselayer",
			},
			walk: {
				assetId: "pirate-character-walk",
				clipName: "Armature|walking_man|baselayer",
			},
		},
		defaultHeightOffset: 0,
		// Patchbeard's visible forward is native +Z; Three grid north is -Z.
		defaultRotationOffset: 180,
		defaultScale: 0.75,
		id: "pirate-character-base",
		kind: "glb",
		materialProfile: "standard",
		name: "Captain Patchbeard (Base)",
		receiveShadow: false,
		tags: ["base", "character", "pirate", "skinned"],
		url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Character_output.glb",
	},
	{
		category: "character",
		animations: {
			attack: {
				assetId: "pirate-character-attack",
				clipName: "Armature|Attack|baselayer",
			},
			defeated: {
				assetId: "pirate-character-dead",
				clipName: "Armature|Dead|baselayer",
			},
			walk: {
				assetId: "pirate-character-walk",
				clipName: "Armature|walking_man|baselayer",
			},
		},
		defaultHeightOffset: 0,
		// Patchbeard's visible forward is native +Z; Three grid north is -Z.
		defaultRotationOffset: 180,
		defaultScale: 0.75,
		id: "pirate-character-walk",
		kind: "glb",
		materialProfile: "standard",
		name: "Captain Patchbeard (Walk)",
		receiveShadow: false,
		tags: ["animation", "character", "pirate", "skinned", "walk"],
		url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Walking_withSkin.glb",
	},
	{
		animationOnly: true,
		category: "character",
		id: "pirate-character-attack",
		kind: "glb",
		materialProfile: "standard",
		name: "Captain Patchbeard Attack (Animation Source)",
		receiveShadow: false,
		tags: ["animation", "attack", "character", "pirate", "skinned"],
		url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Attack_withSkin.glb",
	},
	{
		animationOnly: true,
		category: "character",
		id: "pirate-character-dead",
		kind: "glb",
		materialProfile: "standard",
		name: "Captain Patchbeard Dead (Animation Source)",
		receiveShadow: false,
		tags: ["animation", "character", "dead", "pirate", "skinned"],
		url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Dead_withSkin.glb",
	},
];

let activeRegistry = THREE_VISUAL_ASSET_REGISTRY;

function getAssetMap(): Map<string, ThreeVisualAssetDefinition> {
	return new Map(activeRegistry.map((asset) => [asset.id, asset]));
}

export function listThreeVisualAssets(): ThreeVisualAssetDefinition[] {
	return [...activeRegistry];
}

export function getThreeVisualAssetDefinition(
	assetId: string | undefined,
): ThreeVisualAssetDefinition | undefined {
	return assetId ? getAssetMap().get(assetId) : undefined;
}

export function setThreeVisualAssetRegistryForTests(
	assets: ThreeVisualAssetDefinition[],
): () => void {
	const previous = activeRegistry;
	activeRegistry = assets;
	return () => {
		activeRegistry = previous;
	};
}
