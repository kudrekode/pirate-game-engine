import type { EditorSelection, GameArea, GameProject } from "../../types/game";

export type PreviewGridPosition = {
	x: number;
	y: number;
};

export type PreviewThreePoint = {
	x: number;
	z: number;
};

export function isMovablePreviewSelection(
	selection: EditorSelection,
): selection is Exclude<
	EditorSelection,
	| { type: "area"; areaId: string }
	| { type: "overlay"; areaId: string; x: number; y: number }
	| { type: "terrain"; areaId: string; x: number; y: number }
	| null
> {
	return (
		selection?.type === "npc" ||
		selection?.type === "object" ||
		selection?.type === "pickup" ||
		selection?.type === "eventBlock" ||
		selection?.type === "structure"
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function getPreviewSelectionFootprint(
	area: GameArea,
	selection: EditorSelection,
): { width: number; height: number } {
	if (selection?.type === "structure") {
		const structure = area.structures.find((item) => item.id === selection.id);
		return {
			height: structure?.heightTiles ?? 1,
			width: structure?.widthTiles ?? 1,
		};
	}

	if (selection?.type === "object") {
		const object = area.objects.find((item) => item.id === selection.id);
		return {
			height: object?.heightTiles ?? 1,
			width: object?.widthTiles ?? 1,
		};
	}

	return { height: 1, width: 1 };
}

export function clampPreviewGridPosition(
	area: GameArea,
	position: PreviewGridPosition,
	footprint = { height: 1, width: 1 },
): PreviewGridPosition {
	return {
		x: clamp(
			Math.round(position.x),
			0,
			Math.max(0, area.width - footprint.width),
		),
		y: clamp(
			Math.round(position.y),
			0,
			Math.max(0, area.height - footprint.height),
		),
	};
}

export function threePointToPreviewGridPosition(
	area: GameArea,
	point: PreviewThreePoint,
	footprint = { height: 1, width: 1 },
): PreviewGridPosition {
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	return clampPreviewGridPosition(
		area,
		{
			x: point.x + centerX,
			y: point.z + centerZ,
		},
		footprint,
	);
}

export function previewGridPositionToThreePoint(
	area: GameArea,
	position: PreviewGridPosition,
	footprint = { height: 1, width: 1 },
): PreviewThreePoint {
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	return {
		x: position.x + (footprint.width - 1) / 2 - centerX,
		z: position.y + (footprint.height - 1) / 2 - centerZ,
	};
}

export function movePreviewSelectionInProject(
	project: GameProject,
	selection: EditorSelection,
	position: PreviewGridPosition,
): boolean {
	if (!isMovablePreviewSelection(selection)) {
		return false;
	}

	const area = project.areas.find(
		(candidate) => candidate.id === selection.areaId,
	);
	if (!area) {
		return false;
	}

	const nextPosition = clampPreviewGridPosition(
		area,
		position,
		getPreviewSelectionFootprint(area, selection),
	);

	if (selection.type === "npc") {
		const npc = area.npcs.find((candidate) => candidate.id === selection.id);
		if (!npc) {
			return false;
		}
		npc.x = nextPosition.x;
		npc.y = nextPosition.y;
		npc.areaId = area.id;
		return true;
	}

	if (selection.type === "object") {
		const object = area.objects.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!object) {
			return false;
		}
		object.x = nextPosition.x;
		object.y = nextPosition.y;
		object.areaId = area.id;
		return true;
	}

	if (selection.type === "pickup") {
		const pickup = area.pickups.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!pickup) {
			return false;
		}
		pickup.x = nextPosition.x;
		pickup.y = nextPosition.y;
		pickup.areaId = area.id;
		return true;
	}

	if (selection.type === "eventBlock") {
		const eventBlock = area.eventBlocks.find(
			(candidate) => candidate.id === selection.id,
		);
		if (!eventBlock) {
			return false;
		}
		eventBlock.x = nextPosition.x;
		eventBlock.y = nextPosition.y;
		return true;
	}

	const structure = area.structures.find(
		(candidate) => candidate.id === selection.id,
	);
	if (!structure) {
		return false;
	}
	structure.x = nextPosition.x;
	structure.y = nextPosition.y;
	return true;
}
