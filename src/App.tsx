import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { validateProject } from "./data/validateProject";
import { type EditorSectionId, editorSections } from "./editor/sections";
import { RuntimePanel } from "./runtime/RuntimePanel";
import {
	AUTOSAVE_DRAFT_STORAGE_KEY,
	useProjectStore,
} from "./store/useProjectStore";
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

type ScrollPosition = {
	scrollLeft: number;
	scrollTop: number;
};

const EDITOR_SCROLL_SELECTOR =
	".map-tool-panel-content, .tool-panel:not(.map-tool-panel), .inspector-panel, .content-panel, .map-stage";
const AUTOSAVE_DELAY_MS = 3000;

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
	const [isValidationOpen, setIsValidationOpen] = useState(false);
	const [autosaveTimestamp, setAutosaveTimestamp] = useState("");
	const editorShellRef = useRef<HTMLElement>(null);
	const importInputRef = useRef<HTMLInputElement>(null);
	const savedProjectSnapshotRef = useRef(JSON.stringify(project));
	const autosavedProjectSnapshotRef = useRef(JSON.stringify(project));
	const tabScrollPositionsRef = useRef(
		new Map<EditorSectionId, ScrollPosition[]>(),
	);
	const hasUnsavedChanges =
		JSON.stringify(project) !== savedProjectSnapshotRef.current;

	const activeSection = useMemo(
		() =>
			editorSections.find((section) => section.id === activeSectionId) ??
			editorSections[0],
		[activeSectionId],
	);
	const ActiveSectionComponent = activeSection.component;
	const validationIssues = useMemo(() => validateProject(project), [project]);
	const validationErrorCount = validationIssues.filter(
		(issue) => issue.severity === "error",
	).length;
	const validationLabel =
		validationIssues.length === 0
			? "0 issues"
			: validationErrorCount > 0
				? `${validationIssues.length} issues`
				: `${validationIssues.length} warning${validationIssues.length === 1 ? "" : "s"}`;

	const handleSave = useCallback(() => {
		saveToLocalStorage();
		savedProjectSnapshotRef.current = JSON.stringify(project);
		setStatusMessage("Saved to localStorage.");
	}, [project, saveToLocalStorage]);

	useEffect(() => {
		function handleSaveShortcut(event: KeyboardEvent) {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				handleSave();
			}
		}

		window.addEventListener("keydown", handleSaveShortcut);
		return () => window.removeEventListener("keydown", handleSaveShortcut);
	}, [handleSave]);

	useEffect(() => {
		const snapshot = JSON.stringify(project);
		if (snapshot === autosavedProjectSnapshotRef.current) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			localStorage.setItem(AUTOSAVE_DRAFT_STORAGE_KEY, snapshot);
			autosavedProjectSnapshotRef.current = snapshot;
			setAutosaveTimestamp(
				new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
			);
		}, AUTOSAVE_DELAY_MS);

		return () => window.clearTimeout(timeoutId);
	}, [project]);

	useLayoutEffect(() => {
		const positions = tabScrollPositionsRef.current.get(activeSectionId);
		if (!positions || !editorShellRef.current) {
			return;
		}

		const elements = Array.from(
			editorShellRef.current.querySelectorAll<HTMLElement>(
				EDITOR_SCROLL_SELECTOR,
			),
		);
		elements.forEach((element, index) => {
			const position = positions[index];
			if (position) {
				element.scrollLeft = position.scrollLeft;
				element.scrollTop = position.scrollTop;
			}
		});
	}, [activeSectionId]);

	function handleSectionChange(nextSectionId: EditorSectionId) {
		if (editorShellRef.current) {
			const positions = Array.from(
				editorShellRef.current.querySelectorAll<HTMLElement>(
					EDITOR_SCROLL_SELECTOR,
				),
			).map((element) => ({
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop,
			}));
			tabScrollPositionsRef.current.set(activeSectionId, positions);
		}
		setActiveSectionId(nextSectionId);
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
					{autosaveTimestamp ? (
						<span className="autosave-time">
							Draft autosaved {autosaveTimestamp}
						</span>
					) : null}
				</div>

				<div className="top-actions">
					<div className="validation-control">
						<button
							aria-controls="validation-panel"
							aria-expanded={isValidationOpen}
							className={`validation-indicator ${
								validationErrorCount > 0
									? "error"
									: validationIssues.length > 0
										? "warning"
										: ""
							}`}
							onClick={() => setIsValidationOpen((open) => !open)}
							type="button"
						>
							{validationLabel}
						</button>
						{isValidationOpen ? (
							<section
								aria-label="Project validation issues"
								className="validation-panel"
								id="validation-panel"
							>
								<div className="validation-panel-header">
									<strong>Validation</strong>
									<span>{validationLabel}</span>
								</div>
								{validationIssues.length === 0 ? (
									<p>No validation issues.</p>
								) : (
									<div className="validation-issue-list">
										{validationIssues.map((issue) => (
											<div
												className={`validation-issue ${issue.severity}`}
												key={issue.id}
											>
												<div className="validation-issue-heading">
													<strong>{issue.severity}</strong>
													{issue.entityType ? (
														<span>{issue.entityType}</span>
													) : null}
												</div>
												<p>{issue.message}</p>
											</div>
										))}
									</div>
								)}
							</section>
						) : null}
					</div>
					<button
						className="primary-button"
						onClick={handleSave}
						title="Save project (Ctrl/Cmd+S)"
						type="button"
					>
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
					<main className="editor-shell" ref={editorShellRef}>
						<ActiveSectionComponent />
					</main>
					<nav className="bottom-tabs" aria-label="Editor sections">
						{editorSections.map((section) => (
							<button
								className={activeSectionId === section.id ? "active" : ""}
								key={section.id}
								onClick={() => handleSectionChange(section.id)}
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
