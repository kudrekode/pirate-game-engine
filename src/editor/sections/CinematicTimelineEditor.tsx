import { useEffect, useRef, useState } from "react";
import { sampleSmoothTerrainSurfaceY } from "../../data/terrainSurface";
import { getCinematicDuration } from "../../runtime/cinematicTimeline";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import { ThreeRuntimePanel } from "../../runtime/three/ThreeRuntimePanel";
import type {
	CinematicCamera,
	CinematicCue,
	CinematicSequence,
	Cutscene,
	GameArea,
	GameProject,
} from "../../types/game";
import {
	AudioCueCreator,
	CueFields,
	ShotFields,
} from "./CinematicTimelineFields";
import "./cinematicTimelineEditor.css";

type TimelineSelection = { kind: "shot" | "cue"; index: number };
type TimelineEntry = TimelineSelection & {
	label: string;
	startMs: number;
	durationMs: number;
};

function defaultCamera(area: GameArea): CinematicCamera {
	const spawn = area.eventBlocks.find((event) => event.kind === "spawn");
	const x = spawn?.x ?? (area.width - 1) / 2;
	const z = spawn?.y ?? (area.height - 1) / 2;
	const ground = sampleSmoothTerrainSurfaceY(area, { x, y: z });
	return {
		position: { x: x - 3, y: ground + 3, z: z + 5 },
		lookAt: { x, y: ground + 1.4, z },
	};
}

function timelineEntries(sequence: CinematicSequence): TimelineEntry[] {
	let startMs = 0;
	const shots = sequence.shots.map<TimelineEntry>((shot, index) => {
		const entry: TimelineEntry = {
			kind: "shot",
			index,
			label: `Shot ${index + 1}`,
			startMs,
			durationMs: shot.durationMs,
		};
		startMs += shot.durationMs;
		return entry;
	});
	const cueLabels = {
		subtitle: "Subtitle",
		actor: "Actor action",
		audio: "Audio",
	};
	const cues = sequence.cues?.map<TimelineEntry>((cue, index) => ({
		kind: "cue",
		index,
		label: cueLabels[cue.type],
		startMs: cue.startMs,
		durationMs: cue.durationMs,
	}));
	return [...shots, ...(cues ?? [])].sort((a, b) => a.startMs - b.startMs);
}

function CinematicPreviewDialog({
	project,
	cutscene,
	onClose,
}: {
	project: GameProject;
	cutscene: Cutscene;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const [run, setRun] = useState(0);
	const replay = () => setRun((value) => value + 1);
	useEffect(() => {
		const dialog = ref.current;
		if (dialog?.showModal) dialog.showModal();
		else dialog?.setAttribute("open", "");
		return () => {
			if (dialog?.open && dialog.close) dialog.close();
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-label="3D sequence preview"
			className="cinematic-preview-dialog"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="cinematic-preview-shell">
				<header>
					<strong>{cutscene.name}</strong>
					<div className="cinematic-editor-actions">
						<button type="button" onClick={replay}>
							Replay
						</button>
						<button type="button" onClick={onClose}>
							Close preview
						</button>
					</div>
				</header>
				<div className="cinematic-preview-stage">
					<ThreeRuntimePanel
						key={run}
						project={project}
						onRestart={replay}
						previewCutsceneId={cutscene.id}
					/>
				</div>
			</div>
		</dialog>
	);
}

export function CinematicTimelineEditor({
	project,
	cutscene,
	onChange,
}: {
	project: GameProject;
	cutscene: Cutscene;
	onChange: (sequence: CinematicSequence | undefined) => void;
}) {
	const [selection, select] = useState<TimelineSelection>({
		kind: "shot",
		index: 0,
	});
	const [addingAudio, setAddingAudio] = useState(false);
	const [previewProject, setPreviewProject] = useState<GameProject>();
	const sequence = cutscene.cinematic;
	const area = project.areas.find(
		({ id }) => id === (sequence?.areaId ?? project.activeAreaId),
	);
	const startArea = area ?? project.areas[0];
	if (!sequence) {
		return (
			<button
				type="button"
				disabled={!startArea}
				onClick={() => {
					if (!startArea) return;
					select({ kind: "shot", index: 0 });
					onChange({
						areaId: startArea.id,
						shots: [{ durationMs: 2500, from: defaultCamera(startArea) }],
					});
				}}
			>
				Create 3D sequence
			</button>
		);
	}

	const entries = timelineEntries(sequence);
	const cues = sequence.cues ?? [];
	const active =
		entries.find(
			({ kind, index }) => selection.kind === kind && selection.index === index,
		) ?? entries[0];
	const activeShot =
		active?.kind === "shot" ? sequence.shots[active.index] : undefined;
	const activeCue = active?.kind === "cue" ? cues[active.index] : undefined;
	const lastShot = sequence.shots[sequence.shots.length - 1];
	const actors = [
		{ id: "runtime_player", name: `Player (${project.player.name})` },
		...(area?.npcs.map((npc) => ({
			id: npc.id,
			name: resolveNPCInstance(
				project.npcs.find(
					(definition) => definition.id === npc.npcDefinitionId,
				),
				npc,
			).name,
		})) ?? []),
	];
	function chooseEntry(entry: TimelineSelection) {
		setAddingAudio(false);
		select(entry);
	}
	const addCue = (cue: CinematicCue) => {
		onChange({ ...sequence, cues: [...cues, cue] });
		chooseEntry({ kind: "cue", index: cues.length });
	};
	const moveShot = (index: number, next: number) => {
		const shots = [...sequence.shots];
		[shots[index], shots[next]] = [shots[next], shots[index]];
		onChange({ ...sequence, shots });
		chooseEntry({ kind: "shot", index: next });
	};

	return (
		<section className="cinematic-timeline-editor" aria-label="3D sequence">
			<div className="cinematic-editor-heading">
				<h3>3D sequence</h3>
				<button
					type="button"
					className="primary-button"
					disabled={!area || !lastShot}
					onClick={() => setPreviewProject(project)}
				>
					Preview 3D sequence
				</button>
			</div>
			<label>
				Sequence area
				<select
					value={sequence.areaId}
					onChange={(event) =>
						onChange({ ...sequence, areaId: event.target.value })
					}
				>
					{!area && (
						<option value={sequence.areaId}>
							Missing area ({sequence.areaId})
						</option>
					)}
					{project.areas.map(({ id, name }) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</select>
			</label>
			<div className="cinematic-editor-actions">
				<button
					type="button"
					disabled={!lastShot && !startArea}
					onClick={() => {
						const from =
							lastShot?.to ??
							lastShot?.from ??
							(startArea ? defaultCamera(startArea) : undefined);
						if (!from) return;
						onChange({
							...sequence,
							shots: [...sequence.shots, { durationMs: 2500, from }],
						});
						chooseEntry({ kind: "shot", index: sequence.shots.length });
					}}
				>
					Add shot
				</button>
				<button
					type="button"
					onClick={() =>
						addCue({
							type: "subtitle",
							startMs: 0,
							durationMs: 2000,
							speaker: cutscene.speakerName,
							text: cutscene.text.trim() || "New subtitle",
						})
					}
				>
					Add subtitle
				</button>
				<button
					type="button"
					onClick={() =>
						addCue({
							type: "actor",
							startMs: 0,
							durationMs: 2000,
							actorId: "runtime_player",
							animation: "idle",
						})
					}
				>
					Add actor action
				</button>
				<button type="button" onClick={() => setAddingAudio(true)}>
					Add audio
				</button>
			</div>
			<div className="cinematic-timeline-layout">
				<div>
					<h4>
						Timeline <small>{getCinematicDuration(sequence)} ms</small>
					</h4>
					<ol className="cinematic-timeline-list">
						{entries.map((entry) => (
							// These are ordered timeline slots, with no persisted entry IDs.
							<li key={`${entry.kind}-${entry.index}`}>
								<button
									type="button"
									aria-pressed={
										!addingAudio &&
										active?.kind === entry.kind &&
										active.index === entry.index
									}
									onClick={() => chooseEntry(entry)}
								>
									<span>{entry.label}</span>
									<small>
										{entry.startMs}–{entry.startMs + entry.durationMs} ms
									</small>
								</button>
							</li>
						))}
					</ol>
				</div>
				{addingAudio ? (
					<AudioCueCreator
						onCancel={() => setAddingAudio(false)}
						onAdd={(url) =>
							addCue({ type: "audio", startMs: 0, durationMs: 2000, url })
						}
					/>
				) : (
					active && (
						<div className="form-stack" key={`${active.kind}-${active.index}`}>
							<h4>{active.label}</h4>
							{activeShot && (
								<>
									<p className="helper-text">
										X and Z use map tiles. Y is world height in metres.
									</p>
									<ShotFields
										shot={activeShot}
										onChange={(shot) =>
											onChange({
												...sequence,
												shots: sequence.shots.map((existing, index) =>
													index === active.index ? shot : existing,
												),
											})
										}
									/>
									<div className="cinematic-editor-actions">
										<button
											type="button"
											disabled={active.index === 0}
											onClick={() => moveShot(active.index, active.index - 1)}
										>
											Move shot earlier
										</button>
										<button
											type="button"
											disabled={active.index === sequence.shots.length - 1}
											onClick={() => moveShot(active.index, active.index + 1)}
										>
											Move shot later
										</button>
										<button
											type="button"
											disabled={sequence.shots.length <= 1}
											onClick={() => {
												onChange({
													...sequence,
													shots: sequence.shots.filter(
														(_, index) => index !== active.index,
													),
												});
												chooseEntry({
													kind: "shot",
													index: Math.max(0, active.index - 1),
												});
											}}
										>
											Remove shot
										</button>
									</div>
								</>
							)}
							{activeCue && (
								<>
									<CueFields
										cue={activeCue}
										actors={actors}
										target={
											sequence.shots[0]?.from.lookAt ?? { x: 0, y: 0, z: 0 }
										}
										onChange={(cue) =>
											onChange({
												...sequence,
												cues: cues.map((existing, index) =>
													index === active.index ? cue : existing,
												),
											})
										}
									/>
									<button
										type="button"
										onClick={() => {
											const remaining = cues.filter(
												(_, index) => index !== active.index,
											);
											onChange({
												...sequence,
												cues: remaining.length ? remaining : undefined,
											});
											chooseEntry({ kind: "shot", index: 0 });
										}}
									>
										Remove cue
									</button>
								</>
							)}
						</div>
					)
				)}
			</div>
			<button
				className="danger-button"
				type="button"
				onClick={() => {
					setAddingAudio(false);
					onChange(undefined);
				}}
			>
				Remove 3D sequence
			</button>
			{previewProject && (
				<CinematicPreviewDialog
					project={previewProject}
					cutscene={cutscene}
					onClose={() => setPreviewProject(undefined)}
				/>
			)}
		</section>
	);
}
