import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { emitThreePerformanceDiagnosticsEvent } from "./threePerformanceDiagnostics";
import {
	analyzeThreeVisualAssetRoot,
	type ThreeVisualAssetAnalysis,
} from "./threeVisualAssetAnalysis";
import { prepareThreeVisualAssetMaterials } from "./threeVisualAssetMaterialProfile";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

type GltfLike = {
	animations?: THREE.AnimationClip[];
	scene?: THREE.Object3D;
	scenes?: THREE.Object3D[];
};

export type ThreeVisualAssetCloneType = "object3d" | "skeleton-utils";

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
			analysis: ThreeVisualAssetAnalysis;
			animations: THREE.AnimationClip[];
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
			analysis: ThreeVisualAssetAnalysis;
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			cloneType: ThreeVisualAssetCloneType;
			object: THREE.Object3D;
	  };

export type ThreeVisualAssetAnimationRequest =
	| { status: "missing" }
	| { status: "loading"; definition: ThreeVisualAssetDefinition }
	| { status: "error"; definition: ThreeVisualAssetDefinition; error: unknown }
	| {
			clip: THREE.AnimationClip;
			definition: ThreeVisualAssetDefinition;
			status: "loaded";
	  }
	| {
			definition: ThreeVisualAssetDefinition;
			status: "missing_clip";
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
	emitThreePerformanceDiagnosticsEvent({
		definitionId: definition.id,
		status: "load_start",
		url: definition.url,
	});
	entry.promise = Promise.resolve(loaderFactory())
		.then((loader) => loader.loadAsync(definition.url))
		.then((gltf) => {
			const callbackStartedAt = performance.now();
			const root = getGltfRoot(gltf);
			if (!root) {
				const errorMessage = `Three visual asset "${definition.id}" has no scene.`;
				cache.set(key, {
					definition,
					error: new Error(errorMessage),
					status: "error",
				});
				emitThreePerformanceDiagnosticsEvent({
					definitionId: definition.id,
					durationMs: performance.now() - callbackStartedAt,
					message: errorMessage,
					status: "load_failure",
					url: definition.url,
				});
				return;
			}
			prepareThreeVisualAssetMaterials(root, definition);
			const analysis = analyzeThreeVisualAssetRoot(root, gltf.animations);
			cache.set(key, {
				analysis,
				animations: gltf.animations ?? [],
				definition,
				root,
				status: "loaded",
			});
			emitThreePerformanceDiagnosticsEvent({
				definitionId: definition.id,
				durationMs: performance.now() - callbackStartedAt,
				status: "load_success",
				url: definition.url,
			});
		})
		.catch((error) => {
			const callbackStartedAt = performance.now();
			cache.set(key, {
				definition,
				error,
				status: "error",
			});
			emitThreePerformanceDiagnosticsEvent({
				definitionId: definition.id,
				durationMs: performance.now() - callbackStartedAt,
				message: error instanceof Error ? error.message : String(error),
				status: "load_failure",
				url: definition.url,
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
		const cloneType = getThreeVisualAssetCloneType(existing.analysis);
		emitThreePerformanceDiagnosticsEvent({
			definitionId: existing.definition.id,
			status: "cache_hit",
			url: existing.definition.url,
		});
		return {
			analysis: existing.analysis,
			cloneType,
			definition: existing.definition,
			object: cloneThreeVisualAssetRoot(existing.root, cloneType),
			status: "loaded",
		};
	}
	if (existing?.status === "error") {
		emitThreePerformanceDiagnosticsEvent({
			definitionId: existing.definition.id,
			message:
				existing.error instanceof Error
					? existing.error.message
					: String(existing.error),
			status: "cache_hit",
			url: existing.definition.url,
		});
		return {
			definition: existing.definition,
			error: existing.error,
			status: "error",
		};
	}
	if (existing?.status === "loading") {
		emitThreePerformanceDiagnosticsEvent({
			definitionId: existing.definition.id,
			status: "cache_hit",
			url: existing.definition.url,
		});
		if (options.onStateChange) {
			existing.listeners.add(options.onStateChange);
		}
		return { definition: existing.definition, status: "loading" };
	}

	const entry = startAssetLoad(definition, key, options.onStateChange);
	return { definition: entry.definition, status: "loading" };
}

export function requestThreeVisualAssetAnimationClip(
	definition: ThreeVisualAssetDefinition | undefined,
	clipName: string,
	options: { onStateChange?: () => void } = {},
): ThreeVisualAssetAnimationRequest {
	if (!definition) {
		return { status: "missing" };
	}

	const key = getCacheKey(definition);
	const existing = cache.get(key);
	if (existing?.status === "loaded") {
		const clip = existing.animations.find(
			(candidate) => candidate.name === clipName,
		);
		return clip
			? { clip, definition: existing.definition, status: "loaded" }
			: { definition: existing.definition, status: "missing_clip" };
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
	cloneType: ThreeVisualAssetCloneType = rootHasSkinnedMeshes(root)
		? "skeleton-utils"
		: "object3d",
): THREE.Object3D {
	return cloneType === "skeleton-utils"
		? cloneSkeleton(root)
		: root.clone(true);
}

export function getThreeVisualAssetCloneType(
	analysis: Pick<ThreeVisualAssetAnalysis, "skinnedMeshCount">,
): ThreeVisualAssetCloneType {
	return analysis.skinnedMeshCount > 0 ? "skeleton-utils" : "object3d";
}

function rootHasSkinnedMeshes(root: THREE.Object3D): boolean {
	let hasSkinnedMesh = false;
	root.traverse((object) => {
		if (object instanceof THREE.SkinnedMesh) {
			hasSkinnedMesh = true;
		}
	});
	return hasSkinnedMesh;
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
