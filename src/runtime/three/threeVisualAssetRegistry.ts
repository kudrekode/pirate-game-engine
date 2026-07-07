export type ThreeVisualAssetCategory =
	| "character"
	| "object"
	| "vehicle"
	| "environment"
	| "item";

export type ThreeVisualAssetDefinition = {
	id: string;
	name: string;
	kind: "gltf" | "glb";
	url: string;
	category?: ThreeVisualAssetCategory;
	defaultScale?: number;
	defaultHeightOffset?: number;
	defaultRotationOffset?: number;
	castShadow?: boolean;
	receiveShadow?: boolean;
};

// Built-in/demo registry only. These assets live under public/ so Vite serves
// them from the same stable URLs in dev and production builds.
export const THREE_VISUAL_ASSET_REGISTRY: ThreeVisualAssetDefinition[] = [
	{
		category: "object",
		defaultHeightOffset: 0.45,
		defaultScale: 0.45,
		id: "demo-box",
		kind: "glb",
		name: "Demo Box",
		url: "/assets/demo/Box.glb",
	},
	{
		category: "object",
		defaultScale: 0.22,
		id: "pirate-chest",
		kind: "glb",
		name: "Pirate Chest",
		url: "/assets/pirate-demo/chest.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-barrel",
		kind: "glb",
		name: "Pirate Barrel",
		url: "/assets/pirate-demo/barrel.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-crate",
		kind: "glb",
		name: "Pirate Crate",
		url: "/assets/pirate-demo/crate.glb",
	},
	{
		category: "environment",
		defaultScale: 0.24,
		id: "pirate-palm",
		kind: "glb",
		name: "Pirate Palm",
		url: "/assets/pirate-demo/palm-straight.glb",
	},
	{
		category: "environment",
		defaultScale: 0.35,
		id: "pirate-rocks",
		kind: "glb",
		name: "Pirate Rocks",
		url: "/assets/pirate-demo/rocks-a.glb",
	},
	{
		category: "vehicle",
		defaultScale: 0.12,
		id: "pirate-small-ship",
		kind: "glb",
		name: "Pirate Small Ship",
		url: "/assets/pirate-demo/ship-pirate-small.glb",
	},
	{
		category: "object",
		defaultScale: 0.4,
		id: "pirate-dock",
		kind: "glb",
		name: "Pirate Dock",
		url: "/assets/pirate-demo/structure-platform-dock.glb",
	},
	{
		category: "object",
		defaultScale: 0.45,
		id: "pirate-flag",
		kind: "glb",
		name: "Pirate Flag",
		url: "/assets/pirate-demo/flag-pirate.glb",
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
