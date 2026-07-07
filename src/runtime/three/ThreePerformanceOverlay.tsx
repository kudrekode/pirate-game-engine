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
						<span>Frame avg/worst</span>
						<strong>
							{formatNumber(snapshot.frame.averageFrameMs)} /{" "}
							{formatNumber(snapshot.frame.worstFrameMs)} ms
						</strong>
						<span>RAF frames</span>
						<strong>{snapshot.frame.frameCount}</strong>
						<span>Render call</span>
						<strong>{formatNumber(snapshot.frame.lastRenderMs)} ms</strong>
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
						<span>Active/fallback</span>
						<strong>
							{snapshot.asset.activeImportedAssetInstances}/
							{snapshot.asset.fallbackPlaceholderCount}
						</strong>
						<span>Terrain</span>
						<strong>
							{snapshot.terrain.mode}, {snapshot.terrain.tileCount} tiles,{" "}
							{snapshot.terrain.meshCount} meshes
						</strong>
						<span>Terrain rebuild</span>
						<strong>
							{snapshot.terrain.rebuildCount}x,{" "}
							{formatNumber(snapshot.terrain.lastDurationMs)} ms
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
