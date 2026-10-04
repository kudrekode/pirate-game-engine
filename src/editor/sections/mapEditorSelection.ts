import { getTerrainHeight } from "../../data/terrainHeight";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import type { EditorSelection, GameArea, GameProject } from "../../types/game";

function cellKey(x: number, y: number) {
	return `${x}:${y}`;
}

// Shared selection projection for the map canvas/status and its inspector.
export function resolveMapEditorSelection(
	project: GameProject,
	activeArea: GameArea,
	selection: EditorSelection,
	terrainLookup: ReadonlyMap<string, string>,
	overlayLookup: ReadonlyMap<string, string>,
) {
	const selectedEventBlock =
		selection?.type === "eventBlock" && selection.areaId === activeArea.id
			? activeArea.eventBlocks.find(
					(eventBlock) => eventBlock.id === selection.id,
				)
			: undefined;
	const selectedMapStructure =
		selection?.type === "structure" && selection.areaId === activeArea.id
			? activeArea.structures.find((structure) => structure.id === selection.id)
			: undefined;
	const selectedObject =
		selection?.type === "object" && selection.areaId === activeArea.id
			? activeArea.objects.find((object) => object.id === selection.id)
			: undefined;
	const selectedPickup =
		selection?.type === "pickup" && selection.areaId === activeArea.id
			? activeArea.pickups.find((pickup) => pickup.id === selection.id)
			: undefined;
	const selectedNpc =
		selection?.type === "npc" && selection.areaId === activeArea.id
			? activeArea.npcs.find((npc) => npc.id === selection.id)
			: undefined;
	const selectedNpcDefinition = selectedNpc
		? project.npcs.find((npc) => npc.id === selectedNpc.npcDefinitionId)
		: undefined;
	const selectedResolvedNpc = selectedNpc
		? resolveNPCInstance(selectedNpcDefinition, selectedNpc)
		: undefined;
	const selectedOverlayTile =
		selection?.type === "overlay" && selection.areaId === activeArea.id
			? {
					x: selection.x,
					y: selection.y,
					overlayId: overlayLookup.get(cellKey(selection.x, selection.y)) ?? "",
				}
			: undefined;
	const selectedTerrainTile =
		selection?.type === "terrain" && selection.areaId === activeArea.id
			? {
					height: getTerrainHeight(activeArea, selection.x, selection.y),
					x: selection.x,
					y: selection.y,
					tileId:
						terrainLookup.get(cellKey(selection.x, selection.y)) ?? "grass",
				}
			: undefined;
	return {
		selectedEventBlock,
		selectedMapStructure,
		selectedObject,
		selectedPickup,
		selectedNpc,
		selectedNpcDefinition,
		selectedResolvedNpc,
		selectedOverlayTile,
		selectedTerrainTile,
	};
}
export type MapInspectorSelection = ReturnType<
	typeof resolveMapEditorSelection
>;
