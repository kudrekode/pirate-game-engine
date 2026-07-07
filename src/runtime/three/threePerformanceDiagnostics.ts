export type ThreeAssetDiagnosticsEvent = {
	definitionId?: string;
	message?: string;
	status:
		| "cache_hit"
		| "clone"
		| "fallback"
		| "load_failure"
		| "load_start"
		| "load_success";
	url?: string;
};

export type ThreePerformanceRendererInfo = {
	memory?: {
		geometries?: number;
		textures?: number;
	};
	programs?: unknown[] | null;
	render?: {
		calls?: number;
		lines?: number;
		points?: number;
		triangles?: number;
	};
};

export type ThreePerformanceSnapshot = {
	asset: {
		activeImportedAssetInstances: number;
		cacheHitCount: number;
		cloneCount: number;
		fallbackPlaceholderCount: number;
		lastMessage: string;
		loadFailureCount: number;
		loadStartedCount: number;
		loadSuccessCount: number;
	};
	frame: {
		averageFrameMs: number;
		frameCount: number;
		fps: number;
		lastFrameMs: number;
		lastRenderMs: number;
		worstFrameMs: number;
	};
	label: string;
	pointer: {
		lastPickMs: number;
		pickCount: number;
		pointerMoveCount: number;
		pointerMovesPerSecond: number;
	};
	recentEvents: string[];
	renderer: {
		drawCalls: number;
		geometries: number;
		lines: number;
		points: number;
		programs: number;
		textures: number;
		triangles: number;
	};
	runtime: {
		lastTickMs: number;
		tickCount: number;
	};
	scene: {
		buildCount: number;
		cleanupCount: number;
		entityCount: number;
		lastBuildMs: number;
		lastRebuildReason: string;
		timeSinceLastRebuildMs: number;
	};
	terrain: {
		lastDurationMs: number;
		meshCount: number;
		mode: string;
		rebuildCount: number;
		tileCount: number;
	};
};

export type ThreePerformanceDiagnostics = {
	dispose: () => void;
	formatSnapshot: () => string;
	getSnapshot: () => ThreePerformanceSnapshot;
	recordAssetFallback: (assetStatus: string) => void;
	recordFrame: (durationMs: number) => void;
	recordPointerMove: () => void;
	recordRenderCall: (durationMs: number) => void;
	recordRendererInfo: (info: ThreePerformanceRendererInfo | undefined) => void;
	recordRuntimeTick: (durationMs: number) => void;
	recordSceneBuild: (reason: string, durationMs: number) => void;
	recordSceneCleanup: () => void;
	recordTerrainRebuild: (details: {
		durationMs: number;
		meshCount: number;
		mode: string;
		tileCount: number;
	}) => void;
	recordPick: (durationMs: number) => void;
	setSceneEntityCounts: (counts: {
		activeImportedAssetInstances: number;
		entityCount: number;
		fallbackPlaceholderCount: number;
	}) => void;
};

type ThreeAssetDiagnosticsListener = (
	event: ThreeAssetDiagnosticsEvent,
) => void;

const assetDiagnosticsListeners = new Set<ThreeAssetDiagnosticsListener>();

export function subscribeThreePerformanceDiagnosticsEvents(
	listener: ThreeAssetDiagnosticsListener,
): () => void {
	assetDiagnosticsListeners.add(listener);
	return () => {
		assetDiagnosticsListeners.delete(listener);
	};
}

export function emitThreePerformanceDiagnosticsEvent(
	event: ThreeAssetDiagnosticsEvent,
): void {
	for (const listener of assetDiagnosticsListeners) {
		listener(event);
	}
}

function getDefaultNow(): number {
	return performance.now();
}

function roundMetric(value: number): number {
	return Math.round(value * 10) / 10;
}

function trimRecentEvents(events: string[]): string[] {
	return events.slice(-8);
}

function formatAssetEvent(event: ThreeAssetDiagnosticsEvent): string {
	const label = event.definitionId ?? event.url ?? "asset";
	if (event.message) {
		return `${event.status}: ${label} (${event.message})`;
	}
	return `${event.status}: ${label}`;
}

export function createThreePerformanceDiagnostics(
	options: { label?: string; now?: () => number } = {},
): ThreePerformanceDiagnostics {
	const label = options.label ?? "Three";
	const now = options.now ?? getDefaultNow;
	let frameCount = 0;
	let frameMsTotal = 0;
	let fps = 0;
	let lastFrameMs = 0;
	let lastRenderMs = 0;
	let worstFrameMs = 0;
	let fpsWindowStartMs = now();
	let fpsWindowFrameCount = 0;
	let pointerWindowStartMs = fpsWindowStartMs;
	let pointerWindowMoveCount = 0;
	let pointerMovesPerSecond = 0;
	let drawCalls = 0;
	let triangles = 0;
	let points = 0;
	let lines = 0;
	let geometries = 0;
	let textures = 0;
	let programs = 0;
	let buildCount = 0;
	let cleanupCount = 0;
	let lastBuildMs = 0;
	let lastRebuildReason = "not rebuilt";
	let lastRebuildAtMs = now();
	let entityCount = 0;
	let terrainRebuildCount = 0;
	let terrainMode = "unknown";
	let terrainTileCount = 0;
	let terrainMeshCount = 0;
	let lastTerrainDurationMs = 0;
	let loadStartedCount = 0;
	let loadSuccessCount = 0;
	let loadFailureCount = 0;
	let cacheHitCount = 0;
	let cloneCount = 0;
	let activeImportedAssetInstances = 0;
	let fallbackPlaceholderCount = 0;
	let lastAssetMessage = "";
	let pointerMoveCount = 0;
	let pickCount = 0;
	let lastPickMs = 0;
	let tickCount = 0;
	let lastTickMs = 0;
	let recentEvents: string[] = [];

	const pushEvent = (message: string) => {
		recentEvents = trimRecentEvents([...recentEvents, message]);
	};

	const recordAssetEvent = (event: ThreeAssetDiagnosticsEvent) => {
		if (event.status === "load_start") {
			loadStartedCount += 1;
		}
		if (event.status === "load_success") {
			loadSuccessCount += 1;
		}
		if (event.status === "load_failure") {
			loadFailureCount += 1;
		}
		if (event.status === "cache_hit") {
			cacheHitCount += 1;
		}
		if (event.status === "clone") {
			cloneCount += 1;
		}
		if (event.status === "fallback") {
			fallbackPlaceholderCount += 1;
		}
		lastAssetMessage = formatAssetEvent(event);
		pushEvent(lastAssetMessage);
	};

	const unsubscribe =
		subscribeThreePerformanceDiagnosticsEvents(recordAssetEvent);

	const diagnostics: ThreePerformanceDiagnostics = {
		dispose: unsubscribe,
		formatSnapshot: () =>
			formatThreePerformanceSnapshot(diagnostics.getSnapshot()),
		getSnapshot: () => {
			const currentNow = now();
			return {
				asset: {
					activeImportedAssetInstances,
					cacheHitCount,
					cloneCount,
					fallbackPlaceholderCount,
					lastMessage: lastAssetMessage,
					loadFailureCount,
					loadStartedCount,
					loadSuccessCount,
				},
				frame: {
					averageFrameMs:
						frameCount > 0 ? roundMetric(frameMsTotal / frameCount) : 0,
					frameCount,
					fps: roundMetric(fps),
					lastFrameMs: roundMetric(lastFrameMs),
					lastRenderMs: roundMetric(lastRenderMs),
					worstFrameMs: roundMetric(worstFrameMs),
				},
				label,
				pointer: {
					lastPickMs: roundMetric(lastPickMs),
					pickCount,
					pointerMoveCount,
					pointerMovesPerSecond: roundMetric(pointerMovesPerSecond),
				},
				recentEvents,
				renderer: {
					drawCalls,
					geometries,
					lines,
					points,
					programs,
					textures,
					triangles,
				},
				runtime: {
					lastTickMs: roundMetric(lastTickMs),
					tickCount,
				},
				scene: {
					buildCount,
					cleanupCount,
					entityCount,
					lastBuildMs: roundMetric(lastBuildMs),
					lastRebuildReason,
					timeSinceLastRebuildMs: roundMetric(currentNow - lastRebuildAtMs),
				},
				terrain: {
					lastDurationMs: roundMetric(lastTerrainDurationMs),
					meshCount: terrainMeshCount,
					mode: terrainMode,
					rebuildCount: terrainRebuildCount,
					tileCount: terrainTileCount,
				},
			};
		},
		recordAssetFallback: (assetStatus: string) => {
			recordAssetEvent({
				message: `status ${assetStatus}`,
				status: "fallback",
			});
		},
		recordFrame: (durationMs: number) => {
			frameCount += 1;
			fpsWindowFrameCount += 1;
			lastFrameMs = durationMs;
			frameMsTotal += durationMs;
			worstFrameMs = Math.max(worstFrameMs, durationMs);
			const currentNow = now();
			const elapsedMs = currentNow - fpsWindowStartMs;
			if (elapsedMs >= 250) {
				fps = (fpsWindowFrameCount / elapsedMs) * 1000;
				fpsWindowFrameCount = 0;
				fpsWindowStartMs = currentNow;
			}
		},
		recordPointerMove: () => {
			pointerMoveCount += 1;
			pointerWindowMoveCount += 1;
			const currentNow = now();
			const elapsedMs = currentNow - pointerWindowStartMs;
			if (elapsedMs >= 250) {
				pointerMovesPerSecond = (pointerWindowMoveCount / elapsedMs) * 1000;
				pointerWindowMoveCount = 0;
				pointerWindowStartMs = currentNow;
			}
		},
		recordRenderCall: (durationMs: number) => {
			lastRenderMs = durationMs;
		},
		recordRendererInfo: (info: ThreePerformanceRendererInfo | undefined) => {
			drawCalls = info?.render?.calls ?? 0;
			triangles = info?.render?.triangles ?? 0;
			points = info?.render?.points ?? 0;
			lines = info?.render?.lines ?? 0;
			geometries = info?.memory?.geometries ?? 0;
			textures = info?.memory?.textures ?? 0;
			programs = info?.programs?.length ?? 0;
		},
		recordRuntimeTick: (durationMs: number) => {
			tickCount += 1;
			lastTickMs = durationMs;
		},
		recordSceneBuild: (reason: string, durationMs: number) => {
			buildCount += 1;
			lastBuildMs = durationMs;
			lastRebuildReason = reason;
			lastRebuildAtMs = now();
			pushEvent(`scene build: ${reason}`);
		},
		recordSceneCleanup: () => {
			cleanupCount += 1;
		},
		recordTerrainRebuild: ({ durationMs, meshCount, mode, tileCount }) => {
			terrainRebuildCount += 1;
			terrainMode = mode;
			terrainTileCount = tileCount;
			terrainMeshCount = meshCount;
			lastTerrainDurationMs = durationMs;
		},
		recordPick: (durationMs: number) => {
			pickCount += 1;
			lastPickMs = durationMs;
		},
		setSceneEntityCounts: (counts) => {
			activeImportedAssetInstances = counts.activeImportedAssetInstances;
			entityCount = counts.entityCount;
			fallbackPlaceholderCount = counts.fallbackPlaceholderCount;
		},
	};
	return diagnostics;
}

export function formatThreePerformanceSnapshot(
	snapshot: ThreePerformanceSnapshot,
): string {
	return [
		`${snapshot.label} performance snapshot`,
		`frames: ${snapshot.frame.frameCount}, fps: ${snapshot.frame.fps}, avg frame ms: ${snapshot.frame.averageFrameMs}, worst ms: ${snapshot.frame.worstFrameMs}, render ms: ${snapshot.frame.lastRenderMs}`,
		`renderer: calls ${snapshot.renderer.drawCalls}, triangles ${snapshot.renderer.triangles}, points ${snapshot.renderer.points}, lines ${snapshot.renderer.lines}, geometries ${snapshot.renderer.geometries}, textures ${snapshot.renderer.textures}, programs ${snapshot.renderer.programs}`,
		`scene: builds ${snapshot.scene.buildCount}, cleanups ${snapshot.scene.cleanupCount}, entities ${snapshot.scene.entityCount}, last reason "${snapshot.scene.lastRebuildReason}", last build ms ${snapshot.scene.lastBuildMs}, since rebuild ms ${snapshot.scene.timeSinceLastRebuildMs}`,
		`assets: starts ${snapshot.asset.loadStartedCount}, successes ${snapshot.asset.loadSuccessCount}, failures ${snapshot.asset.loadFailureCount}, cache hits ${snapshot.asset.cacheHitCount}, clones ${snapshot.asset.cloneCount}, active imported ${snapshot.asset.activeImportedAssetInstances}, fallbacks ${snapshot.asset.fallbackPlaceholderCount}`,
		`terrain: rebuilds ${snapshot.terrain.rebuildCount}, mode ${snapshot.terrain.mode}, tiles ${snapshot.terrain.tileCount}, meshes ${snapshot.terrain.meshCount}, last ms ${snapshot.terrain.lastDurationMs}`,
		`input/runtime: pointer moves ${snapshot.pointer.pointerMoveCount}, pointer/s ${snapshot.pointer.pointerMovesPerSecond}, picks ${snapshot.pointer.pickCount}, last pick ms ${snapshot.pointer.lastPickMs}, ticks ${snapshot.runtime.tickCount}, last tick ms ${snapshot.runtime.lastTickMs}`,
		snapshot.asset.lastMessage
			? `last asset: ${snapshot.asset.lastMessage}`
			: "",
		snapshot.recentEvents.length
			? `recent: ${snapshot.recentEvents.join(" | ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}
