import * as THREE from "three";
import { BOW } from "../../data/bow";
import type { CinematicActorAnimation } from "../../types/game";
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
	seated?: boolean;
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
	activeClip?: string;
	bowPhase?: "draw" | "hold" | "release";
	clipTime?: number;
};

export type ThreeCharacterAnimationController = {
	dispose: () => void;
	getStats: () => ThreeCharacterAnimationControllerStats;
	/** Available only after a loaded, finite death action has started. */
	getDefeatPlayback: () => { duration: number; finished: boolean } | undefined;
	refresh: () => void;
	setCinematicAnimation?: (
		animation: CinematicActorAnimation | undefined,
		cueKey?: number,
		previewSeconds?: number,
	) => void;
	sync: (context: CharacterAnimationContext) => void;
	syncBowDraw: (charge: number | undefined) => void;
	triggerAttack: (variant?: "sword" | "bow", impactMs?: number) => void;
	triggerNpcAttack: (clip: string, durationMs?: number) => void;
	syncSwordReady?: (raised: boolean, windupMs?: number) => void;
	triggerGuardImpact?: () => void;
	triggerHit: (interrupt?: boolean) => void;
	triggerInteraction: (state: "interact" | "pickup") => boolean;
	update: (deltaSeconds: number) => void;
};

const TRANSITION_SECONDS = 0.12;
// GoldenSword_Attack_V1 loads the shoulder at 0.15 s and delivers at 0.30 s.
const SWORD_LOAD_SECONDS = 0.15;
const SWORD_CONTACT_SECONDS = 0.3;
type AttackClipKey = `npc:${string}`;
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

/** The baked gait closes on a duplicate pose. Blender gave the first and
 * last samples flat handles, stopping every limb together once per stride.
 * Join the two adjacent slopes on the playback copy. Keep genuine turning
 * points flat and every authored pose, contact time and interior handle intact. */
function joinBakedGaitTangents(clip: THREE.AnimationClip) {
	for (const track of clip.tracks) {
		const { times, values } = track;
		const stride = track.getValueSize();
		// glTF cubic TRS keys contain three tuples: in-tangent, pose, out-tangent.
		if (times.length < 3 || (stride !== 9 && stride !== 12)) continue;
		const size = stride / 3;
		const last = (times.length - 1) * stride;
		const incomingDt = times[times.length - 1] - times[times.length - 2];
		const outgoingDt = times[1] - times[0];
		if (incomingDt <= 0 || outgoingDt <= 0) continue;
		for (let axis = 0; axis < size; axis++) {
			const firstPose = size + axis;
			const lastPose = last + firstPose;
			if (
				Math.abs(values[firstPose] - values[lastPose]) > 1e-5 ||
				values[last + axis] !== 0 ||
				values[2 * size + axis] !== 0
			)
				continue;
			const incoming =
				(values[lastPose] - values[lastPose - stride]) / incomingDt;
			const outgoing =
				(values[firstPose + stride] - values[firstPose]) / outgoingDt;
			// The harmonic mean avoids overshooting a slow contact on either side.
			const tangent =
				incoming * outgoing > 0
					? (2 * incoming * outgoing) / (incoming + outgoing)
					: 0;
			values[last + axis] = tangent;
			values[2 * size + axis] = tangent;
		}
	}
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
		if (
			(assetId === "golden-reference-quaternius-walk-baked-v1" &&
				clip.name === "GoldenReference_Walk_InPlace") ||
			(assetId === "mere-horse" && clip.name === "HorseWalk")
		)
			joinBakedGaitTangents(prepared);
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
		interactionRequested?: "interact" | "pickup";
	},
): CharacterAnimationSemanticState {
	if (context.defeated) {
		return "defeated";
	}
	if (context.seated) return "ride";
	if (context.hitRequested) {
		return "hit";
	}
	if (context.attackRequested) {
		return "attack";
	}
	if (context.interactionRequested && !context.airborne)
		return context.interactionRequested;
	if (context.airborne)
		return context.movementPhase === "fall" ? "fall" : "jump";
	if (context.movementPhase === "land") return "land";
	return context.moving ? (context.sprinting ? "run" : "walk") : "idle";
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
	attackVariants,
	npcAttackClips = [],
}: {
	asset: ThreeVisualAssetDefinition;
	root: THREE.Object3D;
	attackVariants?: Partial<
		Record<"sword" | "bow", { assetId?: string; clipName: string }>
	>;
	npcAttackClips?: string[];
}): ThreeCharacterAnimationController {
	const mixer = new THREE.AnimationMixer(root);
	const actions = new Map<
		CharacterAnimationSemanticState | "sword" | "bow" | "ward" | AttackClipKey,
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
	let oneShotState:
		| "attack"
		| "hit"
		| "defeated"
		| "interact"
		| "pickup"
		| undefined;
	let defeatFinished = false;
	let semanticState: CharacterAnimationSemanticState = "idle";
	let missingClipCount = 0;
	let incompatibleClipCount = 0;
	let oneShotActionsTriggered = 0;
	let disposed = false;
	let attackVariant: "sword" | "bow" | "ward" | AttackClipKey | undefined;
	let npcAttackDurationMs: number | undefined;
	let swordReady = false;
	let loadSeconds = 0;
	let bowDrawCharge: number | undefined;
	let cinematicAnimation: CinematicActorAnimation | undefined;
	let cinematicCueKey: number | undefined;
	let playingCinematicAnimation = false;

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
		cinematic = false,
		cut = false,
	) => {
		const fallback =
			nextState === "ride"
				? "idle"
				: nextState === "run"
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
			(!cinematic && nextState === "attack" && attackVariant
				? actions.get(attackVariant)
				: undefined) ??
			actions.get(nextState) ??
			(fallback ? actions.get(fallback) : undefined);
		const gaitSpeed =
			nextState === "walk" || nextState === "run"
				? asset.gaitSpeeds?.[nextState]
				: undefined;
		const rate =
			!cinematic &&
			(nextState === "walk" || nextState === "run") &&
			currentContext.movementSpeed
				? Math.max(
						0.8,
						Math.min(
							gaitSpeed ? 1.6 : 1.2,
							currentContext.movementSpeed /
								(gaitSpeed ?? (nextState === "run" ? 7.64 : 4.63)),
						),
					)
				: !cinematic &&
						nextState === "attack" &&
						npcAttackDurationMs &&
						nextAction
					? (nextAction.getClip().duration * 1000) / npcAttackDurationMs
					: 1;
		nextAction?.setEffectiveTimeScale(rate);
		if (
			activeAction === nextAction &&
			!forceRestart &&
			(semanticState === nextState ||
				// A rig without a run clip uses the same walk action at both speeds.
				(semanticState === "walk" && nextState === "run") ||
				(semanticState === "run" && nextState === "walk"))
		) {
			semanticState = nextState;
			return;
		}
		semanticState = nextState;
		if (!nextAction) {
			// Assets without an authored idle mapping keep their bind/rest pose.
			if (cut) activeAction?.stop();
			else activeAction?.fadeOut(TRANSITION_SECONDS);
			activeAction = undefined;
			return;
		}
		const isOneShot =
			nextState === "interact" ||
			nextState === "pickup" ||
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
			if (cut) activeAction.stop();
			else nextAction.crossFadeFrom(activeAction, TRANSITION_SECONDS, false);
		}
		activeAction = nextAction;
	};

	const syncResolvedState = (restartCinematic = false, cut = false) => {
		const cueAnimation =
			cinematicAnimation &&
			!currentContext.defeated &&
			(actions.has(cinematicAnimation) ||
				(cinematicAnimation === "run" && actions.has("walk")))
				? cinematicAnimation
				: undefined;
		const modeChanged = Boolean(cueAnimation) !== playingCinematicAnimation;
		playingCinematicAnimation = Boolean(cueAnimation);
		applySemanticState(
			cueAnimation ??
				resolveCharacterAnimationState({
					...currentContext,
					attackRequested:
						oneShotState === "attack" ||
						bowDrawCharge !== undefined ||
						swordReady,
					hitRequested: oneShotState === "hit",
					interactionRequested:
						oneShotState === "interact" || oneShotState === "pickup"
							? oneShotState
							: undefined,
				}),
			modeChanged || (playingCinematicAnimation && restartCinematic),
			playingCinematicAnimation,
			cut,
		);
	};

	const handleFinished = (event: { action?: THREE.AnimationAction }) => {
		if (event.action !== activeAction || playingCinematicAnimation) {
			return;
		}
		if (semanticState === "defeated") {
			defeatFinished = true;
			return;
		}
		if (
			semanticState === "attack" ||
			semanticState === "hit" ||
			semanticState === "interact" ||
			semanticState === "pickup"
		) {
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
			"ride",
			"jump",
			"fall",
			"land",
			"interact",
			"pickup",
			"attack",
			"hit",
			"defeated",
			"sword",
			"ward",
			"bow",
			...npcAttackClips.map((clip): AttackClipKey => `npc:${clip}`),
		] as const) {
			if (actions.has(state)) {
				continue;
			}
			const embeddedAttack = state.startsWith("npc:");
			const mapping = embeddedAttack
				? {
						clipName: state.slice(4),
						assetId: asset.attackClipSources?.[state.slice(4)] ?? asset.id,
					}
				: state === "ward"
					? asset.swordWard
					: state === "sword" || state === "bow"
						? attackVariants?.[state]
						: getAnimationMapping(
								asset,
								state as CharacterAnimationSemanticState,
							);
			if (!mapping) {
				continue;
			}
			const sourceAssetId = mapping.assetId ?? asset.id;
			const sourceAsset =
				sourceAssetId === asset.id
					? asset
					: getThreeVisualAssetDefinition(sourceAssetId);
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
					semanticState === "ride" ||
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
			activeClip: activeAction?.getClip().name,
			clipTime: activeAction?.time,
			bowPhase: playingCinematicAnimation
				? undefined
				: bowDrawCharge !== undefined
					? bowDrawCharge >= 1
						? "hold"
						: "draw"
					: semanticState === "attack" && attackVariant === "bow"
						? "release"
						: undefined,
		}),
		refresh,
		setCinematicAnimation: (animation, cueKey, previewSeconds) => {
			if (disposed) return;
			if (cinematicAnimation !== animation || cinematicCueKey !== cueKey) {
				cinematicAnimation = animation;
				cinematicCueKey = cueKey;
				syncResolvedState(true, previewSeconds !== undefined);
			}
			if (previewSeconds !== undefined && activeAction) {
				const duration = activeAction.getClip().duration;
				activeAction.time =
					activeAction.loop === THREE.LoopOnce
						? Math.min(duration, previewSeconds)
						: previewSeconds % (duration || 1);
				mixer.update(0);
			}
		},
		sync: (context) => {
			if (disposed) return;
			currentContext = context;
			if (context.seated) {
				oneShotState = undefined;
				bowDrawCharge = undefined;
			}
			if (
				context.airborne &&
				(oneShotState === "interact" || oneShotState === "pickup")
			)
				oneShotState = undefined;
			if (context.defeated) {
				bowDrawCharge = undefined;
				oneShotState = "defeated";
			}
			if (context.airborne) bowDrawCharge = undefined;
			syncResolvedState();
		},
		syncBowDraw: (charge) => {
			if (disposed) return;
			if (
				playingCinematicAnimation ||
				currentContext.defeated ||
				currentContext.airborne ||
				oneShotState === "hit" ||
				!actions.has("bow")
			)
				charge = undefined;
			const starting = bowDrawCharge === undefined && charge !== undefined;
			bowDrawCharge =
				charge === undefined ? undefined : Math.max(0, Math.min(1, charge));
			if (starting) {
				oneShotState = undefined;
				attackVariant = "bow";
				npcAttackDurationMs = undefined;
				applySemanticState("attack", true);
			}
			syncResolvedState();
			if (
				bowDrawCharge !== undefined &&
				activeAction &&
				activeAction === actions.get("bow")
			) {
				// Sample the cached action once per frame; never restart Draw or loop Hold.
				activeAction.time = bowDrawCharge * BOW.drawPoseSeconds;
				activeAction.paused = true;
			}
		},
		syncSwordReady: (raised, windupMs) => {
			const ready =
				raised &&
				!disposed &&
				!playingCinematicAnimation &&
				!currentContext.defeated &&
				actions.has("sword");
			const variant =
				windupMs === undefined && actions.has("ward") ? "ward" : "sword";
			if (ready === swordReady && (!ready || attackVariant === variant)) return;
			swordReady = ready;
			if (ready) {
				oneShotState = undefined;
				attackVariant = variant;
				loadSeconds = windupMs ? windupMs / 1000 : 0;
				npcAttackDurationMs = undefined;
				applySemanticState("attack", true);
				if (activeAction) {
					activeAction.time =
						variant === "ward" || loadSeconds ? 0 : SWORD_LOAD_SECONDS;
					activeAction.paused = true;
				}
			} else {
				if (activeAction) activeAction.paused = false;
				syncResolvedState();
			}
		},
		triggerGuardImpact: () => {
			if (swordReady && attackVariant === "ward" && activeAction) {
				activeAction.time = 0;
				activeAction.paused = false;
			}
		},
		triggerAttack: (variant, impactMs) => {
			// A missing/unloaded attack has no mixer finished event. Keep locomotion
			// alive and let the combat HUD present the hit/miss instead of latching.
			if (
				playingCinematicAnimation ||
				currentContext.defeated ||
				currentContext.airborne ||
				(oneShotState === "hit" && impactMs === undefined) ||
				disposed ||
				!actions.has("attack")
			) {
				return;
			}
			const fromReady = swordReady && attackVariant === "sword";
			swordReady = false;
			oneShotState = "attack";
			bowDrawCharge = undefined;
			attackVariant = variant;
			const clip = actions.get("sword")?.getClip();
			npcAttackDurationMs =
				variant === "sword" && impactMs && clip
					? (clip.duration * impactMs) /
						(SWORD_CONTACT_SECONDS - (fromReady ? SWORD_LOAD_SECONDS : 0))
					: undefined;
			oneShotActionsTriggered += 1;
			applySemanticState("attack", true);
			if (fromReady && activeAction && variant === "sword")
				activeAction.time = SWORD_LOAD_SECONDS;
			if (
				variant === "bow" &&
				activeAction &&
				activeAction === actions.get("bow")
			)
				activeAction.time = BOW.drawPoseSeconds;
		},
		triggerNpcAttack: (clip, durationMs) => {
			const key = `npc:${clip}` as const;
			if (
				disposed ||
				playingCinematicAnimation ||
				currentContext.defeated ||
				!actions.has(key)
			)
				return;
			oneShotState = "attack";
			attackVariant = key;
			npcAttackDurationMs = durationMs;
			oneShotActionsTriggered += 1;
			applySemanticState("attack", true);
		},
		triggerHit: (interrupt = false) => {
			if (
				playingCinematicAnimation ||
				currentContext.defeated ||
				(!interrupt &&
					oneShotState === "attack" &&
					attackVariant?.startsWith("npc:")) ||
				disposed ||
				!actions.has("hit")
			)
				return;
			bowDrawCharge = undefined;
			swordReady = false;
			oneShotState = "hit";
			oneShotActionsTriggered += 1;
			applySemanticState("hit", true);
		},
		triggerInteraction: (state) => {
			if (
				disposed ||
				playingCinematicAnimation ||
				currentContext.defeated ||
				currentContext.airborne ||
				oneShotState ||
				bowDrawCharge !== undefined ||
				!actions.has(state)
			)
				return false;
			oneShotState = state;
			oneShotActionsTriggered += 1;
			applySemanticState(state, true);
			return true;
		},
		update: (deltaSeconds) => {
			if (!disposed) {
				if (
					swordReady &&
					loadSeconds &&
					activeAction &&
					attackVariant === "sword"
				)
					activeAction.time = Math.min(
						SWORD_LOAD_SECONDS,
						activeAction.time +
							(deltaSeconds * SWORD_LOAD_SECONDS) / (loadSeconds * 0.78),
					);
				mixer.update(Math.max(0, deltaSeconds));
			}
		},
	};
}
