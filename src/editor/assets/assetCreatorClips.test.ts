// @ts-expect-error File checks run only in the isolated root-node Vitest project.
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { AssetCreatorClip } from "../../types/game";
import {
	applyAssetCreatorClipEdits,
	assetCreatorClipFitsRig,
	getAssetCreatorBoneTrack,
	readAssetCreatorRotation,
	upsertAssetCreatorKey,
} from "./assetCreatorClips";

const draft: AssetCreatorClip = {
	id: "clip-variant",
	name: "Edited rotation",
	sourceAssetId: "asset",
	sourceClipName: "Original",
	loop: true,
	keys: [],
};

describe("Asset Creator clips", () => {
	it("validates all named track targets including explicit skeleton bindings", () => {
		const clip = new THREE.AnimationClip("Original", 1, [
			new THREE.QuaternionKeyframeTrack(
				"Armature.bones[hand_r].quaternion",
				[0],
				[0, 0, 0, 1],
			),
			new THREE.VectorKeyframeTrack("pelvis.position", [0], [0, 0, 0]),
		]);

		expect(
			assetCreatorClipFitsRig(clip, new Set(["Armature", "hand_r", "pelvis"])),
		).toBe(true);
		expect(assetCreatorClipFitsRig(clip, new Set(["Armature", "pelvis"]))).toBe(
			false,
		);
		expect(assetCreatorClipFitsRig(clip, new Set(["Armature", "hand_r"]))).toBe(
			false,
		);
		expect(getAssetCreatorBoneTrack(clip, "hand_r")).toBe(clip.tracks[0]);
	});

	it("inserts and replaces a local rotation key and leaves the source clip intact", () => {
		const original = new THREE.AnimationClip("Original", 1, [
			new THREE.QuaternionKeyframeTrack(
				"hand_r.quaternion",
				[0, 1],
				[0, 0, 0, 1, 0, 0, 0, 1],
			),
		]);
		const first = {
			bone: "hand_r",
			time: 0.4,
			rotation: { x: 15, y: 0, z: 0 },
		};
		const replacement = { ...first, rotation: { x: 45, y: 0, z: 0 } };
		const keys = upsertAssetCreatorKey(
			upsertAssetCreatorKey([], first),
			replacement,
		);
		const persisted = JSON.parse(
			JSON.stringify({ ...draft, keys }),
		) as AssetCreatorClip;
		const edited = applyAssetCreatorClipEdits(original, persisted);

		expect(keys).toEqual([replacement]);
		expect(edited.name).toBe(draft.name);
		expect(edited.duration).toBe(original.duration);
		expect(readAssetCreatorRotation(edited, "hand_r", 0.4)?.x).toBeCloseTo(45);
		expect(readAssetCreatorRotation(original, "hand_r", 0.4)?.x).toBeCloseTo(0);
		expect(Array.from(original.tracks[0].times)).toEqual([0, 1]);
	});

	it("preserves the checked-in Merewatch rider GLB's cubic quaternion track format", async () => {
		const bytes = await readFile(
			new URL(
				"../../../public/assets/hollow-kingdom/rider.glb",
				import.meta.url,
			),
		);
		const gltf = await new GLTFLoader().parseAsync(
			new Uint8Array(bytes).buffer,
			"",
		);
		const [original] = gltf.animations;
		const bone = "pelvis";
		const track = getAssetCreatorBoneTrack(original, bone);
		if (!track) throw new Error("Expected a rider pelvis quaternion track");
		const time = (track.times[0] + track.times[1]) / 2;
		const untouchedRotation = readAssetCreatorRotation(original, bone, 0);
		const originalSampleCount = track.times.length;
		const edited = applyAssetCreatorClipEdits(original, {
			...draft,
			keys: [{ bone, time, rotation: { x: 20, y: 0, z: 0 } }],
		});
		const editedTrack = getAssetCreatorBoneTrack(edited, bone);

		expect(track.getValueSize()).toBe(12);
		expect(editedTrack?.getValueSize()).toBe(12);
		expect(editedTrack?.times).toHaveLength(originalSampleCount + 1);
		expect(readAssetCreatorRotation(edited, bone, time)?.x).toBeCloseTo(20);
		expect(readAssetCreatorRotation(edited, bone, 0)).toEqual(
			untouchedRotation,
		);
		expect(track.times).toHaveLength(originalSampleCount);
	});
});
