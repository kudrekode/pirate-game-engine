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
	definitionId?: string;
	status: ThreeAssetRenderStatus;
	usedAsset: boolean;
};

export type ThreePerformancePhase =
	| "asset cache hit"
	| "asset fallback"
	| "asset load callback"
	| "asset load start"
	| "object state update"
	| "render"
	| "runtime tick"
	| "scene rebuild"
	| "terrain rebuild"
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

export type ThreePerformanceSnapshot = {
	asset: {
		activeImportedAssetInstances: number;
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
		frameCount: number;
		fps: number;
		lastFrameMs: number;
		lastRenderMs: number;
		worstFrameMs: number;
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
		reasonCounts: Record<string, number>;
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
	recordAssetClone: (definitionId?: string) => void;
	recordAssetFallback: (
		assetStatus: ThreeAssetRenderStatus,
		definitionId?: string,
	) => void;
	recordFrame: (durationMs: number) => void;
	recordObjectStateUpdate: (detail: string) => void;
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
		assetStatuses: ThreeAssetRenderStatusEntry[];
		entityCount: number;
	}) => void;
};

type ThreeAssetDiagnosticsListener = (
	event: ThreeAssetDiagnosticsEvent,
) => void;

const assetDiagnosticsListeners = new Set<ThreeAssetDiagnosticsListener>();
const STUCK_ASSET_LOADING_MS = 5000;

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
	let activeCloneInstances = 0;
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
	let over50MsCount = 0;
	let over100MsCount = 0;
	let over500MsCount = 0;
	let over1000MsCount = 0;
	let lastHitchDurationMs = 0;
	let lastHitchPhase: ThreePerformancePhase = "unknown";
	let recentHitches: ThreePerformanceHitch[] = [];
	let recentEvents: string[] = [];
	let lastPhase: {
		detail: string;
		phase: ThreePerformancePhase;
		timestampMs: number;
	} = {
		detail: "",
		phase: "unknown",
		timestampMs: now(),
	};
	let sceneReasonCounts: Record<string, number> = {};

	const pushEvent = (message: string) => {
		recentEvents = trimRecentEvents([...recentEvents, message]);
	};

	const recordPhase = (
		phase: ThreePerformancePhase,
		detail = "",
		durationMs = 0,
	) => {
		lastPhase = {
			detail,
			phase,
			timestampMs: now(),
		};
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

	const getLikelyFramePhase = (): {
		detail: string;
		phase: ThreePerformancePhase;
	} => {
		const currentNow = now();
		if (currentNow - lastPhase.timestampMs <= 5000) {
			return lastPhase;
		}
		return { detail: "", phase: "unknown" };
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
					frameCount,
					fps: roundMetric(fps),
					lastFrameMs: roundMetric(lastFrameMs),
					lastRenderMs: roundMetric(lastRenderMs),
					worstFrameMs: roundMetric(worstFrameMs),
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
					reasonCounts: { ...sceneReasonCounts },
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
		recordFrame: (durationMs: number) => {
			frameCount += 1;
			fpsWindowFrameCount += 1;
			lastFrameMs = durationMs;
			frameMsTotal += durationMs;
			worstFrameMs = Math.max(worstFrameMs, durationMs);
			const likelyPhase = getLikelyFramePhase();
			recordPhase(
				likelyPhase.phase,
				likelyPhase.detail
					? `raf frame after ${likelyPhase.detail}`
					: "raf frame",
				durationMs,
			);
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
		recordObjectStateUpdate: (detail: string) => {
			recordPhase("object state update", detail);
		},
		recordRenderCall: (durationMs: number) => {
			lastRenderMs = durationMs;
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
		recordRuntimeTick: (durationMs: number) => {
			tickCount += 1;
			lastTickMs = durationMs;
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
		recordTerrainRebuild: ({ durationMs, meshCount, mode, tileCount }) => {
			terrainRebuildCount += 1;
			terrainMode = mode;
			terrainTileCount = tileCount;
			terrainMeshCount = meshCount;
			lastTerrainDurationMs = durationMs;
			recordPhase("terrain rebuild", mode, durationMs);
		},
		recordPick: (durationMs: number) => {
			pickCount += 1;
			lastPickMs = durationMs;
		},
		setSceneEntityCounts: ({ assetStatuses, entityCount: nextEntityCount }) => {
			const nextStatusCounts = createEmptyAssetStatusCounts();
			const currentLoadingKeys = new Set<string>();
			activeImportedAssetInstances = 0;
			activeCloneInstances = 0;
			fallbackPlaceholderCount = 0;
			loadingFallbackCount = 0;
			errorFallbackCount = 0;
			missingFallbackCount = 0;
			for (const assetStatus of assetStatuses) {
				nextStatusCounts[assetStatus.status] += 1;
				if (assetStatus.usedAsset) {
					activeImportedAssetInstances += 1;
					activeCloneInstances += 1;
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
			entityCount = nextEntityCount;
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
		`frames: ${snapshot.frame.frameCount}, fps: ${snapshot.frame.fps}, avg frame ms: ${snapshot.frame.averageFrameMs}, worst ms: ${snapshot.frame.worstFrameMs}, render ms: ${snapshot.frame.lastRenderMs}`,
		`hitches: >50ms ${snapshot.hitches.over50MsCount}, >100ms ${snapshot.hitches.over100MsCount}, >500ms ${snapshot.hitches.over500MsCount}, >1000ms ${snapshot.hitches.over1000MsCount}, last ${snapshot.hitches.lastDurationMs}ms (${snapshot.hitches.lastPhase})`,
		`renderer: calls ${snapshot.renderer.drawCalls}, triangles ${snapshot.renderer.triangles}, points ${snapshot.renderer.points}, lines ${snapshot.renderer.lines}, geometries ${snapshot.renderer.geometries}, textures ${snapshot.renderer.textures}, programs ${snapshot.renderer.programs}`,
		`scene: builds ${snapshot.scene.buildCount}, cleanups ${snapshot.scene.cleanupCount}, entities ${snapshot.scene.entityCount}, last reason "${snapshot.scene.lastRebuildReason}", last build ms ${snapshot.scene.lastBuildMs}, since rebuild ms ${snapshot.scene.timeSinceLastRebuildMs}`,
		reasonCounts ? `scene reasons: ${reasonCounts}` : "",
		`assets: starts ${snapshot.asset.loadStartedCount}, successes ${snapshot.asset.loadSuccessCount}, failures ${snapshot.asset.loadFailureCount}, cache hits ${snapshot.asset.cacheHitCount}, clones ${snapshot.asset.cloneCount}, active imported ${snapshot.asset.activeImportedAssetInstances}, active clones ${snapshot.asset.activeCloneInstances}, fallbacks ${snapshot.asset.fallbackPlaceholderCount}`,
		`asset statuses: ${assetStatuses}, loading fallbacks ${snapshot.asset.loadingFallbackCount}, error fallbacks ${snapshot.asset.errorFallbackCount}, missing fallbacks ${snapshot.asset.missingFallbackCount}, stuck loading ${snapshot.asset.stuckLoadingCount}`,
		`terrain: rebuilds ${snapshot.terrain.rebuildCount}, mode ${snapshot.terrain.mode}, tiles ${snapshot.terrain.tileCount}, meshes ${snapshot.terrain.meshCount}, last ms ${snapshot.terrain.lastDurationMs}`,
		`input/runtime: pointer moves ${snapshot.pointer.pointerMoveCount}, pointer/s ${snapshot.pointer.pointerMovesPerSecond}, picks ${snapshot.pointer.pickCount}, last pick ms ${snapshot.pointer.lastPickMs}, ticks ${snapshot.runtime.tickCount}, last tick ms ${snapshot.runtime.lastTickMs}`,
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
