import { useEffect, useMemo, useState } from "react";
import { backgroundPresets, portraitPresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";

export function CutsceneEditor() {
	const cutscenes = useProjectStore((state) => state.project.cutscenes);
	const addCutscene = useProjectStore((state) => state.addCutscene);
	const updateCutscene = useProjectStore((state) => state.updateCutscene);
	const deleteCutscene = useProjectStore((state) => state.deleteCutscene);

	const [selectedCutsceneId, setSelectedCutsceneId] = useState(
		cutscenes[0]?.id ?? "",
	);

	const selectedCutscene = useMemo(
		() => cutscenes.find((cutscene) => cutscene.id === selectedCutsceneId),
		[cutscenes, selectedCutsceneId],
	);

	useEffect(() => {
		if (!selectedCutscene && cutscenes.length > 0) {
			setSelectedCutsceneId(cutscenes[0].id);
		}
	}, [cutscenes, selectedCutscene]);

	function handleAddCutscene() {
		const id = addCutscene();
		setSelectedCutsceneId(id);
	}

	function handleDeleteCutscene() {
		if (!selectedCutscene) {
			return;
		}

		deleteCutscene(selectedCutscene.id);
		setSelectedCutsceneId(
			cutscenes.find((cutscene) => cutscene.id !== selectedCutscene.id)?.id ??
				"",
		);
	}

	return (
		<section className="editor-panel cutscene-editor">
			<aside className="tool-panel">
				<div className="panel-title">Cutscenes</div>
				<div className="list-stack">
					{cutscenes.map((cutscene) => (
						<button
							className={`list-item ${selectedCutsceneId === cutscene.id ? "selected" : ""}`}
							key={cutscene.id}
							onClick={() => setSelectedCutsceneId(cutscene.id)}
							type="button"
						>
							{cutscene.name}
						</button>
					))}
				</div>
				<button
					className="primary-button full-width"
					onClick={handleAddCutscene}
					type="button"
				>
					Add cutscene
				</button>
			</aside>

			<div className="content-panel">
				{selectedCutscene ? (
					<div className="cutscene-edit-layout">
						<div className="form-stack">
							<label>
								Name
								<input
									onChange={(event) =>
										updateCutscene(selectedCutscene.id, {
											name: event.target.value,
										})
									}
									value={selectedCutscene.name}
								/>
							</label>
							<label>
								Background image
								<select
									onChange={(event) =>
										updateCutscene(selectedCutscene.id, {
											backgroundImageId: event.target.value,
										})
									}
									value={selectedCutscene.backgroundImageId}
								>
									{backgroundPresets.map((background) => (
										<option key={background.id} value={background.id}>
											{background.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Portrait image
								<select
									onChange={(event) =>
										updateCutscene(selectedCutscene.id, {
											portraitImageId: event.target.value || undefined,
										})
									}
									value={selectedCutscene.portraitImageId ?? ""}
								>
									<option value="">None</option>
									{portraitPresets.map((portrait) => (
										<option key={portrait.id} value={portrait.id}>
											{portrait.label}
										</option>
									))}
								</select>
							</label>
							<label>
								Speaker name
								<input
									onChange={(event) =>
										updateCutscene(selectedCutscene.id, {
											speakerName: event.target.value,
										})
									}
									value={selectedCutscene.speakerName ?? ""}
								/>
							</label>
							<label>
								Text
								<textarea
									onChange={(event) =>
										updateCutscene(selectedCutscene.id, {
											text: event.target.value,
										})
									}
									rows={7}
									value={selectedCutscene.text}
								/>
							</label>
							<button
								className="danger-button"
								onClick={handleDeleteCutscene}
								type="button"
							>
								Delete cutscene
							</button>
						</div>

						<div className="cutscene-preview">
							<div
								className="preview-background"
								style={{
									background: backgroundPresets.find(
										(background) =>
											background.id === selectedCutscene.backgroundImageId,
									)?.color,
								}}
							>
								{selectedCutscene.portraitImageId ? (
									<span
										className="preview-portrait"
										style={{
											background: portraitPresets.find(
												(portrait) =>
													portrait.id === selectedCutscene.portraitImageId,
											)?.color,
										}}
									/>
								) : null}
								<div className="preview-dialogue">
									<strong>{selectedCutscene.speakerName || "Narrator"}</strong>
									<span>{selectedCutscene.text}</span>
								</div>
							</div>
						</div>
					</div>
				) : (
					<p className="empty-state">Add a cutscene to edit it.</p>
				)}
			</div>
		</section>
	);
}
