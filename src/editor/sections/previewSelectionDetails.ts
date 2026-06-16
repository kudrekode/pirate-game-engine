import { getTerrainHeight } from "../../data/terrainHeight";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import type {
	EditorSelection,
	GameProject,
	Interaction,
} from "../../types/game";

export type PreviewSelectionDetails = {
	title: string;
	rows: { label: string; value: string }[];
	canOpenInMap: boolean;
};

function formatBool(value: boolean | undefined): string {
	return value ? "Yes" : "No";
}

function formatInteraction(interaction: Interaction | undefined): string {
	if (!interaction) {
		return "None";
	}

	if (interaction.type === "set_flag") {
		return `Set flag ${interaction.flag ?? "(missing flag)"} to ${String(
			interaction.value ?? false,
		)}`;
	}

	if (interaction.type === "play_cutscene") {
		return `Play cutscene ${interaction.cutsceneId ?? "(missing cutscene)"}`;
	}

	if (interaction.type === "teleport" || interaction.type === "area_link") {
		return `Link to ${interaction.targetAreaId ?? "(missing area)"}`;
	}

	if (interaction.type === "change_movement_mode") {
		return `Change movement to ${interaction.mode ?? "(missing mode)"}`;
	}

	return interaction.type;
}

function findArea(project: GameProject, selection: EditorSelection) {
	if (!selection) {
		return undefined;
	}
	return (
		project.areas.find((area) => area.id === selection.areaId) ??
		project.areas[0]
	);
}

export function getPreviewSelectionDetails(
	project: GameProject,
	selection: EditorSelection,
): PreviewSelectionDetails | null {
	if (!selection) {
		return null;
	}

	const area = findArea(project, selection);
	if (!area) {
		return null;
	}

	const baseRows = [
		{ label: "Type", value: selection.type },
		{ label: "Area", value: area.name },
	];

	if (selection.type === "terrain") {
		const tile = area.terrainTiles.find(
			(candidate) => candidate.x === selection.x && candidate.y === selection.y,
		);
		const tileId = tile?.tileId ?? "(missing tile)";
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{ label: "Position", value: `${selection.x}, ${selection.y}` },
				{ label: "Tile ID", value: tileId },
				{
					label: "Height",
					value: String(getTerrainHeight(area, selection.x, selection.y)),
				},
				{
					label: "Movement",
					value: project.player.canWalkOn.includes(tileId)
						? "Player can walk on this tile"
						: "Not in player walkable terrain",
				},
			],
			title: `Terrain ${selection.x}, ${selection.y}`,
		};
	}

	if (selection.type === "overlay") {
		const overlay = area.overlayTiles.find(
			(candidate) => candidate.x === selection.x && candidate.y === selection.y,
		);
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{ label: "Position", value: `${selection.x}, ${selection.y}` },
				{ label: "Overlay ID", value: overlay?.overlayId ?? "(none)" },
			],
			title: `Overlay ${selection.x}, ${selection.y}`,
		};
	}

	if (selection.type === "object") {
		const object = area.objects.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!object) {
			return null;
		}
		const definition = project.objects.find(
			(candidate) => candidate.id === object.objectDefinitionId,
		);
		const behaviour = object.behaviourOverride ?? definition?.defaultBehaviour;
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{
					label: "Name",
					value: object.nameOverride ?? definition?.name ?? object.id,
				},
				{ label: "ID", value: object.id },
				{ label: "Position", value: `${object.x}, ${object.y}` },
				{
					label: "Definition",
					value: definition?.name ?? object.objectDefinitionId,
				},
				{ label: "Category", value: definition?.category ?? "Unknown" },
				{
					label: "Blocks movement",
					value: formatBool(
						object.blocksMovement ?? definition?.blocksMovement,
					),
				},
				{ label: "Behaviour", value: behaviour?.type ?? "none" },
				{
					label: "Interaction",
					value: formatInteraction(
						object.interaction ?? definition?.defaultInteraction,
					),
				},
			],
			title: object.nameOverride ?? definition?.name ?? "Object",
		};
	}

	if (selection.type === "npc") {
		const npc = area.npcs.find((candidate) => candidate.id === selection.id);
		if (!npc) {
			return null;
		}
		const definition = project.npcs.find(
			(candidate) => candidate.id === npc.npcDefinitionId,
		);
		const resolvedNpc = resolveNPCInstance(definition, npc);
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{ label: "Name", value: resolvedNpc.name },
				{ label: "ID", value: npc.id },
				{ label: "Position", value: `${npc.x}, ${npc.y}` },
				{ label: "Alignment", value: resolvedNpc.attributes.alignment },
				{ label: "Faction", value: resolvedNpc.attributes.faction },
				{
					label: "Health",
					value: `${resolvedNpc.attributes.health}/${resolvedNpc.attributes.maxHealth}`,
				},
				{ label: "Movement", value: resolvedNpc.movementMode },
				{
					label: "Enemy",
					value: resolvedNpc.enemyBehaviour?.enabled
						? `Enabled, radius ${resolvedNpc.enemyBehaviour.detectionRadiusTiles}`
						: "No",
				},
				{
					label: "Interaction",
					value: formatInteraction(resolvedNpc.interaction),
				},
			],
			title: resolvedNpc.name,
		};
	}

	if (selection.type === "pickup") {
		const pickup = area.pickups.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!pickup) {
			return null;
		}
		const item = project.items.find(
			(candidate) => candidate.id === pickup.itemId,
		);
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{
					label: "Item",
					value: item ? `${item.name} (${item.id})` : pickup.itemId,
				},
				{ label: "ID", value: pickup.id },
				{ label: "Position", value: `${pickup.x}, ${pickup.y}` },
				{ label: "Quantity", value: String(pickup.quantity) },
				{ label: "Pickup mode", value: pickup.pickupMode },
			],
			title: item?.name ?? "Pickup",
		};
	}

	if (selection.type === "eventBlock") {
		const eventBlock = area.eventBlocks.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!eventBlock) {
			return null;
		}
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{ label: "Name", value: eventBlock.name },
				{ label: "ID", value: eventBlock.id },
				{ label: "Position", value: `${eventBlock.x}, ${eventBlock.y}` },
				{ label: "Tag", value: eventBlock.tag },
				{ label: "Kind", value: eventBlock.kind },
				{
					label: "Link",
					value: eventBlock.link
						? `${eventBlock.link.targetAreaId} / ${eventBlock.link.targetEventBlockId}`
						: "None",
				},
				{
					label: "Interaction",
					value: formatInteraction(eventBlock.interaction),
				},
			],
			title: eventBlock.name,
		};
	}

	if (selection.type === "structure") {
		const structure = area.structures.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!structure) {
			return null;
		}
		return {
			canOpenInMap: true,
			rows: [
				...baseRows,
				{ label: "Name", value: structure.name },
				{ label: "ID", value: structure.id },
				{ label: "Position", value: `${structure.x}, ${structure.y}` },
				{
					label: "Footprint",
					value: `${structure.widthTiles} x ${structure.heightTiles}`,
				},
				{ label: "Structure ID", value: structure.structureId },
				{
					label: "Blocks movement",
					value: formatBool(structure.blocksMovement),
				},
				{
					label: "Interaction",
					value: formatInteraction(structure.interaction),
				},
			],
			title: structure.name,
		};
	}

	return {
		canOpenInMap: false,
		rows: baseRows,
		title: area.name,
	};
}
