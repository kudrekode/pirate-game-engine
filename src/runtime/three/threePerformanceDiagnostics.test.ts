import { describe, expect, it } from "vitest";
import {
	createThreePerformanceDiagnostics,
	emitThreePerformanceDiagnosticsEvent,
	formatThreePerformanceSnapshot,
	registerThreePerformanceDiagnostics,
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
		diagnostics.recordFrameCallback(6.4);
		diagnostics.recordRenderCall(4.25);
		diagnostics.recordWaterUpdate(0.7);
		diagnostics.recordRafLoopStart("test start");
		diagnostics.recordRafLoopCancel("test cancel");
		diagnostics.recordRafLoopStart("test restart");
		diagnostics.recordRendererInfo({
			memory: { geometries: 5, textures: 6 },
			programs: [{}, {}],
			render: { calls: 7, lines: 8, points: 9, triangles: 123 },
		});
		diagnostics.recordSceneBuild("test rebuild", 12.4);
		now = 330;
		diagnostics.recordSceneCleanup();
		diagnostics.recordTerrainRebuild({
			coastlineEdgeCount: 8,
			durationMs: 3.2,
			meshCount: 11,
			mode: "smooth",
			tileCount: 10,
			triangleCount: 22,
			vertexCount: 44,
			waterMeshCount: 2,
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
			activeImportedAssetIds: ["ship"],
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
			coastlineEdgeCount: 8,
			lastDurationMs: 3.2,
			meshCount: 11,
			mode: "smooth",
			rebuildCount: 1,
			tileCount: 10,
			triangleCount: 22,
			vertexCount: 44,
			waterMeshCount: 2,
		});
		expect(snapshot.pointer).toMatchObject({
			lastPickMs: 1.6,
			pickCount: 1,
			pointerMoveCount: 2,
			pointerMovesPerSecond: 3.7,
		});
		expect(snapshot.phases.frameCallback).toMatchObject({
			averageMs: 6.4,
			count: 1,
			lastMs: 6.4,
			worstMs: 6.4,
		});
		expect(snapshot.phases.waterUpdate).toMatchObject({
			averageMs: 0.7,
			count: 1,
			lastMs: 0.7,
			worstMs: 0.7,
		});
		expect(snapshot.raf).toMatchObject({
			activeLoopCount: 1,
			lastCancelReason: "test cancel",
			lastStartReason: "test restart",
			loopCancelCount: 1,
			loopRestartCount: 1,
			loopStartCount: 2,
		});
		expect(snapshot.runtime).toMatchObject({
			averageTickMs: 2.7,
			lastTickMs: 2.7,
			tickCount: 1,
			worstTickMs: 2.7,
		});
		expect(formatThreePerformanceSnapshot(snapshot)).toContain(
			"Diagnostics Test performance snapshot",
		);

		diagnostics.dispose();
		emitThreePerformanceDiagnosticsEvent({ status: "load_start" });
		expect(diagnostics.getSnapshot().asset.loadStartedCount).toBe(1);
	});

	it("tracks rebuild reason counts and thresholded hitches by phase", () => {
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
		diagnostics.recordFrameInterval(1200);

		const snapshot = diagnostics.getSnapshot();
		expect(snapshot.scene.reasonCounts).toEqual({
			"asset state changed": 2,
			"object state changed": 1,
		});
		expect(snapshot.hitches).toMatchObject({
			lastPhase: "raf_interval",
			over1000MsCount: 1,
			over100MsCount: 2,
			over500MsCount: 2,
			over50MsCount: 3,
		});
		expect(
			snapshot.hitches.recent[snapshot.hitches.recent.length - 1],
		).toMatchObject({
			detail: "requestAnimationFrame interval",
			phase: "raf_interval",
			thresholdMs: 1000,
		});

		diagnostics.dispose();
	});

	it("does not attribute a long RAF interval to a prior short render", () => {
		const diagnostics = createThreePerformanceDiagnostics();

		diagnostics.recordRenderCall(1.2);
		diagnostics.recordFrameCallback(2.4);
		diagnostics.recordFrameInterval(68);

		const snapshot = diagnostics.getSnapshot();
		expect(snapshot.frame).toMatchObject({
			averageFrameIntervalMs: 68,
			lastFrameIntervalMs: 68,
			worstFrameIntervalMs: 68,
		});
		expect(snapshot.phases.render).toMatchObject({
			averageMs: 1.2,
			lastMs: 1.2,
			worstMs: 1.2,
		});
		expect(snapshot.phases.frameCallback).toMatchObject({
			averageMs: 2.4,
			lastMs: 2.4,
			worstMs: 2.4,
		});
		expect(
			snapshot.hitches.recent[snapshot.hitches.recent.length - 1],
		).toMatchObject({
			durationMs: 68,
			phase: "raf_interval",
		});

		diagnostics.dispose();
	});

	it("attributes actual long render, runtime tick, visual, and camera durations to their phases", () => {
		const diagnostics = createThreePerformanceDiagnostics();

		diagnostics.recordRenderCall(72);
		diagnostics.recordRuntimeTick(10);
		diagnostics.recordRuntimeTick(30);
		diagnostics.recordVisualUpdate(5);
		diagnostics.recordVisualUpdate(15);
		diagnostics.recordCameraUpdate(3);
		diagnostics.recordCameraUpdate(9);

		const snapshot = diagnostics.getSnapshot();
		expect(
			snapshot.hitches.recent[snapshot.hitches.recent.length - 1],
		).toMatchObject({
			durationMs: 72,
			phase: "render",
		});
		expect(snapshot.phases.render).toMatchObject({
			averageMs: 72,
			count: 1,
			lastMs: 72,
			worstMs: 72,
		});
		expect(snapshot.phases.runtimeTick).toMatchObject({
			averageMs: 20,
			count: 2,
			lastMs: 30,
			worstMs: 30,
		});
		expect(snapshot.phases.visualUpdate).toMatchObject({
			averageMs: 10,
			count: 2,
			lastMs: 15,
			worstMs: 15,
		});
		expect(snapshot.phases.cameraUpdate).toMatchObject({
			averageMs: 6,
			count: 2,
			lastMs: 9,
			worstMs: 9,
		});
		expect(snapshot.runtime).toMatchObject({
			averageTickMs: 20,
			lastTickMs: 30,
			tickCount: 2,
			worstTickMs: 30,
		});

		diagnostics.dispose();
	});

	it("resets timing samples without clearing scene or active asset state", () => {
		const diagnostics = createThreePerformanceDiagnostics({
			label: "Reset Test",
		});
		diagnostics.setSceneEntityCounts({
			assetStatuses: [
				{ definitionId: "pirate-chest", status: "loaded", usedAsset: true },
				{
					definitionId: "pirate-small-ship",
					status: "loaded",
					usedAsset: true,
				},
			],
			entityCount: 16,
			sceneIdentity: {
				areaId: "area_main",
				areaName: "Main Area",
				projectName: "Demo Adventure",
			},
		});
		diagnostics.recordFrameInterval(90);
		diagnostics.recordFrameCallback(33);
		diagnostics.recordRenderCall(65);
		diagnostics.recordRafLoopStart("initial loop");
		diagnostics.recordRuntimeTick(12);
		diagnostics.recordWaterUpdate(4);

		diagnostics.resetSampleWindow();

		const snapshot = diagnostics.getSnapshot();
		expect(snapshot.frame).toMatchObject({
			frameCount: 0,
			lastFrameIntervalMs: 0,
			worstFrameIntervalMs: 0,
		});
		expect(snapshot.hitches).toMatchObject({
			lastPhase: "unknown",
			over50MsCount: 0,
			recent: [],
		});
		expect(snapshot.phases.render).toMatchObject({ count: 0, worstMs: 0 });
		expect(snapshot.phases.frameCallback).toMatchObject({
			count: 0,
			worstMs: 0,
		});
		expect(snapshot.phases.waterUpdate).toMatchObject({
			count: 0,
			worstMs: 0,
		});
		expect(snapshot.raf).toMatchObject({
			activeLoopCount: 1,
			loopStartCount: 1,
		});
		expect(snapshot.runtime).toMatchObject({ tickCount: 0, worstTickMs: 0 });
		expect(snapshot.scene).toMatchObject({
			areaId: "area_main",
			areaName: "Main Area",
			entityCount: 16,
			projectName: "Demo Adventure",
		});
		expect(snapshot.asset).toMatchObject({
			activeImportedAssetIds: ["pirate-chest", "pirate-small-ship"],
			activeImportedAssetInstances: 2,
			activeCloneInstances: 2,
			statusCounts: expect.objectContaining({ loaded: 2 }),
		});

		diagnostics.dispose();
	});

	it("exposes registered snapshots through the dev/test diagnostics global", () => {
		const diagnostics = createThreePerformanceDiagnostics({
			label: "Global Diagnostics Test",
		});
		diagnostics.recordFrame(16);
		const unregister = registerThreePerformanceDiagnostics(diagnostics);

		try {
			expect(window.__THREE_PERF_DIAGNOSTICS__?.labels()).toContain(
				"Global Diagnostics Test",
			);
			expect(
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
					"Global Diagnostics Test",
				)?.frame.frameCount,
			).toBe(1);
			expect(
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshots()[
					"Global Diagnostics Test"
				]?.label,
			).toBe("Global Diagnostics Test");
			expect(
				window.__THREE_PERF_DIAGNOSTICS__?.resetSampleWindow(
					"Global Diagnostics Test",
				),
			).toBe(true);

			unregister();
			expect(
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
					"Global Diagnostics Test",
				),
			).toBeNull();
		} finally {
			unregister();
			diagnostics.dispose();
		}
	});
});
