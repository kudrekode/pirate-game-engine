import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, Input, NativeSelect, Textarea } from "@/components/ui/control";
import { backgroundPresets, portraitPresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import type { Cutscene, GameProject } from "../../types/game";
import { CinematicSequenceEditor } from "../cinematics/CinematicSequenceEditor";
import { cinematicId } from "../cinematics/cinematicEditing";
import { createCinematicPresetShot } from "../cinematics/cinematicFraming";
import { useEditorSource } from "./editorSource";
import "../cinematics/cinematics.css";

function establish(project: GameProject) {
	const area =
		project.areas.find(({ id }) => id === project.activeAreaId) ??
		project.areas[0];
	if (!area) return;
	const { shot } = createCinematicPresetShot(project, area, {
		preset: "establishing",
	});
	if (!shot) return;
	return { areaId: area.id, shots: [{ ...shot, id: cinematicId("shot") }] };
}

function StaticFields({
	cutscene,
	onChange,
}: {
	cutscene: Cutscene;
	onChange: (patch: Partial<Cutscene>) => void;
}) {
	return (
		<>
			<label>
				Background image
				<NativeSelect
					value={cutscene.backgroundImageId}
					onChange={(event) =>
						onChange({ backgroundImageId: event.target.value })
					}
				>
					{backgroundPresets.map(({ id, label }) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</NativeSelect>
			</label>
			<label>
				Portrait image
				<NativeSelect
					value={cutscene.portraitImageId ?? ""}
					onChange={(event) =>
						onChange({ portraitImageId: event.target.value || undefined })
					}
				>
					<option value="">None</option>
					{portraitPresets.map(({ id, label }) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</NativeSelect>
			</label>
			<label>
				Speaker name
				<Input
					value={cutscene.speakerName ?? ""}
					onChange={(event) => onChange({ speakerName: event.target.value })}
				/>
			</label>
			<label>
				Text
				<Textarea
					value={cutscene.text}
					rows={4}
					onChange={(event) => onChange({ text: event.target.value })}
				/>
			</label>
		</>
	);
}

export function CutsceneEditor() {
	const project = useProjectStore((state) => state.project);
	const addCutscene = useProjectStore((state) => state.addCutscene);
	const updateCutscene = useProjectStore((state) => state.updateCutscene);
	const deleteCutscene = useProjectStore((state) => state.deleteCutscene);
	const [selectedId, setSelectedId] = useState("");
	const [advanced, setAdvanced] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [confirmStatic, setConfirmStatic] = useState(false);
	useEditorSource("cutscenes", (source) => setSelectedId(source.id));
	const cutscene =
		project.cutscenes.find(({ id }) => id === selectedId) ??
		project.cutscenes[0];
	const sequence = cutscene?.cinematic;

	function select(id: string) {
		setSelectedId(id);
		setConfirmDelete(false);
		setConfirmStatic(false);
	}

	const library = (
		<section className="cinema-side-block">
			<p className="cinema-eyebrow">Cinematic library</p>
			<h3>Sequences</h3>
			{project.cutscenes.map((entry) => (
				<Button
					className="cinema-sequence"
					type="button"
					key={entry.id}
					aria-label={entry.name}
					aria-pressed={entry.id === cutscene?.id}
					onClick={() => select(entry.id)}
				>
					<strong>{entry.name}</strong>
					<small>
						{entry.cinematic
							? `${entry.cinematic.shots.length} ${entry.cinematic.shots.length === 1 ? "shot" : "shots"}`
							: "Static cutscene"}
					</small>
				</Button>
			))}
			<Button
				className="cinema-dashed"
				aria-label="+ New sequence"
				type="button"
				onClick={() => {
					const cinematic = establish(project);
					select(
						addCutscene({
							name: `Sequence ${project.cutscenes.length + 1}`,
							...(cinematic
								? { cinematic, text: "", speakerName: undefined }
								: {}),
						}),
					);
				}}
			>
				<Plus aria-hidden="true" /> New sequence
			</Button>
			<details>
				<summary>Legacy cutscenes</summary>
				<Button type="button" onClick={() => select(addCutscene())}>
					Add cutscene
				</Button>
			</details>
		</section>
	);

	const change = (patch: Partial<Cutscene>) => {
		if (cutscene) updateCutscene(cutscene.id, patch);
	};
	const settings = cutscene && (
		<>
			<label>
				Sequence name
				<Input
					value={cutscene.name}
					onChange={(event) => change({ name: event.target.value })}
				/>
			</label>
			{sequence && (
				<>
					<label>
						Sequence area
						<NativeSelect
							value={sequence.areaId}
							onChange={(event) =>
								change({
									cinematic: {
										...sequence,
										areaId: event.target.value,
										playerMark: undefined,
									},
								})
							}
						>
							{!project.areas.some(({ id }) => id === sequence.areaId) && (
								<option value={sequence.areaId}>
									Missing area ({sequence.areaId})
								</option>
							)}
							{project.areas.map(({ id, name }) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
						</NativeSelect>
					</label>
					<details>
						<summary>Static cutscene presentation</summary>
						<StaticFields cutscene={cutscene} onChange={change} />
						{confirmStatic ? (
							<div className="cinema-confirm">
								<p role="status">
									This will remove the 3D shots and cues from this sequence.
								</p>
								<Button type="button" onClick={() => setConfirmStatic(false)}>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={() => {
										setConfirmStatic(false);
										change({ cinematic: undefined });
									}}
								>
									Remove 3D sequence
								</Button>
							</div>
						) : (
							<Button type="button" onClick={() => setConfirmStatic(true)}>
								Convert to static cutscene
							</Button>
						)}
					</details>
				</>
			)}
			{confirmDelete ? (
				<div className="cinema-confirm">
					<p role="status">
						Delete this sequence and remove its trigger references?
					</p>
					<Button type="button" onClick={() => setConfirmDelete(false)}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => {
							deleteCutscene(cutscene.id);
							select("");
						}}
					>
						Confirm delete
					</Button>
				</div>
			) : (
				<Button type="button" onClick={() => setConfirmDelete(true)}>
					Delete sequence
				</Button>
			)}
		</>
	);

	return (
		<section className="cinema-shell" aria-label="Cinematics workspace">
			<header className="cinema-toolbar editor-toolbar">
				<h2>Cinematics</h2>
				<fieldset
					className="cinema-modes editor-tab-group"
					aria-label="Editing mode"
				>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={!advanced}
						onClick={() => setAdvanced(false)}
					>
						Simple
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={advanced}
						onClick={() => setAdvanced(true)}
					>
						Advanced
					</Button>
				</fieldset>
			</header>
			{cutscene && sequence ? (
				<CinematicSequenceEditor
					key={`${cutscene.id}-${sequence.areaId}`}
					project={project}
					cutscene={cutscene}
					sequence={sequence}
					advanced={advanced}
					library={library}
					settings={settings}
					onChange={(cinematic) => change({ cinematic })}
				/>
			) : (
				<div className="cinema-workspace">
					<aside className="cinema-library" aria-label="Cinematic library">
						{library}
					</aside>
					<div className="cinema-center cinema-empty">
						{cutscene ? (
							<div
								className="cinema-static-preview"
								style={{
									background: backgroundPresets.find(
										({ id }) => id === cutscene.backgroundImageId,
									)?.color,
								}}
							>
								{cutscene.speakerName && (
									<strong>{cutscene.speakerName}</strong>
								)}
								<p>{cutscene.text}</p>
								<Button
									type="button"
									onClick={() => {
										const cinematic = establish(project);
										if (cinematic) change({ cinematic });
									}}
								>
									Create 3D sequence
								</Button>
							</div>
						) : (
							<p>Create a sequence to start filming.</p>
						)}
					</div>
					<aside
						className="cinema-inspector cinema-side-block"
						aria-label="Cinematic inspector"
					>
						{settings}
						{cutscene && <StaticFields cutscene={cutscene} onChange={change} />}
					</aside>
				</div>
			)}
		</section>
	);
}
