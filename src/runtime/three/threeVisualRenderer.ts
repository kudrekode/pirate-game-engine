import * as THREE from "three";
import type { EntityMarker } from "../../editor/sections/entityMarkers";
import {
	applyPlaceholderMetadata,
	createPlaceholderMeshGroup,
	type PlaceholderSelectionMetadata,
} from "./placeholderMeshes";
import {
	requestThreeVisualAsset,
	type ThreeVisualAssetRequest,
} from "./threeVisualAssetLoader";
import { threeVisualRotationOffsetToRadians } from "./threeVisuals";
import { applyShadowRole } from "./worldPresentation";

export type ThreeVisualRenderResult = {
	group: THREE.Group;
	assetStatus: ThreeVisualAssetRequest["status"] | "not_requested";
	usedAsset: boolean;
};

export type ThreeVisualRenderOptions = {
	metadata?: PlaceholderSelectionMetadata;
	onAssetStateChange?: () => void;
	selected?: boolean;
};

function getBaseY(marker: EntityMarker): number {
	return Math.max(0, marker.threeY - marker.height / 2);
}

function applyMarkerTransform(group: THREE.Group, marker: EntityMarker): void {
	group.position.set(
		marker.threeX,
		getBaseY(marker) + (marker.visual?.heightOffset ?? 0),
		marker.threeZ,
	);
	group.rotation.y = threeVisualRotationOffsetToRadians(marker.visual);
	group.scale.setScalar(marker.visual?.scale ?? 1);
}

function createAssetGroup(
	marker: EntityMarker,
	assetObject: THREE.Object3D,
	options: ThreeVisualRenderOptions,
): THREE.Group {
	const group = new THREE.Group();
	applyMarkerTransform(group, marker);
	applyShadowRole(assetObject, {
		cast: marker.visual?.asset?.castShadow ?? false,
		receive: marker.visual?.asset?.receiveShadow ?? false,
	});
	group.add(assetObject);
	if (options.metadata) {
		applyPlaceholderMetadata(group, options.metadata);
	}
	return group;
}

function createFallbackGroup(
	marker: EntityMarker,
	options: ThreeVisualRenderOptions,
	assetStatus: ThreeVisualRenderResult["assetStatus"],
): ThreeVisualRenderResult {
	return {
		assetStatus,
		group: createPlaceholderMeshGroup(marker, {
			metadata: options.metadata,
			selected: options.selected,
		}),
		usedAsset: false,
	};
}

export function createThreeVisualMarkerGroup(
	marker: EntityMarker,
	options: ThreeVisualRenderOptions = {},
): ThreeVisualRenderResult {
	if (marker.visual?.mode !== "asset") {
		return createFallbackGroup(marker, options, "not_requested");
	}

	const assetRequest = requestThreeVisualAsset(marker.visual.asset, {
		onStateChange: options.onAssetStateChange,
	});
	if (assetRequest.status !== "loaded") {
		return createFallbackGroup(marker, options, assetRequest.status);
	}

	return {
		assetStatus: "loaded",
		group: createAssetGroup(marker, assetRequest.object, options),
		usedAsset: true,
	};
}
