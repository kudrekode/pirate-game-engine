import { useMemo, useRef, useState } from "react";
import { type EditorSectionId, editorSections } from "./editor/sections";
import { RuntimePanel } from "./runtime/RuntimePanel";
import { useProjectStore } from "./store/useProjectStore";
import type { GameProject } from "./types/game";

function cloneProject(project: GameProject): GameProject {
	return JSON.parse(JSON.stringify(project)) as GameProject;
}

function downloadJson(project: GameProject) {
	const fileName = `${project.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "game-project"}.json`;
	const blob = new Blob([JSON.stringify(project, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export default function App() {
	const project = useProjectStore((state) => state.project);
	const updateMetadata = useProjectStore((state) => state.updateMetadata);
	const saveToLocalStorage = useProjectStore(
		(state) => state.saveToLocalStorage,
	);
	const loadFromLocalStorage = useProjectStore(
		(state) => state.loadFromLocalStorage,
	);
	const setProject = useProjectStore((state) => state.setProject);
	const resetProject = useProjectStore((state) => state.resetProject);

	const [activeSectionId, setActiveSectionId] =
		useState<EditorSectionId>("map");
	const [runtimeProject, setRuntimeProject] = useState<GameProject | null>(
		null,
	);
	const [statusMessage, setStatusMessage] = useState(
		"Unsaved changes stay in this browser tab.",
	);
	const importInputRef = useRef<HTMLInputElement>(null);
	const savedProjectSnapshotRef = useRef(JSON.stringify(project));
	const hasUnsavedChanges =
		JSON.stringify(project) !== savedProjectSnapshotRef.current;

	const activeSection = useMemo(
		() =>
			editorSections.find((section) => section.id === activeSectionId) ??
			editorSections[0],
		[activeSectionId],
	);
	const ActiveSectionComponent = activeSection.component;

	function handleSave() {
		saveToLocalStorage();
		savedProjectSnapshotRef.current = JSON.stringify(project);
		setStatusMessage("Saved to localStorage.");
	}

	function handleLoad() {
		try {
			const loaded = loadFromLocalStorage();
			savedProjectSnapshotRef.current = JSON.stringify(
				useProjectStore.getState().project,
			);
			setRuntimeProject(null);
			setStatusMessage(
				loaded ? "Loaded from localStorage." : "No saved project found.",
			);
		} catch (error) {
			setStatusMessage(
				error instanceof Error
					? error.message
					: "Could not load saved project.",
			);
		}
	}

	function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		file
			.text()
			.then((raw) => {
				const importedProject = JSON.parse(raw) as GameProject;
				setProject(importedProject);
				savedProjectSnapshotRef.current = JSON.stringify(
					useProjectStore.getState().project,
				);
				setRuntimeProject(null);
				setStatusMessage(`Imported ${file.name}.`);
			})
			.catch((error) => {
				setStatusMessage(
					error instanceof Error ? error.message : "Could not import project.",
				);
			})
			.finally(() => {
				event.target.value = "";
			});
	}

	return (
		<div className="app-shell">
			<header className="top-bar">
				<div className="project-heading">
					<span className="app-logo">V1</span>
					<label>
						<span>Project</span>
						<input
							className="project-name-input"
							onChange={(event) => updateMetadata({ name: event.target.value })}
							value={project.metadata.name}
						/>
					</label>
				</div>

				<div className="status-line">
					<span
						className={`save-state ${hasUnsavedChanges ? "unsaved" : "saved"}`}
					>
						{hasUnsavedChanges ? "Unsaved changes" : "Saved"}
					</span>
					<span>{statusMessage}</span>
				</div>

				<div className="top-actions">
					<button onClick={handleSave} type="button">
						Save
					</button>
					<button onClick={handleLoad} type="button">
						Load
					</button>
					<button onClick={() => downloadJson(project)} type="button">
						Export JSON
					</button>
					<button onClick={() => importInputRef.current?.click()} type="button">
						Import JSON
					</button>
					<button
						onClick={() => {
							resetProject();
							savedProjectSnapshotRef.current = JSON.stringify(
								useProjectStore.getState().project,
							);
							setRuntimeProject(null);
							setStatusMessage("Reset to demo project.");
						}}
						type="button"
					>
						Reset
					</button>
					<button
						className="play-button"
						onClick={() => setRuntimeProject(cloneProject(project))}
						type="button"
					>
						Play
					</button>
					<input
						accept="application/json"
						hidden
						onChange={handleImport}
						ref={importInputRef}
						type="file"
					/>
				</div>
			</header>

			{runtimeProject ? (
				<RuntimePanel
					project={runtimeProject}
					onClose={() => setRuntimeProject(null)}
				/>
			) : (
				<>
					<main className="editor-shell">
						<ActiveSectionComponent />
					</main>
					<nav className="bottom-tabs" aria-label="Editor sections">
						{editorSections.map((section) => (
							<button
								className={activeSectionId === section.id ? "active" : ""}
								key={section.id}
								onClick={() => setActiveSectionId(section.id)}
								title={section.description}
								type="button"
							>
								{section.label}
							</button>
						))}
					</nav>
				</>
			)}
		</div>
	);
}
