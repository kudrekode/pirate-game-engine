import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

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
	resourceUrlAliases?: Record<string, string>;
	category?: ThreeVisualAssetCategory;
	animationOnly?: boolean;
	animations?: Partial<
		Record<ThreeCharacterAnimationState, ThreeCharacterAnimationMapping>
	>;
	materialProfile?: "preserve" | "standard";
	defaultScale?: number;
	defaultHeightOffset?: number;
	defaultRotationOffset?: number;
	castShadow?: boolean;
	receiveShadow?: boolean;
	tags?: string[];
};

/** Externally-authored development fixture, never a CharacterRecipeV1 artifact. */
export const GOLDEN_REFERENCE_HUMANOID_ASSET: ThreeVisualAssetDefinition = {
	animations: {
		idle: {
			assetId: "golden-reference-quaternius-idle-baked-v1",
			clipName: "GoldenReference_Idle",
		},
		walk: {
			assetId: "golden-reference-quaternius-walk-baked-v1",
			clipName: "GoldenReference_Walk_InPlace",
		},
	},
	category: "character",
	castShadow: true,
	defaultHeightOffset: 0,
	defaultRotationOffset: 180,
	defaultScale: 0.75,
	id: "golden-reference-quaternius-superhero-male",
	kind: "gltf",
	materialProfile: "standard",
	name: "Golden Reference: Quaternius Superhero Male",
	receiveShadow: false,
	resourceUrlAliases: {
		"T_Eye_Normal_png.png": "T_Eye_Normal.png",
		"T_Hair_1_Normal_png.png": "T_Hair_1_Normal.png",
	},
	tags: ["character", "golden-reference", "quaternius", "skinned"],
	url: "/assets/source/quaternius/Base%20Characters/Godot%20-%20UE/Superhero_Male_FullBody.gltf",
};

export const GOLDEN_REFERENCE_IDLE_BAKED_ASSET: ThreeVisualAssetDefinition = {
	animationOnly: true,
	category: "character",
	id: "golden-reference-quaternius-idle-baked-v1",
	kind: "glb",
	materialProfile: "standard",
	name: "Golden Reference Idle (Offline Baked)",
	tags: ["animation", "golden-reference", "idle", "offline-baked"],
	url: "/assets/derived/humanoid-animations/golden-reference-v0/idle.glb",
};

export const GOLDEN_REFERENCE_WALK_BAKED_ASSET: ThreeVisualAssetDefinition = {
	animationOnly: true,
	category: "character",
	id: "golden-reference-quaternius-walk-baked-v1",
	kind: "glb",
	materialProfile: "standard",
	name: "Golden Reference Walk In Place (Offline Baked)",
	tags: ["animation", "golden-reference", "offline-baked", "walk"],
	url: "/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb",
};

/** Blender-compiled engineering geometry using the Golden compatibility rig. */
export const PROCEDURAL_MANNEQUIN_V0_ASSET: ThreeVisualAssetDefinition = {
	animations: {
		idle: {
			assetId: GOLDEN_REFERENCE_IDLE_BAKED_ASSET.id,
			clipName: "GoldenReference_Idle",
		},
		walk: {
			assetId: GOLDEN_REFERENCE_WALK_BAKED_ASSET.id,
			clipName: "GoldenReference_Walk_InPlace",
		},
	},
	category: "character",
	castShadow: true,
	defaultHeightOffset: 0,
	defaultRotationOffset: 180,
	defaultScale: 1,
	id: "procedural-mannequin-v0",
	kind: "glb",
	materialProfile: "standard",
	name: "Procedural Mannequin V0",
	receiveShadow: false,
	tags: [
		"character",
		"compiler-generated",
		"golden-skeleton",
		"procedural",
		"skinned",
	],
	url: "/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb",
};

export type ThreeVisualAssetAnalysis = {
	animationClips: { duration: number; name: string; trackCount: number }[];
	bounds: {
		center: { x: number; y: number; z: number };
		dimensions: { x: number; y: number; z: number };
		maxY: number;
		minY: number;
	};
	materialCount: number;
	materialTypes: string[];
	meshCount: number;
	boneCount: number;
	skeletonCount: number;
	skinnedMeshCount: number;
	triangleCount: number;
	sphere: { center: { x: number; y: number; z: number }; radius: number };
	textureCount: number;
	vertexCount: number;
};
const plain = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
export function analyzeThreeVisualAssetRoot(
	root: THREE.Object3D,
	animationClips: readonly THREE.AnimationClip[] = [],
): ThreeVisualAssetAnalysis {
	const bounds = new THREE.Box3().setFromObject(root),
		materials = new Set<THREE.Material>(),
		skeletons = new Set<THREE.Skeleton>(),
		textures = new Set<THREE.Texture>();
	let meshCount = 0,
		skinnedMeshCount = 0,
		triangleCount = 0,
		vertexCount = 0;
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		meshCount += 1;
		const position = object.geometry.getAttribute("position");
		vertexCount += position?.count ?? 0;
		triangleCount += object.geometry.index
			? Math.floor(object.geometry.index.count / 3)
			: Math.floor((position?.count ?? 0) / 3);
		for (const material of Array.isArray(object.material)
			? object.material
			: [object.material]) {
			materials.add(material);
			for (const value of Object.values(material))
				if (value instanceof THREE.Texture) textures.add(value);
		}
		if (object instanceof THREE.SkinnedMesh) {
			skinnedMeshCount += 1;
			skeletons.add(object.skeleton);
		}
	});
	const animationClipSummaries = animationClips.map((clip) => ({
		duration: clip.duration,
		name: clip.name,
		trackCount: clip.tracks.length,
	}));
	const materialTypes = Array.from(
			materials,
			(material) => material.type,
		).sort(),
		boneCount = Array.from(skeletons).reduce(
			(count, skeleton) => count + skeleton.bones.length,
			0,
		);
	if (bounds.isEmpty())
		return {
			animationClips: animationClipSummaries,
			bounds: {
				center: { x: 0, y: 0, z: 0 },
				dimensions: { x: 0, y: 0, z: 0 },
				maxY: 0,
				minY: 0,
			},
			materialCount: materials.size,
			materialTypes,
			meshCount,
			boneCount,
			skeletonCount: skeletons.size,
			skinnedMeshCount,
			triangleCount,
			sphere: { center: { x: 0, y: 0, z: 0 }, radius: 0 },
			textureCount: textures.size,
			vertexCount,
		};
	const center = bounds.getCenter(new THREE.Vector3()),
		dimensions = bounds.getSize(new THREE.Vector3()),
		sphere = bounds.getBoundingSphere(new THREE.Sphere());
	return {
		animationClips: animationClipSummaries,
		bounds: {
			center: plain(center),
			dimensions: plain(dimensions),
			maxY: bounds.max.y,
			minY: bounds.min.y,
		},
		materialCount: materials.size,
		materialTypes,
		meshCount,
		boneCount,
		skeletonCount: skeletons.size,
		skinnedMeshCount,
		triangleCount,
		sphere: { center: plain(sphere.center), radius: sphere.radius },
		textureCount: textures.size,
		vertexCount,
	};
}

function copyStandardMaterialProperties(
	source: THREE.MeshPhysicalMaterial,
): THREE.MeshStandardMaterial {
	const material = new THREE.MeshStandardMaterial({
		alphaMap: source.alphaMap,
		alphaTest: source.alphaTest,
		aoMap: source.aoMap,
		color: source.color,
		depthFunc: source.depthFunc,
		depthTest: source.depthTest,
		depthWrite: source.depthWrite,
		dithering: source.dithering,
		emissive: source.emissive,
		emissiveIntensity: source.emissiveIntensity,
		emissiveMap: source.emissiveMap,
		fog: source.fog,
		lightMap: source.lightMap,
		map: source.map,
		metalness: source.metalness,
		metalnessMap: source.metalnessMap,
		name: source.name,
		normalMap: source.normalMap,
		normalMapType: source.normalMapType,
		normalScale: source.normalScale,
		opacity: source.opacity,
		premultipliedAlpha: source.premultipliedAlpha,
		roughness: source.roughness,
		roughnessMap: source.roughnessMap,
		side: source.side,
		transparent: source.transparent,
		vertexColors: source.vertexColors,
	});
	Object.assign(material, {
		blending: source.blending,
		blendDst: source.blendDst,
		blendDstAlpha: source.blendDstAlpha,
		blendEquation: source.blendEquation,
		blendEquationAlpha: source.blendEquationAlpha,
		blendSrc: source.blendSrc,
		blendSrcAlpha: source.blendSrcAlpha,
		colorWrite: source.colorWrite,
		clipIntersection: source.clipIntersection,
		clipShadows: source.clipShadows,
		clippingPlanes: source.clippingPlanes,
		polygonOffset: source.polygonOffset,
		polygonOffsetFactor: source.polygonOffsetFactor,
		polygonOffsetUnits: source.polygonOffsetUnits,
		shadowSide: source.shadowSide,
		stencilWrite: source.stencilWrite,
		stencilWriteMask: source.stencilWriteMask,
		stencilFunc: source.stencilFunc,
		stencilRef: source.stencilRef,
		stencilFuncMask: source.stencilFuncMask,
		stencilFail: source.stencilFail,
		stencilZFail: source.stencilZFail,
		stencilZPass: source.stencilZPass,
		toneMapped: source.toneMapped,
	});
	return material;
}
export function prepareThreeVisualAssetMaterials(
	root: THREE.Object3D,
	definition: Pick<ThreeVisualAssetDefinition, "materialProfile">,
): void {
	if (definition.materialProfile !== "standard") return;
	const prepared = new Map<THREE.Material, THREE.Material>();
	const prepare = (material: THREE.Material) => {
		const existing = prepared.get(material);
		if (existing) return existing;
		const result =
			material instanceof THREE.MeshPhysicalMaterial
				? copyStandardMaterialProperties(material)
				: material;
		prepared.set(material, result);
		return result;
	};
	root.traverse((object) => {
		if (object instanceof THREE.Mesh)
			object.material = Array.isArray(object.material)
				? object.material.map(prepare)
				: prepare(object.material);
	});
}

type GltfLike = {
	animations?: THREE.AnimationClip[];
	scene?: THREE.Object3D;
	scenes?: THREE.Object3D[];
};
export type ThreeVisualAssetCloneType = "object3d" | "skeleton-utils";
export type ThreeVisualAssetLoaderLike = {
	loadAsync: (url: string) => Promise<GltfLike>;
	manager?: THREE.LoadingManager;
};
type LoaderFactory = () =>
	| ThreeVisualAssetLoaderLike
	| Promise<ThreeVisualAssetLoaderLike>;
export type ThreeAssetPreviewDiagnosticsEvent = {
	definitionId?: string;
	durationMs?: number;
	message?: string;
	status: "cache_hit" | "load_failure" | "load_start" | "load_success";
	url?: string;
};
const listeners = new Set<(event: ThreeAssetPreviewDiagnosticsEvent) => void>();
const emit = (event: ThreeAssetPreviewDiagnosticsEvent) => {
	listeners.forEach((listener) => {
		listener(event);
	});
};
export const subscribeThreeAssetPreviewDiagnosticsEvents = (
	listener: (event: ThreeAssetPreviewDiagnosticsEvent) => void,
) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
type CacheEntry =
	| {
			status: "loading";
			definition: ThreeVisualAssetDefinition;
			listeners: Set<() => void>;
	  }
	| {
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			root: THREE.Object3D;
			animations: THREE.AnimationClip[];
			analysis: ThreeVisualAssetAnalysis;
	  }
	| { status: "error"; definition: ThreeVisualAssetDefinition; error: unknown };
export type ThreeVisualAssetRequest =
	| { status: "missing" }
	| { status: "loading"; definition: ThreeVisualAssetDefinition }
	| { status: "error"; definition: ThreeVisualAssetDefinition; error: unknown }
	| {
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			analysis: ThreeVisualAssetAnalysis;
			cloneType: ThreeVisualAssetCloneType;
			object: THREE.Object3D;
	  };
const cache = new Map<string, CacheEntry>();
let loaderFactory: LoaderFactory = async () =>
	new (await import("three/examples/jsm/loaders/GLTFLoader.js")).GLTFLoader();
export function resolveThreeVisualAssetResourceUrl(
	definition: Pick<ThreeVisualAssetDefinition, "resourceUrlAliases">,
	url: string,
): string {
	const aliases = definition.resourceUrlAliases;
	if (!aliases) return url;
	const [path, suffix = ""] = url.split(/([?#].*)/, 2),
		slash = path.lastIndexOf("/"),
		name = slash === -1 ? path : path.slice(slash + 1),
		alias = aliases[name];
	return alias
		? `${slash === -1 ? "" : path.slice(0, slash + 1)}${alias}${suffix}`
		: url;
}
function start(
	definition: ThreeVisualAssetDefinition,
	key: string,
	onStateChange?: () => void,
) {
	const entry: Extract<CacheEntry, { status: "loading" }> = {
		definition,
		listeners: new Set(onStateChange ? [onStateChange] : []),
		status: "loading",
	};
	cache.set(key, entry);
	emit({
		definitionId: definition.id,
		status: "load_start",
		url: definition.url,
	});
	Promise.resolve(loaderFactory())
		.then((loader) => {
			if (loader.manager && definition.resourceUrlAliases)
				loader.manager.setURLModifier((url) =>
					resolveThreeVisualAssetResourceUrl(definition, url),
				);
			return loader.loadAsync(definition.url);
		})
		.then((gltf) => {
			const root = gltf.scene ?? gltf.scenes?.[0];
			if (!root)
				throw new Error(`Three visual asset "${definition.id}" has no scene.`);
			prepareThreeVisualAssetMaterials(root, definition);
			cache.set(key, {
				analysis: analyzeThreeVisualAssetRoot(root, gltf.animations),
				animations: gltf.animations ?? [],
				definition,
				root,
				status: "loaded",
			});
			emit({
				definitionId: definition.id,
				status: "load_success",
				url: definition.url,
			});
		})
		.catch((error) => {
			cache.set(key, { definition, error, status: "error" });
			emit({
				definitionId: definition.id,
				message: error instanceof Error ? error.message : String(error),
				status: "load_failure",
				url: definition.url,
			});
		})
		.finally(() => {
			for (const listener of entry.listeners) listener();
			entry.listeners.clear();
		});
	return entry;
}
export function getThreeVisualAssetCloneType(
	analysis: Pick<ThreeVisualAssetAnalysis, "skinnedMeshCount">,
): ThreeVisualAssetCloneType {
	return analysis.skinnedMeshCount > 0 ? "skeleton-utils" : "object3d";
}
export function cloneThreeVisualAssetRoot(
	root: THREE.Object3D,
	cloneType: ThreeVisualAssetCloneType = root.getObjectByProperty(
		"isSkinnedMesh",
		true,
	)
		? "skeleton-utils"
		: "object3d",
): THREE.Object3D {
	return cloneType === "skeleton-utils"
		? cloneSkeleton(root)
		: root.clone(true);
}
export function requestThreeVisualAsset(
	definition: ThreeVisualAssetDefinition | undefined,
	options: { onStateChange?: () => void } = {},
): ThreeVisualAssetRequest {
	if (!definition) return { status: "missing" };
	const key = definition.id || definition.url,
		existing = cache.get(key);
	if (existing?.status === "loaded") {
		const cloneType = getThreeVisualAssetCloneType(existing.analysis);
		emit({
			definitionId: definition.id,
			status: "cache_hit",
			url: definition.url,
		});
		return {
			analysis: existing.analysis,
			cloneType,
			definition,
			object: cloneThreeVisualAssetRoot(existing.root, cloneType),
			status: "loaded",
		};
	}
	if (existing?.status === "error") {
		emit({
			definitionId: definition.id,
			message:
				existing.error instanceof Error
					? existing.error.message
					: String(existing.error),
			status: "cache_hit",
			url: definition.url,
		});
		return { definition, error: existing.error, status: "error" };
	}
	if (existing?.status === "loading") {
		emit({
			definitionId: definition.id,
			status: "cache_hit",
			url: definition.url,
		});
		options.onStateChange && existing.listeners.add(options.onStateChange);
		return { definition, status: "loading" };
	}
	return {
		definition,
		status: start(definition, key, options.onStateChange).status,
	};
}
export type ThreeVisualAssetAnimationRequest =
	| { status: "missing" }
	| { status: "loading"; definition: ThreeVisualAssetDefinition }
	| { status: "error"; definition: ThreeVisualAssetDefinition; error: unknown }
	| {
			status: "loaded";
			definition: ThreeVisualAssetDefinition;
			clip: THREE.AnimationClip;
	  }
	| { status: "missing_clip"; definition: ThreeVisualAssetDefinition };
export function requestThreeVisualAssetAnimationClip(
	definition: ThreeVisualAssetDefinition | undefined,
	clipName: string,
	options: { onStateChange?: () => void } = {},
): ThreeVisualAssetAnimationRequest {
	if (!definition) return { status: "missing" };
	const key = definition.id || definition.url,
		existing = cache.get(key);
	if (existing?.status === "loaded") {
		const clip = existing.animations.find(
			(candidate) => candidate.name === clipName,
		);
		return clip
			? { clip, definition, status: "loaded" }
			: { definition, status: "missing_clip" };
	}
	if (existing?.status === "error")
		return { definition, error: existing.error, status: "error" };
	if (existing?.status === "loading") {
		options.onStateChange && existing.listeners.add(options.onStateChange);
		return { definition, status: "loading" };
	}
	start(definition, key, options.onStateChange);
	return { definition, status: "loading" };
}
export function clearThreeVisualAssetCacheForTests() {
	cache.clear();
}
export function setThreeVisualAssetLoaderFactoryForTests(
	factory: LoaderFactory | undefined,
) {
	const previous = loaderFactory;
	loaderFactory =
		factory ??
		(async () =>
			new (
				await import("three/examples/jsm/loaders/GLTFLoader.js")
			).GLTFLoader());
	return () => {
		loaderFactory = previous;
	};
}
