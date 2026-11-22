import { type ReactNode, useId, useState } from "react";
import type { EditorSelection, GameArea, GameProject } from "../../types/game";
import { AssetBrowser } from "./AssetBrowser";
import { type SceneAsset, sceneEntries } from "./sceneEditing";
import "./mapWorkspace.css";

export type MapAuthoringMode = "select" | "foliage" | "terrain" | "water";
export type MapTerrainTool =
	| "raise"
	| "lower"
	| "smooth"
	| "roughen"
	| "flatten"
	| "paint";
export type MapWorldSetting = "area" | "sky" | "physics" | "spawn" | "hud";

const modes = [
	{ id: "select", label: "Select", key: "1", icon: "◇" },
	{ id: "foliage", label: "Foliage Scatter", key: "2", icon: "♠" },
	{ id: "terrain", label: "Terrain Sculpt", key: "3", icon: "↟" },
	{ id: "water", label: "Water", key: "4", icon: "≈" },
] as const;

const terrainTools: { id: MapTerrainTool; label: string; icon: string }[] = [
	{ id: "raise", label: "Raise terrain", icon: "↥" },
	{ id: "lower", label: "Lower terrain", icon: "↧" },
	{ id: "smooth", label: "Smooth terrain", icon: "∿" },
	{ id: "roughen", label: "Roughen terrain", icon: "≋" },
	{ id: "flatten", label: "Flatten terrain", icon: "−" },
	{ id: "paint", label: "Paint terrain", icon: "▧" },
];

const worldSettings: { id: MapWorldSetting; label: string; icon: string }[] = [
	{ id: "area", label: "Area & layers", icon: "▱" },
	{ id: "sky", label: "Sky, fog & lighting", icon: "☼" },
	{ id: "physics", label: "Physics & gravity", icon: "↓" },
	{ id: "spawn", label: "Player & spawn", icon: "◎" },
	{ id: "hud", label: "HUD settings", icon: "▤" },
];

const drawerPreferencesKey = "map-workspace-drawers-v1";
const openDrawers = { assets: true, tools: true, world: true };
type DrawerName = keyof typeof openDrawers;

function readDrawers(): typeof openDrawers {
	try {
		const saved = JSON.parse(
			localStorage.getItem(drawerPreferencesKey) ?? "null",
		);
		return {
			assets:
				typeof saved?.assets === "boolean" ? saved.assets : openDrawers.assets,
			tools:
				typeof saved?.tools === "boolean" ? saved.tools : openDrawers.tools,
			world:
				typeof saved?.world === "boolean" ? saved.world : openDrawers.world,
		};
	} catch {
		return openDrawers;
	}
}

function MapDrawer({
	title,
	icon,
	open,
	onToggle,
	children,
}: {
	title: string;
	icon: string;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section className="map-workspace-drawer">
			<h3>
				<button
					type="button"
					className="map-drawer-toggle"
					aria-expanded={open}
					aria-controls={id}
					onClick={onToggle}
				>
					<span aria-hidden="true">{icon}</span>
					{title}
					<span className="map-drawer-chevron" aria-hidden="true">
						⌄
					</span>
				</button>
			</h3>
			<div id={id} className="map-drawer-body" hidden={!open}>
				{children}
			</div>
		</section>
	);
}

type SceneAppearance = { hidden?: boolean; locked?: boolean; group?: string };
type SceneHierarchyProps = {
	project: GameProject;
	area: GameArea;
	selection: EditorSelection;
	onSelect: (selection: EditorSelection) => void;
	onFocus?: (selection: EditorSelection) => void;
	onToggleVisibility?: (selection: EditorSelection) => void;
	onToggleLock?: (selection: EditorSelection) => void;
	getSceneAppearance?: (
		selection: EditorSelection,
	) => SceneAppearance | undefined;
};

function MapSceneHierarchy({
	project,
	area,
	selection,
	onSelect,
	onFocus,
	onToggleVisibility,
	onToggleLock,
	getSceneAppearance,
}: SceneHierarchyProps) {
	const [query, setQuery] = useState("");
	const search = query.trim().toLowerCase();
	const entries = sceneEntries(project, area);
	const groups = new Map<string, ReactNode[]>();
	for (const entry of entries) {
		const next = { type: entry.type, id: entry.id, areaId: area.id };
		const appearance = getSceneAppearance?.(next);
		const group = appearance?.group || "";
		const type =
			entry.type === "npc"
				? "Character"
				: entry.type === "eventBlock"
					? "Event"
					: entry.type;
		if (
			!`${entry.name} ${entry.id} ${type} ${group}`
				.toLowerCase()
				.includes(search)
		)
			continue;
		const selected =
			selection?.type === entry.type &&
			"id" in selection &&
			selection.id === entry.id &&
			selection.areaId === area.id;
		const rows = groups.get(group) ?? [];
		rows.push(
			<div className="map-scene-row" key={`${entry.type}:${entry.id}`}>
				<button
					type="button"
					role="option"
					className="map-scene-option"
					aria-label={`${entry.name} ${type}`}
					aria-selected={selected}
					title={`${entry.name} (${type})`}
					onClick={() => onSelect(next)}
				>
					<span aria-hidden="true">{entry.icon}</span>
					<span>{entry.name}</span>
				</button>
				{onFocus && (
					<MapSceneAction
						label={`Focus ${entry.name}`}
						icon="◎"
						onClick={() => onFocus(next)}
					/>
				)}
				{onToggleVisibility && (
					<MapSceneAction
						label={`${appearance?.hidden ? "Show" : "Hide"} ${entry.name}`}
						icon={appearance?.hidden ? "◌" : "◉"}
						onClick={() => onToggleVisibility(next)}
					/>
				)}
				{onToggleLock && (
					<MapSceneAction
						label={`${appearance?.locked ? "Unlock" : "Lock"} ${entry.name}`}
						icon={appearance?.locked ? "▣" : "□"}
						onClick={() => onToggleLock(next)}
					/>
				)}
			</div>,
		);
		groups.set(group, rows);
	}

	return (
		<section className="map-scene-hierarchy" aria-label="Scene hierarchy">
			<h4>Scene Hierarchy</h4>
			<input
				aria-label="Search scene"
				placeholder="Find in scene"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
			/>
			{groups.size > 0 ? (
				<div
					className="map-scene-tree"
					role="listbox"
					aria-label="Scene entities"
				>
					{Array.from(groups, ([group, rows]) => (
						<fieldset key={group}>
							<legend className={group ? "map-scene-group" : "sr-only"}>
								{group || "Scene root"}
							</legend>
							{rows}
						</fieldset>
					))}
				</div>
			) : (
				<p>
					{entries.length
						? "No matching scene entities."
						: "Drag an asset into the scene to get started."}
				</p>
			)}
		</section>
	);
}

function MapSceneAction({
	label,
	icon,
	onClick,
}: {
	label: string;
	icon: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="map-scene-action"
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			{icon}
		</button>
	);
}

type MapWorkspaceSidebarProps = SceneHierarchyProps & {
	selectedAsset?: SceneAsset;
	onAssetSelect: (asset: SceneAsset) => void;
	onAssetAdd?: (asset: SceneAsset) => void;
	onAssetDrag?: (asset: SceneAsset | undefined) => void;
	mode: MapAuthoringMode;
	terrainTool: MapTerrainTool;
	onModeChange: (mode: MapAuthoringMode) => void;
	onTerrainToolChange: (tool: MapTerrainTool) => void;
	worldSetting?: MapWorldSetting;
	onWorldSettingChange: (setting: MapWorldSetting) => void;
	onAreaChange: (areaId: string) => void;
};

export function MapWorkspaceSidebar({
	selectedAsset,
	onAssetSelect,
	onAssetAdd = onAssetSelect,
	onAssetDrag,
	mode,
	terrainTool,
	onModeChange,
	onTerrainToolChange,
	worldSetting,
	onWorldSettingChange,
	onAreaChange,
	...hierarchy
}: MapWorkspaceSidebarProps) {
	const [drawers, setDrawers] = useState(readDrawers);
	const { project, area } = hierarchy;
	function toggleDrawer(name: DrawerName) {
		const next = { ...drawers, [name]: !drawers[name] };
		setDrawers(next);
		try {
			localStorage.setItem(drawerPreferencesKey, JSON.stringify(next));
		} catch {
			// The drawer stays usable when editor preference storage is unavailable.
		}
	}

	return (
		<aside className="map-workspace-sidebar" aria-label="World tools">
			<header className="map-workspace-sidehead">
				<h2>World Tools</h2>
				<p>{area.name}</p>
			</header>
			<MapDrawer
				title="Asset Drawer"
				icon="▧"
				open={drawers.assets}
				onToggle={() => toggleDrawer("assets")}
			>
				<AssetBrowser
					project={project}
					selectedAsset={selectedAsset}
					onAdd={onAssetAdd}
					onSelect={onAssetSelect}
					onDragAsset={onAssetDrag}
				/>
				<p className="map-drawer-hint">
					Drag onto the world, or choose an asset and click the ground.
				</p>
			</MapDrawer>
			<MapDrawer
				title="Tools Drawer"
				icon="◇"
				open={drawers.tools}
				onToggle={() => toggleDrawer("tools")}
			>
				<div className="map-drawer-choices map-drawer-mode-choices">
					<button
						type="button"
						aria-pressed={mode === "foliage"}
						onClick={() => onModeChange("foliage")}
					>
						<span aria-hidden="true">♠</span>Scatter foliage
					</button>
					<button
						type="button"
						aria-pressed={mode === "water"}
						onClick={() => onModeChange("water")}
					>
						<span aria-hidden="true">≈</span>Edit water
					</button>
				</div>
				<div className="map-drawer-choices map-terrain-tool-grid">
					{terrainTools.map((tool) => (
						<button
							type="button"
							key={tool.id}
							aria-pressed={mode === "terrain" && terrainTool === tool.id}
							onClick={() => onTerrainToolChange(tool.id)}
						>
							<span aria-hidden="true">{tool.icon}</span>
							{tool.label}
						</button>
					))}
				</div>
			</MapDrawer>
			<MapDrawer
				title="World Details"
				icon="◎"
				open={drawers.world}
				onToggle={() => toggleDrawer("world")}
			>
				<label className="map-workspace-area-picker">
					<span>Editing area</span>
					<select
						value={area.id}
						onChange={(event) => onAreaChange(event.target.value)}
					>
						{project.areas.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.name}
							</option>
						))}
					</select>
				</label>
				<div className="map-drawer-choices">
					{worldSettings.map((setting) => (
						<button
							type="button"
							key={setting.id}
							aria-pressed={worldSetting === setting.id}
							onClick={() => onWorldSettingChange(setting.id)}
						>
							<span aria-hidden="true">{setting.icon}</span>
							{setting.label}
						</button>
					))}
				</div>
				<MapSceneHierarchy {...hierarchy} />
			</MapDrawer>
		</aside>
	);
}

export function MapModeToolbar({
	mode,
	onModeChange,
	children,
}: {
	mode: MapAuthoringMode;
	onModeChange: (mode: MapAuthoringMode) => void;
	children?: ReactNode;
}) {
	return (
		<div
			className="map-workspace-modebar"
			role="toolbar"
			aria-label="Map modes"
		>
			<div className="map-workspace-modebuttons">
				{modes.map((item) => (
					<button
						key={item.id}
						type="button"
						aria-label={item.label}
						aria-pressed={mode === item.id}
						aria-keyshortcuts={item.key}
						onClick={() => onModeChange(item.id)}
					>
						<span aria-hidden="true">{item.icon}</span>
						{item.label}
						<kbd>{item.key}</kbd>
					</button>
				))}
			</div>
			{children && <div className="map-workspace-modeactions">{children}</div>}
		</div>
	);
}

export function MapContextInspector({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<aside className="map-context-inspector" aria-label="Context inspector">
			<header className="map-context-heading">
				<span>Context Inspector</span>
				<h2>{title}</h2>
				{subtitle && <p>{subtitle}</p>}
			</header>
			<div className="map-context-content">{children}</div>
		</aside>
	);
}
