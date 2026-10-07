import {
	addCharacterNpcDefinition,
	characterAssetProblem,
} from "../../data/characterAssets";
import {
	defaultMapEntityTransform,
	migrateMapEntityTransform,
} from "../../data/mapEntityTransform";
import { structurePresets } from "../../data/mapVisuals";
import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
} from "../../runtime/three/threeVisualAssetRegistry";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	EditorSelection,
	GameArea,
	GameProject,
	MapEntityTransform,
	ThreeVisualConfig,
} from "../../types/game";
import { isMovablePreviewSelection } from "./previewMove";

export const SCENE_ASSET_MIME = "application/x-adventure-scene-asset";
export type SceneAsset = {
	id: string;
	name: string;
	category: string;
	tags: string[];
	kind: "object" | "npc" | "structure" | "visual" | "character";
	visual?: ThreeVisualConfig;
};

export function sceneAssets(project: GameProject): SceneAsset[] {
	const assets: SceneAsset[] = [
		...project.objects.map(
			(entry): SceneAsset => ({
				id: entry.id,
				name: entry.name,
				category:
					getThreeVisualAssetDefinition(entry.threeVisual?.assetId)
						?.browserCategory ??
					(/tree|palm|rock/i.test(entry.name) ? "Nature" : "Props"),
				tags: [
					entry.category,
					...(getThreeVisualAssetDefinition(entry.threeVisual?.assetId)?.tags ??
						[]),
				],
				kind: "object",
				visual: entry.threeVisual,
			}),
		),
		...project.npcs.map(
			(entry): SceneAsset => ({
				id: entry.id,
				name: entry.name,
				category: "Characters",
				tags: ["npc"],
				kind: "npc",
				visual: entry.threeVisual,
			}),
		),
		...structurePresets
			.filter((entry) => entry.id === "small_house")
			.map(
				(entry): SceneAsset => ({
					id: entry.id,
					name: entry.label,
					category: "Buildings",
					tags: ["structure", "built-in"],
					kind: "structure",
				}),
			),
	];
	const used = new Set(assets.map((asset) => asset.visual?.assetId));
	for (const asset of listThreeVisualAssets(project.characterAssets)) {
		if (asset.animationOnly || asset.hiddenFromBrowser || used.has(asset.id))
			continue;
		const imported = project.characterAssets?.find(
			(item) => item.id === asset.id,
		);
		if (imported && characterAssetProblem(imported)) continue;
		assets.push({
			id: asset.id,
			name: asset.name,
			category:
				asset.browserCategory ??
				(asset.category === "character"
					? "Characters"
					: asset.category === "environment"
						? "Nature"
						: "Props"),
			tags: asset.tags ?? [],
			kind: asset.category === "character" ? "character" : "visual",
			visual: { mode: "asset", assetId: asset.id },
		});
	}
	return assets;
}

export function getSceneEntity(
	project: GameProject,
	selection: EditorSelection,
) {
	if (!isMovablePreviewSelection(selection)) return undefined;
	const area = project.areas.find((entry) => entry.id === selection.areaId);
	if (!area) return undefined;
	const entities =
		selection.type === "npc"
			? area.npcs
			: selection.type === "object"
				? area.objects
				: selection.type === "structure"
					? area.structures
					: selection.type === "pickup"
						? area.pickups
						: area.eventBlocks;
	return entities.find((entry) => entry.id === selection.id);
}

export function sceneEntries(project: GameProject, area: GameArea) {
	return [
		...area.objects.map((entry) => ({
			id: entry.id,
			type: "object" as const,
			name:
				entry.nameOverride ||
				project.objects.find(
					(definition) => definition.id === entry.objectDefinitionId,
				)?.name ||
				"Object",
			icon: "◇",
		})),
		...area.npcs.map((entry) => ({
			id: entry.id,
			type: "npc" as const,
			name:
				entry.nameOverride ||
				project.npcs.find(
					(definition) => definition.id === entry.npcDefinitionId,
				)?.name ||
				"Character",
			icon: "♟",
		})),
		...area.structures.map((entry) => ({
			id: entry.id,
			type: "structure" as const,
			name: entry.name,
			icon: "⌂",
		})),
		...area.pickups.map((entry) => ({
			id: entry.id,
			type: "pickup" as const,
			name:
				project.items.find((item) => item.id === entry.itemId)?.name ||
				"Pickup",
			icon: "✦",
		})),
		...area.eventBlocks.map((entry) => ({
			id: entry.id,
			type: "eventBlock" as const,
			name: entry.name,
			icon: entry.kind === "spawn" ? "⚑" : "◎",
		})),
	];
}

// Continuous presentation coordinates retain an integer gameplay anchor.
export function writeSceneTransform(
	project: GameProject,
	selection: EditorSelection,
	value: MapEntityTransform,
) {
	const entity = getSceneEntity(project, selection);
	const area = project.areas.find((entry) => entry.id === selection?.areaId);
	if (!entity || !area) return;
	const transform =
		migrateMapEntityTransform(value) ?? defaultMapEntityTransform();
	const x = Math.min(
		area.width - 1,
		Math.max(
			0,
			Number.isFinite(value.position.x) ? value.position.x : entity.x,
		),
	);
	const z = Math.min(
		area.height - 1,
		Math.max(
			0,
			Number.isFinite(value.position.z) ? value.position.z : entity.y,
		),
	);
	entity.x = Math.round(x);
	entity.y = Math.round(z);
	transform.position.x = x - entity.x;
	transform.position.z = z - entity.y;
	entity.transform = transform;
}

export function readSceneTransform(
	entity: NonNullable<ReturnType<typeof getSceneEntity>>,
): MapEntityTransform {
	const value = structuredClone(
		entity.transform ?? defaultMapEntityTransform(),
	);
	value.position.x += entity.x;
	value.position.z += entity.y;
	return value;
}

export function placeSceneAsset(
	asset: SceneAsset,
	position: { x: number; y: number },
): EditorSelection {
	const store = useProjectStore.getState();
	const project = store.project;
	const area = project.areas.find((item) => item.id === project.activeAreaId);
	if (!area) throw new Error("The active area no longer exists.");
	const x = Math.min(area.width - 1, Math.max(0, Math.round(position.x)));
	const y = Math.min(area.height - 1, Math.max(0, Math.round(position.y)));
	let definitionId = asset.id;
	const type: "object" | "npc" | "structure" =
		asset.kind === "npc" || asset.kind === "character"
			? "npc"
			: asset.kind === "structure"
				? "structure"
				: "object";
	if (asset.kind === "character" || asset.kind === "visual") {
		definitionId = `scene-${asset.id}`;
		store.updateProject((draft) => {
			const imported = draft.characterAssets?.find(
				(entry) => entry.id === asset.id,
			);
			if (imported) {
				definitionId = addCharacterNpcDefinition(draft, imported);
				return;
			}
			if (
				type === "npc" &&
				!draft.npcs.some((entry) => entry.id === definitionId)
			)
				draft.npcs.push({
					id: definitionId,
					name: asset.name,
					mapAvatarId: "scout",
					threeVisual: asset.visual,
					defaultMovement: { movementMode: "stationary" },
				});
			if (
				type === "object" &&
				!draft.objects.some((entry) => entry.id === definitionId)
			)
				draft.objects.push({
					id: definitionId,
					name: asset.name,
					category: "prop",
					widthTiles: 1,
					heightTiles: 1,
					blocksMovement: false,
					threeVisual: asset.visual,
				});
		});
	}
	const preset = structurePresets.find((entry) => entry.id === asset.id);
	const id =
		type === "npc"
			? store.addNpc(x, y, definitionId)
			: type === "object"
				? store.addObject(x, y, definitionId)
				: store.addStructure({
						structureId: asset.id,
						name: asset.name,
						x,
						y,
						widthTiles: preset?.widthTiles ?? 1,
						heightTiles: preset?.heightTiles ?? 1,
						blocksMovement: preset?.blocksMovement ?? true,
					});
	const selection: EditorSelection = { type, id, areaId: area.id };
	store.setMapPaletteSelection({ type: "none" });
	store.setEditorSelection(selection);
	return selection;
}

export function deleteSceneSelection(selection: EditorSelection) {
	if (!isMovablePreviewSelection(selection)) return;
	const store = useProjectStore.getState();
	if (!getSceneEntity(store.project, selection)) return;
	const remove = {
		object: store.deleteObject,
		npc: store.deleteNpc,
		structure: store.deleteStructure,
		pickup: store.deletePickup,
		eventBlock: store.deleteEventBlock,
	}[selection.type];
	remove(selection.id);
	store.setEditorSelection({ type: "area", areaId: selection.areaId });
}

export function duplicateSceneSelection(selection: EditorSelection) {
	if (!isMovablePreviewSelection(selection)) return;
	const store = useProjectStore.getState();
	const source = getSceneEntity(store.project, selection);
	if (!source) return;
	const id = `${selection.type}_${crypto.randomUUID()}`;
	store.updateProject((project) => {
		const area = project.areas.find((entry) => entry.id === selection.areaId);
		if (!area) return;
		const copy = structuredClone(source);
		copy.id = id;
		copy.x = Math.min(area.width - 1, copy.x + 1);
		copy.y = Math.min(area.height - 1, copy.y + 1);
		if ("objectDefinitionId" in copy || "npcDefinitionId" in copy)
			copy.nameOverride = `${copy.nameOverride || sceneEntries(project, area).find((entry) => entry.id === source.id)?.name || "Object"} copy`;
		if ("name" in copy) copy.name = `${copy.name} copy`;
		if ("objectDefinitionId" in copy) area.objects.push(copy);
		else if ("npcDefinitionId" in copy) area.npcs.push(copy);
		else if ("structureId" in copy) area.structures.push(copy);
		else if ("itemId" in copy) area.pickups.push(copy);
		else area.eventBlocks.push(copy);
	});
	store.setEditorSelection({ ...selection, id });
}
