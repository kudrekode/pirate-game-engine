import * as THREE from "three";
import type { EntityMarker } from "../../editor/sections/entityMarkers";
import {
	applyPlaceholderMetadata,
	createPlaceholderMeshGroup,
	type PlaceholderSelectionMetadata,
} from "./placeholderMeshes";
import type { ThreePerformanceDiagnostics } from "./threePerformanceDiagnostics";
import {
	requestThreeVisualAsset,
	type ThreeVisualAssetRequest,
} from "./threeVisualAssetLoader";
import { resolveThreeVisualAssetTransform } from "./threeVisuals";
import { applyShadowRole } from "./worldPresentation";

export type ThreeVisualRenderResult = {
	assetDefinitionId?: string;
	group: THREE.Group;
	assetStatus: ThreeVisualAssetRequest["status"] | "not_requested";
	usedAsset: boolean;
};

export type ThreeVisualRenderOptions = {
	diagnostics?: ThreePerformanceDiagnostics;
	metadata?: PlaceholderSelectionMetadata;
	onAssetStateChange?: () => void;
	selected?: boolean;
};

function getBaseY(marker: EntityMarker): number {
	return Math.max(0, marker.threeY - marker.height / 2);
}

function applyMarkerTransform(
	group: THREE.Group,
	marker: EntityMarker,
	transform: ReturnType<typeof resolveThreeVisualAssetTransform>,
): void {
	group.position.set(
		marker.threeX,
		getBaseY(marker) + transform.heightOffset,
		marker.threeZ,
	);
	group.rotation.y = transform.rotationYRadians;
	group.scale.setScalar(transform.scale);
}

function createAssetGroup(
	marker: EntityMarker,
	assetObject: THREE.Object3D,
	analysis: Extract<ThreeVisualAssetRequest, { status: "loaded" }>["analysis"],
	options: ThreeVisualRenderOptions,
): THREE.Group {
	const group = new THREE.Group();
	const transform = resolveThreeVisualAssetTransform(marker.visual, analysis);
	applyMarkerTransform(group, marker, transform);
	assetObject.position.y += transform.normalizationOffsetY;
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
	assetDefinitionId?: string,
): ThreeVisualRenderResult {
	if (assetStatus === "error" || assetStatus === "missing") {
		options.diagnostics?.recordAssetFallback(assetStatus, assetDefinitionId);
	}
	return {
		assetDefinitionId,
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
		return createFallbackGroup(
			marker,
			options,
			assetRequest.status,
			assetRequest.status === "missing"
				? marker.visual.asset?.id
				: assetRequest.definition.id,
		);
	}

	options.diagnostics?.recordAssetClone(assetRequest.definition.id);
	return {
		assetDefinitionId: assetRequest.definition.id,
		assetStatus: "loaded",
		group: createAssetGroup(
			marker,
			assetRequest.object,
			assetRequest.analysis,
			options,
		),
		usedAsset: true,
	};
}
