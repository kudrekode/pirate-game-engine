import { getStructurePreset } from "../../data/mapVisuals";
import type { MapPaletteSelection } from "../../store/useProjectStore";
import type { EditorSelection, GameProject } from "../../types/game";
import type { PreviewGridPosition } from "./previewMove";

export type PreviewPlacementInfo = {
	active: boolean;
	label: string;
	shape: "box" | "cylinder";
	color: number;
	width: number;
	height: number;
	depth: number;
};

export type PreviewPlacementActions = {
	areaId: string;
	addNpc: (x: number, y: number, npcDefinitionId: string) => string;
	addObject: (x: number, y: number, objectDefinitionId: string) => string;
	addPickup: (x: number, y: number) => string;
	updatePickup: (id: string, patch: { itemId?: string }) => void;
	addEventBlock: (x: number, y: number) => string;
	addStructure: (structure: {
		structureId: string;
		name: string;
		x: number;
		y: number;
		widthTiles: number;
		heightTiles: number;
		blocksMovement: boolean;
	}) => string;
};

export function getPreviewPlacementInfo(
	project: GameProject,
	paletteSelection: MapPaletteSelection,
): PreviewPlacementInfo {
	if (paletteSelection.type === "npc") {
		const npc = project.npcs.find(
			(definition) => definition.id === paletteSelection.npcDefinitionId,
		);
		return {
			active: Boolean(npc),
			color: 0xf97316,
			depth: 0.48,
			height: 1.25,
			label: npc ? `Placing NPC: ${npc.name}` : "No placeable selected",
			shape: "cylinder",
			width: 0.48,
		};
	}

	if (paletteSelection.type === "object") {
		const object = project.objects.find(
			(definition) => definition.id === paletteSelection.objectDefinitionId,
		);
		return {
			active: Boolean(object),
			color: 0x8b5a2b,
			depth: object?.heightTiles ?? 1,
			height: 0.8,
			label: object
				? `Placing Object: ${object.name}`
				: "No placeable selected",
			shape: "box",
			width: object?.widthTiles ?? 1,
		};
	}

	if (paletteSelection.type === "pickup") {
		const item = project.items.find(
			(definition) => definition.id === paletteSelection.itemId,
		);
		return {
			active: project.items.length > 0,
			color: 0xfacc15,
			depth: 0.34,
			height: 0.34,
			label: `Placing Pickup: ${item?.name ?? project.items[0]?.name ?? "Item"} x1`,
			shape: "box",
			width: 0.34,
		};
	}

	if (paletteSelection.type === "eventBlock") {
		return {
			active: true,
			color: 0xc026d3,
			depth: 0.72,
			height: 0.12,
			label: "Placing Event Block",
			shape: "box",
			width: 0.72,
		};
	}

	if (paletteSelection.type === "structure") {
		const structure = getStructurePreset(paletteSelection.structureId);
		return {
			active: Boolean(structure),
			color: 0x64748b,
			depth: structure.heightTiles,
			height: 1.7,
			label: `Placing Structure: ${structure.label}`,
			shape: "box",
			width: structure.widthTiles,
		};
	}

	return {
		active: false,
		color: 0x9aa4af,
		depth: 1,
		height: 1,
		label: "No placeable selected",
		shape: "box",
		width: 1,
	};
}

export function placePreviewEntity(
	paletteSelection: MapPaletteSelection,
	position: PreviewGridPosition,
	actions: PreviewPlacementActions,
): EditorSelection {
	if (paletteSelection.type === "npc") {
		const id = actions.addNpc(
			position.x,
			position.y,
			paletteSelection.npcDefinitionId,
		);
		return { areaId: actions.areaId, id, type: "npc" };
	}

	if (paletteSelection.type === "object") {
		const id = actions.addObject(
			position.x,
			position.y,
			paletteSelection.objectDefinitionId,
		);
		return { areaId: actions.areaId, id, type: "object" };
	}

	if (paletteSelection.type === "pickup") {
		const id = actions.addPickup(position.x, position.y);
		if (paletteSelection.itemId) {
			actions.updatePickup(id, { itemId: paletteSelection.itemId });
		}
		return { areaId: actions.areaId, id, type: "pickup" };
	}

	if (paletteSelection.type === "eventBlock") {
		const id = actions.addEventBlock(position.x, position.y);
		return { areaId: actions.areaId, id, type: "eventBlock" };
	}

	if (paletteSelection.type === "structure") {
		const structure = getStructurePreset(paletteSelection.structureId);
		const id = actions.addStructure({
			blocksMovement: structure.blocksMovement,
			heightTiles: structure.heightTiles,
			name: structure.label,
			structureId: structure.id,
			widthTiles: structure.widthTiles,
			x: position.x,
			y: position.y,
		});
		return { areaId: actions.areaId, id, type: "structure" };
	}

	return null;
}
