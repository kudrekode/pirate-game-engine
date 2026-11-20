import * as THREE from "three";
import { BOW } from "../../data/bow";
import type { SWORD } from "../../data/sword";
import { disposePlaceholderObject } from "./placeholderMeshes";
import type { ThreePerformanceDiagnostics } from "./threePerformanceDiagnostics";
import { requestThreeVisualAssetAnimationClip } from "./threeVisualAssetLoader";
import { getThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";
import {
	createThreeVisualMarkerGroup,
	type ThreeVisualRenderResult,
} from "./threeVisualRenderer";
import { resolveThreeVisual } from "./threeVisuals";

/** Resolve once on the instance skeleton, then let the hierarchy follow animation. */
export function resolveCharacterHand(
	root: THREE.Object3D,
	socket: "rightHand" | "leftHand",
) {
	const hand = root.getObjectByName(
		socket === "rightHand" ? "hand_r" : "hand_l",
	);
	return hand && (hand as THREE.Bone).isBone ? hand : undefined;
}

export function createThreeWeaponAttachment(
	root: THREE.Object3D,
	diagnostics?: ThreePerformanceDiagnostics,
) {
	type Weapon = typeof SWORD | typeof BOW;
	const attachments = new Map<
		string,
		ReturnType<typeof createHandAttachment>
	>();
	let active: ReturnType<typeof createHandAttachment> | undefined;
	let disposed = false;
	return {
		sync: (weapon: Weapon | undefined, hidden = false) => {
			if (disposed) return;
			const next = weapon
				? (attachments.get(weapon.id) ??
					createHandAttachment(root, weapon, diagnostics))
				: undefined;
			if (weapon && next) attachments.set(weapon.id, next);
			if (active !== next) active?.sync(undefined);
			active = next;
			active?.sync(weapon, hidden);
		},
		getStats: () => active?.getStats() ?? { attached: false, visible: false },
		getProjectileSpawn: () => active?.getProjectileSpawn(),
		updateGrip: () => active?.updateGrip(),
		dispose: () => {
			disposed = true;
			for (const attachment of attachments.values()) attachment.dispose();
			attachments.clear();
			active = undefined;
		},
	};
}

function createHandAttachment(
	root: THREE.Object3D,
	definition: typeof SWORD | typeof BOW,
	diagnostics?: ThreePerformanceDiagnostics,
) {
	const hand = resolveCharacterHand(root, definition.socket);
	let equipped: typeof SWORD | typeof BOW | undefined;
	let presentation: ThreeVisualRenderResult | undefined;
	let disposed = false;
	let pending = false;
	let unavailable = false;
	let gripPending = false;
	let gripPose:
		| { bone: THREE.Object3D; values: ArrayLike<number> }[]
		| undefined;
	const refresh = () => {
		if (disposed || !hand || !equipped || unavailable) return;
		if (!gripPose && !gripPending) {
			const mapping = equipped.attackAnimation;
			const request = requestThreeVisualAssetAnimationClip(
				getThreeVisualAssetDefinition(mapping.assetId),
				mapping.clipName,
				{
					onStateChange: () => {
						gripPending = false;
						refresh();
					},
				},
			);
			gripPending = request.status === "loading";
			if (request.status === "loaded")
				gripPose = request.clip.tracks.flatMap((track) => {
					if (
						!new RegExp(
							`^(index|middle|ring|pinky|thumb)_0[123]_${definition.socket === "leftHand" ? "l" : "r"}\\.quaternion$`,
						).test(track.name)
					)
						return [];
					const bone = root.getObjectByName(track.name.split(".")[0]);
					return bone ? [{ bone, values: track.values.slice(0, 4) }] : [];
				});
			else if (!gripPending) gripPose = [];
		}
		if (!presentation) {
			const visual = resolveThreeVisual({
				kind: "object",
				threeVisual: {
					mode: "asset",
					assetId: equipped.visualAssetId,
				},
			});
			if (visual.mode !== "asset") return;
			const result = createThreeVisualMarkerGroup(
				{
					id: "equipped_weapon",
					kind: "object",
					shape: "box",
					color: 0xaaaaaa,
					opacity: 1,
					gridX: 0,
					gridY: 0,
					width: 0.1,
					height: 1,
					depth: 0.1,
					threeX: 0,
					threeY: 0.5,
					threeZ: 0,
					visualType: "genericObject",
					visual,
				},
				{
					diagnostics,
					preserveAssetOrigin: true,
					onAssetStateChange: pending
						? undefined
						: () => {
								pending = false;
								refresh();
							},
				},
			);
			pending = result.assetStatus === "loading";
			if (!result.usedAsset) {
				unavailable = result.assetStatus !== "loading";
				disposePlaceholderObject(result.group);
				result.disposePresentation?.();
				return;
			}
			presentation = result;
			const grip = equipped.grip;
			result.group.name = "equipped_weapon";
			result.group.position.set(
				grip.position[0],
				grip.position[1],
				grip.position[2],
			);
			result.group.rotation.set(
				grip.rotation[0],
				grip.rotation[1],
				grip.rotation[2],
			);
			result.group.scale.multiplyScalar(grip.scale);
		}
		if (presentation.group.parent !== hand) hand.add(presentation.group);
	};
	return {
		sync: (weapon: typeof SWORD | typeof BOW | undefined, hidden = false) => {
			equipped = weapon;
			if (!weapon) presentation?.group.removeFromParent();
			else if (!pending) refresh();
			if (presentation) presentation.group.visible = !hidden;
		},
		getStats: () => ({
			attached: !!presentation?.group.parent,
			visible: !!presentation?.group.parent && presentation.group.visible,
			bone: hand?.name,
			instanceId: presentation?.group.uuid,
		}),
		getProjectileSpawn: () => {
			if (!presentation?.group.parent || equipped?.id !== "bow")
				return undefined;
			const point = presentation.group.localToWorld(
				new THREE.Vector3(...BOW.projectileSocket),
			);
			return { x: point.x, y: point.y, z: point.z };
		},
		/** Fixed finger pose from the sword source, after the existing mixer. No weapon transforms. */
		updateGrip: () => {
			if (!disposed && equipped && presentation?.group.visible)
				for (const { bone, values } of gripPose ?? [])
					bone.quaternion.fromArray(values);
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			presentation?.group.removeFromParent();
			presentation?.disposePresentation?.();
			presentation = undefined;
		},
	};
}
