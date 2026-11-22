import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { BOW } from "../../data/bow";
import { SWORD } from "../../data/sword";
import {
	requestThreeVisualAsset,
	requestThreeVisualAssetAnimationClip,
	type ThreeVisualAssetAnalysis,
} from "../../runtime/three/threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type { AssetCreatorClip, AssetCreatorVector } from "../../types/game";

type RotationKey = AssetCreatorClip["keys"][number];
type ClipStatus = "loading" | "ready" | "incompatible" | "unavailable";

type ClipSource = {
	id: string;
	name: string;
	sourceAssetId: string;
	sourceClipName: string;
	sourceName: string;
	loop: boolean;
	variant?: AssetCreatorClip;
};

export type AssetCreatorClipRow = ClipSource & {
	status: ClipStatus | "unchecked";
	duration?: number;
};

type TrackWithInterpolant = THREE.QuaternionKeyframeTrack & {
	createInterpolant: ((result?: Float32Array) => THREE.Interpolant) & {
		isInterpolantFactoryMethodGLTFCubicSpline?: boolean;
	};
};

const NO_EMBEDDED_CLIPS: ThreeVisualAssetAnalysis["animationClips"] = [];
const KEY_TIME_TOLERANCE = 0.00001;

function parseTrack(name: string) {
	try {
		return THREE.PropertyBinding.parseTrackName(name);
	} catch {
		return undefined;
	}
}

/** Validate every target before passing a clip to the selected model's mixer. */
export function assetCreatorClipFitsRig(
	clip: THREE.AnimationClip,
	nodes: ReadonlySet<string>,
): boolean {
	return (
		Number.isFinite(clip.duration) &&
		clip.duration > 0 &&
		clip.tracks.length > 0 &&
		clip.tracks.every((track) => {
			const target = parseTrack(track.name);
			return Boolean(
				target &&
					(!target.nodeName || nodes.has(target.nodeName)) &&
					(target.objectName !== "bones" || nodes.has(target.objectIndex)),
			);
		})
	);
}

export function getAssetCreatorBoneTrack(
	clip: THREE.AnimationClip | undefined,
	bone: string,
): THREE.QuaternionKeyframeTrack | undefined {
	if (!bone) return undefined;
	return clip?.tracks.find((track): track is THREE.QuaternionKeyframeTrack => {
		if (!(track instanceof THREE.QuaternionKeyframeTrack)) return false;
		const target = parseTrack(track.name);
		return Boolean(
			target?.propertyName === "quaternion" &&
				!target.propertyIndex &&
				(target.objectName === "bones"
					? target.objectIndex === bone
					: !target.objectName && target.nodeName === bone) &&
				(track.getValueSize() === 4 ||
					(track.getValueSize() === 12 &&
						(track as TrackWithInterpolant).createInterpolant
							.isInterpolantFactoryMethodGLTFCubicSpline)),
		);
	});
}

function trackQuaternion(track: THREE.QuaternionKeyframeTrack, time: number) {
	const values = (track as TrackWithInterpolant)
		.createInterpolant(new Float32Array(4))
		.evaluate(time);
	return new THREE.Quaternion(values[0], values[1], values[2], values[3]);
}

export function readAssetCreatorRotation(
	clip: THREE.AnimationClip | undefined,
	bone: string,
	time: number,
): AssetCreatorVector | undefined {
	const track = getAssetCreatorBoneTrack(clip, bone);
	if (!track) return undefined;
	const rotation = new THREE.Euler().setFromQuaternion(
		trackQuaternion(track, time),
	);
	return {
		x: THREE.MathUtils.radToDeg(rotation.x),
		y: THREE.MathUtils.radToDeg(rotation.y),
		z: THREE.MathUtils.radToDeg(rotation.z),
	};
}

export function upsertAssetCreatorKey(
	keys: RotationKey[],
	key: RotationKey,
): RotationKey[] {
	return [
		...keys.filter(
			(existing) =>
				existing.bone !== key.bone ||
				Math.abs(existing.time - key.time) > KEY_TIME_TOLERANCE,
		),
		key,
	].sort((a, b) => a.time - b.time);
}

function writeTrackRotation(
	track: THREE.QuaternionKeyframeTrack,
	time: number,
	rotation: AssetCreatorVector,
) {
	const quaternion = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(
			THREE.MathUtils.degToRad(rotation.x),
			THREE.MathUtils.degToRad(rotation.y),
			THREE.MathUtils.degToRad(rotation.z),
		),
	);
	// Select the source hemisphere so cubic interpolation stays continuous.
	if (quaternion.dot(trackQuaternion(track, time)) < 0)
		quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
	const stride = track.getValueSize();
	const valueOffset = stride === 12 ? 4 : 0;
	const existing = track.times.findIndex(
		(sample) => Math.abs(sample - time) <= KEY_TIME_TOLERANCE,
	);
	if (existing !== -1) {
		track.values.set(quaternion.toArray(), existing * stride + valueOffset);
		return;
	}

	const following = track.times.findIndex((sample) => sample > time);
	const insert = following === -1 ? track.times.length : following;
	const times = new Float32Array(track.times.length + 1);
	const values = new Float32Array(track.values.length + stride);
	const offset = insert * stride;
	times.set(track.times.subarray(0, insert));
	times[insert] = time;
	times.set(track.times.subarray(insert), insert + 1);
	values.set(track.values.subarray(0, offset));
	// For a new cubic key, the adjacent four-value tangent slots start at zero.
	values.set(quaternion.toArray(), offset + valueOffset);
	values.set(track.values.subarray(offset), offset + stride);
	track.times = times;
	track.values = values;
}

export function applyAssetCreatorClipEdits(
	clip: THREE.AnimationClip,
	variant: AssetCreatorClip,
): THREE.AnimationClip {
	const edited = clip.clone();
	edited.name = variant.name;
	for (const key of variant.keys) {
		const track = getAssetCreatorBoneTrack(edited, key.bone);
		if (
			track &&
			[key.time, key.rotation.x, key.rotation.y, key.rotation.z].every(
				Number.isFinite,
			)
		)
			writeTrackRotation(
				track,
				THREE.MathUtils.clamp(key.time, 0, edited.duration),
				key.rotation,
			);
	}
	return edited;
}

function clipId(sourceId: string, clipName: string) {
	return `builtin:${sourceId}:${clipName}`;
}

const singlePlay = new Set([
	"attack",
	"bow attack",
	"defeated",
	"hit",
	"interact",
	"jump",
	"land",
	"open",
	"pickup",
	"sword attack",
]);

function makeClipSource(
	registry: ReadonlyMap<string, ThreeVisualAssetDefinition>,
	sourceAssetId: string,
	sourceClipName: string,
	label: string,
): ClipSource {
	return {
		id: clipId(sourceAssetId, sourceClipName),
		name: label.replace(/^./, (letter) => letter.toUpperCase()),
		sourceAssetId,
		sourceClipName,
		sourceName: registry.get(sourceAssetId)?.name ?? sourceAssetId,
		loop: !singlePlay.has(label),
	};
}

function getMappedSources(
	asset: ThreeVisualAssetDefinition,
	registry: ReadonlyMap<string, ThreeVisualAssetDefinition>,
) {
	const clips = Object.entries(asset.animations ?? {}).map(([state, mapping]) =>
		makeClipSource(
			registry,
			mapping.assetId ?? asset.id,
			mapping.clipName,
			state,
		),
	);
	if (asset.propAnimations)
		clips.push(
			makeClipSource(registry, asset.id, asset.propAnimations.open, "open"),
		);
	return clips;
}

function useEmbeddedClips(asset: ThreeVisualAssetDefinition | undefined) {
	const [result, setResult] = useState<{
		asset: ThreeVisualAssetDefinition;
		clips: ThreeVisualAssetAnalysis["animationClips"];
	}>();
	useEffect(() => {
		if (!asset) return;
		let live = true;
		const refresh = () => {
			if (!live) return;
			const request = requestThreeVisualAsset(asset, {
				onStateChange: refresh,
			});
			if (request.status === "loaded")
				setResult({ asset, clips: request.analysis.animationClips });
		};
		refresh();
		return () => {
			live = false;
		};
	}, [asset]);
	return result?.asset.id === asset?.id
		? (result?.clips ?? NO_EMBEDDED_CLIPS)
		: NO_EMBEDDED_CLIPS;
}

function readClip(
	registry: ReadonlyMap<string, ThreeVisualAssetDefinition>,
	selection: Pick<AssetCreatorClip, "sourceAssetId" | "sourceClipName">,
	nodes: ReadonlySet<string>,
	onStateChange: () => void,
): { clip?: THREE.AnimationClip; status: ClipStatus } {
	const request = requestThreeVisualAssetAnimationClip(
		registry.get(selection.sourceAssetId),
		selection.sourceClipName,
		{ onStateChange },
	);
	if (request.status === "loaded") {
		if (nodes.size === 0) return { status: "loading" };
		return assetCreatorClipFitsRig(request.clip, nodes)
			? { status: "ready", clip: request.clip }
			: { status: "incompatible" };
	}
	return { status: request.status === "loading" ? "loading" : "unavailable" };
}

function useRegistry(
	asset: ThreeVisualAssetDefinition | undefined,
	registry: readonly ThreeVisualAssetDefinition[],
) {
	return useMemo(() => {
		const definitions = new Map(
			registry.map((definition) => [definition.id, definition]),
		);
		if (asset) definitions.set(asset.id, asset);
		return definitions;
	}, [asset, registry]);
}

export function useAssetCreatorClips(
	asset: ThreeVisualAssetDefinition | undefined,
	registry: readonly ThreeVisualAssetDefinition[],
	variants: readonly AssetCreatorClip[],
	nodeNames: readonly string[],
	showAll: boolean,
): AssetCreatorClipRow[] {
	const definitions = useRegistry(asset, registry);
	const embedded = useEmbeddedClips(asset);
	const sources = useMemo(() => {
		const selected = asset ? getMappedSources(asset, definitions) : [];
		if (asset)
			for (const clip of embedded)
				selected.push(
					makeClipSource(definitions, asset.id, clip.name, clip.name),
				);

		const weapons = [
			makeClipSource(
				definitions,
				SWORD.attackAnimation.assetId,
				SWORD.attackAnimation.clipName,
				"sword attack",
			),
			makeClipSource(
				definitions,
				BOW.attackAnimation.assetId,
				BOW.attackAnimation.clipName,
				"bow attack",
			),
		];
		const catalog = [...definitions.values()].flatMap((definition) =>
			getMappedSources(definition, definitions),
		);
		const isGolden = asset?.tags?.some(
			(tag) =>
				tag === "golden-skeleton" ||
				tag === "golden-reference" ||
				tag === "finalised",
		);
		if (isGolden)
			selected.push(
				...weapons,
				...catalog.filter((clip) =>
					definitions
						.get(clip.sourceAssetId)
						?.tags?.includes("golden-skeleton"),
				),
			);

		const localClipIds = new Set(selected.map((clip) => clip.id));
		const all = new Map<string, ClipSource>();
		for (const clip of [...selected, ...weapons, ...catalog])
			if (!all.has(clip.id)) all.set(clip.id, clip);
		for (const variant of variants) {
			const sourceId = clipId(variant.sourceAssetId, variant.sourceClipName);
			if (localClipIds.has(sourceId) || !all.has(sourceId))
				localClipIds.add(variant.id);
			all.set(variant.id, {
				...makeClipSource(
					definitions,
					variant.sourceAssetId,
					variant.sourceClipName,
					variant.name,
				),
				id: variant.id,
				name: variant.name,
				loop: variant.loop,
				variant,
			});
		}
		return [...all.values()].flatMap((clip) => {
			const local = localClipIds.has(clip.id);
			return showAll || local ? [{ clip, local }] : [];
		});
	}, [asset, definitions, embedded, showAll, variants]);

	const [result, setResult] = useState<{
		sources: typeof sources;
		nodeNames: readonly string[];
		rows: AssetCreatorClipRow[];
	}>();
	useEffect(() => {
		let live = true;
		const nodes = new Set(nodeNames);
		const refresh = () => {
			if (!live) return;
			const rows = sources.map(({ clip, local }): AssetCreatorClipRow => {
				if (!local) return { ...clip, status: "unchecked" };
				const result = readClip(definitions, clip, nodes, refresh);
				return {
					...clip,
					status: result.status,
					duration: result.clip?.duration,
				};
			});
			setResult({ sources, nodeNames, rows });
		};
		refresh();
		return () => {
			live = false;
		};
	}, [definitions, nodeNames, sources]);
	const rows =
		result?.sources === sources && result.nodeNames === nodeNames
			? result.rows
			: [];
	return showAll
		? rows
		: rows.filter((row) => row.status === "ready" || row.status === "loading");
}

export function useAssetCreatorClip(
	asset: ThreeVisualAssetDefinition | undefined,
	registry: readonly ThreeVisualAssetDefinition[],
	selection: AssetCreatorClipRow | AssetCreatorClip | undefined,
	nodeNames: readonly string[],
): { clip?: THREE.AnimationClip; status: ClipStatus | "idle" } {
	const definitions = useRegistry(asset, registry);
	const sourceAssetId = selection?.sourceAssetId;
	const sourceClipName = selection?.sourceClipName;
	const variant = selection
		? "keys" in selection
			? selection
			: selection.variant
		: undefined;
	const [result, setResult] = useState<{
		sourceAssetId: string;
		sourceClipName: string;
		nodeNames: readonly string[];
		clip?: THREE.AnimationClip;
		status: ClipStatus;
	}>();
	useEffect(() => {
		if (!sourceAssetId || !sourceClipName) return;
		let live = true;
		const nodes = new Set(nodeNames);
		const refresh = () => {
			if (!live) return;
			setResult({
				sourceAssetId,
				sourceClipName,
				nodeNames,
				...readClip(
					definitions,
					{ sourceAssetId, sourceClipName },
					nodes,
					refresh,
				),
			});
		};
		refresh();
		return () => {
			live = false;
		};
	}, [definitions, nodeNames, sourceAssetId, sourceClipName]);
	const current =
		result?.sourceAssetId === sourceAssetId &&
		result?.sourceClipName === sourceClipName &&
		result?.nodeNames === nodeNames
			? result
			: undefined;
	const baseClip = current?.clip;
	const clip = useMemo(
		() =>
			baseClip && variant
				? applyAssetCreatorClipEdits(baseClip, variant)
				: baseClip,
		[baseClip, variant],
	);
	return { clip, status: current?.status ?? (selection ? "loading" : "idle") };
}
