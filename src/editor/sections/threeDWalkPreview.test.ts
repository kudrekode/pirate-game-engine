import { describe, expect, it } from "vitest";
import type { GameArea, PlayerConfig } from "../../types/game";
import {
	getWalkPreviewDirectionFromKey,
	getWalkPreviewStart,
	moveWalkPreview,
} from "./threeDWalkPreview";

const player: PlayerConfig = {
	canWalkOn: ["grass", "dirt"],
	cutscenePortraitId: "portrait",
	health: 5,
	mapAvatarId: "scout",
	name: "Ari",
	speed: 6,
};

function makeArea(overrides: Partial<GameArea> = {}): GameArea {
	const width = overrides.width ?? 5;
	const height = overrides.height ?? 5;
	return {
		eventBlocks: [],
		height,
		id: "area",
		kind: "outdoor",
		name: "Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: Array.from({ length: height }).flatMap((_, y) =>
			Array.from({ length: width }).map((__, x) => ({
				tileId: "grass",
				x,
				y,
			})),
		),
		tileSize: 32,
		width,
		...overrides,
	};
}

describe("3D walk preview helpers", () => {
	it("starts at the first spawn block, then first event, then map centre", () => {
		expect(
			getWalkPreviewStart(
				makeArea({
					eventBlocks: [
						{
							id: "trigger",
							kind: "trigger",
							name: "Trigger",
							tag: "trigger",
							x: 4,
							y: 4,
						},
						{
							id: "spawn",
							kind: "spawn",
							name: "Spawn",
							tag: "spawn",
							x: 1,
							y: 2,
						},
					],
				}),
			),
		).toEqual({ x: 1, y: 2 });
		expect(
			getWalkPreviewStart(
				makeArea({
					eventBlocks: [
						{
							id: "trigger",
							kind: "trigger",
							name: "Trigger",
							tag: "trigger",
							x: 4,
							y: 4,
						},
					],
				}),
			),
		).toEqual({ x: 4, y: 4 });
		expect(getWalkPreviewStart(makeArea())).toEqual({ x: 2, y: 2 });
	});

	it("moves tile-to-tile and respects existing movement collision", () => {
		const area = makeArea({
			structures: [
				{
					blocksMovement: true,
					heightTiles: 1,
					id: "wall",
					name: "Wall",
					structureId: "small_house",
					widthTiles: 1,
					x: 3,
					y: 2,
				},
			],
		});

		expect(moveWalkPreview(area, player, { x: 2, y: 2 }, "up")).toEqual({
			position: { x: 2, y: 1 },
		});
		expect(moveWalkPreview(area, player, { x: 2, y: 2 }, "right")).toEqual({
			blockedReason: "Blocked by Wall.",
			position: { x: 2, y: 2 },
		});
	});

	it("maps WASD and arrow keys to grid directions", () => {
		expect(getWalkPreviewDirectionFromKey("w")).toBe("up");
		expect(getWalkPreviewDirectionFromKey("ArrowDown")).toBe("down");
		expect(getWalkPreviewDirectionFromKey("A")).toBe("left");
		expect(getWalkPreviewDirectionFromKey("ArrowRight")).toBe("right");
		expect(getWalkPreviewDirectionFromKey("Enter")).toBeUndefined();
	});
});
