import { defaultMapEntityTransform } from "../../data/mapEntityTransform";
import { useProjectStore } from "../../store/useProjectStore";
import type { EditorSelection, GameProject } from "../../types/game";
import {
	getSceneEntity,
	readSceneTransform,
	writeSceneTransform,
} from "./sceneEditing";
import { ThreeVisualControls } from "./ThreeVisualControls";

export function SceneTransformInspector({
	project,
	selection,
}: {
	project: GameProject;
	selection: EditorSelection;
}) {
	const entity = getSceneEntity(project, selection);
	if (!entity)
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
	return (
		<section
			className="scene-transform-inspector"
			aria-label="Transform inspector"
		>
			{canRename && (
				<label className="scene-name">
					Name
					<input
						aria-label="Scene name"
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
								if (!target) return;
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
			<div className="panel-title">Transform</div>
			{(["position", "rotation", "scale"] as const).map((group) => (
				<fieldset key={group}>
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
				X / Z: map position · Y: elevation. Collision uses the nearest grid
				cell.
			</p>
			<button
				type="button"
				onClick={() =>
					useProjectStore.getState().updateProject((draft) => {
						const target = getSceneEntity(draft, selection);
						if (target)
							target.transform = {
								...defaultMapEntityTransform(),
								position: target.transform?.position ?? { x: 0, y: 0, z: 0 },
							};
					})
				}
			>
				Reset rotation & scale
			</button>
			{("objectDefinitionId" in entity || "npcDefinitionId" in entity) && (
				<details className="scene-visual">
					<summary>Visual</summary>
					<ThreeVisualControls
						title="Appearance"
						showTransformControls={false}
						projectAssets={project.characterAssets}
						value={{ ...definition?.threeVisual, ...entity.threeVisual }}
						inferredPlaceholderType={
							"npcDefinitionId" in entity ? "npc" : "genericObject"
						}
						onChange={(visual) =>
							useProjectStore.getState().updateProject((draft) => {
								const target = getSceneEntity(draft, selection);
								if (
									target &&
									("objectDefinitionId" in target ||
										"npcDefinitionId" in target)
								)
									target.threeVisual = visual;
							})
						}
					/>
				</details>
			)}
		</section>
	);
}
