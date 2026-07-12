import * as THREE from "three";
import { requestThreeVisualAssetAnimationClip } from "./threeVisualAssetLoader";
import {
	getThreeVisualAssetDefinition,
	type ThreeCharacterAnimationState,
	type ThreeVisualAssetDefinition,
} from "./threeVisualAssetRegistry";

export type CharacterAnimationSemanticState = ThreeCharacterAnimationState;

export type CharacterAnimationContext = {
	defeated: boolean;
	moving: boolean;
};

export type CharacterAnimationPreparationResult =
	| { status: "prepared"; clip: THREE.AnimationClip }
	| { status: "incompatible"; reason: string };

export type ThreeCharacterAnimationControllerStats = {
	activeLoopingActions: number;
	incompatibleClipCount: number;
	loadingSourceCount: number;
	missingClipCount: number;
	oneShotActionsTriggered: number;
	semanticState: CharacterAnimationSemanticState;
	sourceAssetIds: string[];
};

export type ThreeCharacterAnimationController = {
	dispose: () => void;
	getStats: () => ThreeCharacterAnimationControllerStats;
	refresh: () => void;
	sync: (context: CharacterAnimationContext) => void;
	triggerAttack: () => void;
	update: (deltaSeconds: number) => void;
};

const TRANSITION_SECONDS = 0.12;
const preparedClipCache = new Map<string, THREE.AnimationClip>();

function getTrackTargetName(trackName: string): string | undefined {
	const separator = trackName.lastIndexOf(".");
	if (separator <= 0) {
		return undefined;
	}
	return trackName.slice(0, separator);
}

function getTrackProperty(trackName: string): string | undefined {
	const separator = trackName.lastIndexOf(".");
	return separator < 0 ? undefined : trackName.slice(separator + 1);
}

function getObjectNames(root: THREE.Object3D): Set<string> {
	const names = new Set<string>();
	root.traverse((object) => {
		if (object.name) {
			names.add(object.name);
		}
	});
	return names;
}

function neutralizeHorizontalRootMotion(clip: THREE.AnimationClip): void {
	for (const track of clip.tracks) {
		if (
			getTrackTargetName(track.name) !== "Hips" ||
			getTrackProperty(track.name) !== "position" ||
			!(track instanceof THREE.VectorKeyframeTrack)
		) {
			continue;
		}
		const initialX = track.values[0];
		const initialZ = track.values[2];
		for (let index = 0; index < track.values.length; index += 3) {
			track.values[index] = initialX;
			track.values[index + 2] = initialZ;
		}
	}
}

function getPreparedClipCacheKey(assetId: string, clipName: string): string {
	return `${assetId}:${clipName}`;
}

/**
 * Patchbeard sources animate the Hips bone, including horizontal movement.
 * The wrapper remains runtime-positioned, so prepared clips freeze only the
 * horizontal Hips keys and retain vertical/lower-body motion.
 */
export function prepareThreeCharacterAnimationClip(
	assetId: string,
	clip: THREE.AnimationClip,
	root: THREE.Object3D,
): CharacterAnimationPreparationResult {
	const objectNames = getObjectNames(root);
	for (const track of clip.tracks) {
		const targetName = getTrackTargetName(track.name);
		if (targetName && !objectNames.has(targetName)) {
			return {
				reason: `Track target "${targetName}" is absent from the rendered skeleton.`,
				status: "incompatible",
			};
		}
	}

	const cacheKey = getPreparedClipCacheKey(assetId, clip.name);
	let prepared = preparedClipCache.get(cacheKey);
	if (!prepared) {
		prepared = clip.clone();
		neutralizeHorizontalRootMotion(prepared);
		preparedClipCache.set(cacheKey, prepared);
	}
	return { clip: prepared, status: "prepared" };
}

export function clearThreeCharacterAnimationClipCacheForTests(): void {
	preparedClipCache.clear();
}

export function resolveCharacterAnimationState(
	context: CharacterAnimationContext & { attackRequested?: boolean },
): CharacterAnimationSemanticState {
	if (context.defeated) {
		return "defeated";
	}
	if (context.attackRequested) {
		return "attack";
	}
	return context.moving ? "walk" : "idle";
}

function getSourceAssetId(
	asset: ThreeVisualAssetDefinition,
	state: Exclude<CharacterAnimationSemanticState, "idle">,
): string | undefined {
	return asset.animations?.[state]?.assetId ?? asset.id;
}

function getAnimationMapping(
	asset: ThreeVisualAssetDefinition,
	state: Exclude<CharacterAnimationSemanticState, "idle">,
) {
	return asset.animations?.[state];
}

export function createThreeCharacterAnimationController({
	asset,
	root,
}: {
	asset: ThreeVisualAssetDefinition;
	root: THREE.Object3D;
}): ThreeCharacterAnimationController {
	const mixer = new THREE.AnimationMixer(root);
	const actions = new Map<
		CharacterAnimationSemanticState,
		THREE.AnimationAction
	>();
	const loadingSourceIds = new Set<string>();
	const pendingSourceIds = new Set<string>();
	const reportedIssueKeys = new Set<string>();
	const sourceAssetIds = new Set<string>();
	let activeAction: THREE.AnimationAction | undefined;
	let currentContext: CharacterAnimationContext = {
		defeated: false,
		moving: false,
	};
	let oneShotState: "attack" | "defeated" | undefined;
	let semanticState: CharacterAnimationSemanticState = "idle";
	let missingClipCount = 0;
	let incompatibleClipCount = 0;
	let oneShotActionsTriggered = 0;
	let disposed = false;

	const reportIssueOnce = (key: string, type: "missing" | "incompatible") => {
		if (reportedIssueKeys.has(key)) {
			return;
		}
		reportedIssueKeys.add(key);
		if (type === "missing") {
			missingClipCount += 1;
		} else {
			incompatibleClipCount += 1;
		}
	};

	const applySemanticState = (
		nextState: CharacterAnimationSemanticState,
		forceRestart = false,
	) => {
		const nextAction = actions.get(nextState);
		if (
			semanticState === nextState &&
			activeAction === nextAction &&
			!forceRestart
		) {
			return;
		}
		semanticState = nextState;
		if (!nextAction) {
			// V1 idle intentionally has no action: Patchbeard's 0.033s base clip
			// is treated as its bind/rest pose rather than a stationary walk loop.
			activeAction?.fadeOut(TRANSITION_SECONDS);
			activeAction = undefined;
			return;
		}
		const isOneShot = nextState === "attack" || nextState === "defeated";
		nextAction.enabled = true;
		nextAction.setEffectiveTimeScale(1);
		nextAction.setEffectiveWeight(1);
		nextAction.setLoop(isOneShot ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
		nextAction.clampWhenFinished = nextState === "defeated";
		nextAction.reset().play();
		if (activeAction && activeAction !== nextAction) {
			nextAction.crossFadeFrom(activeAction, TRANSITION_SECONDS, false);
		}
		activeAction = nextAction;
	};

	const syncResolvedState = () => {
		applySemanticState(
			resolveCharacterAnimationState({
				...currentContext,
				attackRequested: oneShotState === "attack",
			}),
		);
	};

	const handleFinished = (event: { action?: THREE.AnimationAction }) => {
		if (event.action !== activeAction || semanticState === "defeated") {
			return;
		}
		if (semanticState === "attack") {
			oneShotState = undefined;
			activeAction = undefined;
			syncResolvedState();
		}
	};
	mixer.addEventListener("finished", handleFinished);

	const refresh = () => {
		if (disposed) {
			return;
		}
		for (const state of ["walk", "attack", "defeated"] as const) {
			if (actions.has(state)) {
				continue;
			}
			const mapping = getAnimationMapping(asset, state);
			if (!mapping) {
				continue;
			}
			const sourceAssetId = getSourceAssetId(asset, state);
			const sourceAsset = getThreeVisualAssetDefinition(sourceAssetId);
			if (sourceAssetId) {
				sourceAssetIds.add(sourceAssetId);
			}
			const sourceKey = `${sourceAssetId ?? "missing"}:${mapping.clipName}`;
			const request = requestThreeVisualAssetAnimationClip(
				sourceAsset,
				mapping.clipName,
				{
					onStateChange: pendingSourceIds.has(sourceKey)
						? undefined
						: () => {
								pendingSourceIds.delete(sourceKey);
								loadingSourceIds.delete(sourceKey);
								refresh();
							},
				},
			);
			if (request.status === "loading") {
				loadingSourceIds.add(sourceKey);
				pendingSourceIds.add(sourceKey);
				continue;
			}
			loadingSourceIds.delete(sourceKey);
			if (request.status !== "loaded") {
				reportIssueOnce(sourceKey, "missing");
				continue;
			}
			const prepared = prepareThreeCharacterAnimationClip(
				request.definition.id,
				request.clip,
				root,
			);
			if (prepared.status === "incompatible") {
				reportIssueOnce(`${sourceKey}:${prepared.reason}`, "incompatible");
				continue;
			}
			actions.set(state, mixer.clipAction(prepared.clip));
		}
		syncResolvedState();
	};

	refresh();

	return {
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			mixer.removeEventListener("finished", handleFinished);
			mixer.stopAllAction();
			mixer.uncacheRoot(root);
			actions.clear();
		},
		getStats: () => ({
			activeLoopingActions:
				semanticState === "walk" && activeAction?.enabled ? 1 : 0,
			incompatibleClipCount,
			loadingSourceCount: loadingSourceIds.size,
			missingClipCount,
			oneShotActionsTriggered,
			semanticState,
			sourceAssetIds: Array.from(sourceAssetIds).sort(),
		}),
		refresh,
		sync: (context) => {
			currentContext = context;
			if (context.defeated) {
				oneShotState = "defeated";
			}
			syncResolvedState();
		},
		triggerAttack: () => {
			if (currentContext.defeated || disposed) {
				return;
			}
			oneShotState = "attack";
			oneShotActionsTriggered += 1;
			applySemanticState("attack", true);
		},
		update: (deltaSeconds) => {
			if (!disposed) {
				mixer.update(Math.max(0, deltaSeconds));
			}
		},
	};
}
