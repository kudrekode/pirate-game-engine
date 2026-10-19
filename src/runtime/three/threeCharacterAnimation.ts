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
	sprinting?: boolean;
	airborne?: boolean;
	movementPhase?: "grounded" | "jump" | "fall" | "land";
	movementSpeed?: number;
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
	/** Available only after a loaded, finite death action has started. */
	getDefeatPlayback: () => { duration: number; finished: boolean } | undefined;
	refresh: () => void;
	sync: (context: CharacterAnimationContext) => void;
	triggerAttack: () => void;
	triggerHit: () => void;
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
	context: CharacterAnimationContext & {
		attackRequested?: boolean;
		hitRequested?: boolean;
	},
): CharacterAnimationSemanticState {
	if (context.defeated) {
		return "defeated";
	}
	if (context.hitRequested) {
		return "hit";
	}
	if (context.attackRequested) {
		return "attack";
	}
	if (context.airborne)
		return context.movementPhase === "fall" ? "fall" : "jump";
	if (context.movementPhase === "land") return "land";
	return context.moving ? (context.sprinting ? "run" : "walk") : "idle";
}

function getSourceAssetId(
	asset: ThreeVisualAssetDefinition,
	state: CharacterAnimationSemanticState,
): string | undefined {
	return asset.animations?.[state]?.assetId ?? asset.id;
}

function getAnimationMapping(
	asset: ThreeVisualAssetDefinition,
	state: CharacterAnimationSemanticState,
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
	let oneShotState: "attack" | "hit" | "defeated" | undefined;
	let defeatFinished = false;
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
		const fallback =
			nextState === "run"
				? "walk"
				: nextState === "jump" || nextState === "fall"
					? "idle"
					: nextState === "land"
						? currentContext.moving
							? currentContext.sprinting && actions.has("run")
								? "run"
								: "walk"
							: "idle"
						: undefined;
		const nextAction =
			actions.get(nextState) ?? (fallback ? actions.get(fallback) : undefined);
		const rate =
			(nextState === "walk" || nextState === "run") &&
			currentContext.movementSpeed
				? Math.max(
						0.8,
						Math.min(
							1.2,
							currentContext.movementSpeed /
								(nextState === "run" ? 7.64 : 4.63),
						),
					)
				: 1;
		nextAction?.setEffectiveTimeScale(rate);
		if (
			semanticState === nextState &&
			activeAction === nextAction &&
			!forceRestart
		) {
			return;
		}
		semanticState = nextState;
		if (!nextAction) {
			// Assets without an authored idle mapping keep their bind/rest pose.
			activeAction?.fadeOut(TRANSITION_SECONDS);
			activeAction = undefined;
			return;
		}
		const isOneShot =
			nextState === "attack" ||
			nextState === "hit" ||
			nextState === "defeated" ||
			((nextState === "jump" || nextState === "land") &&
				actions.has(nextState));
		if (nextState === "defeated") defeatFinished = false;
		nextAction.enabled = true;
		nextAction.setEffectiveTimeScale(rate);
		nextAction.setEffectiveWeight(1);
		nextAction.setLoop(isOneShot ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
		// Hold a one-shot recovery pose during the ordinary short return blend.
		nextAction.clampWhenFinished = isOneShot;
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
				hitRequested: oneShotState === "hit",
			}),
		);
	};

	const handleFinished = (event: { action?: THREE.AnimationAction }) => {
		if (event.action !== activeAction) {
			return;
		}
		if (semanticState === "defeated") {
			defeatFinished = true;
			return;
		}
		if (semanticState === "attack" || semanticState === "hit") {
			oneShotState = undefined;
			syncResolvedState();
		}
	};
	mixer.addEventListener("finished", handleFinished);

	const refresh = () => {
		if (disposed) {
			return;
		}
		for (const state of [
			"idle",
			"walk",
			"run",
			"jump",
			"fall",
			"land",
			"attack",
			"hit",
			"defeated",
		] as const) {
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
			if (
				!Number.isFinite(prepared.clip.duration) ||
				prepared.clip.duration <= 0
			) {
				reportIssueOnce(sourceKey, "incompatible");
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
		getDefeatPlayback: () => {
			const action = actions.get("defeated");
			return !disposed &&
				semanticState === "defeated" &&
				activeAction === action &&
				action
				? { duration: action.getClip().duration, finished: defeatFinished }
				: undefined;
		},
		getStats: () => ({
			activeLoopingActions:
				(semanticState === "idle" ||
					semanticState === "walk" ||
					semanticState === "run" ||
					semanticState === "fall") &&
				activeAction?.enabled
					? 1
					: 0,
			incompatibleClipCount,
			loadingSourceCount: loadingSourceIds.size,
			missingClipCount,
			oneShotActionsTriggered,
			semanticState,
			sourceAssetIds: Array.from(sourceAssetIds).sort(),
		}),
		refresh,
		sync: (context) => {
			if (disposed) return;
			currentContext = context;
			if (context.defeated) {
				oneShotState = "defeated";
			}
			syncResolvedState();
		},
		triggerAttack: () => {
			// A missing/unloaded attack has no mixer finished event. Keep locomotion
			// alive and let the combat HUD present the hit/miss instead of latching.
			if (
				currentContext.defeated ||
				currentContext.airborne ||
				oneShotState === "hit" ||
				disposed ||
				!actions.has("attack")
			) {
				return;
			}
			oneShotState = "attack";
			oneShotActionsTriggered += 1;
			applySemanticState("attack", true);
		},
		triggerHit: () => {
			if (currentContext.defeated || disposed || !actions.has("hit")) return;
			oneShotState = "hit";
			oneShotActionsTriggered += 1;
			applySemanticState("hit", true);
		},
		update: (deltaSeconds) => {
			if (!disposed) {
				mixer.update(Math.max(0, deltaSeconds));
			}
		},
	};
}
