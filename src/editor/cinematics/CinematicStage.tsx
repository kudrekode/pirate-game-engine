import { type MutableRefObject, useState } from "react";
import { sampleCinematicCues } from "../../runtime/cinematicTimeline";
import {
	type CinematicPreviewTransport,
	ThreeRuntimePanel,
} from "../../runtime/three/ThreeRuntimePanel";
import type { Cutscene, GameProject } from "../../types/game";
import type { CinematicSubject } from "./cinematicFraming";

export function CinematicStage({
	project,
	transport,
	timeMs,
	actors,
	fallback,
	label,
	ready,
	orbit,
}: {
	project: GameProject;
	transport: MutableRefObject<CinematicPreviewTransport>;
	timeMs: number;
	actors: CinematicSubject[];
	fallback: Pick<Cutscene, "speakerName" | "text">;
	label: string;
	ready: boolean;
	orbit: boolean;
}) {
	// The scene builds from one isolated project snapshot. Timeline edits flow
	// through the transport without rebuilding the map or restarting a session.
	const [snapshot] = useState(() => project);
	const { subtitle } = sampleCinematicCues(transport.current.sequence, timeMs);
	const staticCaption = !transport.current.sequence.cues?.some(
		(cue) => cue.type === "subtitle",
	);
	const caption = subtitle?.text ?? (staticCaption ? fallback.text : "");
	const speaker =
		actors.find(({ id }) => id === subtitle?.speakerId)?.name ??
		subtitle?.speaker ??
		(staticCaption ? fallback.speakerName : undefined);

	return (
		<div className="cinema-stage" data-orbit={orbit} data-ready={ready}>
			<ThreeRuntimePanel
				project={snapshot}
				cinematicPreview={transport}
				onRestart={() => {}}
			/>
			<span className="cinema-frame-label">
				{orbit ? "Orbit camera" : label}
			</span>
			{!ready && (
				<span className="cinema-loading" role="status">
					Loading scene…
				</span>
			)}
			{caption && !orbit && (
				<p className="cinema-caption">
					{speaker && <strong>{speaker} </strong>}
					{caption}
				</p>
			)}
		</div>
	);
}
