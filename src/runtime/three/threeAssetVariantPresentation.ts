import * as THREE from "three";
import type { AssetCreatorVariant } from "../../types/game";
import { requestThreeVisualAsset } from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

const socketBones: Record<string, string[]> = {
	right_hand: ["hand_r", "RightHand", "mixamorigRightHand"],
	left_hand: ["hand_l", "LeftHand", "mixamorigLeftHand"],
	head: ["head", "Head", "mixamorigHead"],
	back: [
		"spine_03",
		"spine_02",
		"spine_01",
		"Spine2",
		"Chest",
		"mixamorigSpine2",
	],
};

export function resolveAssetVariantSocket(
	root: THREE.Object3D,
	socket: string,
) {
	for (const name of Object.getOwnPropertyDescriptor(socketBones, socket) !==
	undefined
		? socketBones[socket]
		: [socket]) {
		const node = root.getObjectByName(name);
		if ((node as THREE.Bone | undefined)?.isBone) return node;
	}
}

export function applyAssetVariantTint(
	root: THREE.Object3D,
	tint: string | undefined,
) {
	const copies = new Map<THREE.Material, THREE.Material>();
	if (tint)
		root.traverse((node) => {
			const mesh = node as THREE.Mesh;
			if (!mesh.isMesh) return;
			const copy = (material: THREE.Material) => {
				if (!("color" in material) || !(material.color instanceof THREE.Color))
					return material;
				const existing = copies.get(material);
				if (existing) return existing;
				const clone = material.clone() as THREE.MeshStandardMaterial;
				clone.color.multiply(new THREE.Color(tint));
				copies.set(material, clone);
				return clone;
			};
			mesh.material = Array.isArray(mesh.material)
				? mesh.material.map(copy)
				: copy(mesh.material);
		});
	return () => {
		for (const material of copies.values()) material.dispose();
	};
}

export function applyAssetVariantPresentation(
	root: THREE.Object3D,
	variant: AssetCreatorVariant | undefined,
	prop: ThreeVisualAssetDefinition | undefined,
) {
	if (!variant) return undefined;
	const disposeTint = applyAssetVariantTint(root, variant.tint);
	const radians = THREE.MathUtils.degToRad;
	root.traverse((node) => {
		const rotation =
			Object.getOwnPropertyDescriptor(variant.pose, node.name) !== undefined
				? variant.pose[node.name]
				: undefined;
		if ((node as THREE.Bone).isBone && rotation)
			node.rotation.set(
				radians(rotation.x),
				radians(rotation.y),
				radians(rotation.z),
				"XYZ",
			);
	});
	const attachment = variant.attachment;
	const socket =
		attachment && resolveAssetVariantSocket(root, attachment.socket);
	let live = true;
	let attached: THREE.Group | undefined;
	let disposePropTint: (() => void) | undefined;
	function attach() {
		if (!live || !socket || !attachment || !prop || attached) return;
		const request = requestThreeVisualAsset(prop, { onStateChange: attach });
		if (request.status !== "loaded") return;
		disposePropTint = applyAssetVariantTint(request.object, prop.variant?.tint);
		const { position, rotation, scale } = attachment;
		attached = new THREE.Group();
		attached.name = `asset_socket_${attachment.socket}`;
		attached.add(request.object);
		attached.position.set(position.x, position.y, position.z);
		attached.rotation.set(
			radians(rotation.x),
			radians(rotation.y),
			radians(rotation.z),
		);
		attached.rotation.y += radians(prop.defaultRotationOffset ?? 0);
		attached.scale.setScalar((prop.defaultScale ?? 1) * scale);
		socket.add(attached);
	}
	attach();
	return () => {
		live = false;
		attached?.removeFromParent();
		disposePropTint?.();
		attached?.traverse((node) => {
			const mesh = node as THREE.SkinnedMesh;
			if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
		});
		disposeTint();
	};
}
