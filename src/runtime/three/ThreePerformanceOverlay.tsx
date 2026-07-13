import { useEffect, useState } from "react";
import {
	formatThreePerformanceSnapshot,
	type ThreePerformanceDiagnostics,
	type ThreePerformanceSnapshot,
} from "./threePerformanceDiagnostics";

type ThreePerformanceOverlayProps = {
	diagnostics: ThreePerformanceDiagnostics;
	title: string;
};

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function createInitialSnapshot(
	diagnostics: ThreePerformanceDiagnostics,
): ThreePerformanceSnapshot {
	return diagnostics.getSnapshot();
}

function formatReasonCounts(reasonCounts: Record<string, number>): string {
	const entries = Object.entries(reasonCounts);
	if (entries.length === 0) {
		return "none";
	}
	return entries
		.map(([reason, count]) => `${reason} ${count}`)
		.slice(-3)
		.join(", ");
}

export function ThreePerformanceOverlay({
	diagnostics,
	title,
}: ThreePerformanceOverlayProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [snapshot, setSnapshot] = useState(() =>
		createInitialSnapshot(diagnostics),
	);
	const [copyStatus, setCopyStatus] = useState("");

	useEffect(() => {
		setSnapshot(diagnostics.getSnapshot());
		if (!isOpen) {
			return undefined;
		}
		const interval = window.setInterval(() => {
			setSnapshot(diagnostics.getSnapshot());
		}, 250);
		return () => window.clearInterval(interval);
	}, [diagnostics, isOpen]);

	const snapshotText = formatThreePerformanceSnapshot(snapshot);

	const copySnapshot = () => {
		if (navigator.clipboard?.writeText) {
			navigator.clipboard
				.writeText(snapshotText)
				.then(() => setCopyStatus("Copied"))
				.catch(() => {
					console.info(snapshotText);
					setCopyStatus("Logged");
				});
			return;
		}
		console.info(snapshotText);
		setCopyStatus("Logged");
	};

	const logSnapshot = () => {
		console.info(snapshotText);
		setCopyStatus("Logged");
	};

	return (
		<div className="three-perf-overlay">
			<button
				aria-expanded={isOpen}
				className="three-perf-toggle"
				onClick={() => setIsOpen((current) => !current)}
				type="button"
			>
				Perf
			</button>
			{isOpen ? (
				<section
					aria-label={`${title} diagnostics`}
					className="three-perf-panel"
				>
					<div className="three-perf-header">
						<strong>{title}</strong>
						<div>
							<button onClick={copySnapshot} type="button">
								Copy
							</button>
							<button onClick={logSnapshot} type="button">
								Log
							</button>
						</div>
					</div>
					<div className="three-perf-grid">
						<span>FPS</span>
						<strong>{formatNumber(snapshot.frame.fps)}</strong>
						<span>RAF interval avg/worst</span>
						<strong>
							{formatNumber(snapshot.frame.averageFrameIntervalMs)} /{" "}
							{formatNumber(snapshot.frame.worstFrameIntervalMs)} ms
						</strong>
						<span>Hitches 50/100/500/1000</span>
						<strong>
							{snapshot.hitches.over50MsCount}/{snapshot.hitches.over100MsCount}
							/{snapshot.hitches.over500MsCount}/
							{snapshot.hitches.over1000MsCount}
						</strong>
						<span>Last hitch</span>
						<strong>
							{formatNumber(snapshot.hitches.lastDurationMs)} ms,{" "}
							{snapshot.hitches.lastPhase}
						</strong>
						<span>RAF frames</span>
						<strong>{snapshot.frame.frameCount}</strong>
						<span>Render call</span>
						<strong>{formatNumber(snapshot.frame.lastRenderMs)} ms</strong>
						<span>RAF callback avg/worst</span>
						<strong>
							{formatNumber(snapshot.phases.frameCallback.averageMs)} /{" "}
							{formatNumber(snapshot.phases.frameCallback.worstMs)} ms
						</strong>
						<span>RAF loops start/cancel</span>
						<strong>
							{snapshot.raf.loopStartCount}/{snapshot.raf.loopCancelCount}
						</strong>
						<span>Draw calls</span>
						<strong>{snapshot.renderer.drawCalls}</strong>
						<span>Triangles</span>
						<strong>{snapshot.renderer.triangles}</strong>
						<span>Geom/textures/programs</span>
						<strong>
							{snapshot.renderer.geometries}/{snapshot.renderer.textures}/
							{snapshot.renderer.programs}
						</strong>
						<span>Scene builds/cleanups</span>
						<strong>
							{snapshot.scene.buildCount}/{snapshot.scene.cleanupCount}
						</strong>
						<span>Last rebuild</span>
						<strong>{snapshot.scene.lastRebuildReason}</strong>
						<span>Rebuild reasons</span>
						<strong>{formatReasonCounts(snapshot.scene.reasonCounts)}</strong>
						<span>Since rebuild</span>
						<strong>
							{formatNumber(snapshot.scene.timeSinceLastRebuildMs)} ms
						</strong>
						<span>Assets load ok/fail</span>
						<strong>
							{snapshot.asset.loadSuccessCount}/
							{snapshot.asset.loadFailureCount}
						</strong>
						<span>Cache/clones</span>
						<strong>
							{snapshot.asset.cacheHitCount}/{snapshot.asset.cloneCount}
						</strong>
						<span>Active clones/fallback</span>
						<strong>
							{snapshot.asset.activeCloneInstances}/
							{snapshot.asset.fallbackPlaceholderCount}
						</strong>
						<span>Character clones/skinned</span>
						<strong>
							{snapshot.asset.character.activeCloneInstances}/
							{snapshot.asset.character.skinnedMeshCount}
						</strong>
						<span>Character clone type</span>
						<strong>
							{snapshot.asset.character.cloneTypes.join(", ") || "none"}
						</strong>
						<span>Character animation</span>
						<strong>
							{snapshot.asset.character.animation.playerState}, mixers{" "}
							{snapshot.asset.character.animation.activeMixers}, loops{" "}
							{snapshot.asset.character.animation.activeLoopingActions}
						</strong>
						<span>Animation sources/issues</span>
						<strong>
							loading {snapshot.asset.character.animation.loadingSourceCount},
							missing {snapshot.asset.character.animation.missingClipCount},
							incompatible{" "}
							{snapshot.asset.character.animation.incompatibleClipCount}
						</strong>
						<span>Animation update avg/worst</span>
						<strong>
							{formatNumber(snapshot.phases.animationUpdate.averageMs)} /{" "}
							{formatNumber(snapshot.phases.animationUpdate.worstMs)} ms
						</strong>
						<span>Asset statuses</span>
						<strong>
							L {snapshot.asset.statusCounts.loaded} / G{" "}
							{snapshot.asset.statusCounts.loading} / E{" "}
							{snapshot.asset.statusCounts.error} / M{" "}
							{snapshot.asset.statusCounts.missing}
						</strong>
						<span>Stuck loading</span>
						<strong>
							{snapshot.asset.hasStuckLoadingAssets
								? snapshot.asset.stuckLoadingCount
								: "none"}
						</strong>
						<span>Terrain</span>
						<strong>
							{snapshot.terrain.mode}, {snapshot.terrain.tileCount} tiles,{" "}
							{snapshot.terrain.meshCount} meshes
						</strong>
						<span>Terrain V/T</span>
						<strong>
							{snapshot.terrain.vertexCount}/{snapshot.terrain.triangleCount}
						</strong>
						<span>Water/coast</span>
						<strong>
							{snapshot.terrain.waterMeshCount}/
							{snapshot.terrain.coastlineEdgeCount}
						</strong>
						<span>Terrain rebuild</span>
						<strong>
							{snapshot.terrain.rebuildCount}x,{" "}
							{formatNumber(snapshot.terrain.lastDurationMs)} ms
						</strong>
						<span>Water update avg/worst</span>
						<strong>
							{formatNumber(snapshot.phases.waterUpdate.averageMs)} /{" "}
							{formatNumber(snapshot.phases.waterUpdate.worstMs)} ms
						</strong>
						<span>Pointer/picks</span>
						<strong>
							{snapshot.pointer.pointerMoveCount}/{snapshot.pointer.pickCount}
						</strong>
						<span>Runtime ticks</span>
						<strong>
							{snapshot.runtime.tickCount},{" "}
							{formatNumber(snapshot.runtime.lastTickMs)} ms
						</strong>
					</div>
					{snapshot.asset.lastMessage ? (
						<p>Last asset: {snapshot.asset.lastMessage}</p>
					) : null}
					{copyStatus ? <small>{copyStatus}</small> : null}
				</section>
			) : null}
		</div>
	);
}
