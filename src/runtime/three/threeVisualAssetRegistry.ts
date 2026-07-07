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
