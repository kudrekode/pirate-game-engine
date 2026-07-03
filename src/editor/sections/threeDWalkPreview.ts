import { resolveMovementAt } from "../../runtime/movement";
import type { GameArea, PlayerConfig } from "../../types/game";
import type { PreviewGridPosition } from "./previewMove";

export type WalkPreviewDirection = "up" | "down" | "left" | "right";

const WALK_DELTAS: Record<WalkPreviewDirection, PreviewGridPosition> = {
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	up: { x: 0, y: -1 },
};

export function getWalkPreviewStart(
	area: GameArea | undefined,
): PreviewGridPosition | undefined {
	if (!area) {
		return undefined;
	}
	const spawn =
		area.eventBlocks.find((eventBlock) => eventBlock.kind === "spawn") ??
		area.eventBlocks[0];
	if (spawn) {
		return { x: spawn.x, y: spawn.y };
	}
	return {
		x: Math.max(0, Math.floor((area.width - 1) / 2)),
		y: Math.max(0, Math.floor((area.height - 1) / 2)),
	};
}

export function moveWalkPreview(
	area: GameArea,
	player: PlayerConfig,
	position: PreviewGridPosition,
	direction: WalkPreviewDirection,
): { blockedReason?: string; position: PreviewGridPosition } {
	const delta = WALK_DELTAS[direction];
	const nextPosition = {
		x: position.x + delta.x,
		y: position.y + delta.y,
	};
	const result = resolveMovementAt(
		area,
		nextPosition.x,
		nextPosition.y,
		player,
	);
	if (!result.canMove) {
		return {
			blockedReason: result.reason,
			position,
		};
	}
	return { position: nextPosition };
}

export function getWalkPreviewDirectionFromKey(
	key: string,
): WalkPreviewDirection | undefined {
	if (key === "ArrowUp" || key.toLowerCase() === "w") {
		return "up";
	}
	if (key === "ArrowDown" || key.toLowerCase() === "s") {
		return "down";
	}
	if (key === "ArrowLeft" || key.toLowerCase() === "a") {
		return "left";
	}
	if (key === "ArrowRight" || key.toLowerCase() === "d") {
		return "right";
	}
	return undefined;
}
