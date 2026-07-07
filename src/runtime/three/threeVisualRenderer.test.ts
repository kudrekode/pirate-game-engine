import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityMarker } from "../../editor/sections/entityMarkers";
import { getPlaceholderSelectableObjects } from "./placeholderMeshes";
import { createThreePerformanceDiagnostics } from "./threePerformanceDiagnostics";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";
import { createThreeVisualMarkerGroup } from "./threeVisualRenderer";

const assetDefinition: ThreeVisualAssetDefinition = {
	category: "character",
	id: "demo_character",
	kind: "glb",
	name: "Demo Character",
	url: "/assets/demo-character.glb",
};

function makeMarker(patch: Partial<EntityMarker> = {}): EntityMarker {
	return {
		color: 0xf97316,
		depth: 0.48,
		gridX: 1,
		gridY: 2,
		height: 1.25,
		id: "npc_1",
		kind: "npc",
		opacity: 1,
		shape: "cylinder",
		threeX: 1,
		threeY: 1.25,
		threeZ: 2,
		visual: {
			heightOffset: 0,
			mode: "placeholder",
			placeholderType: "npc",
			requestedMode: "placeholder",
			rotationOffset: 0,
			scale: 1,
			source: "inferred",
		},
		visualType: "npc",
		width: 0.48,
		...patch,
	};
}

async function flushAssetPromises(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

describe("Three visual marker renderer", () => {
	beforeEach(() => {
		clearThreeVisualAssetCacheForTests();
	});

	afterEach(() => {
		clearThreeVisualAssetCacheForTests();
	});

	it("uses the placeholder path when no imported asset is requested", () => {
		const metadata = { areaId: "area", entityId: "npc_1", entityType: "npc" };
		const result = createThreeVisualMarkerGroup(makeMarker(), {
			metadata,
			selected: true,
		});

		expect(result).toMatchObject({
			assetStatus: "not_requested",
			usedAsset: false,
		});
		expect(result.group.userData.selectionMetadata).toBe(metadata);
		expect(
			getPlaceholderSelectableObjects(result.group).length,
		).toBeGreaterThan(0);
	});

	it("reports current loading fallback status to diagnostics", () => {
		const loadAsync = vi.fn(() => new Promise<never>(() => undefined));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const diagnostics = createThreePerformanceDiagnostics();
		const marker = makeMarker({
			visual: {
				asset: assetDefinition,
				assetId: assetDefinition.id,
				heightOffset: 0,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 0,
				scale: 1,
				source: "authored",
			},
		});

		try {
			const result = createThreeVisualMarkerGroup(marker, { diagnostics });
			expect(result.assetStatus).toBe("loading");
			expect(result.usedAsset).toBe(false);
			diagnostics.setSceneEntityCounts({
				assetStatuses: [
					{
						definitionId: result.assetDefinitionId,
						status: result.assetStatus,
						usedAsset: result.usedAsset,
					},
				],
				entityCount: 1,
			});
			expect(diagnostics.getSnapshot().asset.statusCounts.loading).toBe(1);
			expect(diagnostics.getSnapshot().asset.loadingFallbackCount).toBe(1);
		} finally {
			diagnostics.dispose();
			restoreLoader();
		}
	});

	it("reports loaded imported assets as active clones instead of perpetual loading fallback", async () => {
		const source = new THREE.Group();
		const loadAsync = vi.fn(async () => ({ scene: source }));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const diagnostics = createThreePerformanceDiagnostics();
		const marker = makeMarker({
			visual: {
				asset: assetDefinition,
				assetId: assetDefinition.id,
				heightOffset: 0,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 0,
				scale: 1,
				source: "authored",
			},
		});

		try {
			createThreeVisualMarkerGroup(marker, { diagnostics });
			await flushAssetPromises();
			const loaded = createThreeVisualMarkerGroup(marker, { diagnostics });
			diagnostics.setSceneEntityCounts({
				assetStatuses: [
					{
						definitionId: loaded.assetDefinitionId,
						status: loaded.assetStatus,
						usedAsset: loaded.usedAsset,
					},
				],
				entityCount: 1,
			});

			const snapshot = diagnostics.getSnapshot();
			expect(snapshot.asset.cloneCount).toBe(1);
			expect(snapshot.asset.activeCloneInstances).toBe(1);
			expect(snapshot.asset.statusCounts.loaded).toBe(1);
			expect(snapshot.asset.statusCounts.loading).toBe(0);
			expect(snapshot.asset.loadingFallbackCount).toBe(0);
			expect(snapshot.asset.fallbackPlaceholderCount).toBe(0);
			expect(snapshot.asset.lastMessage).toBe(`clone: ${assetDefinition.id}`);
		} finally {
			diagnostics.dispose();
			restoreLoader();
		}
	});

	it("shows fallback while loading and swaps to a cloned asset when cached", async () => {
		const source = new THREE.Group();
		const child = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial(),
		);
		child.castShadow = true;
		child.receiveShadow = true;
		source.add(child);
		const loadAsync = vi.fn(async () => ({ scene: source }));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const onAssetStateChange = vi.fn();
		const metadata = { areaId: "area", entityId: "npc_1", entityType: "npc" };
		const marker = makeMarker({
			visual: {
				asset: assetDefinition,
				assetId: assetDefinition.id,
				heightOffset: 0.5,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 90,
				scale: 1.5,
				source: "authored",
			},
		});

		try {
			const loading = createThreeVisualMarkerGroup(marker, {
				metadata,
				onAssetStateChange,
			});
			expect(loading).toMatchObject({
				assetStatus: "loading",
				usedAsset: false,
			});
			await flushAssetPromises();
			expect(onAssetStateChange).toHaveBeenCalledTimes(1);

			const loaded = createThreeVisualMarkerGroup(marker, { metadata });
			expect(loaded).toMatchObject({
				assetStatus: "loaded",
				usedAsset: true,
			});
			expect(loaded.group.children[0]).not.toBe(source);
			expect(loaded.group.children[0].castShadow).toBe(false);
			expect(loaded.group.children[0].receiveShadow).toBe(false);
			expect(loaded.group.userData.selectionMetadata).toBe(metadata);
			expect(loaded.group.children[0].userData.selectionMetadata).toBe(
				metadata,
			);
			expect(loaded.group.position.y).toBeCloseTo(1.125);
			expect(loaded.group.rotation.y).toBeCloseTo(Math.PI / 2);
			expect(loaded.group.scale.x).toBeCloseTo(1.5);
			expect(loadAsync).toHaveBeenCalledTimes(1);
		} finally {
			restoreLoader();
		}
	});

	it("applies explicit imported asset shadow metadata when registered", async () => {
		const source = new THREE.Group();
		const child = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial(),
		);
		source.add(child);
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({ scene: source })),
		}));
		const marker = makeMarker({
			visual: {
				asset: {
					...assetDefinition,
					castShadow: true,
					receiveShadow: true,
				},
				assetId: assetDefinition.id,
				heightOffset: 0,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 0,
				scale: 1,
				source: "authored",
			},
		});

		try {
			createThreeVisualMarkerGroup(marker);
			await flushAssetPromises();

			const loaded = createThreeVisualMarkerGroup(marker);
			expect(loaded.usedAsset).toBe(true);
			expect(loaded.group.children[0].castShadow).toBe(true);
			expect(loaded.group.children[0].receiveShadow).toBe(true);
		} finally {
			restoreLoader();
		}
	});

	it("falls back to a placeholder after failed asset loads", async () => {
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => {
				throw new Error("load failed");
			}),
		}));
		const marker = makeMarker({
			visual: {
				asset: assetDefinition,
				assetId: assetDefinition.id,
				heightOffset: 0,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 0,
				scale: 1,
				source: "authored",
			},
		});

		try {
			createThreeVisualMarkerGroup(marker);
			await flushAssetPromises();

			const result = createThreeVisualMarkerGroup(marker, {
				metadata: { areaId: "area", entityId: "npc_1", entityType: "npc" },
			});
			expect(result).toMatchObject({
				assetStatus: "error",
				usedAsset: false,
			});
			expect(
				getPlaceholderSelectableObjects(result.group).length,
			).toBeGreaterThan(0);
		} finally {
			restoreLoader();
		}
	});
});
