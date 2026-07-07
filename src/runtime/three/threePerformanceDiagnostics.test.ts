import { describe, expect, it } from "vitest";
import {
	createThreePerformanceDiagnostics,
	emitThreePerformanceDiagnosticsEvent,
	formatThreePerformanceSnapshot,
} from "./threePerformanceDiagnostics";

describe("three performance diagnostics", () => {
	it("records frame, renderer, scene, terrain, asset, pointer, and tick metrics", () => {
		let now = 0;
		const diagnostics = createThreePerformanceDiagnostics({
			label: "Diagnostics Test",
			now: () => now,
		});

		diagnostics.recordFrame(16);
		now = 300;
		diagnostics.recordFrame(20);
		diagnostics.recordRenderCall(4.25);
		diagnostics.recordRendererInfo({
			memory: { geometries: 5, textures: 6 },
			programs: [{}, {}],
			render: { calls: 7, lines: 8, points: 9, triangles: 123 },
		});
		diagnostics.recordSceneBuild("test rebuild", 12.4);
		now = 330;
		diagnostics.recordSceneCleanup();
		diagnostics.recordTerrainRebuild({
			durationMs: 3.2,
			meshCount: 11,
			mode: "smooth",
			tileCount: 10,
		});
		diagnostics.setSceneEntityCounts({
			assetStatuses: [
				{ definitionId: "ship", status: "loaded", usedAsset: true },
				{ definitionId: "crate", status: "loading", usedAsset: false },
				{ status: "not_requested", usedAsset: false },
			],
			entityCount: 4,
		});
		diagnostics.recordPointerMove();
		now = 600;
		diagnostics.recordPointerMove();
		diagnostics.recordPick(1.6);
		diagnostics.recordRuntimeTick(2.7);
		emitThreePerformanceDiagnosticsEvent({
			definitionId: "ship",
			status: "load_start",
		});
		emitThreePerformanceDiagnosticsEvent({
			definitionId: "ship",
			status: "load_success",
		});
		emitThreePerformanceDiagnosticsEvent({
			definitionId: "barrel",
			message: "invalid glb",
			status: "load_failure",
		});
		emitThreePerformanceDiagnosticsEvent({
			definitionId: "ship",
			status: "cache_hit",
		});
		diagnostics.recordAssetClone("ship");

		const snapshot = diagnostics.getSnapshot();
		expect(snapshot.label).toBe("Diagnostics Test");
		expect(snapshot.frame).toMatchObject({
			averageFrameMs: 18,
			frameCount: 2,
			fps: 6.7,
			lastRenderMs: 4.3,
			worstFrameMs: 20,
		});
		expect(snapshot.renderer).toMatchObject({
			drawCalls: 7,
			geometries: 5,
			lines: 8,
			points: 9,
			programs: 2,
			textures: 6,
			triangles: 123,
		});
		expect(snapshot.scene).toMatchObject({
			buildCount: 1,
			cleanupCount: 1,
			entityCount: 4,
			lastRebuildReason: "test rebuild",
			timeSinceLastRebuildMs: 300,
		});
		expect(snapshot.asset).toMatchObject({
			activeImportedAssetInstances: 1,
			activeCloneInstances: 1,
			cacheHitCount: 1,
			cloneCount: 1,
			fallbackPlaceholderCount: 1,
			loadingFallbackCount: 1,
			loadFailureCount: 1,
			loadStartedCount: 1,
			loadSuccessCount: 1,
			statusCounts: {
				error: 0,
				loaded: 1,
				loading: 1,
				missing: 0,
				not_requested: 1,
			},
		});
		expect(snapshot.terrain).toMatchObject({
			lastDurationMs: 3.2,
			meshCount: 11,
			mode: "smooth",
			rebuildCount: 1,
			tileCount: 10,
		});
		expect(snapshot.pointer).toMatchObject({
			lastPickMs: 1.6,
			pickCount: 1,
			pointerMoveCount: 2,
			pointerMovesPerSecond: 3.7,
		});
		expect(snapshot.runtime).toMatchObject({
			lastTickMs: 2.7,
			tickCount: 1,
		});
		expect(formatThreePerformanceSnapshot(snapshot)).toContain(
			"Diagnostics Test performance snapshot",
		);

		diagnostics.dispose();
		emitThreePerformanceDiagnosticsEvent({ status: "load_start" });
		expect(diagnostics.getSnapshot().asset.loadStartedCount).toBe(1);
	});

	it("tracks rebuild reason counts and thresholded hitches", () => {
		let now = 0;
		const diagnostics = createThreePerformanceDiagnostics({
			now: () => now,
		});

		diagnostics.recordSceneBuild("asset state changed", 75);
		now = 100;
		diagnostics.recordSceneBuild("asset state changed", 8);
		now = 200;
		diagnostics.recordSceneBuild("object state changed", 525);
		now = 300;
		diagnostics.recordFrame(1200);

		const snapshot = diagnostics.getSnapshot();
		expect(snapshot.scene.reasonCounts).toEqual({
			"asset state changed": 2,
			"object state changed": 1,
		});
		expect(snapshot.hitches).toMatchObject({
			lastPhase: "scene rebuild",
			over1000MsCount: 1,
			over100MsCount: 2,
			over500MsCount: 2,
			over50MsCount: 3,
		});
		expect(
			snapshot.hitches.recent[snapshot.hitches.recent.length - 1],
		).toMatchObject({
			phase: "scene rebuild",
			thresholdMs: 1000,
		});

		diagnostics.dispose();
	});
});
