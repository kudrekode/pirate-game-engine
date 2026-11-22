import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getCinematicDuration } from "../../runtime/cinematicTimeline";
import type { CinematicPreviewTransport } from "../../runtime/three/ThreeRuntimePanel";
import type {
	CinematicActorAnimation,
	CinematicSequence,
	CinematicShot,
	CinematicShotPreset,
	Cutscene,
	GameProject,
} from "../../types/game";
import {
	AdvancedCameraFields,
	CinematicShotInspector,
	shotLabel,
} from "./CinematicShotInspector";
import { CinematicStage } from "./CinematicStage";
import { CinematicTracks } from "./CinematicTracks";
import {
	cinematicId,
	duplicateStoryboardShot,
	estimateShotDuration,
	getShotStart,
	getStoryboardCueIndex,
	identifyStoryboard,
	replaceStoryboard,
	setStoryboardCue,
} from "./cinematicEditing";
import {
	CINEMATIC_PRESETS,
	type CinematicPreset,
	createCinematicPresetShot,
	getCinematicSubjects,
} from "./cinematicFraming";

const HISTORY_LIMIT = 40;
const PLAYER = "runtime_player";
const PRESET_SYMBOLS: Record<CinematicShotPreset, string> = {
	establishing: "▤",
	"close-up": "◎",
	"over-shoulder": "◈",
	"two-shot": "♙♙",
	detail: "◇",
	reveal: "♜",
	"current-view": "⊡",
};

function clock(ms: number) {
	const seconds = Math.floor(ms / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function presetDuration(shot: CinematicShot) {
	return (
		CINEMATIC_PRESETS.find(({ id }) => id === shot.preset)?.durationMs ?? 2500
	);
}

type Snapshot = { sequence: CinematicSequence; index: number };

export function CinematicSequenceEditor({
	project,
	cutscene,
	sequence,
	advanced,
	library,
	settings,
	onChange,
}: {
	project: GameProject;
	cutscene: Cutscene;
	sequence: CinematicSequence;
	advanced: boolean;
	library: ReactNode;
	settings: ReactNode;
	onChange: (sequence: CinematicSequence) => void;
}) {
	const area = project.areas.find(({ id }) => id === sequence.areaId);
	const sceneProject = useRef(project).current;
	const { actors, landmarks } = useMemo(
		() =>
			area
				? getCinematicSubjects(sceneProject, area, sequence.playerMark)
				: { actors: [], landmarks: [] },
		[sceneProject, area, sequence.playerMark],
	);
	const subjects = [...actors, ...landmarks];
	const [selectedIndex, setSelectedIndex] = useState(0);
	const index = Math.min(selectedIndex, sequence.shots.length - 1);
	const shot = sequence.shots[index];
	const [timeMs, setTimeMs] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [orbit, setOrbit] = useState(false);
	const [ready, setReady] = useState(false);
	const [isolateShot, setIsolateShot] = useState(false);
	const [audioIssue, setAudioIssue] = useState<string>();
	const [advancedInspector, setAdvancedInspector] =
		useState<HTMLDivElement | null>(null);
	const [framingMessages, setFramingMessages] = useState<string[]>([]);
	const [undo, setUndo] = useState<Snapshot[]>([]);
	const [redo, setRedo] = useState<Snapshot[]>([]);
	const dragging = useRef<number>(undefined);
	const transport = useRef<CinematicPreviewTransport>({
		sequence,
		timeMs: 0,
		playing: false,
		orbit: false,
		seekRevision: 0,
		onReady: () => setReady(true),
		onAudioIssue: setAudioIssue,
	});
	const duration = getCinematicDuration(sequence);
	const selectedStart = getShotStart(sequence, index);
	const playbackStart = isolateShot ? selectedStart : 0;
	const playbackEnd = isolateShot ? selectedStart + shot.durationMs : duration;
	const previewTime = Math.min(timeMs, Math.max(0, playbackEnd - 0.01));
	Object.assign(transport.current, {
		sequence,
		timeMs: previewTime,
		playing,
		orbit,
	});

	useEffect(() => {
		if (!playing || !ready) return;
		let frame = 0;
		let previous = window.performance.now();
		const tick = (now: number) => {
			const next = Math.min(
				transport.current.timeMs + Math.max(0, now - previous),
				playbackEnd,
			);
			previous = now;
			if (next >= playbackEnd) {
				transport.current.playing = false;
				setPlaying(false);
				setTimeMs(playbackEnd);
				return;
			}
			transport.current.timeMs = next;
			setTimeMs(next);
			frame = window.requestAnimationFrame(tick);
		};
		frame = window.requestAnimationFrame(tick);
		return () => window.cancelAnimationFrame(frame);
	}, [playbackEnd, playing, ready]);

	function seek(ms: number, end = duration) {
		const time = Math.max(0, Math.min(end, ms));
		transport.current.timeMs = time;
		transport.current.playing = false;
		transport.current.seekRevision++;
		setPlaying(false);
		setTimeMs(time);
		setOrbit(false);
	}

	function selectShot(next: number) {
		setFramingMessages([]);
		setSelectedIndex(next);
		seek(getShotStart(sequence, next));
	}

	function commit(
		next: CinematicSequence,
		nextIndex = index,
		focusShot = true,
	) {
		setUndo((entries) =>
			[...entries, { sequence, index }].slice(-HISTORY_LIMIT),
		);
		setRedo([]);
		onChange(next);
		setSelectedIndex(nextIndex);
		if (focusShot)
			seek(getShotStart(next, nextIndex), getCinematicDuration(next));
	}

	function restore(direction: "undo" | "redo") {
		const history = direction === "undo" ? undo : redo;
		const snapshot = history[history.length - 1];
		if (!snapshot) return;
		const current = { sequence, index };
		if (direction === "undo") {
			setUndo(history.slice(0, -1));
			setRedo((entries) => [...entries, current]);
		} else {
			setRedo(history.slice(0, -1));
			setUndo((entries) => [...entries, current]);
		}
		onChange(snapshot.sequence);
		setSelectedIndex(snapshot.index);
		seek(
			getShotStart(snapshot.sequence, snapshot.index),
			getCinematicDuration(snapshot.sequence),
		);
		setFramingMessages([]);
	}

	const subtitleIndex = getStoryboardCueIndex(sequence, index, "subtitle");
	const gestureIndex = getStoryboardCueIndex(sequence, index, "actor");
	const activeSubtitle = sequence.cues?.[subtitleIndex];
	const activeGesture = sequence.cues?.[gestureIndex];
	const subtitle =
		activeSubtitle?.type === "subtitle" ? activeSubtitle : undefined;
	const gesture = activeGesture?.type === "actor" ? activeGesture : undefined;

	const castIds =
		sequence.castIds ??
		Array.from(
			new Set([
				PLAYER,
				...(sequence.cues ?? []).flatMap((cue) =>
					cue.type === "actor"
						? [cue.actorId]
						: cue.type === "subtitle" && cue.speakerId
							? [cue.speakerId]
							: [],
				),
			]),
		);
	const cast = actors.filter(({ id }) => castIds.includes(id));
	const actorChoices = [
		...cast,
		...actors.filter(({ id }) => !castIds.includes(id)),
	];
	const relevantActors = new Set(castIds);
	const errors = new Set(framingMessages);
	for (const cue of sequence.cues ?? []) {
		if (cue.type === "actor") relevantActors.add(cue.actorId);
		if (cue.type === "subtitle" && cue.speakerId)
			relevantActors.add(cue.speakerId);
		if (cue.shotId && !sequence.shots.some(({ id }) => id === cue.shotId))
			errors.add(`Cue has a missing shot (${cue.shotId}).`);
	}
	for (const actorId of relevantActors) {
		const actor = actors.find(({ id }) => id === actorId);
		if (!actor) errors.add(`Missing actor (${actorId}).`);
		else if (actor.assetWarning) errors.add(actor.assetWarning);
	}
	for (const entry of sequence.shots) {
		for (const targetId of [entry.targetId, entry.secondaryTargetId]) {
			if (targetId && !subjects.some(({ id }) => id === targetId))
				errors.add(`Missing camera target (${targetId}).`);
		}
	}
	if (!area) errors.add(`Missing sequence area (${sequence.areaId}).`);

	function buildShot(
		preset: CinematicPreset,
		targetId?: string,
		secondaryTargetId?: string,
	) {
		if (!area) return;
		const prefersLandmark = preset === "reveal" || preset === "detail";
		const target =
			targetId ??
			(prefersLandmark
				? landmarks[0]?.id
				: cast.find(({ id }) => id !== PLAYER)?.id);
		const outcome = createCinematicPresetShot(project, area, {
			preset,
			targetId: target,
			secondaryTargetId,
			playerMark: sequence.playerMark,
			getSubjectGeometry: transport.current.getSubjectGeometry,
		});
		setFramingMessages(outcome.diagnostics);
		return outcome.shot;
	}

	function addShot(preset: CinematicPreset) {
		const next = buildShot(preset);
		if (!next) return;
		const current = identifyStoryboard(sequence);
		commit(
			{
				...current,
				shots: [...current.shots, { ...next, id: cinematicId("shot") }],
			},
			current.shots.length,
		);
	}

	function editShot(at: number, next: CinematicShot) {
		const current = identifyStoryboard(sequence);
		const durationMs =
			next.durationMode === "auto"
				? estimateShotDuration(subtitle?.text ?? "", presetDuration(next))
				: next.durationMs;
		const shots = current.shots.map((item, i) =>
			i === at ? { ...next, id: item.id, durationMs } : item,
		);
		commit(replaceStoryboard(current, shots), at);
	}

	function reframe(
		preset: CinematicShotPreset,
		target?: string,
		secondary?: string,
	) {
		if (preset === "current-view") return;
		const next = buildShot(preset, target, secondary);
		if (!next) return;
		const priorFov = CINEMATIC_PRESETS.find(
			({ id }) => id === shot.preset,
		)?.fov;
		editShot(index, {
			...shot,
			...next,
			to: next.to ?? shot.to,
			trackingOrigin: shot.trackingOrigin
				? actors.find(({ id }) => id === next.targetId)?.position
				: undefined,
			fov:
				shot.fov !== undefined && shot.fov !== priorFov ? shot.fov : next.fov,
			durationMode: shot.durationMode ?? "auto",
			durationMs:
				shot.durationMode === "manual" ? shot.durationMs : next.durationMs,
		});
	}

	function useCurrentView() {
		const view = transport.current.currentView;
		if (!view) return;
		const subtract = (
			point: typeof view.position,
			offset?: typeof view.position,
		) => ({
			x: point.x - (offset?.x ?? 0),
			y: point.y - (offset?.y ?? 0),
			z: point.z - (offset?.z ?? 0),
		});
		editShot(index, {
			...shot,
			preset: "current-view",
			targetId: undefined,
			secondaryTargetId: undefined,
			trackingOrigin: undefined,
			fov: transport.current.currentFov ?? shot.fov,
			from: {
				position: subtract(view.position, shot.positionOffset),
				lookAt: subtract(view.lookAt, shot.lookAtOffset),
			},
		});
		setFramingMessages([]);
	}

	function moveShot(from: number, to: number) {
		if (from === to || to < 0 || to >= sequence.shots.length) return;
		const current = identifyStoryboard(sequence);
		const shots = [...current.shots];
		const [moved] = shots.splice(from, 1);
		shots.splice(to, 0, moved);
		commit(replaceStoryboard(current, shots), to);
	}

	function editSubtitle(text: string, speakerId: string) {
		let current = identifyStoryboard(sequence);
		if (shot.durationMode === "auto") {
			const durationMs = estimateShotDuration(text, presetDuration(shot));
			current = replaceStoryboard(
				current,
				current.shots.map((item, i) =>
					i === index ? { ...item, durationMs } : item,
				),
			);
		}
		const prior = current.cues?.[subtitleIndex];
		const speaker = actors.find(({ id }) => id === speakerId)?.name;
		commit(
			setStoryboardCue(
				current,
				index,
				"subtitle",
				text
					? {
							type: "subtitle",
							startMs: prior?.startMs ?? selectedStart,
							durationMs: prior?.durationMs ?? current.shots[index].durationMs,
							speakerId: speakerId || undefined,
							speaker,
							text,
						}
					: undefined,
			),
		);
	}

	function editGesture(
		animation: CinematicActorAnimation | undefined,
		actorId: string,
	) {
		const current = identifyStoryboard(sequence);
		const prior = current.cues?.[gestureIndex];
		const target = actors.find(
			({ id }) =>
				id !== actorId &&
				(id === shot.targetId || id === shot.secondaryTargetId),
		);
		const face = target
			? { x: target.position.x, z: target.position.z }
			: gesture?.face;
		commit(
			setStoryboardCue(
				current,
				index,
				"actor",
				animation || face
					? {
							type: "actor",
							startMs: prior?.startMs ?? selectedStart,
							durationMs: prior?.durationMs ?? shot.durationMs,
							actorId,
							animation,
							face,
						}
					: undefined,
			),
		);
	}

	function setPlayerMark(targetId: string) {
		const target = actors.find(({ id }) => id === targetId);
		const mark =
			target && area
				? {
						x: Math.min(
							area.width - 1,
							Math.max(0, target.position.x + 1.4 * target.facing.x),
						),
						y: Math.min(
							area.height - 1,
							Math.max(0, target.position.z + 1.4 * target.facing.z),
						),
					}
				: undefined;
		commit({ ...sequence, playerMark: mark });
	}

	let currentFrame = index;
	if (playing || previewTime !== selectedStart) {
		const found = sequence.shots.findIndex(
			(entry, i) => previewTime < getShotStart(sequence, i) + entry.durationMs,
		);
		currentFrame = found < 0 ? sequence.shots.length - 1 : found;
	}
	const frame = sequence.shots[currentFrame];
	const frameTarget = subjects.find(({ id }) => id === frame.targetId);
	const frameLabel = `Shot ${currentFrame + 1} · ${shotLabel(frame)}${frameTarget ? ` · ${frameTarget.name}` : ""}`;

	return (
		<div
			className="cinema-workspace"
			data-mode={advanced ? "advanced" : "simple"}
		>
			<aside className="cinema-library" aria-label="Cinematic library">
				{library}
				<section className="cinema-side-block">
					<h3>Cast in scene</h3>
					<div className="cinema-cast">
						{actors.map((actor) => (
							<label key={actor.id} className="cinema-cast-member">
								<input
									type="checkbox"
									checked={castIds.includes(actor.id)}
									onChange={(event) =>
										commit(
											{
												...sequence,
												castIds: event.target.checked
													? [...castIds, actor.id]
													: castIds.filter((id) => id !== actor.id),
											},
											index,
											false,
										)
									}
								/>
								<span>
									<strong>{actor.name}</strong>
									<small>
										{actor.kind === "player"
											? "Player character"
											: "NPC placement"}
									</small>
								</span>
							</label>
						))}
					</div>
				</section>
				<section className="cinema-side-block">
					<h3>Shot presets</h3>
					{CINEMATIC_PRESETS.map(({ id, label }) => (
						<button
							className="cinema-preset"
							key={id}
							type="button"
							disabled={!area}
							onClick={() => addShot(id)}
						>
							<span aria-hidden="true">{PRESET_SYMBOLS[id]}</span>
							{label}
							<span aria-hidden="true">+</span>
						</button>
					))}
				</section>
			</aside>
			<div className="cinema-center">
				<header className="cinema-center-header">
					<strong>{cutscene.name}</strong>
					<span>
						{sequence.shots.length}{" "}
						{sequence.shots.length === 1 ? "shot" : "shots"} ·{" "}
						{(duration / 1000).toFixed(1)} s
					</span>
					<div className="cinema-actions">
						<button
							type="button"
							onClick={() => restore("undo")}
							disabled={!undo.length}
						>
							Undo
						</button>
						<button
							type="button"
							onClick={() => restore("redo")}
							disabled={!redo.length}
						>
							Redo
						</button>
					</div>
				</header>
				<div className="cinema-viewer">
					{area ? (
						<CinematicStage
							project={sceneProject}
							transport={transport}
							timeMs={previewTime}
							actors={actors}
							fallback={cutscene}
							label={frameLabel}
							ready={ready}
							orbit={orbit}
						/>
					) : (
						<div className="cinema-stage cinema-empty">
							Choose an existing sequence area to preview.
						</div>
					)}
					<div className="cinema-transport">
						<button
							type="button"
							disabled={!ready}
							onClick={() => {
								if (playing) {
									transport.current.playing = false;
									setPlaying(false);
								} else {
									if (timeMs < playbackStart || timeMs >= playbackEnd)
										seek(playbackStart);
									setOrbit(false);
									setPlaying(true);
								}
							}}
						>
							{playing ? "Pause preview" : "Play preview"}
						</button>
						<span>
							{clock(timeMs)} / {clock(duration)}
						</span>
						<input
							aria-label="Preview playhead"
							type="range"
							min={0}
							max={duration}
							value={Math.min(timeMs, duration)}
							onChange={(event) => seek(event.currentTarget.valueAsNumber)}
						/>
						<button
							type="button"
							disabled={!playing && timeMs === playbackStart}
							onClick={() => seek(playbackStart)}
						>
							{playing ? "Skip preview" : "Reset preview"}
						</button>
					</div>
					<div className="cinema-view-tools">
						<button
							type="button"
							disabled={!ready}
							aria-pressed={orbit}
							onClick={() => {
								transport.current.playing = false;
								setPlaying(false);
								setOrbit(!orbit);
							}}
						>
							Orbit view
						</button>
						<button type="button" disabled={!ready} onClick={useCurrentView}>
							Use Current View
						</button>
						<label className="cinema-check">
							<input
								type="checkbox"
								checked={isolateShot}
								onChange={(event) => {
									setIsolateShot(event.target.checked);
									seek(event.target.checked ? selectedStart : 0);
								}}
							/>
							Isolate shot
						</label>
						{audioIssue && <span role="alert">{audioIssue}</span>}
					</div>
				</div>
				<section className="cinema-storyboard" aria-label="Storyboard">
					<header>
						<h3>{advanced ? "Timeline + storyboard" : "Storyboard"}</h3>
						<button
							type="button"
							disabled={!area}
							onClick={() => addShot("establishing")}
						>
							+ Add shot
						</button>
					</header>
					<div className="cinema-storyboard-strip">
						{sequence.shots.map((entry, i) => {
							const reference = subjects.find(
								({ id }) => id === entry.targetId,
							);
							const cue =
								sequence.cues?.[getStoryboardCueIndex(sequence, i, "subtitle")];
							return (
								<button
									key={entry.id ?? `legacy-${i}`}
									type="button"
									className="cinema-storyboard-card"
									aria-pressed={i === index}
									onClick={() => selectShot(i)}
									draggable
									onDragStart={(event) => {
										dragging.current = i;
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/plain", String(i));
									}}
									onDragEnd={() => {
										dragging.current = undefined;
									}}
									onDragOver={(event) => {
										if (dragging.current !== undefined) event.preventDefault();
									}}
									onDrop={(event) => {
										event.preventDefault();
										if (dragging.current !== undefined)
											moveShot(dragging.current, i);
										dragging.current = undefined;
									}}
								>
									<span className="cinema-shot-slate" aria-hidden="true">
										{PRESET_SYMBOLS[entry.preset ?? "current-view"]}
										<small>{clock(getShotStart(sequence, i))}</small>
									</span>
									<strong>
										{i + 1}. {shotLabel(entry)}
									</strong>
									<small>
										{[
											reference?.name,
											cue?.type === "subtitle" ? cue.speaker : undefined,
											`${(entry.durationMs / 1000).toFixed(1)} s`,
										]
											.filter(Boolean)
											.join(" · ")}
									</small>
								</button>
							);
						})}
					</div>
					{advanced && (
						<CinematicTracks
							sequence={sequence}
							actors={actorChoices}
							selectedShotIndex={index}
							timeMs={timeMs}
							onSeek={seek}
							onSelectShot={selectShot}
							onChange={(next) => commit(next, index, false)}
							onAddShot={() => addShot("establishing")}
							onMoveShot={moveShot}
							inspectorTarget={advancedInspector}
							renderShotFields={(entry, at) => (
								<AdvancedCameraFields
									shot={entry}
									trackingTarget={actors.find(
										({ id }) => id === entry.targetId,
									)}
									onChange={(next) => editShot(at, next)}
								/>
							)}
						/>
					)}
				</section>
			</div>
			<aside className="cinema-inspector" aria-label="Cinematic inspector">
				<CinematicShotInspector
					key={`${index}-${shot.id ?? "legacy"}`}
					shot={shot}
					index={index}
					shotCount={sequence.shots.length}
					subtitle={subtitle}
					gesture={gesture}
					actors={actorChoices}
					landmarks={landmarks}
					onFrame={reframe}
					onShotChange={(next) => editShot(index, next)}
					onSubtitle={editSubtitle}
					onGesture={editGesture}
					onMove={(direction) => moveShot(index, index + direction)}
					onDuplicate={() =>
						commit(
							duplicateStoryboardShot(identifyStoryboard(sequence), index),
							index + 1,
						)
					}
					onRemove={() => {
						const current = identifyStoryboard(sequence);
						commit(
							replaceStoryboard(
								current,
								current.shots.filter((_, i) => i !== index),
							),
							Math.min(index, current.shots.length - 2),
						);
					}}
				/>
				{advanced && <div ref={setAdvancedInspector} />}
				{errors.size > 0 && (
					<ul className="cinema-diagnostics" aria-label="Sequence diagnostics">
						{[...errors].map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				)}
				<section className="cinema-side-block">
					<details>
						<summary>Sequence settings</summary>
						{settings}
						{actors.length > 1 && (
							<label>
								Stage player near
								<select
									value={sequence.playerMark ? "staged" : ""}
									onChange={(event) => setPlayerMark(event.target.value)}
								>
									<option value="">Area spawn</option>
									{sequence.playerMark && (
										<option value="staged" disabled>
											Custom stage mark
										</option>
									)}
									{actors
										.filter(({ id }) => id !== PLAYER)
										.map(({ id, name }) => (
											<option key={id} value={id}>
												{name}
											</option>
										))}
								</select>
							</label>
						)}
					</details>
				</section>
			</aside>
		</div>
	);
}
