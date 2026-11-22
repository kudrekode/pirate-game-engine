import type { ReactNode } from "react";
import { defaultProject } from "../../data/defaultProject";
import { JUMP_GRAVITY, JUMP_SPEED } from "../../runtime/playerLocomotion";
import { getPlayerMoveDurationMs } from "../../runtime/playerMovementTransaction";
import {
	ATMOSPHERE_PRESETS,
	type AtmospherePresetId,
	resolveAtmosphereFog,
	resolveAtmospherePreset,
} from "../../runtime/three/worldPresentation";
import { MAX_STEP_HEIGHT, PLAYER_BODY_HEIGHT } from "../../runtime/traversal";
import { useProjectStore } from "../../store/useProjectStore";
import type { AreaThemeConfig, GameArea, GameProject } from "../../types/game";
import type { MapWorldSetting } from "./MapWorkspacePanels";
import { resolveMapSpawn, setMapSpawnAsProjectStart } from "./mapSpawn";
import "./mapWorldInspector.css";

type MapWorldInspectorProps = {
	project: GameProject;
	area: GameArea;
	setting: MapWorldSetting;
	onOpenPlayer?: () => void;
	onOpenHud?: () => void;
	children?: ReactNode;
};

function updateAreaTheme(
	areaId: string,
	update: (theme: AreaThemeConfig) => void,
) {
	useProjectStore.getState().updateProject((draft) => {
		const area = draft.areas.find((entry) => entry.id === areaId);
		if (!area) return;
		const theme = { ...area.theme };
		update(theme);
		area.theme = theme;
	});
}

function AtmosphereFields({ area }: { area: GameArea }) {
	const preset = resolveAtmospherePreset(area.theme?.atmosphere);
	const fog = resolveAtmosphereFog(preset, area.theme?.fog);
	const updateFog = (patch: NonNullable<AreaThemeConfig["fog"]>) =>
		updateAreaTheme(area.id, (theme) => {
			theme.fog = { ...theme.fog, ...patch };
		});

	return (
		<div className="form-stack">
			<label>
				Atmosphere
				<select
					value={area.theme?.atmosphere ?? ""}
					onChange={(event) => {
						const value = event.currentTarget.value as AtmospherePresetId | "";
						updateAreaTheme(area.id, (theme) => {
							if (value) theme.atmosphere = value;
							else delete theme.atmosphere;
						});
					}}
				>
					<option value="">Default (Clear Day)</option>
					{Object.values(ATMOSPHERE_PRESETS).map((entry) => (
						<option key={entry.id} value={entry.id}>
							{entry.label}
						</option>
					))}
				</select>
			</label>
			<p className="scene-hint">
				The area preset sets the sky, horizon and lighting in 3D Edit and Play.
			</p>
			<label className="checkbox-row">
				<input
					type="checkbox"
					checked={fog.enabled}
					onChange={(event) =>
						updateFog({ enabled: event.currentTarget.checked })
					}
				/>
				Enable fog
			</label>
			<div className="form-grid map-world-pair">
				<label>
					Fog near (m)
					<input
						type="number"
						min={0}
						max={fog.far - 1}
						disabled={!fog.enabled}
						value={fog.near}
						onChange={(event) => {
							const value = event.currentTarget.valueAsNumber;
							if (Number.isFinite(value))
								updateFog({ near: Math.max(0, Math.min(fog.far - 1, value)) });
						}}
					/>
				</label>
				<label>
					Fog far (m)
					<input
						type="number"
						min={fog.near + 1}
						max={500}
						disabled={!fog.enabled}
						value={fog.far}
						onChange={(event) => {
							const value = event.currentTarget.valueAsNumber;
							if (Number.isFinite(value))
								updateFog({
									far: Math.min(500, Math.max(fog.near + 1, value)),
								});
						}}
					/>
				</label>
			</div>
			<button
				type="button"
				disabled={!area.theme?.fog}
				onClick={() =>
					updateAreaTheme(area.id, (theme) => {
						delete theme.fog;
					})
				}
			>
				Use preset fog
			</button>
		</div>
	);
}

function SpawnFields({
	area,
	project,
	onOpenPlayer,
}: Pick<MapWorldInspectorProps, "area" | "project" | "onOpenPlayer">) {
	const { marker, isProjectStart } = resolveMapSpawn(project, area);
	const addSpawn = () => {
		const store = useProjectStore.getState();
		const id = store.addEventBlock(
			Math.floor(area.width / 2),
			Math.floor(area.height / 2),
		);
		store.updateEventBlock(id, { name: "Player spawn", kind: "spawn" });
	};

	return (
		<div className="form-stack">
			{marker ? (
				<>
					<div>
						<strong>{marker.name}</strong>
						<p className="scene-hint">
							{isProjectStart ? "Project starting spawn" : "Area spawn marker"}{" "}
							· {marker.id}
						</p>
					</div>
					<div className="form-grid map-world-pair">
						{(["x", "y"] as const).map((axis) => {
							const max = (axis === "x" ? area.width : area.height) - 1;
							return (
								<label key={axis}>
									{axis === "x" ? "Spawn X" : "Spawn Z"}
									<input
										type="number"
										min={0}
										max={max}
										value={marker[axis]}
										onChange={(event) => {
											const value = event.currentTarget.valueAsNumber;
											if (!Number.isFinite(value)) return;
											useProjectStore.getState().updateEventBlock(marker.id, {
												[axis]: Math.max(0, Math.min(max, Math.round(value))),
											});
										}}
									/>
								</label>
							);
						})}
					</div>
					<p className="scene-hint">
						Grid coordinates in tiles. The destination follows the terrain
						surface.
					</p>
					{!isProjectStart && (
						<button
							type="button"
							onClick={() =>
								useProjectStore
									.getState()
									.updateProject((draft) =>
										setMapSpawnAsProjectStart(draft, area.id, marker.id),
									)
							}
						>
							Set as project start
						</button>
					)}
				</>
			) : (
				<button type="button" onClick={addSpawn}>
					Add spawn marker
				</button>
			)}
			{onOpenPlayer && (
				<button type="button" onClick={onOpenPlayer}>
					Open Character editor
				</button>
			)}
		</div>
	);
}

export function MapWorldInspector({
	project,
	area,
	setting,
	onOpenPlayer,
	onOpenHud,
	children,
}: MapWorldInspectorProps) {
	if (setting === "sky") return <AtmosphereFields area={area} />;
	if (setting === "spawn")
		return (
			<SpawnFields area={area} project={project} onOpenPlayer={onOpenPlayer} />
		);
	if (setting === "physics") {
		return (
			<div className="form-stack">
				<dl className="map-world-readouts">
					<div>
						<dt>3D player gravity</dt>
						<dd>{JUMP_GRAVITY} m/s²</dd>
					</div>
					<div>
						<dt>Jump launch speed</dt>
						<dd>{JUMP_SPEED} m/s</dd>
					</div>
					<div>
						<dt>Maximum step up</dt>
						<dd>{MAX_STEP_HEIGHT} m</dd>
					</div>
					<div>
						<dt>Player collision height</dt>
						<dd>{PLAYER_BODY_HEIGHT} m</dd>
					</div>
				</dl>
				<label>
					Player movement speed
					<input
						type="number"
						min={1}
						max={20}
						value={project.player.speed}
						onChange={(event) => {
							const value = event.currentTarget.valueAsNumber;
							if (Number.isFinite(value))
								useProjectStore
									.getState()
									.updatePlayer({ speed: Math.max(1, Math.min(20, value)) });
						}}
					/>
				</label>
				<p className="scene-hint">
					Project-wide speed setting. A normal movement step takes{" "}
					{getPlayerMoveDurationMs(project.player.speed)} ms.
				</p>
				<button
					type="button"
					disabled={project.player.speed === defaultProject.player.speed}
					onClick={() =>
						useProjectStore
							.getState()
							.updatePlayer({ speed: defaultProject.player.speed })
					}
				>
					Reset player speed
				</button>
			</div>
		);
	}
	if (setting === "hud") {
		return (
			<div className="form-stack">
				<p className="scene-hint">
					Quest tracking applies to the whole project.
				</p>
				<label>
					Tracked Quest HUD
					<select
						value={project.trackedQuestId ?? ""}
						onChange={(event) => {
							const id = event.currentTarget.value;
							useProjectStore.getState().updateProject((draft) => {
								draft.trackedQuestId = id || undefined;
							});
						}}
					>
						<option value="">First active quest</option>
						{project.quests.map((quest) => (
							<option value={quest.id} key={quest.id}>
								{quest.name}
							</option>
						))}
					</select>
				</label>
				{onOpenHud && (
					<button type="button" onClick={onOpenHud}>
						Open Quests editor
					</button>
				)}
			</div>
		);
	}
	return <div className="form-stack">{children}</div>;
}
