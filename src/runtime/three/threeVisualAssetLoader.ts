import type * as THREE from "three";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

type GltfLike = {
	scene?: THREE.Object3D;
	scenes?: THREE.Object3D[];
};

export type ThreeVisualAssetLoaderLike = {
	loadAsync: (url: string) => Promise<GltfLike>;
};

type ThreeVisualAssetLoaderFactory = () =>
	| ThreeVisualAssetLoaderLike
	| Promise<ThreeVisualAssetLoaderLike>;

type AssetCacheEntry =
	| {
			status: "loading";
			definition: ThreeVisualAssetDefinition;
			listeners: Set<() => void>;
			promise: Promise<void>;
	  }
	| {
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			root: THREE.Object3D;
	  }
	| {
			status: "error";
			definition: ThreeVisualAssetDefinition;
			error: unknown;
	  };

export type ThreeVisualAssetRequest =
	| { status: "missing" }
	| { status: "loading"; definition: ThreeVisualAssetDefinition }
	| { status: "error"; definition: ThreeVisualAssetDefinition; error: unknown }
	| {
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			object: THREE.Object3D;
	  };

const cache = new Map<string, AssetCacheEntry>();
let loaderFactory: ThreeVisualAssetLoaderFactory = async () => {
	const { GLTFLoader } = await import(
		"three/examples/jsm/loaders/GLTFLoader.js"
	);
	return new GLTFLoader();
};

function getCacheKey(definition: ThreeVisualAssetDefinition): string {
	return definition.id || definition.url;
}

function getGltfRoot(gltf: GltfLike): THREE.Object3D | undefined {
	return gltf.scene ?? gltf.scenes?.[0];
}

function notifyListeners(
	entry: Extract<AssetCacheEntry, { status: "loading" }>,
) {
	const listeners = Array.from(entry.listeners);
	entry.listeners.clear();
	for (const listener of listeners) {
		listener();
	}
}

function startAssetLoad(
	definition: ThreeVisualAssetDefinition,
	key: string,
	onStateChange: (() => void) | undefined,
): Extract<AssetCacheEntry, { status: "loading" }> {
	const listeners = new Set<() => void>();
	if (onStateChange) {
		listeners.add(onStateChange);
	}
	const entry: Extract<AssetCacheEntry, { status: "loading" }> = {
		definition,
		listeners,
		promise: Promise.resolve(),
		status: "loading",
	};
	entry.promise = Promise.resolve(loaderFactory())
		.then((loader) => loader.loadAsync(definition.url))
		.then((gltf) => {
			const root = getGltfRoot(gltf);
			if (!root) {
				cache.set(key, {
					definition,
					error: new Error(
						`Three visual asset "${definition.id}" has no scene.`,
					),
					status: "error",
				});
				return;
			}
			cache.set(key, {
				definition,
				root,
				status: "loaded",
			});
		})
		.catch((error) => {
			cache.set(key, {
				definition,
				error,
				status: "error",
			});
		})
		.finally(() => notifyListeners(entry));
	cache.set(key, entry);
	return entry;
}

export function requestThreeVisualAsset(
	definition: ThreeVisualAssetDefinition | undefined,
	options: { onStateChange?: () => void } = {},
): ThreeVisualAssetRequest {
	if (!definition) {
		return { status: "missing" };
	}

	const key = getCacheKey(definition);
	const existing = cache.get(key);
	if (existing?.status === "loaded") {
		return {
			definition: existing.definition,
			object: cloneThreeVisualAssetRoot(existing.root),
			status: "loaded",
		};
	}
	if (existing?.status === "error") {
		return {
			definition: existing.definition,
			error: existing.error,
			status: "error",
		};
	}
	if (existing?.status === "loading") {
		if (options.onStateChange) {
			existing.listeners.add(options.onStateChange);
		}
		return { definition: existing.definition, status: "loading" };
	}

	const entry = startAssetLoad(definition, key, options.onStateChange);
	return { definition: entry.definition, status: "loading" };
}

export function cloneThreeVisualAssetRoot(
	root: THREE.Object3D,
): THREE.Object3D {
	return root.clone(true);
}

export function clearThreeVisualAssetCacheForTests(): void {
	cache.clear();
}

export function setThreeVisualAssetLoaderFactoryForTests(
	factory: ThreeVisualAssetLoaderFactory | undefined,
): () => void {
	const previous = loaderFactory;
	loaderFactory =
		factory ??
		(async () => {
			const { GLTFLoader } = await import(
				"three/examples/jsm/loaders/GLTFLoader.js"
			);
			return new GLTFLoader();
		});
	return () => {
		loaderFactory = previous;
	};
}
