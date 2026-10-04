import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { inspectAnimationSource } from "../animation-retargeting/animation-source-inspection.mjs";
import { loadRetargetProfile } from "./golden-animation-bake.mjs";

const OUTPUT_ROOT =
	"public/assets/derived/humanoid-animations/golden-reference-v0";
const CLIPS = {
	idle: {
		artifact: `${OUTPUT_ROOT}/idle.glb`,
		clipName: "GoldenReference_Idle",
		runtimeReference: `${OUTPUT_ROOT}/idle.runtime-retarget.json`,
	},
	walk: {
		artifact: `${OUTPUT_ROOT}/walk-in-place.glb`,
		clipName: "GoldenReference_Walk_InPlace",
		runtimeReference: `${OUTPUT_ROOT}/walk-in-place.runtime-retarget.json`,
	},
};
const DIAGNOSTIC_JOINTS = [
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
];
const SAMPLE_TIMES = [0, 0.25, 0.5, 0.75];
const POSITION_TOLERANCE_METRES = 0.02;
const ANGLE_TOLERANCE_DEGREES = 10;

function toArrayBuffer(input) {
	return input.buffer.slice(
		input.byteOffset,
		input.byteOffset + input.byteLength,
	);
}

async function loadWithProductionLoader(filePath) {
	globalThis.self ??= globalThis;
	globalThis.createImageBitmap ??= async () => ({
		close() {},
		height: 1,
		width: 1,
	});
	return new GLTFLoader().parseAsync(
		toArrayBuffer(await readFile(filePath)),
		"",
	);
}

function uniqueSkeletons(root) {
	const skeletons = new Set();
	root.traverse((object) => {
		if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
	});
	return [...skeletons];
}

function analyzeLoadedRoot(root) {
	const materials = new Set();
	const textures = new Set();
	let meshCount = 0;
	let skinnedMeshCount = 0;
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		meshCount += 1;
		if (object instanceof THREE.SkinnedMesh) skinnedMeshCount += 1;
		for (const material of Array.isArray(object.material)
			? object.material
			: [object.material]) {
			materials.add(material);
			for (const value of Object.values(material))
				if (value instanceof THREE.Texture) textures.add(value);
		}
	});
	return {
		materialCount: materials.size,
		meshCount,
		skeletonCount: uniqueSkeletons(root).length,
		skinnedMeshCount,
		textureCount: textures.size,
	};
}

function snapshot(root, clip, normalizedTime) {
	const clone = cloneSkeleton(root);
	const mixer = new THREE.AnimationMixer(clone);
	const action = mixer.clipAction(clip);
	action.setLoop(THREE.LoopOnce, 1);
	action.clampWhenFinished = true;
	action.play();
	mixer.setTime(clip.duration * normalizedTime);
	clone.updateMatrixWorld(true);
	const joints = Object.fromEntries(
		DIAGNOSTIC_JOINTS.map((name) => {
			const bone = clone.getObjectByName(name);
			if (!bone) throw new Error(`Round-trip artifact is missing ${name}.`);
			return [
				name,
				{
					position: bone.getWorldPosition(new THREE.Vector3()).toArray(),
					rotation: bone
						.getWorldQuaternion(new THREE.Quaternion())
						.normalize()
						.toArray(),
				},
			];
		}),
	);
	mixer.stopAllAction();
	mixer.uncacheRoot(clone);
	return joints;
}

function comparePoses(bakedRoot, bakedClip, runtimeClip) {
	let maxAngularDifferenceDegrees = 0;
	let maxPositionDifferenceMetres = 0;
	let maxAngularJoint;
	let maxPositionJoint;
	const samples = SAMPLE_TIMES.map((normalizedTime) => {
		const baked = snapshot(bakedRoot, bakedClip, normalizedTime);
		const runtime = snapshot(bakedRoot, runtimeClip, normalizedTime);
		let sampleMaxAngle = 0;
		let sampleMaxPosition = 0;
		for (const name of DIAGNOSTIC_JOINTS) {
			const position = new THREE.Vector3()
				.fromArray(baked[name].position)
				.distanceTo(new THREE.Vector3().fromArray(runtime[name].position));
			const angle = THREE.MathUtils.radToDeg(
				new THREE.Quaternion()
					.fromArray(baked[name].rotation)
					.angleTo(new THREE.Quaternion().fromArray(runtime[name].rotation)),
			);
			sampleMaxPosition = Math.max(sampleMaxPosition, position);
			sampleMaxAngle = Math.max(sampleMaxAngle, angle);
			if (position > maxPositionDifferenceMetres) {
				maxPositionDifferenceMetres = position;
				maxPositionJoint = { name, normalizedTime };
			}
			if (angle > maxAngularDifferenceDegrees) {
				maxAngularDifferenceDegrees = angle;
				maxAngularJoint = { name, normalizedTime };
			}
		}
		return {
			maxAngularDifferenceDegrees: sampleMaxAngle,
			maxPositionDifferenceMetres: sampleMaxPosition,
			normalizedTime,
		};
	});
	return {
		maxAngularDifferenceDegrees,
		maxAngularJoint,
		maxPositionDifferenceMetres,
		maxPositionJoint,
		passed:
			maxPositionDifferenceMetres <= POSITION_TOLERANCE_METRES &&
			maxAngularDifferenceDegrees <= ANGLE_TOLERANCE_DEGREES,
		samples,
		tolerances: {
			maxAngularDifferenceDegrees: ANGLE_TOLERANCE_DEGREES,
			maxPositionDifferenceMetres: POSITION_TOLERANCE_METRES,
		},
	};
}

function rootResidual(root, clip) {
	const first = snapshot(root, clip, 0).pelvis.position;
	const last = snapshot(root, clip, 1).pelvis.position;
	return {
		x: last[0] - first[0],
		z: last[2] - first[2],
	};
}

function validateIndependentClones(root, clip) {
	const first = cloneSkeleton(root);
	const second = cloneSkeleton(root);
	const firstPelvis = first.getObjectByName("pelvis");
	const secondPelvis = second.getObjectByName("pelvis");
	const initialSecond = secondPelvis.quaternion.clone();
	const firstMixer = new THREE.AnimationMixer(first);
	const secondMixer = new THREE.AnimationMixer(second);
	firstMixer.clipAction(clip).play();
	secondMixer.clipAction(clip).play();
	firstMixer.update(clip.duration * 0.35);
	const secondUnaffected = secondPelvis.quaternion.equals(initialSecond);
	secondMixer.update(clip.duration * 0.7);
	const separateBones = firstPelvis !== secondPelvis;
	const separateSkeletons = uniqueSkeletons(first).every(
		(skeleton) => !uniqueSkeletons(second).includes(skeleton),
	);
	firstMixer.stopAllAction();
	secondMixer.stopAllAction();
	for (const skeleton of uniqueSkeletons(first)) skeleton.pose();
	const restRestored = uniqueSkeletons(first).every((skeleton) =>
		skeleton.bones.every((bone, index) =>
			bone.matrixWorld
				.clone()
				.multiply(skeleton.boneInverses[index])
				.elements.every(Number.isFinite),
		),
	);
	firstMixer.uncacheRoot(first);
	secondMixer.uncacheRoot(second);
	return {
		passed:
			secondUnaffected && separateBones && separateSkeletons && restRestored,
		restRestored,
		secondUnaffected,
		separateBones,
		separateMixers: firstMixer !== secondMixer,
		separateSkeletons,
	};
}

export async function validateOfflineBakedArtifact(clipId, profile) {
	const definition = CLIPS[clipId];
	if (!definition) throw new Error(`Unknown baked clip: ${clipId}`);
	const [gltf, inspection, runtimeJson] = await Promise.all([
		loadWithProductionLoader(definition.artifact),
		inspectAnimationSource(definition.artifact),
		readFile(definition.runtimeReference, "utf8"),
	]);
	const clip = gltf.animations.find(
		(candidate) => candidate.name === definition.clipName,
	);
	if (!clip)
		throw new Error(
			`${definition.artifact} has no ${definition.clipName} clip.`,
		);
	const runtimeClip = THREE.AnimationClip.parse(JSON.parse(runtimeJson));
	const targetNames = new Set(
		inspection.skeletons.flatMap((skeleton) =>
			skeleton.joints.map((joint) => joint.name),
		),
	);
	const trackTargets = clip.tracks.map((track) =>
		track.name.slice(0, track.name.lastIndexOf(".")),
	);
	const analysis = analyzeLoadedRoot(gltf.scene);
	const poseComparison = comparePoses(gltf.scene, clip, runtimeClip);
	const residual = rootResidual(gltf.scene, clip);
	const cloneValidation = validateIndependentClones(gltf.scene, clip);
	const checks = {
		clipDuration: Math.abs(clip.duration - runtimeClip.duration) <= 0.000001,
		clipName: clip.name === definition.clipName,
		finiteKeyframes: clip.tracks.every((track) =>
			Array.from(track.values).every(Number.isFinite),
		),
		goldenJointCount:
			inspection.skeletons.length === 1 &&
			inspection.skeletons[0].jointCount === profile.targetSkeleton.jointCount,
		materialAndTextureStructure:
			analysis.materialCount === 3 && analysis.textureCount >= 5,
		noMixamoRig: ![...targetNames].some((name) => /mixamo/iu.test(name)),
		rootMotion: Math.hypot(residual.x, residual.z) <= 0.00001,
		targetOnlyTracks:
			trackTargets.length === 23 &&
			trackTargets.every((name) => targetNames.has(name)),
	};
	return {
		analysis,
		artifact: definition.artifact,
		checks,
		cloneValidation,
		clip: {
			duration: clip.duration,
			name: clip.name,
			trackCount: clip.tracks.length,
		},
		inspection: {
			nodeCount: inspection.nodeCount,
			skeletonCount: inspection.skeletons.length,
			targetJointCount: inspection.skeletons[0]?.jointCount,
			warnings: inspection.warnings,
		},
		passed:
			Object.values(checks).every(Boolean) &&
			cloneValidation.passed &&
			poseComparison.passed,
		poseComparison,
		rootMotionResidual: residual,
	};
}

export async function validateOfflineBakes({
	outputPath = `${OUTPUT_ROOT}/offline-bake-roundtrip-report.json`,
} = {}) {
	const profile = await loadRetargetProfile();
	const [idle, walk] = await Promise.all([
		validateOfflineBakedArtifact("idle", profile),
		validateOfflineBakedArtifact("walk", profile),
	]);
	const report = {
		artifactFormatDecision:
			"Full Golden target GLB per clip: proven reliable through the production GLTFLoader and skeleton-safe clone path; animation-only reuse remains unproven.",
		idle,
		passed: idle.passed && walk.passed,
		profileVersion: profile.version,
		textureValidation:
			"Node validation uses one-pixel createImageBitmap stand-ins; real embedded texture decode is validated in browser Playwright.",
		walk,
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	if (!report.passed)
		throw new Error(`Offline bake round-trip validation failed: ${outputPath}`);
	return report;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const report = await validateOfflineBakes();
	console.log(JSON.stringify(report, null, 2));
}
