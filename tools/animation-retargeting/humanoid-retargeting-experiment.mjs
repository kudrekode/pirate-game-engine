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

export const BONE_MAP_VERSION = "mixamo-quaternius-v1";

function createBoneMap() {
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

export const TARGET_TO_MIXAMO_BONE_MAP = Object.freeze(createBoneMap());

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
	const rawRetargeted = retargetClip(target, sourceMesh, sourceClip, {
		fps: 30,
		hip: "mixamorigHips",
		names: TARGET_TO_MIXAMO_BONE_MAP,
		preserveBoneMatrix: true,
		preserveHipPosition: false,
		scale: scale.scale,
		useFirstFramePosition: false,
	});
	const clip = cloneAndRenameClip(
		rawRetargeted,
		semanticState === "walk"
			? "GoldenReference_Walk_InPlace"
			: "GoldenReference_Idle",
	);
	const rootMotion = neutralizeHorizontalRootMotion(clip, target);
	const validation = validateClipOnIndependentClones(target, clip);
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
			method:
				"Three.js SkeletonUtils.retargetClip runtime feasibility experiment",
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
	return THREE.AnimationClip.toJSON(clip);
}

export function resolveWorkspacePath(relativePath) {
	return path.resolve(relativePath);
}
