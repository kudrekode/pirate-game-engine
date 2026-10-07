import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { migrateProject } from "./data/migrateProject";
import {
	createProjectFromPreset,
	type ProjectPresetId,
	projectPresets,
} from "./data/projectPresets";
import { validateProject } from "./data/validateProject";
import { AssetCreatorLauncher } from "./editor/AssetCreatorLauncher";
import { type EditorSectionId, editorSections } from "./editor/sections";
import { MapEditor } from "./editor/sections/MapEditor";
import { ThreeDPreview } from "./editor/sections/ThreeDPreview";
import { RuntimePanel } from "./runtime/RuntimePanel";
import {
	AUTOSAVE_DRAFT_STORAGE_KEY,
	STORAGE_KEY,
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

function readRecoveryProject(raw: string | null): GameProject | null {
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object" || Array.isArray(value))
			return null;
		// Read both current areas and the historical single-map shape.
		if (!("areas" in value) && !("map" in value)) return null;
		return migrateProject(value);
	} catch {
		return null;
	}
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

	const [isStartupReady, setIsStartupReady] = useState(false);
	const [autosaveEnabled, setAutosaveEnabled] = useState(false);
	const [recoveryChoice, setRecoveryChoice] = useState<{
		saved: GameProject;
		draft: GameProject;
	} | null>(null);
	const [isPresetChooserOpen, setIsPresetChooserOpen] = useState(false);
	const [isInitialPresetChoice, setIsInitialPresetChoice] = useState(false);
	const [activeSectionId, setActiveSectionId] =
		useState<EditorSectionId>("map");
	const [runtimeProject, setRuntimeProject] = useState<GameProject | null>(
		null,
	);
	const [editorView, setEditorView] = useState<"2d" | "3d">("2d");
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

	function loadRecoveredProject(
		selected: GameProject,
		saved: GameProject | null,
	) {
		setProject(selected);
		savedProjectSnapshotRef.current = saved ? JSON.stringify(saved) : "";
		// Loading is not an edit. In particular, do not replace an unchosen draft.
		autosavedProjectSnapshotRef.current = JSON.stringify(selected);
		setRecoveryChoice(null);
		setAutosaveEnabled(true);
		setStatusMessage(
			selected === saved ? "Loaded saved project." : "Loaded autosaved draft.",
		);
	}

	const handleSave = useCallback(() => {
		if (!autosaveEnabled) return;
		try {
			saveToLocalStorage();
			savedProjectSnapshotRef.current = JSON.stringify(project);
			setStatusMessage("Saved to localStorage.");
		} catch {
			setStatusMessage(
				"Could not save. Your changes are still in this tab; export a copy.",
			);
		}
	}, [autosaveEnabled, project, saveToLocalStorage]);

	useEffect(() => {
		try {
			const saved = readRecoveryProject(localStorage.getItem(STORAGE_KEY));
			const draft = readRecoveryProject(
				localStorage.getItem(AUTOSAVE_DRAFT_STORAGE_KEY),
			);
			if (saved && draft && JSON.stringify(saved) !== JSON.stringify(draft)) {
				setRecoveryChoice({ saved, draft });
			} else if (saved || draft) {
				const selected = saved ?? draft;
				if (!selected) return;
				setProject(selected);
				savedProjectSnapshotRef.current = saved ? JSON.stringify(saved) : "";
				autosavedProjectSnapshotRef.current = JSON.stringify(selected);
				setAutosaveEnabled(true);
				setStatusMessage(
					saved ? "Loaded saved project." : "Loaded autosaved draft.",
				);
			} else {
				setIsInitialPresetChoice(true);
				setIsPresetChooserOpen(true);
			}
		} catch {
			setStatusMessage(
				"Could not read browser storage. Export your work to keep a copy.",
			);
			setIsInitialPresetChoice(true);
			setIsPresetChooserOpen(true);
		} finally {
			setIsStartupReady(true);
		}
	}, [setProject]);

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
		if (!isStartupReady || !autosaveEnabled) return;
		const snapshot = JSON.stringify(project);
		if (snapshot === autosavedProjectSnapshotRef.current) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			try {
				localStorage.setItem(AUTOSAVE_DRAFT_STORAGE_KEY, snapshot);
				autosavedProjectSnapshotRef.current = snapshot;
				setAutosaveTimestamp(
					new Date().toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
				);
				setStatusMessage((message) =>
					message.startsWith("Could not autosave")
						? "Draft recovery is available."
						: message,
				);
			} catch {
				setAutosaveTimestamp("");
				setStatusMessage(
					"Could not autosave. Your changes are still in this tab; save or export a copy.",
				);
			}
		}, AUTOSAVE_DELAY_MS);
		return () => window.clearTimeout(timeoutId);
	}, [project, isStartupReady, autosaveEnabled]);

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
			if (!loaded) {
				setStatusMessage("No saved project found.");
				return;
			}
			autosavedProjectSnapshotRef.current = JSON.stringify(
				useProjectStore.getState().project,
			);
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

	function handlePresetSelection(presetId: ProjectPresetId) {
		const preset =
			projectPresets.find((candidate) => candidate.id === presetId) ??
			projectPresets[0];
		if (
			isStartupReady &&
			hasUnsavedChanges &&
			!window.confirm(
				`Start a new ${preset.label}? Unsaved changes will be lost.`,
			)
		) {
			return;
		}

		setProject(createProjectFromPreset(preset.id));
		setAutosaveEnabled(true);
		savedProjectSnapshotRef.current = "";
		setRuntimeProject(null);
		setIsInitialPresetChoice(false);
		setIsPresetChooserOpen(false);
		setStatusMessage(`Created ${preset.label}.`);
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

	if (!isStartupReady) {
		return null;
	}

	if (recoveryChoice) {
		return (
			<div className="preset-chooser-backdrop">
				<section
					className="preset-chooser"
					role="dialog"
					aria-modal="true"
					aria-label="Recover a project"
				>
					<strong>A saved project and a different draft are available.</strong>
					<p>
						Choose which to open. Neither copy is changed until you edit or
						save.
					</p>
					<p>Saved project: {recoveryChoice.saved.metadata.name}</p>
					<p>Recovery draft: {recoveryChoice.draft.metadata.name}</p>
					<button
						type="button"
						onClick={() =>
							loadRecoveredProject(recoveryChoice.draft, recoveryChoice.saved)
						}
					>
						Recover draft
					</button>
					<button
						type="button"
						onClick={() =>
							loadRecoveredProject(recoveryChoice.saved, recoveryChoice.saved)
						}
					>
						Use saved project
					</button>
				</section>
			</div>
		);
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
							disabled={Boolean(runtimeProject)}
							onChange={(event) => updateMetadata({ name: event.target.value })}
							value={project.metadata.name}
						/>
					</label>
				</div>

				<div className="status-line" role="status" title={statusMessage}>
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

				<fieldset className="top-actions" disabled={Boolean(runtimeProject)}>
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
						onClick={() => {
							setIsInitialPresetChoice(false);
							setIsPresetChooserOpen(true);
						}}
						type="button"
					>
						New Project
					</button>
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
					<AssetCreatorLauncher
						onImported={() => {
							setActiveSectionId("map");
							setStatusMessage(
								"Character added to the Asset Browser. Drag it into your scene.",
							);
						}}
					/>
					<button onClick={() => downloadJson(project)} type="button">
						Export JSON
					</button>
					<button onClick={() => importInputRef.current?.click()} type="button">
						Import JSON
					</button>
					<button
						onClick={() => {
							setProject(createProjectFromPreset("demo"));
							savedProjectSnapshotRef.current = JSON.stringify(
								useProjectStore.getState().project,
							);
							setRuntimeProject(null);
							setStatusMessage("Reset to Demo Project.");
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
				</fieldset>
			</header>

			{runtimeProject && (
				<RuntimePanel
					initialMode={editorView}
					project={runtimeProject}
					onClose={() => setRuntimeProject(null)}
				/>
			)}
			<main
				className="editor-shell"
				ref={editorShellRef}
				hidden={Boolean(runtimeProject)}
			>
				{activeSectionId === "three-d-preview" ? (
					<ThreeDPreview onOpenInMapEditor={() => setActiveSectionId("map")} />
				) : activeSectionId === "map" ? (
					<MapEditor onViewChange={setEditorView} />
				) : (
					<ActiveSectionComponent />
				)}
			</main>
			<nav
				className="bottom-tabs"
				aria-label="Editor sections"
				hidden={Boolean(runtimeProject)}
			>
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
			{isPresetChooserOpen ? (
				<div className="preset-chooser-backdrop">
					<section
						aria-label="Choose a starter project"
						className="preset-chooser"
					>
						<div className="preset-chooser-heading">
							<div>
								<strong>Choose a starter project</strong>
								<p>Start clean or explore the feature demo.</p>
							</div>
							{!isInitialPresetChoice ? (
								<button
									aria-label="Close preset chooser"
									onClick={() => setIsPresetChooserOpen(false)}
									type="button"
								>
									Close
								</button>
							) : null}
						</div>
						<div className="preset-options">
							{projectPresets.map((preset) => (
								<button
									className="preset-option"
									key={preset.id}
									onClick={() => handlePresetSelection(preset.id)}
									type="button"
								>
									<strong>{preset.label}</strong>
									<span>
										{preset.id === "blank"
											? "One clean area with only the required player spawn."
											: "Feature-rich demo content with a clean active map area."}
									</span>
								</button>
							))}
						</div>
					</section>
				</div>
			) : null}
		</div>
	);
}
