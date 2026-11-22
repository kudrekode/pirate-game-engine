import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { migrateProject } from "./data/migrateProject";
import {
	createProjectRecord,
	type ProjectRecord,
	projectGameSaveStorage,
	readProjectCatalog,
	SELECTED_PROJECT_KEY,
	unclaimedLegacySave,
	updateProjectRecord,
	writeProjectRecord,
} from "./data/projectCatalog";
import { importProjectJson, readProjectJson } from "./data/projectImport";
import { createProjectFromPreset } from "./data/projectPresets";
import { AssetCreatorWorkspace } from "./editor/assets/AssetCreatorWorkspace";
import {
	EditorNavigationContext,
	openEntity,
} from "./editor/project/navigation";
import {
	NewProjectDialog,
	ProjectDialog,
	ProjectTools,
} from "./editor/project/ProjectDialog";
import { ProjectHome, ProjectsScreen } from "./editor/project/ProjectScreens";
import {
	type EditorSectionId,
	editorSections,
	primaryWorkspaces,
	secondaryWorkspaces,
	type WorkspaceId,
} from "./editor/sections";
import { MapEditor } from "./editor/sections/MapEditor";
import { ThreeDPreview } from "./editor/sections/ThreeDPreview";
import type { GameSaveStorage } from "./runtime/gameSave";
import { RuntimePanel } from "./runtime/RuntimePanel";
import { useProjectStore } from "./store/useProjectStore";
import type { GameProject } from "./types/game";

type Route = "projects" | "home" | WorkspaceId;
type Dialog =
	| { kind: "new" }
	| { kind: "tools" }
	| { kind: "recover"; record: ProjectRecord }
	| { kind: "leave"; next: () => void };

const AUTOSAVE_DELAY_MS = 3000;
const EDITOR_SCROLL_SELECTOR =
	".map-tool-panel-content, .tool-panel:not(.map-tool-panel), .inspector-panel, .content-panel, .map-stage";

function mapViewPreference() {
	try {
		return localStorage.getItem("map-workspace-view-v1") === "3d" ? "3d" : "2d";
	} catch {
		return "2d";
	}
}

const browserGameSaves: GameSaveStorage = {
	getItem: (key) => localStorage.getItem(key),
	setItem: (key, value) => localStorage.setItem(key, value),
};

function recoveryName(raw: string | null) {
	try {
		return raw ? JSON.parse(raw).metadata?.name || "Untitled project" : "";
	} catch {
		return "Unreadable version";
	}
}

export default function App() {
	const project = useProjectStore((state) => state.project);
	const requestedDialogueId = useProjectStore(
		(state) => state.requestedDialogueId,
	);
	const requestedEditorSource = useProjectStore(
		(state) => state.requestedEditorSource,
	);
	const [records, setRecords] = useState<ProjectRecord[]>([]);
	const [lastProjectId, setLastProjectId] = useState<string | null>(null);
	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [route, setRoute] = useState<Route>("projects");
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [status, setStatus] = useState("");
	const [draftTimestamp, setDraftTimestamp] = useState("");
	const [editorView, setEditorView] = useState<"2d" | "3d">(mapViewPreference);
	const [runtime, setRuntime] = useState<{
		project: GameProject;
		storage: GameSaveStorage;
	} | null>(null);
	const editorShell = useRef<HTMLElement>(null);
	const importInput = useRef<HTMLInputElement>(null);
	const importRequest = useRef(0);
	const activeRecord = useRef<ProjectRecord | null>(null);
	const assetDraft = useRef(false);
	const onAssetDraftChange = useCallback((dirty: boolean) => {
		assetDraft.current = dirty;
	}, []);
	const checkpoint = useRef("");
	const scrollPositions = useRef(
		new Map<string, { left: number; top: number }[]>(),
	);
	const snapshot = useMemo(() => JSON.stringify(project), [project]);
	const active = records.find((record) => record.id === activeProjectId);
	const dirty = Boolean(active && snapshot !== active.saved);
	const section = editorSections.find((candidate) => candidate.id === route);
	const ActiveSection = section?.component;
	const workspace = primaryWorkspaces.find(
		(candidate) => candidate.id === route,
	);
	const pageLabel =
		workspace?.label ??
		section?.label ??
		(route === "home" ? "Project Home" : "Projects");
	const projectName = project.metadata.name.trim() || "Untitled project";
	const dialogError =
		(dialog?.kind === "leave" || dialog?.kind === "new") &&
		status.startsWith("Could not")
			? status
			: "";

	const rememberRecord = useCallback((record: ProjectRecord) => {
		setRecords((current) => [
			...current.filter((candidate) => candidate.id !== record.id),
			record,
		]);
	}, []);

	useEffect(() => {
		try {
			const catalog = readProjectCatalog(localStorage);
			setRecords(catalog.records);
			setLastProjectId(catalog.lastProjectId);
			setStatus(catalog.warning);
		} catch {
			setStatus("Could not read browser storage.");
		}
	}, []);

	const persist = useCallback(
		(mode: "save" | "draft") => {
			const record = activeRecord.current;
			if (!record) return false;
			const latest = useProjectStore.getState().project;
			const currentSnapshot = JSON.stringify(latest);
			if (mode === "draft" && checkpoint.current === currentSnapshot)
				return true;

			try {
				const next = updateProjectRecord(record, latest, mode);
				writeProjectRecord(localStorage, next);
				activeRecord.current = next;
				checkpoint.current = currentSnapshot;
				rememberRecord(next);
				setDraftTimestamp(
					mode === "draft"
						? new Date().toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})
						: "",
				);
				setStatus(mode === "save" ? "Project saved." : "");
				return true;
			} catch {
				setStatus(
					mode === "save"
						? "Could not save. Your changes are still in this tab. Export a copy to keep them."
						: "Could not autosave. Your changes are still in this tab. Save or export a copy.",
				);
				return false;
			}
		},
		[rememberRecord],
	);

	useEffect(() => {
		if (!activeProjectId || snapshot === checkpoint.current) return;
		const timer = window.setTimeout(() => persist("draft"), AUTOSAVE_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [activeProjectId, snapshot, persist]);

	useEffect(() => {
		if (!activeProjectId) return;
		function handleShortcut(event: KeyboardEvent) {
			if (
				!runtime &&
				(event.ctrlKey || event.metaKey) &&
				event.key.toLowerCase() === "s"
			) {
				event.preventDefault();
				persist("save");
			}
		}
		function handleUnload(event: BeforeUnloadEvent) {
			if (persist("draft") && !assetDraft.current) return;
			event.preventDefault();
			event.returnValue = true;
		}
		const checkpointOnHide = () => persist("draft");
		window.addEventListener("keydown", handleShortcut);
		window.addEventListener("beforeunload", handleUnload);
		window.addEventListener("pagehide", checkpointOnHide);
		return () => {
			window.removeEventListener("keydown", handleShortcut);
			window.removeEventListener("beforeunload", handleUnload);
			window.removeEventListener("pagehide", checkpointOnHide);
		};
	}, [activeProjectId, persist, runtime]);

	const changeRoute = useCallback((next: Route) => {
		const editor = editorShell.current;
		const previous = editor?.dataset.workspace;
		if (editor && previous && previous !== next) {
			scrollPositions.current.set(
				previous,
				Array.from(
					editor.querySelectorAll<HTMLElement>(EDITOR_SCROLL_SELECTOR),
					(element) => ({
						left: element.scrollLeft,
						top: element.scrollTop,
					}),
				),
			);
		}
		setRoute(next);
	}, []);

	const openWorkspace = useCallback(
		(id: WorkspaceId) => {
			if (activeRecord.current) changeRoute(id);
		},
		[changeRoute],
	);
	const navigation = useMemo(
		() => ({ openWorkspace, openEntity }),
		[openWorkspace],
	);

	useLayoutEffect(() => {
		const editor = editorShell.current;
		const positions = scrollPositions.current.get(route);
		if (!editor || !positions) return;
		editor
			.querySelectorAll<HTMLElement>(EDITOR_SCROLL_SELECTOR)
			.forEach((element, index) => {
				const position = positions[index];
				if (!position) return;
				element.scrollLeft = position.left;
				element.scrollTop = position.top;
			});
	}, [route]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: route changes replace the heading with the same ID
	useEffect(() => {
		// Focus the screen heading after a route change or return from Play.
		if (!runtime)
			document
				.getElementById("editor-route-heading")
				?.focus({ preventScroll: true });
	}, [activeProjectId, route, runtime]);

	useEffect(() => {
		if (requestedDialogueId) openWorkspace("dialogues");
	}, [requestedDialogueId, openWorkspace]);

	useEffect(() => {
		if (!requestedEditorSource || !activeRecord.current) return;
		const source = requestedEditorSource;
		if (source.section === "map" && source.areaId) {
			const store = useProjectStore.getState();
			if (store.project.activeAreaId !== source.areaId)
				store.setActiveArea(source.areaId);
			const area = store.project.areas.find(
				(candidate) => candidate.id === source.areaId,
			);
			const type = area?.npcs.some((entity) => entity.id === source.id)
				? "npc"
				: area?.objects.some((entity) => entity.id === source.id)
					? "object"
					: area?.eventBlocks.some((entity) => entity.id === source.id)
						? "eventBlock"
						: area?.pickups.some((entity) => entity.id === source.id)
							? "pickup"
							: area?.structures.some((entity) => entity.id === source.id)
								? "structure"
								: undefined;
			store.setEditorSelection(
				type
					? { type, id: source.id, areaId: source.areaId }
					: { type: "area", areaId: source.areaId },
			);
			setEditorView("2d");
		}
		openWorkspace(source.section as EditorSectionId);
	}, [requestedEditorSource, openWorkspace]);

	const onAssetImported = useCallback(() => {
		openWorkspace("map");
		setStatus("Character added to the Asset Browser. Drag it into your scene.");
	}, [openWorkspace]);
	const saveAssetProject = useCallback(() => persist("save"), [persist]);

	function activate(record: ProjectRecord, raw: string, message: string) {
		const selected = readProjectJson(raw);
		useProjectStore.getState().setProject(selected);
		checkpoint.current = JSON.stringify(useProjectStore.getState().project);
		scrollPositions.current.clear();
		activeRecord.current = record;
		setActiveProjectId(record.id);
		setLastProjectId(record.id);
		setRoute("home");
		setDialog(null);
		setRuntime(null);
		setEditorView(mapViewPreference());
		setDraftTimestamp("");
		setStatus(message);
		try {
			localStorage.setItem(SELECTED_PROJECT_KEY, record.id);
		} catch {
			// The project record is independent of the last-opened preference.
		}
	}

	function openRecord(record: ProjectRecord, choice?: "saved" | "draft") {
		if (!choice && record.saved && record.draft) {
			setDialog({ kind: "recover", record });
			return;
		}
		const raw =
			choice === "draft" ? record.draft : (record.saved ?? record.draft);
		if (!raw) return;
		try {
			activate(
				record,
				raw,
				raw === record.saved
					? "Loaded saved project."
					: "Loaded autosaved draft.",
			);
		} catch {
			setDialog(null);
			setStatus(
				"Could not open this project. Its stored data is still available.",
			);
		}
	}

	function leaveProject(next: () => void) {
		if (
			assetDraft.current &&
			!window.confirm(
				"Discard the unsaved Asset Creator changes and leave this project?",
			)
		)
			return;
		const latest = useProjectStore.getState().project;
		if (
			activeRecord.current &&
			JSON.stringify(latest) !== activeRecord.current.saved
		) {
			setDialog({ kind: "leave", next });
		} else {
			next();
		}
	}

	function showProjects() {
		leaveProject(() => {
			const store = useProjectStore.getState();
			store.setProject(store.project);
			activeRecord.current = null;
			setActiveProjectId(null);
			setDraftTimestamp("");
			setStatus("");
			setDialog(null);
			setRoute("projects");
		});
	}

	function addProject(
		selected: GameProject,
		message: string,
		claimLegacySave = false,
	) {
		try {
			const legacyId = claimLegacySave
				? unclaimedLegacySave(
						selected,
						readProjectCatalog(localStorage).records,
						localStorage,
					)
				: undefined;
			const record = createProjectRecord(migrateProject(selected), legacyId);
			writeProjectRecord(localStorage, record);
			rememberRecord(record);
			activate(record, record.saved, message);
		} catch (error) {
			setStatus(
				`Could not store project. ${error instanceof Error ? error.message : ""}`,
			);
		}
	}

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";
		if (!file) return;
		const request = ++importRequest.current;
		const context = useProjectStore.getState().projectContextId;
		try {
			const imported = importProjectJson(await file.text());
			if (
				request !== importRequest.current ||
				context !== useProjectStore.getState().projectContextId
			)
				return;
			leaveProject(() => addProject(imported, `Imported ${file.name}.`, true));
		} catch (error) {
			if (
				request !== importRequest.current ||
				context !== useProjectStore.getState().projectContextId
			)
				return;
			setStatus(
				`Import failed: ${error instanceof Error ? error.message : "Could not read the project file."}`,
			);
		}
	}

	function play() {
		const record = activeRecord.current;
		if (!record) return;
		const playable = JSON.parse(snapshot) as GameProject;
		setRuntime({
			project: playable,
			storage: projectGameSaveStorage(
				record,
				playable,
				browserGameSaves,
				records,
			),
		});
	}

	return (
		<EditorNavigationContext.Provider value={navigation}>
			<div className="project-shell">
				<header className="project-topbar">
					<div className="project-brand">
						<span className="project-monogram" aria-hidden="true">
							{active ? Array.from(projectName)[0].toLocaleUpperCase() : "◆"}
						</span>
						<div>
							<strong>{active ? projectName : "Adventure Game Builder"}</strong>
							<small>{pageLabel}</small>
						</div>
					</div>
					{!runtime && active ? (
						<div className="project-header-actions">
							<span className="project-save-status" role="status">
								<span
									aria-hidden="true"
									className={dirty ? "project-dot is-dirty" : "project-dot"}
								/>
								{dirty ? "Unsaved changes" : "Saved"}
							</span>
							<nav
								className="project-breadcrumbs"
								aria-label="Project navigation"
							>
								<button type="button" onClick={showProjects}>
									Projects
								</button>
								{route !== "home" && (
									<button type="button" onClick={() => changeRoute("home")}>
										Home
									</button>
								)}
							</nav>
							<button
								type="button"
								onClick={() => setDialog({ kind: "tools" })}
							>
								Project tools
							</button>
							<button
								type="button"
								onClick={() => persist("save")}
								title="Save project (Ctrl/Cmd+S)"
							>
								Save
							</button>
							<button type="button" className="project-primary" onClick={play}>
								<span aria-hidden="true">▶ </span>Play
							</button>
						</div>
					) : (
						!active && (
							<div className="project-header-actions">
								<button
									type="button"
									onClick={() => importInput.current?.click()}
								>
									Import JSON
								</button>
							</div>
						)
					)}
				</header>

				<input
					ref={importInput}
					hidden
					type="file"
					accept=".json,application/json"
					onChange={handleImport}
				/>

				{route === "projects" && (
					<ProjectsScreen
						projects={[...records].sort(
							(a, b) =>
								(b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "") ||
								a.name.localeCompare(b.name),
						)}
						lastProjectId={lastProjectId}
						onOpen={(id) => {
							const record = records.find((candidate) => candidate.id === id);
							if (record) openRecord(record);
						}}
						onNew={() => setDialog({ kind: "new" })}
					/>
				)}
				{active && route === "home" && !runtime && (
					<ProjectHome
						name={projectName}
						workspaces={primaryWorkspaces}
						onOpen={openWorkspace}
					/>
				)}
				{active && route !== "home" && route !== "projects" && !runtime && (
					<nav className="project-workspace-nav" aria-label="Editor workspaces">
						{primaryWorkspaces.map((item) => (
							<button
								type="button"
								key={item.id}
								aria-current={route === item.id ? "page" : undefined}
								onClick={() => openWorkspace(item.id)}
							>
								{item.label}
							</button>
						))}
						<div className="project-workspace-secondary">
							<label htmlFor="more-editors">More editors</label>
							<select
								id="more-editors"
								value={workspace ? "" : route}
								onChange={(event) => {
									if (event.target.value)
										openWorkspace(event.target.value as EditorSectionId);
								}}
							>
								<option value="" disabled>
									Choose an editor
								</option>
								{secondaryWorkspaces.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</div>
					</nav>
				)}

				{active && (
					<AssetCreatorWorkspace
						key={active.id}
						project={project}
						visible={route === "assets" && !runtime}
						saveProject={saveAssetProject}
						onImported={onAssetImported}
						onDraftChange={onAssetDraftChange}
					/>
				)}
				{ActiveSection && active && (route !== "cutscenes" || !runtime) && (
					<main
						className="editor-shell project-workspace-main"
						ref={editorShell}
						data-workspace={route}
						hidden={Boolean(runtime)}
						aria-labelledby="editor-route-heading"
					>
						<h1
							id="editor-route-heading"
							className="project-route-title"
							tabIndex={-1}
						>
							{pageLabel}
						</h1>
						{route === "three-d-preview" ? (
							<ThreeDPreview onOpenInMapEditor={() => openWorkspace("map")} />
						) : route === "map" ? (
							<MapEditor onViewChange={setEditorView} />
						) : (
							<ActiveSection />
						)}
					</main>
				)}
				{runtime && (
					<RuntimePanel
						initialMode={editorView}
						project={runtime.project}
						saveStorage={runtime.storage}
						onClose={() => setRuntime(null)}
					/>
				)}
				<footer className="project-shell-footer">
					<span role="status">{dialogError ? "" : status}</span>
					{draftTimestamp && <span>Draft autosaved {draftTimestamp}</span>}
				</footer>

				{dialog?.kind === "new" && (
					<NewProjectDialog
						error={dialogError}
						onClose={() => setDialog(null)}
						onCreate={(selected, name) => {
							const next = createProjectFromPreset(selected);
							next.metadata.name = name.trim() || next.metadata.name;
							addProject(next, `Created ${next.metadata.name}.`);
						}}
					/>
				)}
				{dialog?.kind === "recover" && (
					<ProjectDialog
						title="Recover a project"
						onClose={() => setDialog(null)}
					>
						<p>
							A saved project and an autosaved draft are available. Choose which
							version to open.
						</p>
						<p>Saved project: {recoveryName(dialog.record.saved)}</p>
						<p>Recovery draft: {recoveryName(dialog.record.draft)}</p>
						<div className="project-dialog-actions">
							<button type="button" onClick={() => setDialog(null)}>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => openRecord(dialog.record, "saved")}
							>
								Use saved project
							</button>
							<button
								type="button"
								className="project-primary"
								onClick={() => openRecord(dialog.record, "draft")}
							>
								Recover draft
							</button>
						</div>
					</ProjectDialog>
				)}
				{dialog?.kind === "leave" && (
					<ProjectDialog
						title="Unsaved changes"
						onClose={() => setDialog(null)}
					>
						<p>
							Save your changes or keep an autosaved draft before switching
							projects.
						</p>
						{dialogError && <p role="alert">{dialogError}</p>}
						<div className="project-dialog-actions">
							<button type="button" onClick={() => setDialog(null)}>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => {
									if (persist("draft")) dialog.next();
								}}
							>
								Keep draft and continue
							</button>
							<button
								type="button"
								className="project-primary"
								onClick={() => {
									if (persist("save")) dialog.next();
								}}
							>
								Save and continue
							</button>
						</div>
					</ProjectDialog>
				)}
				{dialog?.kind === "tools" && active && (
					<ProjectTools
						project={project}
						canLoad={Boolean(active.saved)}
						onClose={() => setDialog(null)}
						onImport={() => {
							// Remove the modal's inert state before opening the native picker.
							flushSync(() => setDialog(null));
							importInput.current?.click();
						}}
						onLoad={() => {
							if (
								!dirty ||
								window.confirm("Load the last saved version of this project?")
							)
								openRecord(active, "saved");
						}}
						onReset={() => {
							if (
								!window.confirm(
									"Replace this project's editor contents with the Demo Project?",
								)
							)
								return;
							useProjectStore
								.getState()
								.setProject(createProjectFromPreset("demo"));
							setDialog(null);
							setStatus(
								"Reset to Demo Project. Save to replace the previous version.",
							);
						}}
					/>
				)}
			</div>
		</EditorNavigationContext.Provider>
	);
}
