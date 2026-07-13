export type ThreeAssetDiagnosticsEvent = {
	durationMs?: number;
	definitionId?: string;
	message?: string;
	status:
		| "cache_hit"
		| "fallback"
		| "load_failure"
		| "load_start"
		| "load_success";
	url?: string;
};

export type ThreeAssetRenderStatus =
	| "error"
	| "loaded"
	| "loading"
	| "missing"
	| "not_requested";

export type ThreeAssetRenderStatusEntry = {
	analysis?: ThreeVisualAssetAnalysis;
	category?: ThreeVisualAssetCategory;
	cloneType?: ThreeVisualAssetCloneType;
	definitionId?: string;
	status: ThreeAssetRenderStatus;
	usedAsset: boolean;
};

export type ThreePerformancePhase =
	| "asset cache hit"
	| "asset fallback"
	| "asset load callback"
	| "asset load start"
	| "animation_update"
	| "camera_update"
	| "frame_callback"
	| "object state update"
	| "raf_interval"
	| "render"
	| "runtime tick"
	| "scene rebuild"
	| "terrain rebuild"
	| "visual_update"
	| "water_update"
	| "unknown";

export type ThreePerformanceHitch = {
	detail: string;
	durationMs: number;
	phase: ThreePerformancePhase;
	thresholdMs: number;
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

export type ThreePerformancePhaseStats = {
	averageMs: number;
	count: number;
	lastMs: number;
	worstMs: number;
};

export type ThreePerformanceSnapshot = {
	asset: {
		activeImportedAssetInstances: number;
		activeImportedAssetIds: string[];
		character: {
			activeAssetIds: string[];
			activeCloneInstances: number;
			assetMetrics: {
				boneCount: number;
				definitionId: string;
				materialCount: number;
				materialTypes: string[];
				skinnedMeshCount: number;
				textureCount: number;
				triangleCount: number;
				vertexCount: number;
			}[];
			animationClips: {
				definitionId: string;
				duration: number;
				name: string;
				trackCount: number;
			}[];
			cloneTypes: ThreeVisualAssetCloneType[];
			animation: {
				activeLoopingActions: number;
				activeMixers: number;
				incompatibleClipCount: number;
				loadingSourceCount: number;
				missingClipCount: number;
				oneShotActionsTriggered: number;
				playerState: string;
				sourceAssetIds: string[];
			};
			skinnedMeshCount: number;
		};
		activeCloneInstances: number;
		cacheHitCount: number;
		cloneCount: number;
		errorFallbackCount: number;
		fallbackPlaceholderCount: number;
		hasStuckLoadingAssets: boolean;
		lastMessage: string;
		loadingFallbackCount: number;
		loadFailureCount: number;
		loadStartedCount: number;
		loadSuccessCount: number;
		missingFallbackCount: number;
		statusCounts: Record<ThreeAssetRenderStatus, number>;
		stuckLoadingCount: number;
	};
	frame: {
		averageFrameMs: number;
		averageFrameIntervalMs: number;
		frameCount: number;
		fps: number;
		lastFrameMs: number;
		lastFrameIntervalMs: number;
		lastRenderMs: number;
		worstFrameMs: number;
		worstFrameIntervalMs: number;
	};
	hitches: {
		lastDurationMs: number;
		lastPhase: ThreePerformancePhase;
		over1000MsCount: number;
		over100MsCount: number;
		over500MsCount: number;
		over50MsCount: number;
		recent: ThreePerformanceHitch[];
	};
	label: string;
	phases: {
		cameraUpdate: ThreePerformancePhaseStats;
		animationUpdate: ThreePerformancePhaseStats;
		frameCallback: ThreePerformancePhaseStats;
		render: ThreePerformancePhaseStats;
		runtimeTick: ThreePerformancePhaseStats;
		visualUpdate: ThreePerformancePhaseStats;
		waterUpdate: ThreePerformancePhaseStats;
	};
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
	raf: {
		activeLoopCount: number;
		lastCancelReason: string;
		lastStartReason: string;
		loopCancelCount: number;
		loopRestartCount: number;
		loopStartCount: number;
	};
	runtime: {
		averageTickMs: number;
		lastTickMs: number;
		tickCount: number;
		worstTickMs: number;
	};
	scene: {
		areaId?: string;
		areaName?: string;
		buildCount: number;
		cleanupCount: number;
		entityCount: number;
		lastBuildMs: number;
		lastRebuildReason: string;
		projectName?: string;
		reasonCounts: Record<string, number>;
		timeSinceLastRebuildMs: number;
	};
	terrain: {
		coastlineEdgeCount: number;
		lastDurationMs: number;
		meshCount: number;
		mode: string;
		rebuildCount: number;
		tileCount: number;
		triangleCount: number;
		vertexCount: number;
		waterMeshCount: number;
	};
};

export type ThreePerformanceDiagnostics = {
	dispose: () => void;
	formatSnapshot: () => string;
	getSnapshot: () => ThreePerformanceSnapshot;
	recordAssetClone: (definitionId?: string) => void;
	recordCharacterAnimationUpdate: (durationMs: number) => void;
	recordAssetFallback: (
		assetStatus: ThreeAssetRenderStatus,
		definitionId?: string,
	) => void;
	recordFrame: (durationMs: number) => void;
	recordFrameCallback: (durationMs: number) => void;
	recordFrameInterval: (durationMs: number) => void;
	recordCameraUpdate: (durationMs: number) => void;
	recordVisualUpdate: (durationMs: number) => void;
	recordObjectStateUpdate: (detail: string) => void;
	recordPointerMove: () => void;
	recordRenderCall: (durationMs: number) => void;
	recordRendererInfo: (info: ThreePerformanceRendererInfo | undefined) => void;
	recordRafLoopCancel: (reason: string) => void;
	recordRafLoopStart: (reason: string) => void;
	recordRuntimeTick: (durationMs: number) => void;
	recordSceneBuild: (reason: string, durationMs: number) => void;
	recordSceneCleanup: () => void;
	recordTerrainRebuild: (details: {
		coastlineEdgeCount?: number;
		durationMs: number;
		meshCount: number;
		mode: string;
		tileCount: number;
		triangleCount?: number;
		vertexCount?: number;
		waterMeshCount?: number;
	}) => void;
	recordWaterUpdate: (durationMs: number) => void;
	recordPick: (durationMs: number) => void;
	resetSampleWindow: () => void;
	setSceneEntityCounts: (counts: {
		assetStatuses: ThreeAssetRenderStatusEntry[];
		entityCount: number;
		sceneIdentity?: {
			areaId?: string;
			areaName?: string;
			projectName?: string;
		};
	}) => void;
	setCharacterAnimationMetrics: (metrics: {
		activeLoopingActions: number;
		activeMixers: number;
		incompatibleClipCount: number;
		loadingSourceCount: number;
		missingClipCount: number;
		oneShotActionsTriggered: number;
		playerState: string;
		sourceAssetIds: string[];
	}) => void;
};

export type ThreePerformanceDiagnosticsGlobal = {
	getSnapshot: (label?: string) => ThreePerformanceSnapshot | null;
	getSnapshots: () => Record<string, ThreePerformanceSnapshot>;
	labels: () => string[];
	resetSampleWindow: (label?: string) => boolean;
};

type ThreeAssetDiagnosticsListener = (
	event: ThreeAssetDiagnosticsEvent,
) => void;

const assetDiagnosticsListeners = new Set<ThreeAssetDiagnosticsListener>();
const STUCK_ASSET_LOADING_MS = 5000;
const registeredDiagnostics = new Map<string, ThreePerformanceDiagnostics[]>();

declare global {
	interface Window {
		__THREE_PERF_DIAGNOSTICS__?: ThreePerformanceDiagnosticsGlobal;
	}
}

function canExposeDiagnosticsGlobal(): boolean {
	return (
		typeof window !== "undefined" &&
		(import.meta.env.DEV || import.meta.env.MODE === "test")
	);
}

function getLatestDiagnostics(
	label?: string,
): ThreePerformanceDiagnostics | undefined {
	if (label) {
		const entries = registeredDiagnostics.get(label);
		return entries?.[entries.length - 1];
	}

	const entries = Array.from(registeredDiagnostics.values()).flat();
	return entries[entries.length - 1];
}

function ensureDiagnosticsGlobal(): void {
	if (!canExposeDiagnosticsGlobal() || window.__THREE_PERF_DIAGNOSTICS__) {
		return;
	}

	window.__THREE_PERF_DIAGNOSTICS__ = {
		getSnapshot: (label?: string) =>
			getLatestDiagnostics(label)?.getSnapshot() ?? null,
		getSnapshots: () =>
			Object.fromEntries(
				Array.from(registeredDiagnostics.entries()).flatMap(
					([label, entries]) => {
						const diagnostics = entries[entries.length - 1];
						return diagnostics ? [[label, diagnostics.getSnapshot()]] : [];
					},
				),
			),
		labels: () => Array.from(registeredDiagnostics.keys()),
		resetSampleWindow: (label?: string) => {
			const diagnostics = getLatestDiagnostics(label);
			if (!diagnostics) {
				return false;
			}
			diagnostics.resetSampleWindow();
			return true;
		},
	};
}

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

export function registerThreePerformanceDiagnostics(
	diagnostics: ThreePerformanceDiagnostics,
): () => void {
	const label = diagnostics.getSnapshot().label;
	const entries = registeredDiagnostics.get(label) ?? [];
	registeredDiagnostics.set(label, [...entries, diagnostics]);
	ensureDiagnosticsGlobal();

	return () => {
		const currentEntries = registeredDiagnostics.get(label) ?? [];
		const nextEntries = currentEntries.filter((entry) => entry !== diagnostics);
		if (nextEntries.length > 0) {
			registeredDiagnostics.set(label, nextEntries);
			return;
		}
		registeredDiagnostics.delete(label);
	};
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

function trimRecentHitches(
	hitches: ThreePerformanceHitch[],
): ThreePerformanceHitch[] {
	return hitches.slice(-8);
}

function createEmptyAssetStatusCounts(): Record<
	ThreeAssetRenderStatus,
	number
> {
	return {
		error: 0,
		loaded: 0,
		loading: 0,
		missing: 0,
		not_requested: 0,
	};
}

type PhaseStatsState = {
	count: number;
	lastMs: number;
	totalMs: number;
	worstMs: number;
};

function createPhaseStatsState(): PhaseStatsState {
	return {
		count: 0,
		lastMs: 0,
		totalMs: 0,
		worstMs: 0,
	};
}

function recordPhaseStats(stats: PhaseStatsState, durationMs: number): void {
	stats.count += 1;
	stats.lastMs = durationMs;
	stats.totalMs += durationMs;
	stats.worstMs = Math.max(stats.worstMs, durationMs);
}

function resetPhaseStats(stats: PhaseStatsState): void {
	stats.count = 0;
	stats.lastMs = 0;
	stats.totalMs = 0;
	stats.worstMs = 0;
}

function getPhaseStatsSnapshot(
	stats: PhaseStatsState,
): ThreePerformancePhaseStats {
	return {
		averageMs: stats.count > 0 ? roundMetric(stats.totalMs / stats.count) : 0,
		count: stats.count,
		lastMs: roundMetric(stats.lastMs),
		worstMs: roundMetric(stats.worstMs),
	};
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
	let terrainWaterMeshCount = 0;
	let terrainCoastlineEdgeCount = 0;
	let terrainTriangleCount = 0;
	let terrainVertexCount = 0;
	let lastTerrainDurationMs = 0;
	let loadStartedCount = 0;
	let loadSuccessCount = 0;
	let loadFailureCount = 0;
	let cacheHitCount = 0;
	let cloneCount = 0;
	let activeImportedAssetInstances = 0;
	let activeImportedAssetIds: string[] = [];
	let activeCloneInstances = 0;
	let activeCharacterAssetIds: string[] = [];
	let activeCharacterCloneInstances = 0;
	let characterAssetMetrics: ThreePerformanceSnapshot["asset"]["character"]["assetMetrics"] =
		[];
	let characterAnimationClips: ThreePerformanceSnapshot["asset"]["character"]["animationClips"] =
		[];
	let characterCloneTypes: ThreeVisualAssetCloneType[] = [];
	let characterSkinnedMeshCount = 0;
	let characterAnimationMetrics: ThreePerformanceSnapshot["asset"]["character"]["animation"] =
		{
			activeLoopingActions: 0,
			activeMixers: 0,
			incompatibleClipCount: 0,
			loadingSourceCount: 0,
			missingClipCount: 0,
			oneShotActionsTriggered: 0,
			playerState: "idle",
			sourceAssetIds: [],
		};
	let fallbackPlaceholderCount = 0;
	let loadingFallbackCount = 0;
	let errorFallbackCount = 0;
	let missingFallbackCount = 0;
	let assetStatusCounts = createEmptyAssetStatusCounts();
	const assetLoadingStartedAtMs = new Map<string, number>();
	let lastAssetMessage = "";
	let pointerMoveCount = 0;
	let pickCount = 0;
	let lastPickMs = 0;
	let tickCount = 0;
	let lastTickMs = 0;
	const renderStats = createPhaseStatsState();
	const runtimeTickStats = createPhaseStatsState();
	const visualUpdateStats = createPhaseStatsState();
	const cameraUpdateStats = createPhaseStatsState();
	const animationUpdateStats = createPhaseStatsState();
	const frameCallbackStats = createPhaseStatsState();
	const waterUpdateStats = createPhaseStatsState();
	let rafLoopStartCount = 0;
	let rafLoopCancelCount = 0;
	let activeRafLoopCount = 0;
	let lastRafLoopStartReason = "";
	let lastRafLoopCancelReason = "";
	let over50MsCount = 0;
	let over100MsCount = 0;
	let over500MsCount = 0;
	let over1000MsCount = 0;
	let lastHitchDurationMs = 0;
	let lastHitchPhase: ThreePerformancePhase = "unknown";
	let recentHitches: ThreePerformanceHitch[] = [];
	let recentEvents: string[] = [];
	let sceneReasonCounts: Record<string, number> = {};
	let sceneAreaId: string | undefined;
	let sceneAreaName: string | undefined;
	let sceneProjectName: string | undefined;

	const pushEvent = (message: string) => {
		recentEvents = trimRecentEvents([...recentEvents, message]);
	};

	const resetSampleWindow = () => {
		frameCount = 0;
		frameMsTotal = 0;
		fps = 0;
		lastFrameMs = 0;
		worstFrameMs = 0;
		fpsWindowStartMs = now();
		fpsWindowFrameCount = 0;
		tickCount = 0;
		lastTickMs = 0;
		resetPhaseStats(renderStats);
		resetPhaseStats(runtimeTickStats);
		resetPhaseStats(visualUpdateStats);
		resetPhaseStats(cameraUpdateStats);
		resetPhaseStats(animationUpdateStats);
		resetPhaseStats(frameCallbackStats);
		resetPhaseStats(waterUpdateStats);
		over50MsCount = 0;
		over100MsCount = 0;
		over500MsCount = 0;
		over1000MsCount = 0;
		lastHitchDurationMs = 0;
		lastHitchPhase = "unknown";
		recentHitches = [];
		recentEvents = [];
	};

	const recordPhase = (
		phase: ThreePerformancePhase,
		detail = "",
		durationMs = 0,
	) => {
		if (durationMs > 50) {
			const thresholdMs =
				durationMs > 1000
					? 1000
					: durationMs > 500
						? 500
						: durationMs > 100
							? 100
							: 50;
			over50MsCount += 1;
			if (durationMs > 100) {
				over100MsCount += 1;
			}
			if (durationMs > 500) {
				over500MsCount += 1;
			}
			if (durationMs > 1000) {
				over1000MsCount += 1;
			}
			lastHitchDurationMs = durationMs;
			lastHitchPhase = phase;
			recentHitches = trimRecentHitches([
				...recentHitches,
				{
					detail,
					durationMs: roundMetric(durationMs),
					phase,
					thresholdMs,
				},
			]);
		}
	};

	const recordAssetEvent = (event: ThreeAssetDiagnosticsEvent) => {
		if (event.status === "load_start") {
			loadStartedCount += 1;
			recordPhase("asset load start", event.definitionId ?? event.url ?? "");
		}
		if (event.status === "load_success") {
			loadSuccessCount += 1;
			recordPhase(
				"asset load callback",
				event.definitionId ?? event.url ?? "",
				event.durationMs,
			);
		}
		if (event.status === "load_failure") {
			loadFailureCount += 1;
			recordPhase(
				"asset load callback",
				event.definitionId ?? event.url ?? "",
				event.durationMs,
			);
		}
		if (event.status === "cache_hit") {
			cacheHitCount += 1;
			recordPhase("asset cache hit", event.definitionId ?? event.url ?? "");
		}
		if (event.status === "fallback") {
			recordPhase("asset fallback", event.message ?? "");
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
			const stuckLoadingCount = Array.from(
				assetLoadingStartedAtMs.values(),
			).filter(
				(startedAtMs) => currentNow - startedAtMs >= STUCK_ASSET_LOADING_MS,
			).length;
			return {
				asset: {
					activeImportedAssetInstances,
					activeImportedAssetIds,
					character: {
						activeAssetIds: activeCharacterAssetIds,
						activeCloneInstances: activeCharacterCloneInstances,
						assetMetrics: characterAssetMetrics,
						animationClips: characterAnimationClips,
						animation: characterAnimationMetrics,
						cloneTypes: characterCloneTypes,
						skinnedMeshCount: characterSkinnedMeshCount,
					},
					activeCloneInstances,
					cacheHitCount,
					cloneCount,
					errorFallbackCount,
					fallbackPlaceholderCount,
					hasStuckLoadingAssets: stuckLoadingCount > 0,
					lastMessage: lastAssetMessage,
					loadingFallbackCount,
					loadFailureCount,
					loadStartedCount,
					loadSuccessCount,
					missingFallbackCount,
					statusCounts: { ...assetStatusCounts },
					stuckLoadingCount,
				},
				frame: {
					averageFrameMs:
						frameCount > 0 ? roundMetric(frameMsTotal / frameCount) : 0,
					averageFrameIntervalMs:
						frameCount > 0 ? roundMetric(frameMsTotal / frameCount) : 0,
					frameCount,
					fps: roundMetric(fps),
					lastFrameMs: roundMetric(lastFrameMs),
					lastFrameIntervalMs: roundMetric(lastFrameMs),
					lastRenderMs: roundMetric(lastRenderMs),
					worstFrameMs: roundMetric(worstFrameMs),
					worstFrameIntervalMs: roundMetric(worstFrameMs),
				},
				hitches: {
					lastDurationMs: roundMetric(lastHitchDurationMs),
					lastPhase: lastHitchPhase,
					over1000MsCount,
					over100MsCount,
					over500MsCount,
					over50MsCount,
					recent: recentHitches,
				},
				label,
				phases: {
					animationUpdate: getPhaseStatsSnapshot(animationUpdateStats),
					cameraUpdate: getPhaseStatsSnapshot(cameraUpdateStats),
					frameCallback: getPhaseStatsSnapshot(frameCallbackStats),
					render: getPhaseStatsSnapshot(renderStats),
					runtimeTick: getPhaseStatsSnapshot(runtimeTickStats),
					visualUpdate: getPhaseStatsSnapshot(visualUpdateStats),
					waterUpdate: getPhaseStatsSnapshot(waterUpdateStats),
				},
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
				raf: {
					activeLoopCount: activeRafLoopCount,
					lastCancelReason: lastRafLoopCancelReason,
					lastStartReason: lastRafLoopStartReason,
					loopCancelCount: rafLoopCancelCount,
					loopRestartCount: Math.max(0, rafLoopStartCount - 1),
					loopStartCount: rafLoopStartCount,
				},
				runtime: {
					averageTickMs: getPhaseStatsSnapshot(runtimeTickStats).averageMs,
					lastTickMs: roundMetric(lastTickMs),
					tickCount,
					worstTickMs: getPhaseStatsSnapshot(runtimeTickStats).worstMs,
				},
				scene: {
					areaId: sceneAreaId,
					areaName: sceneAreaName,
					buildCount,
					cleanupCount,
					entityCount,
					lastBuildMs: roundMetric(lastBuildMs),
					lastRebuildReason,
					projectName: sceneProjectName,
					reasonCounts: { ...sceneReasonCounts },
					timeSinceLastRebuildMs: roundMetric(currentNow - lastRebuildAtMs),
				},
				terrain: {
					coastlineEdgeCount: terrainCoastlineEdgeCount,
					lastDurationMs: roundMetric(lastTerrainDurationMs),
					meshCount: terrainMeshCount,
					mode: terrainMode,
					rebuildCount: terrainRebuildCount,
					tileCount: terrainTileCount,
					triangleCount: terrainTriangleCount,
					vertexCount: terrainVertexCount,
					waterMeshCount: terrainWaterMeshCount,
				},
			};
		},
		recordAssetFallback: (
			assetStatus: ThreeAssetRenderStatus,
			definitionId?: string,
		) => {
			recordAssetEvent({
				definitionId,
				message: `status ${assetStatus}`,
				status: "fallback",
			});
		},
		recordAssetClone: (definitionId?: string) => {
			cloneCount += 1;
			lastAssetMessage = `clone: ${definitionId ?? "asset"}`;
			pushEvent(lastAssetMessage);
		},
		recordCharacterAnimationUpdate: (durationMs: number) => {
			recordPhaseStats(animationUpdateStats, durationMs);
			recordPhase("animation_update", "character animation update", durationMs);
		},
		recordFrame: (durationMs: number) => {
			diagnostics.recordFrameInterval(durationMs);
		},
		recordFrameCallback: (durationMs: number) => {
			recordPhaseStats(frameCallbackStats, durationMs);
			recordPhase(
				"frame_callback",
				"RAF callback synchronous work",
				durationMs,
			);
		},
		recordFrameInterval: (durationMs: number) => {
			frameCount += 1;
			fpsWindowFrameCount += 1;
			lastFrameMs = durationMs;
			frameMsTotal += durationMs;
			worstFrameMs = Math.max(worstFrameMs, durationMs);
			recordPhase("raf_interval", "requestAnimationFrame interval", durationMs);
			const currentNow = now();
			const elapsedMs = currentNow - fpsWindowStartMs;
			if (elapsedMs >= 250) {
				fps = (fpsWindowFrameCount / elapsedMs) * 1000;
				fpsWindowFrameCount = 0;
				fpsWindowStartMs = currentNow;
			}
		},
		recordCameraUpdate: (durationMs: number) => {
			recordPhaseStats(cameraUpdateStats, durationMs);
			recordPhase("camera_update", "camera update", durationMs);
		},
		setCharacterAnimationMetrics: (metrics) => {
			characterAnimationMetrics = {
				...metrics,
				sourceAssetIds: [...metrics.sourceAssetIds].sort(),
			};
		},
		recordVisualUpdate: (durationMs: number) => {
			recordPhaseStats(visualUpdateStats, durationMs);
			recordPhase("visual_update", "visual update", durationMs);
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
		recordObjectStateUpdate: (detail: string) => {
			recordPhase("object state update", detail);
		},
		recordRenderCall: (durationMs: number) => {
			lastRenderMs = durationMs;
			recordPhaseStats(renderStats, durationMs);
			recordPhase("render", "renderer.render", durationMs);
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
		recordRafLoopCancel: (reason: string) => {
			rafLoopCancelCount += 1;
			activeRafLoopCount = Math.max(0, activeRafLoopCount - 1);
			lastRafLoopCancelReason = reason;
			pushEvent(`raf cancel: ${reason}`);
		},
		recordRafLoopStart: (reason: string) => {
			rafLoopStartCount += 1;
			activeRafLoopCount += 1;
			lastRafLoopStartReason = reason;
			pushEvent(`raf start: ${reason}`);
		},
		recordRuntimeTick: (durationMs: number) => {
			tickCount += 1;
			lastTickMs = durationMs;
			recordPhaseStats(runtimeTickStats, durationMs);
			recordPhase("runtime tick", "npc tick", durationMs);
		},
		recordSceneBuild: (reason: string, durationMs: number) => {
			buildCount += 1;
			lastBuildMs = durationMs;
			lastRebuildReason = reason;
			lastRebuildAtMs = now();
			sceneReasonCounts = {
				...sceneReasonCounts,
				[reason]: (sceneReasonCounts[reason] ?? 0) + 1,
			};
			recordPhase("scene rebuild", reason, durationMs);
			pushEvent(`scene build: ${reason}`);
		},
		recordSceneCleanup: () => {
			cleanupCount += 1;
		},
		recordTerrainRebuild: ({
			coastlineEdgeCount = 0,
			durationMs,
			meshCount,
			mode,
			tileCount,
			triangleCount = 0,
			vertexCount = 0,
			waterMeshCount = 0,
		}) => {
			terrainRebuildCount += 1;
			terrainMode = mode;
			terrainTileCount = tileCount;
			terrainMeshCount = meshCount;
			terrainWaterMeshCount = waterMeshCount;
			terrainCoastlineEdgeCount = coastlineEdgeCount;
			terrainTriangleCount = triangleCount;
			terrainVertexCount = vertexCount;
			lastTerrainDurationMs = durationMs;
			recordPhase("terrain rebuild", mode, durationMs);
		},
		recordWaterUpdate: (durationMs: number) => {
			recordPhaseStats(waterUpdateStats, durationMs);
			recordPhase("water_update", "water material animation", durationMs);
		},
		recordPick: (durationMs: number) => {
			pickCount += 1;
			lastPickMs = durationMs;
		},
		resetSampleWindow,
		setSceneEntityCounts: ({
			assetStatuses,
			entityCount: nextEntityCount,
			sceneIdentity,
		}) => {
			const nextStatusCounts = createEmptyAssetStatusCounts();
			const currentLoadingKeys = new Set<string>();
			const nextActiveImportedAssetIds = new Set<string>();
			const nextActiveCharacterAssetIds = new Set<string>();
			const nextCharacterAnimationClips = new Map<
				string,
				ThreePerformanceSnapshot["asset"]["character"]["animationClips"][number]
			>();
			const nextCharacterCloneTypes = new Set<ThreeVisualAssetCloneType>();
			const nextCharacterAssetMetrics = new Map<
				string,
				ThreePerformanceSnapshot["asset"]["character"]["assetMetrics"][number]
			>();
			activeImportedAssetInstances = 0;
			activeCloneInstances = 0;
			activeCharacterCloneInstances = 0;
			characterSkinnedMeshCount = 0;
			fallbackPlaceholderCount = 0;
			loadingFallbackCount = 0;
			errorFallbackCount = 0;
			missingFallbackCount = 0;
			for (const assetStatus of assetStatuses) {
				nextStatusCounts[assetStatus.status] += 1;
				if (assetStatus.usedAsset) {
					activeImportedAssetInstances += 1;
					activeCloneInstances += 1;
					if (assetStatus.definitionId) {
						nextActiveImportedAssetIds.add(assetStatus.definitionId);
					}
					if (assetStatus.category === "character") {
						activeCharacterCloneInstances += 1;
						if (assetStatus.definitionId) {
							nextActiveCharacterAssetIds.add(assetStatus.definitionId);
						}
						characterSkinnedMeshCount +=
							assetStatus.analysis?.skinnedMeshCount ?? 0;
						if (assetStatus.cloneType) {
							nextCharacterCloneTypes.add(assetStatus.cloneType);
						}
						if (assetStatus.analysis && assetStatus.definitionId) {
							nextCharacterAssetMetrics.set(assetStatus.definitionId, {
								boneCount: assetStatus.analysis.boneCount,
								definitionId: assetStatus.definitionId,
								materialCount: assetStatus.analysis.materialCount,
								materialTypes: assetStatus.analysis.materialTypes,
								skinnedMeshCount: assetStatus.analysis.skinnedMeshCount,
								textureCount: assetStatus.analysis.textureCount,
								triangleCount: assetStatus.analysis.triangleCount,
								vertexCount: assetStatus.analysis.vertexCount,
							});
						}
						for (const clip of assetStatus.analysis?.animationClips ?? []) {
							const definitionId = assetStatus.definitionId ?? "unknown";
							nextCharacterAnimationClips.set(`${definitionId}:${clip.name}`, {
								definitionId,
								...clip,
							});
						}
					}
				}
				if (!assetStatus.usedAsset && assetStatus.status !== "not_requested") {
					fallbackPlaceholderCount += 1;
					if (assetStatus.status === "loading") {
						loadingFallbackCount += 1;
					}
					if (assetStatus.status === "error") {
						errorFallbackCount += 1;
					}
					if (assetStatus.status === "missing") {
						missingFallbackCount += 1;
					}
				}
				if (assetStatus.status === "loading") {
					const key = assetStatus.definitionId ?? "unknown";
					currentLoadingKeys.add(key);
					if (!assetLoadingStartedAtMs.has(key)) {
						assetLoadingStartedAtMs.set(key, now());
					}
				}
			}
			for (const key of Array.from(assetLoadingStartedAtMs.keys())) {
				if (!currentLoadingKeys.has(key)) {
					assetLoadingStartedAtMs.delete(key);
				}
			}
			assetStatusCounts = nextStatusCounts;
			activeImportedAssetIds = Array.from(nextActiveImportedAssetIds).sort();
			activeCharacterAssetIds = Array.from(nextActiveCharacterAssetIds).sort();
			characterAnimationClips = Array.from(
				nextCharacterAnimationClips.values(),
			).sort((left, right) =>
				left.definitionId === right.definitionId
					? left.name.localeCompare(right.name)
					: left.definitionId.localeCompare(right.definitionId),
			);
			characterCloneTypes = Array.from(nextCharacterCloneTypes).sort();
			characterAssetMetrics = Array.from(
				nextCharacterAssetMetrics.values(),
			).sort((left, right) =>
				left.definitionId.localeCompare(right.definitionId),
			);
			entityCount = nextEntityCount;
			sceneAreaId = sceneIdentity?.areaId;
			sceneAreaName = sceneIdentity?.areaName;
			sceneProjectName = sceneIdentity?.projectName;
		},
	};
	return diagnostics;
}

export function formatThreePerformanceSnapshot(
	snapshot: ThreePerformanceSnapshot,
): string {
	const reasonCounts = Object.entries(snapshot.scene.reasonCounts)
		.map(([reason, count]) => `${reason}:${count}`)
		.join(", ");
	const assetStatuses = Object.entries(snapshot.asset.statusCounts)
		.map(([status, count]) => `${status}:${count}`)
		.join(", ");
	const recentHitches = snapshot.hitches.recent
		.map(
			(hitch) =>
				`${hitch.phase} ${hitch.durationMs}ms (${hitch.detail || "no detail"})`,
		)
		.join(" | ");
	return [
		`${snapshot.label} performance snapshot`,
		`scene identity: project "${snapshot.scene.projectName ?? "unknown"}", area "${snapshot.scene.areaName ?? "unknown"}" (${snapshot.scene.areaId ?? "unknown"})`,
		`frames: ${snapshot.frame.frameCount}, fps: ${snapshot.frame.fps}, avg raf interval ms: ${snapshot.frame.averageFrameIntervalMs}, worst interval ms: ${snapshot.frame.worstFrameIntervalMs}, render ms: ${snapshot.frame.lastRenderMs}`,
		`hitches: >50ms ${snapshot.hitches.over50MsCount}, >100ms ${snapshot.hitches.over100MsCount}, >500ms ${snapshot.hitches.over500MsCount}, >1000ms ${snapshot.hitches.over1000MsCount}, last ${snapshot.hitches.lastDurationMs}ms (${snapshot.hitches.lastPhase})`,
		`renderer: calls ${snapshot.renderer.drawCalls}, triangles ${snapshot.renderer.triangles}, points ${snapshot.renderer.points}, lines ${snapshot.renderer.lines}, geometries ${snapshot.renderer.geometries}, textures ${snapshot.renderer.textures}, programs ${snapshot.renderer.programs}`,
		`scene: builds ${snapshot.scene.buildCount}, cleanups ${snapshot.scene.cleanupCount}, entities ${snapshot.scene.entityCount}, last reason "${snapshot.scene.lastRebuildReason}", last build ms ${snapshot.scene.lastBuildMs}, since rebuild ms ${snapshot.scene.timeSinceLastRebuildMs}`,
		reasonCounts ? `scene reasons: ${reasonCounts}` : "",
		`assets: starts ${snapshot.asset.loadStartedCount}, successes ${snapshot.asset.loadSuccessCount}, failures ${snapshot.asset.loadFailureCount}, cache hits ${snapshot.asset.cacheHitCount}, clones ${snapshot.asset.cloneCount}, active imported ${snapshot.asset.activeImportedAssetInstances} (${snapshot.asset.activeImportedAssetIds.join(", ") || "none"}), active clones ${snapshot.asset.activeCloneInstances}, fallbacks ${snapshot.asset.fallbackPlaceholderCount}`,
		`characters: assets ${snapshot.asset.character.activeAssetIds.join(", ") || "none"}, active clones ${snapshot.asset.character.activeCloneInstances}, skinned meshes ${snapshot.asset.character.skinnedMeshCount}, clone types ${snapshot.asset.character.cloneTypes.join(", ") || "none"}, clips ${snapshot.asset.character.animationClips.map((clip) => `${clip.definitionId}:${clip.name}`).join(", ") || "none"}`,
		`character animation: state ${snapshot.asset.character.animation.playerState}, mixers ${snapshot.asset.character.animation.activeMixers}, looping actions ${snapshot.asset.character.animation.activeLoopingActions}, one-shots ${snapshot.asset.character.animation.oneShotActionsTriggered}, loading sources ${snapshot.asset.character.animation.loadingSourceCount}, missing clips ${snapshot.asset.character.animation.missingClipCount}, incompatible clips ${snapshot.asset.character.animation.incompatibleClipCount}, source assets ${snapshot.asset.character.animation.sourceAssetIds.join(", ") || "none"}`,
		`character metrics: ${snapshot.asset.character.assetMetrics.map((metrics) => `${metrics.definitionId}: ${metrics.vertexCount} vertices, ${metrics.triangleCount} triangles, ${metrics.boneCount} bones, ${metrics.skinnedMeshCount} skinned meshes, ${metrics.materialCount} ${metrics.materialTypes.join("/")} material(s), ${metrics.textureCount} texture(s)`).join(" | ") || "none"}`,
		`asset statuses: ${assetStatuses}, loading fallbacks ${snapshot.asset.loadingFallbackCount}, error fallbacks ${snapshot.asset.errorFallbackCount}, missing fallbacks ${snapshot.asset.missingFallbackCount}, stuck loading ${snapshot.asset.stuckLoadingCount}`,
		`terrain: rebuilds ${snapshot.terrain.rebuildCount}, mode ${snapshot.terrain.mode}, tiles ${snapshot.terrain.tileCount}, meshes ${snapshot.terrain.meshCount}, vertices ${snapshot.terrain.vertexCount}, triangles ${snapshot.terrain.triangleCount}, water meshes ${snapshot.terrain.waterMeshCount}, coast edges ${snapshot.terrain.coastlineEdgeCount}, last ms ${snapshot.terrain.lastDurationMs}`,
		`phase stats: callback avg/worst ${snapshot.phases.frameCallback.averageMs}/${snapshot.phases.frameCallback.worstMs} ms, animation avg/worst ${snapshot.phases.animationUpdate.averageMs}/${snapshot.phases.animationUpdate.worstMs} ms, visual avg/worst ${snapshot.phases.visualUpdate.averageMs}/${snapshot.phases.visualUpdate.worstMs} ms, water avg/worst ${snapshot.phases.waterUpdate.averageMs}/${snapshot.phases.waterUpdate.worstMs} ms, camera avg/worst ${snapshot.phases.cameraUpdate.averageMs}/${snapshot.phases.cameraUpdate.worstMs} ms, render avg/worst ${snapshot.phases.render.averageMs}/${snapshot.phases.render.worstMs} ms`,
		`raf loops: starts ${snapshot.raf.loopStartCount}, cancels ${snapshot.raf.loopCancelCount}, restarts ${snapshot.raf.loopRestartCount}, active ${snapshot.raf.activeLoopCount}, last start "${snapshot.raf.lastStartReason || "none"}", last cancel "${snapshot.raf.lastCancelReason || "none"}"`,
		`input/runtime: pointer moves ${snapshot.pointer.pointerMoveCount}, pointer/s ${snapshot.pointer.pointerMovesPerSecond}, picks ${snapshot.pointer.pickCount}, last pick ms ${snapshot.pointer.lastPickMs}, ticks ${snapshot.runtime.tickCount}, last/avg/worst tick ms ${snapshot.runtime.lastTickMs}/${snapshot.runtime.averageTickMs}/${snapshot.runtime.worstTickMs}`,
		snapshot.asset.lastMessage
			? `last asset: ${snapshot.asset.lastMessage}`
			: "",
		recentHitches ? `recent hitches: ${recentHitches}` : "",
		snapshot.recentEvents.length
			? `recent: ${snapshot.recentEvents.join(" | ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

import type { ThreeVisualAssetAnalysis } from "./threeVisualAssetAnalysis";
import type { ThreeVisualAssetCloneType } from "./threeVisualAssetLoader";
import type { ThreeVisualAssetCategory } from "./threeVisualAssetRegistry";
