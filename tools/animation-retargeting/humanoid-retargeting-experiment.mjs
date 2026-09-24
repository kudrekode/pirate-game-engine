import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import {
	clone as cloneSkeleton,
	retargetClip,
} from "three/examples/jsm/utils/SkeletonUtils.js";
import {
	findPrimaryFbxSkinnedMesh,
	inspectAnimationSource,
	parseFbxAnimationSource,
} from "./animation-source-inspection.mjs";

export const BONE_MAP_VERSION = "mixamo-quaternius-rest-delta-v2";

function createLegacyBoneMap() {
	const map = {
		Head: "mixamorigHead",
		neck_01: "mixamorigNeck",
		pelvis: "mixamorigHips",
		spine_01: "mixamorigSpine",
		spine_02: "mixamorigSpine1",
		spine_03: "mixamorigSpine2",
	};
	for (const [targetSide, sourceSide] of [
		["l", "Left"],
		["r", "Right"],
	]) {
		map[`clavicle_${targetSide}`] = `mixamorig${sourceSide}Shoulder`;
		map[`upperarm_${targetSide}`] = `mixamorig${sourceSide}Arm`;
		map[`lowerarm_${targetSide}`] = `mixamorig${sourceSide}ForeArm`;
		map[`hand_${targetSide}`] = `mixamorig${sourceSide}Hand`;
		for (const [targetFinger, sourceFinger] of [
			["index", "Index"],
			["middle", "Middle"],
			["pinky", "Pinky"],
			["ring", "Ring"],
			["thumb", "Thumb"],
		]) {
			for (let joint = 1; joint <= 4; joint += 1) {
				map[
					`${targetFinger}_0${joint}${joint === 4 ? "_leaf" : ""}_${targetSide}`
				] = `mixamorig${sourceSide}Hand${sourceFinger}${joint}`;
			}
		}
		map[`thigh_${targetSide}`] = `mixamorig${sourceSide}UpLeg`;
		map[`calf_${targetSide}`] = `mixamorig${sourceSide}Leg`;
		map[`foot_${targetSide}`] = `mixamorig${sourceSide}Foot`;
		map[`ball_${targetSide}`] = `mixamorig${sourceSide}ToeBase`;
		map[`ball_leaf_${targetSide}`] = `mixamorig${sourceSide}Toe_End`;
	}
	return Object.fromEntries(
		Object.entries(map).sort(([left], [right]) => left.localeCompare(right)),
	);
}

export const LEGACY_TARGET_TO_MIXAMO_BONE_MAP = Object.freeze(
	createLegacyBoneMap(),
);

const PRINCIPAL_TARGET_BONES = Object.freeze([
	"Head",
	"neck_01",
	"pelvis",
	"spine_01",
	"spine_02",
	"spine_03",
	...["l", "r"].flatMap((side) => [
		`clavicle_${side}`,
		`upperarm_${side}`,
		`lowerarm_${side}`,
		`hand_${side}`,
		`thigh_${side}`,
		`calf_${side}`,
		`foot_${side}`,
		`ball_${side}`,
	]),
]);

export const TARGET_TO_MIXAMO_BONE_MAP = Object.freeze(
	Object.fromEntries(
		PRINCIPAL_TARGET_BONES.map((target) => [
			target,
			LEGACY_TARGET_TO_MIXAMO_BONE_MAP[target],
		]),
	),
);

export const GOLDEN_REFERENCE_RETARGET_PROFILE = Object.freeze({
	boneMap: TARGET_TO_MIXAMO_BONE_MAP,
	ignoredTargetBones: Object.keys(LEGACY_TARGET_TO_MIXAMO_BONE_MAP).filter(
		(target) => !(target in TARGET_TO_MIXAMO_BONE_MAP),
	),
	rootMotionPolicy:
		"freeze target-world pelvis X/Z; preserve target-world pelvis Y",
	scalePolicy: "target pelvis rest height / source hips rest height",
	sourceSkeletonId: "mixamo-67-fbx",
	targetSkeletonId: "golden-reference-quaternius-superhero-male",
	transformPolicy:
		"sourceAnimatedWorld * inverse(sourceRestWorld) * targetRestWorld, converted through animated target parent world",
	version: BONE_MAP_VERSION,
});

export function normalizeBoneName(name) {
	return name
		.toLowerCase()
		.replace(/^mixamorig[:_]?/u, "")
		.replace(/[^a-z0-9]/gu, "");
}

function createParents(nodes) {
	const parents = new Map();
	nodes.forEach((node, index) => {
		for (const child of node.children ?? []) parents.set(child, index);
	});
	return parents;
}

export function createQuaterniusTargetRig(document) {
	const skin = document.skins?.[0];
	if (!skin) throw new Error("Golden Reference target has no skin.");
	const nodes = document.nodes ?? [];
	const parents = createParents(nodes);
	const bonesByNode = new Map();
	for (const nodeIndex of skin.joints) {
		const node = nodes[nodeIndex] ?? {};
		const bone = new THREE.Bone();
		bone.name = node.name || `node_${nodeIndex}`;
		if (node.matrix) {
			bone.matrix.fromArray(node.matrix);
			bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
		} else {
			bone.position.fromArray(node.translation ?? [0, 0, 0]);
			bone.quaternion.fromArray(node.rotation ?? [0, 0, 0, 1]);
			bone.scale.fromArray(node.scale ?? [1, 1, 1]);
		}
		bonesByNode.set(nodeIndex, bone);
	}
	const mesh = new THREE.SkinnedMesh(
		new THREE.BufferGeometry(),
		new THREE.MeshBasicMaterial(),
	);
	mesh.name = "GoldenReferenceRetargetDiagnostic";
	for (const nodeIndex of skin.joints) {
		const bone = bonesByNode.get(nodeIndex);
		const parentBone = bonesByNode.get(parents.get(nodeIndex));
		if (parentBone) parentBone.add(bone);
		else mesh.add(bone);
	}
	const bones = skin.joints.map((nodeIndex) => bonesByNode.get(nodeIndex));
	const skeleton = new THREE.Skeleton(bones);
	mesh.bind(skeleton);
	mesh.updateMatrixWorld(true);
	return mesh;
}

function getClipTarget(trackName) {
	const separator = trackName.lastIndexOf(".");
	return separator < 0 ? trackName : trackName.slice(0, separator);
}

function quaternionAngle(left, right) {
	const a = new THREE.Quaternion().fromArray(left);
	const b = new THREE.Quaternion().fromArray(right);
	return THREE.MathUtils.radToDeg(a.angleTo(b));
}

export function compareSkeletonReports(sourceReport, targetReport) {
	const sourceJoints = sourceReport.skeletons[0].joints;
	const targetJoints = targetReport.skeletons[0].joints;
	const sourceNames = new Set(sourceJoints.map((joint) => joint.name));
	const targetNames = new Set(targetJoints.map((joint) => joint.name));
	const normalizedSource = new Map(
		sourceJoints.map((joint) => [normalizeBoneName(joint.name), joint.name]),
	);
	const exactNameMatches = [...targetNames]
		.filter((name) => sourceNames.has(name))
		.sort();
	const normalizedNameMatches = targetJoints
		.map((joint) => ({
			source: normalizedSource.get(normalizeBoneName(joint.name)),
			target: joint.name,
		}))
		.filter((entry) => entry.source)
		.sort((left, right) => left.target.localeCompare(right.target));
	const configuredSemanticMatches = Object.entries(
		TARGET_TO_MIXAMO_BONE_MAP,
	).map(([target, source]) => ({ source, target }));
	const semanticMatches = configuredSemanticMatches.filter(
		({ source, target }) => sourceNames.has(source) && targetNames.has(target),
	);
	const mappedSourceNames = new Set(
		semanticMatches.map((entry) => entry.source),
	);
	const mappedTargetNames = new Set(
		semanticMatches.map((entry) => entry.target),
	);
	const sourceByName = new Map(
		sourceJoints.map((joint) => [joint.name, joint]),
	);
	const targetByName = new Map(
		targetJoints.map((joint) => [joint.name, joint]),
	);
	const hierarchyDifferences = [];
	const restPoseDifferences = [];
	for (const { source, target } of semanticMatches) {
		const sourceJoint = sourceByName.get(source);
		const targetJoint = targetByName.get(target);
		if (!sourceJoint || !targetJoint) continue;
		const mappedTargetParent = targetJoint.parent
			? TARGET_TO_MIXAMO_BONE_MAP[targetJoint.parent]
			: undefined;
		if ((mappedTargetParent ?? null) !== (sourceJoint.parent ?? null)) {
			hierarchyDifferences.push({
				source,
				sourceParent: sourceJoint.parent,
				target,
				targetMappedParent: mappedTargetParent ?? null,
				targetParent: targetJoint.parent,
			});
		}
		if (sourceJoint.rest.rotation && targetJoint.rest.rotation) {
			const angleDegrees = quaternionAngle(
				sourceJoint.rest.rotation,
				targetJoint.rest.rotation,
			);
			if (angleDegrees > 5) {
				restPoseDifferences.push({ angleDegrees, source, target });
			}
		}
	}
	const animatedSourceTargets = new Set(
		sourceReport.animations
			.filter((clip) => clip.duration > 0)
			.flatMap((clip) => clip.tracks.map((track) => track.target)),
	);
	const directBoundTargets = [...animatedSourceTargets]
		.filter((name) => targetNames.has(name))
		.sort();
	return {
		directBinding: {
			animatedSourceTargetCount: animatedSourceTargets.size,
			boundTargetCount: directBoundTargets.length,
			boundTargets: directBoundTargets,
			viable: directBoundTargets.length === animatedSourceTargets.size,
		},
		exactNameMatches,
		hierarchyDifferences,
		normalizedNameMatches,
		restPoseDifferences,
		semanticMatches,
		missingMappedSourceBones: configuredSemanticMatches
			.filter(({ source }) => !sourceNames.has(source))
			.map(({ source }) => source)
			.sort(),
		missingMappedTargetBones: configuredSemanticMatches
			.filter(({ target }) => !targetNames.has(target))
			.map(({ target }) => target)
			.sort(),
		unmatchedSourceBones: sourceJoints
			.map((joint) => joint.name)
			.filter((name) => !mappedSourceNames.has(name))
			.sort(),
		unmatchedTargetBones: targetJoints
			.map((joint) => joint.name)
			.filter((name) => !mappedTargetNames.has(name))
			.sort(),
	};
}

function targetTrackName(trackName) {
	const match = /^\.bones\[([^\]]+)\]\.(position|quaternion)$/u.exec(trackName);
	return match ? `${match[1]}.${match[2]}` : trackName;
}

function neutralizeHorizontalRootMotion(clip, target) {
	let before;
	let after;
	target.skeleton.pose();
	target.updateMatrixWorld(true);
	const pelvis = target.skeleton.getBoneByName("pelvis");
	if (!pelvis?.parent)
		throw new Error("Target pelvis has no parent transform.");
	const parentMatrix = pelvis.parent.matrixWorld.clone();
	const inverseParentMatrix = parentMatrix.clone().invert();
	for (const track of clip.tracks) {
		if (
			targetTrackName(track.name) !== "pelvis.position" ||
			!(track instanceof THREE.VectorKeyframeTrack)
		) {
			continue;
		}
		const firstLocal = new THREE.Vector3().fromArray(track.values, 0);
		const lastLocal = new THREE.Vector3().fromArray(
			track.values,
			track.values.length - 3,
		);
		const firstWorld = firstLocal.clone().applyMatrix4(parentMatrix);
		const lastWorld = lastLocal.clone().applyMatrix4(parentMatrix);
		before = {
			x: lastWorld.x - firstWorld.x,
			y: lastWorld.y - firstWorld.y,
			z: lastWorld.z - firstWorld.z,
		};
		for (let index = 0; index < track.values.length; index += 3) {
			const worldPosition = new THREE.Vector3()
				.fromArray(track.values, index)
				.applyMatrix4(parentMatrix);
			worldPosition.x = firstWorld.x;
			worldPosition.z = firstWorld.z;
			const localPosition = worldPosition.applyMatrix4(inverseParentMatrix);
			localPosition.toArray(track.values, index);
		}
		const adjustedLastWorld = new THREE.Vector3()
			.fromArray(track.values, track.values.length - 3)
			.applyMatrix4(parentMatrix);
		after = {
			x: adjustedLastWorld.x - firstWorld.x,
			y: adjustedLastWorld.y - firstWorld.y,
			z: adjustedLastWorld.z - firstWorld.z,
		};
	}
	return {
		after,
		before,
		policy: "freeze target-world pelvis X/Z; preserve target-world pelvis Y",
	};
}

function cloneAndRenameClip(clip, name) {
	const cloned = clip.clone();
	cloned.name = name;
	for (const track of cloned.tracks) track.name = targetTrackName(track.name);
	return cloned;
}

function getHipScale(sourceMesh, targetMesh) {
	sourceMesh.updateMatrixWorld(true);
	targetMesh.updateMatrixWorld(true);
	const sourceHip = sourceMesh.skeleton.getBoneByName("mixamorigHips");
	const targetHip = targetMesh.skeleton.getBoneByName("pelvis");
	if (!sourceHip || !targetHip)
		throw new Error("Cannot measure source/target hips.");
	const sourceHeight = sourceHip.getWorldPosition(new THREE.Vector3()).y;
	const targetHeight = targetHip.getWorldPosition(new THREE.Vector3()).y;
	return {
		scale: targetHeight / sourceHeight,
		sourceHipHeight: sourceHeight,
		targetHipHeight: targetHeight,
	};
}

const DIAGNOSTIC_JOINTS = Object.freeze([
	"pelvis",
	"spine_03",
	"neck_01",
	"Head",
	"clavicle_l",
	"clavicle_r",
	"upperarm_l",
	"upperarm_r",
	"lowerarm_l",
	"lowerarm_r",
	"hand_l",
	"hand_r",
	"thigh_l",
	"thigh_r",
	"calf_l",
	"calf_r",
	"foot_l",
	"foot_r",
]);

function worldQuaternion(object) {
	return object.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function captureRestTransforms(skeleton) {
	skeleton.pose();
	const root = skeleton.bones[0]?.parent;
	root?.updateMatrixWorld(true);
	return new Map(
		skeleton.bones.map((bone) => [
			bone.name,
			{
				localPosition: bone.position.clone(),
				localQuaternion: bone.quaternion.clone(),
				worldPosition: bone.getWorldPosition(new THREE.Vector3()),
				worldQuaternion: worldQuaternion(bone),
			},
		]),
	);
}

function createRestDeltaRetargetClip({
	semanticState,
	sourceClip,
	sourceMesh,
	target,
	scale,
}) {
	const sourceRest = captureRestTransforms(sourceMesh.skeleton);
	const targetRest = captureRestTransforms(target.skeleton);
	const frameCount = Math.max(
		2,
		...sourceClip.tracks.map((track) => track.times.length),
	);
	const times = new Float32Array(frameCount);
	const quaternionValues = new Map(
		Object.keys(TARGET_TO_MIXAMO_BONE_MAP).map((name) => [
			name,
			new Float32Array(frameCount * 4),
		]),
	);
	const pelvisValues = new Float32Array(frameCount * 3);
	const sourceMixer = new THREE.AnimationMixer(sourceMesh);
	const sourceAction = sourceMixer.clipAction(sourceClip);
	sourceAction.setLoop(THREE.LoopOnce, 1);
	sourceAction.clampWhenFinished = true;
	sourceAction.play();
	const sourceHips = sourceMesh.skeleton.getBoneByName("mixamorigHips");
	const targetPelvis = target.skeleton.getBoneByName("pelvis");
	if (!sourceHips || !targetPelvis)
		throw new Error("Retarget profile requires source hips and target pelvis.");
	for (let frame = 0; frame < frameCount; frame += 1) {
		const time = (sourceClip.duration * frame) / (frameCount - 1);
		times[frame] = time;
		sourceMixer.setTime(time);
		sourceMesh.updateMatrixWorld(true);
		target.skeleton.pose();
		target.updateMatrixWorld(true);
		for (const targetBone of target.skeleton.bones) {
			const sourceName = TARGET_TO_MIXAMO_BONE_MAP[targetBone.name];
			if (!sourceName) continue;
			const sourceBone = sourceMesh.skeleton.getBoneByName(sourceName);
			const sourceRestTransform = sourceRest.get(sourceName);
			const targetRestTransform = targetRest.get(targetBone.name);
			if (!sourceBone || !sourceRestTransform || !targetRestTransform)
				throw new Error(
					`Retarget profile transform is missing for ${targetBone.name}.`,
				);
			const desiredWorldQuaternion = worldQuaternion(sourceBone)
				.multiply(sourceRestTransform.worldQuaternion.clone().invert())
				.multiply(targetRestTransform.worldQuaternion)
				.normalize();
			const parentWorldQuaternion = targetBone.parent
				? worldQuaternion(targetBone.parent)
				: new THREE.Quaternion();
			targetBone.quaternion
				.copy(parentWorldQuaternion.invert().multiply(desiredWorldQuaternion))
				.normalize();
			if (targetBone === targetPelvis && targetBone.parent) {
				const sourceDisplacement = sourceBone
					.getWorldPosition(new THREE.Vector3())
					.sub(sourceRestTransform.worldPosition)
					.multiplyScalar(scale.scale);
				const desiredWorldPosition = targetRestTransform.worldPosition
					.clone()
					.add(sourceDisplacement);
				targetBone.position.copy(
					desiredWorldPosition.applyMatrix4(
						targetBone.parent.matrixWorld.clone().invert(),
					),
				);
			}
			targetBone.updateMatrix();
			targetBone.updateMatrixWorld(true);
			targetBone.quaternion.toArray(
				quaternionValues.get(targetBone.name),
				frame * 4,
			);
			if (targetBone === targetPelvis)
				targetBone.position.toArray(pelvisValues, frame * 3);
		}
	}
	sourceMixer.stopAllAction();
	sourceMixer.uncacheRoot(sourceMesh);
	const tracks = [
		new THREE.VectorKeyframeTrack("pelvis.position", times, pelvisValues),
		...Object.entries(TARGET_TO_MIXAMO_BONE_MAP).map(
			([targetName]) =>
				new THREE.QuaternionKeyframeTrack(
					`${targetName}.quaternion`,
					times,
					quaternionValues.get(targetName),
				),
		),
	];
	return new THREE.AnimationClip(
		semanticState === "walk"
			? "GoldenReference_Walk_InPlace"
			: "GoldenReference_Idle",
		sourceClip.duration,
		tracks,
	);
}

function poseSnapshot(target, clip, normalizedTime) {
	const clone = cloneSkeleton(target);
	const restLocalQuaternions = new Map(
		clone.skeleton.bones.map((bone) => [bone.name, bone.quaternion.clone()]),
	);
	let mixer;
	if (clip) {
		mixer = new THREE.AnimationMixer(clone);
		const action = mixer.clipAction(clip);
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		action.play();
		mixer.setTime(clip.duration * normalizedTime);
	}
	clone.updateMatrixWorld(true);
	const joints = Object.fromEntries(
		DIAGNOSTIC_JOINTS.map((name) => {
			const bone = clone.skeleton.getBoneByName(name);
			if (!bone) throw new Error(`Missing diagnostic joint ${name}.`);
			return [
				name,
				{
					position: bone.getWorldPosition(new THREE.Vector3()).toArray(),
					rotation: worldQuaternion(bone).toArray(),
				},
			];
		}),
	);
	const localRotationFromRest = Object.fromEntries(
		["clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"].map((name) => {
			const bone = clone.skeleton.getBoneByName(name);
			return [
				name,
				THREE.MathUtils.radToDeg(
					bone.quaternion.angleTo(restLocalQuaternions.get(name)),
				),
			];
		}),
	);
	mixer?.stopAllAction();
	if (mixer) mixer.uncacheRoot(clone);
	return { joints, localRotationFromRest, normalizedTime };
}

function distance(sample, left, right) {
	return new THREE.Vector3()
		.fromArray(sample.joints[left].position)
		.distanceTo(new THREE.Vector3().fromArray(sample.joints[right].position));
}

function jointBounds(sample) {
	const box = new THREE.Box3();
	for (const joint of Object.values(sample.joints))
		box.expandByPoint(new THREE.Vector3().fromArray(joint.position));
	return box.getSize(new THREE.Vector3());
}

export function evaluateRetargetedClip(target, clip, semanticState) {
	const normalizedTimes = [0, 0.25, 0.5, 0.75];
	const rest = poseSnapshot(target, undefined, 0);
	const samples = normalizedTimes.map((time) =>
		poseSnapshot(target, clip, time),
	);
	const restBounds = jointBounds(rest);
	const restHeight = restBounds.y;
	const bonePairs = [
		["clavicle_l", "upperarm_l"],
		["upperarm_l", "lowerarm_l"],
		["lowerarm_l", "hand_l"],
		["clavicle_r", "upperarm_r"],
		["upperarm_r", "lowerarm_r"],
		["lowerarm_r", "hand_r"],
		["thigh_l", "calf_l"],
		["calf_l", "foot_l"],
		["thigh_r", "calf_r"],
		["calf_r", "foot_r"],
	];
	let maxBoneLengthRelativeError = 0;
	const maxBoundingBoxExpansion = { x: 0, y: 0, z: 0 };
	let maxBoundingSpanRelativeToRestHeight = 0;
	let maxClavicleRestRotationDegrees = 0;
	let maxIdleSymmetryError = 0;
	let maxRootHorizontalDisplacement = 0;
	const firstPelvis = new THREE.Vector3().fromArray(
		samples[0].joints.pelvis.position,
	);
	for (const sample of samples) {
		for (const [parent, child] of bonePairs) {
			const restLength = distance(rest, parent, child);
			maxBoneLengthRelativeError = Math.max(
				maxBoneLengthRelativeError,
				Math.abs(distance(sample, parent, child) / restLength - 1),
			);
		}
		const bounds = jointBounds(sample);
		maxBoundingBoxExpansion.x = Math.max(
			maxBoundingBoxExpansion.x,
			bounds.x / restBounds.x,
		);
		maxBoundingBoxExpansion.y = Math.max(
			maxBoundingBoxExpansion.y,
			bounds.y / restBounds.y,
		);
		maxBoundingBoxExpansion.z = Math.max(
			maxBoundingBoxExpansion.z,
			bounds.z / Math.max(restBounds.z, 0.0001),
		);
		maxBoundingSpanRelativeToRestHeight = Math.max(
			maxBoundingSpanRelativeToRestHeight,
			bounds.x / restHeight,
			bounds.y / restHeight,
			bounds.z / restHeight,
		);
		maxClavicleRestRotationDegrees = Math.max(
			maxClavicleRestRotationDegrees,
			sample.localRotationFromRest.clavicle_l,
			sample.localRotationFromRest.clavicle_r,
		);
		const pelvis = new THREE.Vector3().fromArray(sample.joints.pelvis.position);
		maxRootHorizontalDisplacement = Math.max(
			maxRootHorizontalDisplacement,
			Math.hypot(pelvis.x - firstPelvis.x, pelvis.z - firstPelvis.z),
		);
		sample.invariants = {
			boundingBoxSize: bounds.toArray(),
			elbowChainContinuity: {
				left:
					distance(sample, "upperarm_l", "lowerarm_l") +
					distance(sample, "lowerarm_l", "hand_l"),
				right:
					distance(sample, "upperarm_r", "lowerarm_r") +
					distance(sample, "lowerarm_r", "hand_r"),
			},
			handToShoulderDistance: {
				left: distance(sample, "clavicle_l", "hand_l"),
				right: distance(sample, "clavicle_r", "hand_r"),
			},
			hipKneeAnkleContinuity: {
				left:
					distance(sample, "thigh_l", "calf_l") +
					distance(sample, "calf_l", "foot_l"),
				right:
					distance(sample, "thigh_r", "calf_r") +
					distance(sample, "calf_r", "foot_r"),
			},
			shoulderHeightRelativeToNeck: {
				left:
					sample.joints.clavicle_l.position[1] -
					sample.joints.neck_01.position[1],
				right:
					sample.joints.clavicle_r.position[1] -
					sample.joints.neck_01.position[1],
			},
			shoulderToNeckDistance: {
				left: distance(sample, "clavicle_l", "neck_01"),
				right: distance(sample, "clavicle_r", "neck_01"),
			},
		};
		if (semanticState === "idle") {
			for (const [left, right] of [
				["clavicle_l", "clavicle_r"],
				["upperarm_l", "upperarm_r"],
				["lowerarm_l", "lowerarm_r"],
				["hand_l", "hand_r"],
				["thigh_l", "thigh_r"],
				["calf_l", "calf_r"],
				["foot_l", "foot_r"],
			]) {
				const leftPosition = new THREE.Vector3().fromArray(
					sample.joints[left].position,
				);
				const rightPosition = new THREE.Vector3().fromArray(
					sample.joints[right].position,
				);
				leftPosition.sub(pelvis);
				rightPosition.sub(pelvis);
				rightPosition.x *= -1;
				maxIdleSymmetryError = Math.max(
					maxIdleSymmetryError,
					leftPosition.distanceTo(rightPosition) / restBounds.y,
				);
			}
		}
	}
	const finiteTransforms = samples.every((sample) =>
		Object.values(sample.joints).every(
			(joint) =>
				joint.position.every(Number.isFinite) &&
				joint.rotation.every(Number.isFinite),
		),
	);
	const summary = {
		finiteTransforms,
		maxBoneLengthRelativeError,
		maxBoundingBoxExpansion,
		maxBoundingSpanRelativeToRestHeight,
		maxClavicleRestRotationDegrees,
		maxIdleSymmetryError,
		maxRootHorizontalDisplacement,
		passed:
			finiteTransforms &&
			maxBoneLengthRelativeError <= 0.00001 &&
			maxBoundingSpanRelativeToRestHeight <= 1.5 &&
			maxClavicleRestRotationDegrees <= 45 &&
			maxIdleSymmetryError <= 0.15 &&
			maxRootHorizontalDisplacement <= 0.00001,
		thresholds: {
			maxBoneLengthRelativeError: 0.00001,
			maxBoundingSpanRelativeToRestHeight: 1.5,
			maxClavicleRestRotationDegrees: 45,
			maxIdleSymmetryError: 0.15,
			maxRootHorizontalDisplacement: 0.00001,
		},
	};
	return { rest, samples, summary };
}

export async function runSkeletonUtilsOptionExperiments({
	sourcePath,
	targetPath,
}) {
	const targetDocument = JSON.parse(await readFile(targetPath, "utf8"));
	const variants = [
		["current-defaults", {}],
		["preserve-bone-matrix-false", { preserveBoneMatrix: false }],
		["preserve-bone-positions-false", { preserveBonePositions: false }],
		["use-target-matrix-true", { useTargetMatrix: true }],
		[
			"matrix-false-target-matrix-true",
			{ preserveBoneMatrix: false, useTargetMatrix: true },
		],
		["use-first-frame-position-true", { useFirstFramePosition: true }],
		["hip-influence-y-only", { hipInfluence: new THREE.Vector3(0, 1, 0) }],
	];
	const results = [];
	for (const [name, options] of variants) {
		const sourceInput = await readFile(sourcePath);
		const { root: sourceRoot } = parseFbxAnimationSource(sourceInput);
		const sourceMesh = findPrimaryFbxSkinnedMesh(sourceRoot);
		const sourceClip = sourceRoot.animations.find((clip) => clip.duration > 0);
		if (!sourceMesh || !sourceClip)
			throw new Error("Option experiment source is missing its rig or clip.");
		const target = createQuaterniusTargetRig(targetDocument);
		const scale = getHipScale(sourceMesh, target);
		const rawClip = retargetClip(target, sourceMesh, sourceClip, {
			fps: 30,
			hip: "mixamorigHips",
			names: LEGACY_TARGET_TO_MIXAMO_BONE_MAP,
			scale: scale.scale,
			...options,
		});
		const clip = cloneAndRenameClip(rawClip, `SkeletonUtils_${name}`);
		neutralizeHorizontalRootMotion(clip, target);
		const quality = evaluateRetargetedClip(target, clip, "idle");
		results.push({
			name,
			options: Object.fromEntries(
				Object.entries(options).map(([key, value]) => [
					key,
					value instanceof THREE.Vector3 ? value.toArray() : value,
				]),
			),
			quality: quality.summary,
			trackCount: clip.tracks.length,
		});
	}
	return {
		results,
		unsupportedCurrentOption: {
			name: "preserveHipPosition",
			effect: "none; this is not a SkeletonUtils retarget option",
		},
	};
}

export async function runLegacySkeletonUtilsRetargetExperiment({
	semanticState,
	sourcePath,
	targetPath,
}) {
	const sourceInput = await readFile(sourcePath);
	const { root: sourceRoot } = parseFbxAnimationSource(sourceInput);
	const sourceMesh = findPrimaryFbxSkinnedMesh(sourceRoot);
	const sourceClip = sourceRoot.animations.find((clip) => clip.duration > 0);
	if (!sourceMesh || !sourceClip)
		throw new Error("Legacy comparison source is missing its rig or clip.");
	const targetDocument = JSON.parse(await readFile(targetPath, "utf8"));
	const target = createQuaterniusTargetRig(targetDocument);
	const scale = getHipScale(sourceMesh, target);
	const rawClip = retargetClip(target, sourceMesh, sourceClip, {
		fps: 30,
		hip: "mixamorigHips",
		names: LEGACY_TARGET_TO_MIXAMO_BONE_MAP,
		preserveBoneMatrix: true,
		scale: scale.scale,
		useFirstFramePosition: false,
	});
	const clip = cloneAndRenameClip(
		rawClip,
		semanticState === "walk" ? "FailedV1_Walk_InPlace" : "FailedV1_Idle",
	);
	neutralizeHorizontalRootMotion(clip, target);
	return {
		clip,
		quality: evaluateRetargetedClip(target, clip, semanticState).summary,
	};
}

function trackEndpointDifference(track) {
	const valueSize = track.getValueSize();
	const first = track.values.slice(0, valueSize);
	const last = track.values.slice(-valueSize);
	if (track instanceof THREE.QuaternionKeyframeTrack) {
		return new THREE.Quaternion()
			.fromArray(first)
			.angleTo(new THREE.Quaternion().fromArray(last));
	}
	let squared = 0;
	for (let index = 0; index < valueSize; index += 1) {
		squared += (last[index] - first[index]) ** 2;
	}
	return Math.sqrt(squared);
}

function validateClipOnIndependentClones(target, clip) {
	const first = cloneSkeleton(target);
	const second = cloneSkeleton(target);
	const firstPelvis = first.skeleton.getBoneByName("pelvis");
	const secondPelvis = second.skeleton.getBoneByName("pelvis");
	const secondInitial = secondPelvis.quaternion.clone();
	const firstRestPosition = firstPelvis.position.clone();
	const firstRestQuaternion = firstPelvis.quaternion.clone();
	const firstMixer = new THREE.AnimationMixer(first);
	const secondMixer = new THREE.AnimationMixer(second);
	firstMixer.clipAction(clip).play();
	secondMixer.clipAction(clip).play();
	firstMixer.update(clip.duration * 0.35);
	const independentBeforeSecondUpdate =
		secondPelvis.quaternion.equals(secondInitial);
	secondMixer.update(clip.duration * 0.7);
	const separateSkeletons =
		first.skeleton !== second.skeleton && firstPelvis !== secondPelvis;
	const finiteValues = clip.tracks.every((track) =>
		Array.from(track.values).every(Number.isFinite),
	);
	const targetNames = new Set(target.skeleton.bones.map((bone) => bone.name));
	const allTracksTargetGoldenBones = clip.tracks.every((track) =>
		targetNames.has(getClipTarget(track.name)),
	);
	firstMixer.stopAllAction();
	secondMixer.stopAllAction();
	first.skeleton.pose();
	const restRestored =
		firstPelvis.position.distanceTo(firstRestPosition) <= 0.000001 &&
		firstPelvis.quaternion.angleTo(firstRestQuaternion) <= 0.000001;
	firstMixer.uncacheRoot(first);
	secondMixer.uncacheRoot(second);
	return {
		allTracksTargetGoldenBones,
		finiteValues,
		independentBeforeSecondUpdate,
		restRestored,
		separateSkeletons,
	};
}

export async function runRuntimeRetargetExperiment({
	sourcePath,
	targetPath,
	semanticState,
}) {
	const sourceInput = await readFile(sourcePath);
	const { root: sourceRoot, warnings } = parseFbxAnimationSource(sourceInput);
	const sourceMesh = findPrimaryFbxSkinnedMesh(sourceRoot);
	if (!sourceMesh) throw new Error("Source FBX has no primary skinned mesh.");
	const sourceClip = sourceRoot.animations.find((clip) => clip.duration > 0);
	if (!sourceClip)
		throw new Error("Source FBX has no non-empty animation clip.");
	const targetDocument = JSON.parse(await readFile(targetPath, "utf8"));
	const target = createQuaterniusTargetRig(targetDocument);
	const scale = getHipScale(sourceMesh, target);
	const clip = createRestDeltaRetargetClip({
		semanticState,
		sourceClip,
		sourceMesh,
		target,
		scale,
	});
	const rootMotion = neutralizeHorizontalRootMotion(clip, target);
	const validation = validateClipOnIndependentClones(target, clip);
	const quality = evaluateRetargetedClip(target, clip, semanticState);
	return {
		clip,
		report: {
			boneMapVersion: BONE_MAP_VERSION,
			clip: {
				duration: clip.duration,
				maxLoopEndpointDifference: Math.max(
					0,
					...clip.tracks.map(trackEndpointDifference),
				),
				name: clip.name,
				trackCount: clip.tracks.length,
			},
			method: "rest-frame world-delta runtime feasibility experiment",
			profile: GOLDEN_REFERENCE_RETARGET_PROFILE,
			quality,
			rootMotion,
			scale,
			semanticState,
			validation,
			warnings,
		},
	};
}

export async function buildComparisonReport(sourcePath, targetPath) {
	const [sourceReport, targetReport] = await Promise.all([
		inspectAnimationSource(sourcePath),
		inspectAnimationSource(targetPath),
	]);
	return compareSkeletonReports(sourceReport, targetReport);
}

export function serializeClip(clip) {
	const serialized = THREE.AnimationClip.toJSON(clip);
	delete serialized.uuid;
	const digest = createHash("sha256")
		.update(JSON.stringify(serialized))
		.digest("hex")
		.slice(0, 32);
	serialized.uuid = [
		digest.slice(0, 8),
		digest.slice(8, 12),
		digest.slice(12, 16),
		digest.slice(16, 20),
		digest.slice(20),
	].join("-");
	return serialized;
}

export function resolveWorkspacePath(relativePath) {
	return path.resolve(relativePath);
}
