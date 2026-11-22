import {
	type CSSProperties,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { getCinematicDuration } from "../../runtime/cinematicTimeline";
import { sampleCinematicShot } from "../../runtime/three/cinematicCamera";
import type { CinematicCue, CinematicSequence } from "../../types/game";
import { CueFields, ShotFields } from "../sections/CinematicTimelineFields";
import "../sections/cinematicTimelineEditor.css";
import {
	AudioCueCreator,
	CinematicAudioSourceFields,
} from "./CinematicAudioFields";
import "./cinematicTracks.css";

type Shot = CinematicSequence["shots"][number];
type Actor = { id: string; name: string };
type TrackKind = "camera" | CinematicCue["type"] | "face" | "effects";

const trackLabels: Record<TrackKind, string> = {
	camera: "Camera",
	actor: "Actors",
	subtitle: "Dialogue",
	audio: "Audio",
	face: "Face",
	effects: "Effects",
};

type Clip = {
	id: string;
	kind: "camera" | CinematicCue["type"];
	index: number;
	label: string;
	startMs: number;
	durationMs: number;
};

type CueSelection = { id?: string; index: number };
type ClipDrag = {
	clip: Clip;
	sequence: CinematicSequence;
	pointerId: number;
	x: number;
	width: number;
	durationMs: number;
};

type ClipPosition = { id: string; startMs: number; targetShotIndex?: number };

function getClips(sequence: CinematicSequence, actors: Actor[]) {
	const tracks: Record<TrackKind, Clip[]> = {
		camera: [],
		actor: [],
		subtitle: [],
		audio: [],
		face: [],
		effects: [],
	};
	let startMs = 0;
	sequence.shots.forEach((shot, index) => {
		tracks.camera.push({
			id: shot.id ?? `legacy-shot-${index}`,
			kind: "camera",
			index,
			label: `Shot ${index + 1}`,
			startMs,
			durationMs: shot.durationMs,
		});
		startMs += shot.durationMs;
	});
	sequence.cues?.forEach((cue, index) => {
		let label: string;
		if (cue.type === "subtitle") {
			const speaker =
				actors.find(({ id }) => id === cue.speakerId)?.name ?? cue.speaker;
			label = speaker ? `${speaker} · ${cue.text}` : cue.text;
		} else if (cue.type === "actor") {
			const actor =
				actors.find(({ id }) => id === cue.actorId)?.name ??
				`Missing actor (${cue.actorId})`;
			label = `${actor} · ${cue.animation ?? "Face point"}`;
		} else {
			if (cue.sourceName) label = cue.sourceName;
			else if (cue.url.startsWith("data:")) label = "Imported audio";
			else {
				const path = cue.url.split(/[?#]/, 1)[0];
				label = path.slice(path.lastIndexOf("/") + 1) || "Audio cue";
			}
		}
		tracks[cue.type].push({
			id: cue.id ?? `legacy-cue-${index}`,
			kind: cue.type,
			index,
			label,
			startMs: cue.startMs,
			durationMs: cue.durationMs,
		});
	});
	return tracks;
}

function getLanes(clips: Clip[]) {
	const lanes: Clip[][] = [];
	const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
	for (const clip of sorted) {
		const lane = lanes.find((entries) => {
			const last = entries[entries.length - 1];
			return last.startMs + last.durationMs <= clip.startMs;
		});
		if (lane) lane.push(clip);
		else lanes.push([clip]);
	}
	return lanes.length ? lanes : [[]];
}

function formatTime(ms: number) {
	const minutes = Math.floor(ms / 60000);
	const seconds = (ms % 60000) / 1000;
	return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function getTickTimes(durationMs: number) {
	const approximateStep = durationMs / 6;
	const magnitude = 10 ** Math.floor(Math.log10(approximateStep));
	const step = Math.max(
		1,
		([1, 2, 5, 10].find((value) => value * magnitude >= approximateStep) ??
			10) * magnitude,
	);
	return Array.from(
		{ length: Math.floor(durationMs / step) + 1 },
		(_, index) => index * step,
	);
}

function clampTime(timeMs: number, durationMs: number) {
	return Math.min(durationMs, Math.max(0, Math.round(timeMs)));
}

type CinematicTracksProps = {
	sequence: CinematicSequence;
	actors: Actor[];
	selectedShotIndex: number;
	timeMs: number;
	onSeek: (timeMs: number) => void;
	onSelectShot: (index: number) => void;
	onChange: (sequence: CinematicSequence) => void;
	onAddShot: () => void;
	onMoveShot?: (index: number, next: number) => void;
	renderShotFields?: (shot: Shot, index: number) => ReactNode;
	inspectorTarget?: HTMLElement | null;
};

export function CinematicTracks({
	sequence,
	actors,
	selectedShotIndex,
	timeMs,
	onSeek,
	onSelectShot,
	onChange,
	onAddShot,
	onMoveShot,
	renderShotFields,
	inspectorTarget,
}: CinematicTracksProps) {
	const [cueSelection, setCueSelection] = useState<CueSelection>();
	const [addingAudio, setAddingAudio] = useState(false);
	const [clipPosition, setClipPosition] = useState<ClipPosition>();
	const drag = useRef<ClipDrag>(undefined);
	const didDrag = useRef(false);
	const durationMs = getCinematicDuration(sequence);
	const scaleMs = Math.max(durationMs, 1);
	const playhead = clampTime(timeMs, durationMs);
	const cues = sequence.cues ?? [];
	const clips = getClips(sequence, actors);
	const activeCueIndex = cueSelection?.id
		? cues.findIndex(({ id }) => id === cueSelection.id)
		: (cueSelection?.index ?? -1);
	const activeCue = cues[activeCueIndex];
	const activeShot = sequence.shots[selectedShotIndex];
	const ticks = getTickTimes(scaleMs);
	useEffect(() => {
		if (!drag.current || drag.current.sequence === sequence) return;
		drag.current = undefined;
		setClipPosition(undefined);
	}, [sequence]);

	function selectClip(clip: Clip, atMs = clip.startMs) {
		setAddingAudio(false);
		if (clip.kind === "camera") {
			setCueSelection(undefined);
			onSelectShot(clip.index);
		} else {
			setCueSelection({ id: cues[clip.index].id, index: clip.index });
		}
		onSeek(atMs);
	}

	function addCue(cue: CinematicCue) {
		const newCue = { ...cue, id: `cinematic-cue-${crypto.randomUUID()}` };
		onChange({ ...sequence, cues: [...cues, newCue] });
		setAddingAudio(false);
		setCueSelection({ index: cues.length, id: newCue.id });
	}

	function editCue(index: number, next: CinematicCue) {
		const cue = cues[index];
		const changedTiming =
			next.startMs !== cue.startMs || next.durationMs !== cue.durationMs;
		const updated = { ...next };
		if (changedTiming) delete updated.shotId;
		onChange({
			...sequence,
			cues: cues.map((entry, entryIndex) =>
				entryIndex === index ? updated : entry,
			),
		});
	}

	function editShot(index: number, next: Shot) {
		onChange({
			...sequence,
			shots: sequence.shots.map((shot, shotIndex) =>
				shotIndex === index ? next : shot,
			),
		});
	}

	function beginDrag(event: PointerEvent<HTMLButtonElement>, clip: Clip) {
		if (drag.current || event.button !== 0) return;
		didDrag.current = false;
		if (clip.kind === "camera" && !onMoveShot) return;
		const width =
			event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
		if (!width) return;
		drag.current = {
			clip,
			sequence,
			width,
			durationMs,
			pointerId: event.pointerId,
			x: event.clientX,
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function getDragPosition(
		event: PointerEvent<HTMLButtonElement>,
	): ClipPosition | undefined {
		const gesture = drag.current;
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const dx = event.clientX - gesture.x;
		if (Math.abs(dx) < 4) return;
		const { clip } = gesture;
		const offset = (dx / gesture.width) * gesture.durationMs;
		const startMs = clampTime(clip.startMs + offset, gesture.durationMs);
		if (clip.kind !== "camera") return { id: clip.id, startMs };
		const lastShot = clips.camera[clips.camera.length - 1];
		const midpoint = clampTime(
			clip.startMs + offset + clip.durationMs / 2,
			lastShot.startMs + lastShot.durationMs - 1,
		);
		const target = clips.camera.find(
			(shot) =>
				midpoint >= shot.startMs && midpoint < shot.startMs + shot.durationMs,
		);
		return { id: clip.id, startMs, targetShotIndex: target?.index };
	}

	function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
		if (drag.current?.pointerId !== event.pointerId) return;
		drag.current = undefined;
		setClipPosition(undefined);
	}

	function finishDrag(event: PointerEvent<HTMLButtonElement>, clip: Clip) {
		const position = getDragPosition(event);
		cancelDrag(event);
		if (!position) return;
		didDrag.current = true;
		if (clip.kind === "camera") {
			setCueSelection(undefined);
			setAddingAudio(false);
			if (
				position.targetShotIndex !== undefined &&
				position.targetShotIndex !== clip.index
			) {
				onMoveShot?.(clip.index, position.targetShotIndex);
			} else {
				selectClip(clip);
			}
		} else {
			if (position.startMs !== clip.startMs) {
				editCue(clip.index, { ...cues[clip.index], startMs: position.startMs });
			}
			selectClip(clip, position.startMs);
		}
	}

	function renderClip(clip: Clip) {
		const camera = clip.kind === "camera";
		const selected = camera
			? !activeCue && clip.index === selectedShotIndex
			: clip.index === activeCueIndex;
		const startMs =
			!camera && clip.id === clipPosition?.id
				? clipPosition.startMs
				: clip.startMs;
		const left = (startMs / scaleMs) * 100;
		const width =
			(Math.min(clip.durationMs, scaleMs - startMs) / scaleMs) * 100;
		return (
			<button
				key={clip.id}
				className="cinematic-track-clip"
				data-draggable={!camera || !!onMoveShot}
				data-dropping={camera && clipPosition?.targetShotIndex === clip.index}
				style={{ left: `min(${left}%, calc(100% - 8px))`, width: `${width}%` }}
				type="button"
				aria-pressed={selected}
				title={`${clip.label} · ${formatTime(startMs)} · ${clip.durationMs} ms`}
				onClick={(event) => {
					if (!didDrag.current || event.detail === 0) selectClip(clip);
					didDrag.current = false;
				}}
				onPointerDown={(event) => beginDrag(event, clip)}
				onPointerMove={(event) => {
					if (drag.current?.pointerId === event.pointerId)
						setClipPosition(getDragPosition(event));
				}}
				onPointerUp={(event) => finishDrag(event, clip)}
				onPointerCancel={cancelDrag}
				onLostPointerCapture={cancelDrag}
			>
				{clip.label}
			</button>
		);
	}

	const addActions: Partial<
		Record<TrackKind, { label: string; run: () => void; disabled?: boolean }>
	> = {
		camera: {
			label: "Add camera shot",
			run: () => {
				setCueSelection(undefined);
				setAddingAudio(false);
				onAddShot();
			},
		},
		actor: {
			label: "Add actor cue",
			disabled: actors.length === 0,
			run: () =>
				addCue({
					type: "actor",
					actorId: actors[0].id,
					animation: "idle",
					startMs: playhead,
					durationMs: 2000,
				}),
		},
		subtitle: {
			label: "Add dialogue cue",
			run: () =>
				addCue({
					type: "subtitle",
					text: "New subtitle",
					startMs: playhead,
					durationMs: 2000,
				}),
		},
		audio: { label: "Add audio", run: () => setAddingAudio(true) },
	};

	return (
		<section className="cinematic-tracks" aria-label="Advanced timeline">
			<header className="cinematic-tracks-heading">
				<h3>Advanced timeline</h3>
				<span className="cinematic-track-time">
					{formatTime(playhead)} / {formatTime(durationMs)}
				</span>
			</header>
			<div className="cinematic-tracks-scroll">
				<div
					className="cinematic-tracks-grid"
					style={
						{
							"--cinematic-playhead": `${(playhead / scaleMs) * 100}%`,
						} as CSSProperties
					}
				>
					<div className="cinematic-tracks-row">
						<div className="cinematic-track-label">Time</div>
						<div className="cinematic-track-ruler">
							{ticks.map((tickMs) => (
								<span
									key={tickMs}
									data-edge={tickMs === scaleMs ? "end" : undefined}
									style={{ left: `${(tickMs / scaleMs) * 100}%` }}
									aria-hidden="true"
								>
									{tickMs / 1000}s
								</span>
							))}
							<input
								aria-label="Timeline playhead"
								aria-valuetext={formatTime(playhead)}
								type="range"
								min={0}
								max={scaleMs}
								step={1}
								value={playhead}
								disabled={durationMs === 0}
								onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
							/>
						</div>
					</div>
					{(Object.keys(trackLabels) as TrackKind[]).map((kind) => {
						const action = addActions[kind];
						return (
							<div
								className="cinematic-tracks-row"
								data-track={kind}
								key={kind}
							>
								<div className="cinematic-track-label">
									<span>{trackLabels[kind]}</span>
									{action && (
										<button
											type="button"
											title={action.label}
											aria-label={action.label}
											disabled={action.disabled}
											onClick={action.run}
										>
											+
										</button>
									)}
								</div>
								<fieldset
									className="cinematic-track-lanes"
									aria-label={`${trackLabels[kind]} track`}
								>
									{action ? (
										getLanes(clips[kind]).map((lane, laneIndex) => (
											// Lanes are temporary rows allocated by the clip times.
											<div
												className="cinematic-track-lane"
												key={lane[0]?.id ?? laneIndex}
												style={{
													backgroundSize: `${((ticks[1] ?? scaleMs) / scaleMs) * 100}% 100%`,
												}}
											>
												{lane.map(renderClip)}
											</div>
										))
									) : (
										<span className="cinematic-track-unavailable">
											Unavailable
										</span>
									)}
								</fieldset>
							</div>
						);
					})}
				</div>
			</div>
			{renderInspector()}
		</section>
	);

	function renderInspector() {
		const inspector = (
			<section
				className="cinematic-track-inspector form-stack"
				aria-label="Advanced inspector"
			>
				{addingAudio ? (
					<>
						<h4>Add audio</h4>
						<AudioCueCreator
							onAdd={(url, sourceName) =>
								addCue({
									type: "audio",
									url,
									sourceName,
									startMs: playhead,
									durationMs: 2000,
								})
							}
							onCancel={() => setAddingAudio(false)}
						/>
					</>
				) : activeCue ? (
					<>
						<h4>{trackLabels[activeCue.type]} cue</h4>
						{activeCue.shotId && (
							<p>Changing timing detaches this cue from its storyboard shot.</p>
						)}
						{activeCue.type === "audio" && (
							<p>
								One audio cue plays at a time. The latest active cue takes
								priority.
							</p>
						)}
						<CueFields
							key={activeCue.id ?? activeCueIndex}
							cue={activeCue}
							actors={actors}
							target={
								sampleCinematicShot(sequence, activeCue.startMs, true)?.camera
									.lookAt
							}
							onChange={(cue) => editCue(activeCueIndex, cue)}
							linkSubtitleSpeaker
							audioSourceFields={
								activeCue.type === "audio" && (
									<CinematicAudioSourceFields
										url={activeCue.url}
										sourceName={activeCue.sourceName}
										onChange={(url, sourceName) =>
											editCue(activeCueIndex, { ...activeCue, url, sourceName })
										}
									/>
								)
							}
						/>
						<button
							type="button"
							className="danger-button"
							onClick={() => {
								onChange({
									...sequence,
									cues: cues.filter((_, index) => index !== activeCueIndex),
								});
								setCueSelection(undefined);
							}}
						>
							Delete cue
						</button>
					</>
				) : (
					activeShot && (
						<>
							<h4>Camera · Shot {selectedShotIndex + 1}</h4>
							{renderShotFields ? (
								renderShotFields(activeShot, selectedShotIndex)
							) : (
								<ShotFields
									shot={activeShot}
									onChange={(shot) => editShot(selectedShotIndex, shot)}
								/>
							)}
						</>
					)
				)}
			</section>
		);
		return inspectorTarget
			? createPortal(inspector, inspectorTarget)
			: inspector;
	}
}
