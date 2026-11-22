import { defaultMapEntityTransform } from "../../data/mapEntityTransform";
import { getTraversalAssetProfile } from "../../runtime/mapCollision";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	EditorSelection,
	GameProject,
	MapCollisionProfile,
} from "../../types/game";
import {
	getSceneEntity,
	readSceneTransform,
	updateSceneAppearance,
	writeSceneTransform,
} from "./sceneEditing";
import { ThreeVisualControls } from "./ThreeVisualControls";

export function SceneTransformInspector({
	project,
	selection,
	onOpenAsset,
	onOpenStory,
}: {
	project: GameProject;
	selection: EditorSelection;
	onOpenAsset?: (assetId: string) => void;
	onOpenStory?: (selection: NonNullable<EditorSelection>) => void;
}) {
	const entity = getSceneEntity(project, selection);
	if (!entity || !selection)
		return (
			<p className="scene-hint">
				Select an object in the world or Scene list to edit it.
			</p>
		);
	const transform = readSceneTransform(entity);
	const definition =
		"objectDefinitionId" in entity
			? project.objects.find((entry) => entry.id === entity.objectDefinitionId)
			: "npcDefinitionId" in entity
				? project.npcs.find((entry) => entry.id === entity.npcDefinitionId)
				: undefined;
	const canRename = selection?.type !== "pickup";
	const visual =
		"objectDefinitionId" in entity || "npcDefinitionId" in entity
			? { ...definition?.threeVisual, ...entity.threeVisual }
			: {};
	const assetId = visual.mode === "asset" ? visual.assetId : undefined;
	const locked = !!entity.scene?.locked;
	const supportsCollision =
		"objectDefinitionId" in entity ||
		"npcDefinitionId" in entity ||
		"structureId" in entity;
	const floor =
		"objectDefinitionId" in entity &&
		!!getTraversalAssetProfile(project, visual)?.profile.surfaces?.length;
	const interaction =
		("interactionOverride" in entity
			? entity.interactionOverride
			: undefined) ??
		("interaction" in entity ? entity.interaction : undefined) ??
		definition?.defaultInteraction;
	const trigger =
		interaction?.activationMode === "on_touch" ||
		interaction?.activationMode === "both";
	const currentCollision = entity.scene?.collision;
	return (
		<section
			className="scene-transform-inspector"
			aria-label="Transform inspector"
		>
			<div className="scene-instance-links">
				<code title="Instance ID">{entity.id}</code>
				{assetId && onOpenAsset ? (
					<button type="button" onClick={() => onOpenAsset(assetId)}>
						Open Asset
					</button>
				) : null}
				{onOpenStory ? (
					<button type="button" onClick={() => onOpenStory(selection)}>
						Open in Story
					</button>
				) : null}
			</div>
			{canRename && (
				<label className="scene-name">
					Name
					<input
						aria-label="Scene name"
						disabled={locked}
						value={
							"name" in entity
								? entity.name
								: ("nameOverride" in entity
										? entity.nameOverride
										: undefined) ||
									definition?.name ||
									"Object"
						}
						onChange={(event) =>
							useProjectStore.getState().updateProject((draft) => {
								const target = getSceneEntity(draft, selection);
								if (!target || target.scene?.locked) return;
								if ("name" in target) target.name = event.target.value;
								else if (
									"npcDefinitionId" in target ||
									"objectDefinitionId" in target
								)
									target.nameOverride = event.target.value;
							})
						}
					/>
				</label>
			)}
			<div className="scene-instance-flags">
				<label className="checkbox-row">
					<input
						type="checkbox"
						checked={!entity.scene?.hidden}
						onChange={(event) =>
							updateSceneAppearance(selection, {
								hidden: !event.target.checked,
							})
						}
					/>{" "}
					Visible
				</label>
				<label className="checkbox-row">
					<input
						type="checkbox"
						checked={locked}
						onChange={(event) =>
							updateSceneAppearance(selection, { locked: event.target.checked })
						}
					/>{" "}
					Locked
				</label>
			</div>
			<label>
				Group / layer
				<input
					key={`${entity.id}:${entity.scene?.group ?? ""}`}
					defaultValue={entity.scene?.group ?? ""}
					maxLength={80}
					disabled={locked}
					onBlur={(event) =>
						updateSceneAppearance(selection, { group: event.target.value })
					}
				/>
			</label>
			<div className="panel-title">Transform</div>
			{(["position", "rotation", "scale"] as const).map((group) => (
				<fieldset key={group} disabled={locked}>
					<legend>
						{group === "rotation"
							? "Rotation (°)"
							: group === "scale"
								? "Scale"
								: "Position"}
					</legend>
					<div className="transform-vector">
						{(["x", "y", "z"] as const).map((axis) => (
							<label key={axis}>
								<span className={`axis-${axis}`}>{axis.toUpperCase()}</span>
								<input
									aria-label={`${group[0].toUpperCase()}${group.slice(1)} ${axis.toUpperCase()}`}
									type="number"
									step={group === "rotation" ? 1 : 0.25}
									min={group === "scale" ? 0.05 : undefined}
									max={group === "scale" ? 20 : undefined}
									value={Number(transform[group][axis].toFixed(3))}
									onChange={(event) => {
										if (
											!event.target.value ||
											!Number.isFinite(event.target.valueAsNumber)
										)
											return;
										const next = structuredClone(transform);
										next[group][axis] = event.target.valueAsNumber;
										useProjectStore
											.getState()
											.updateProject((draft) =>
												writeSceneTransform(draft, selection, next),
											);
									}}
								/>
							</label>
						))}
					</div>
				</fieldset>
			))}
			<p className="scene-hint">
				X / Z: map position · Y: elevation. Supported world-kit assets use these
				transforms for collision in 3D Play.
			</p>
			<button
				type="button"
				disabled={locked}
				onClick={() =>
					useProjectStore.getState().updateProject((draft) => {
						const target = getSceneEntity(draft, selection);
						if (target && !target.scene?.locked)
							target.transform = {
								...defaultMapEntityTransform(),
								position: target.transform?.position ?? { x: 0, y: 0, z: 0 },
							};
					})
				}
			>
				Reset rotation & scale
			</button>
			{supportsCollision && (
				<label>
					Collision profile
					<select
						disabled={locked}
						value={currentCollision ?? ""}
						onChange={(event) =>
							updateSceneAppearance(selection, {
								collision: (event.target.value || undefined) as
									| MapCollisionProfile
									| undefined,
							})
						}
					>
						<option value="">Asset / instance default</option>
						<option value="none">None</option>
						<option value="solid">Solid</option>
						{(floor || currentCollision === "walkable-floor") && (
							<option value="walkable-floor" disabled={!floor}>
								Walkable floor
							</option>
						)}
						{(trigger || currentCollision === "trigger") && (
							<option value="trigger" disabled={!trigger}>
								Trigger
							</option>
						)}
					</select>
				</label>
			)}
			{("objectDefinitionId" in entity || "npcDefinitionId" in entity) && (
				<details className="scene-visual">
					<summary>Visual</summary>
					<fieldset disabled={locked}>
						<ThreeVisualControls
							title="Appearance"
							showTransformControls={false}
							projectAssets={project.characterAssets}
							variants={project.assetCreator?.variants}
							value={visual}
							inferredPlaceholderType={
								"npcDefinitionId" in entity ? "npc" : "genericObject"
							}
							onChange={(visual) =>
								useProjectStore.getState().updateProject((draft) => {
									const target = getSceneEntity(draft, selection);
									if (
										target &&
										!target.scene?.locked &&
										("objectDefinitionId" in target ||
											"npcDefinitionId" in target)
									)
										target.threeVisual = visual;
								})
							}
						/>
					</fieldset>
				</details>
			)}
		</section>
	);
}
