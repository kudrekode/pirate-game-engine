import { describe, expect, it } from "vitest";
import type { GameArea, PlayerConfig } from "../types/game";
import { resolveMovementAt } from "./movement";

const player: PlayerConfig = {
  name: "Ari",
  mapAvatarId: "scout",
  cutscenePortraitId: "portrait_scout",
  speed: 6,
  health: 5,
  canWalkOn: ["grass", "dirt"],
};

function makeArea(patch: Partial<GameArea> = {}): GameArea {
  return {
    id: "test-area",
    name: "Test Area",
    kind: "outdoor",
    width: 2,
    height: 2,
    tileSize: 32,
    terrainTiles: [
      { x: 0, y: 0, tileId: "grass" },
      { x: 1, y: 0, tileId: "water" },
      { x: 0, y: 1, tileId: "grass" },
      { x: 1, y: 1, tileId: "grass" },
    ],
    overlayTiles: [],
    structures: [],
    eventBlocks: [],
    ...patch,
    pickups: patch.pickups ?? [],
    npcs: patch.npcs ?? [],
  };
}

describe("resolveMovementAt", () => {
  it("allows walkable terrain", () => {
    expect(resolveMovementAt(makeArea(), 0, 0, player).canMove).toBe(true);
  });

  it("blocks terrain the player cannot walk on", () => {
    expect(resolveMovementAt(makeArea(), 1, 0, player)).toMatchObject({
      canMove: false,
      reason: "Blocked by Water.",
    });
  });

  it("allows a walkable overlay to override blocked terrain", () => {
    const area = makeArea({
      overlayTiles: [{ x: 1, y: 0, overlayId: "wooden_planks" }],
    });

    expect(resolveMovementAt(area, 1, 0, player).canMove).toBe(true);
  });

  it("blocks movement through structures", () => {
    const area = makeArea({
      structures: [
        {
          id: "house",
          structureId: "small_house",
          name: "House",
          x: 0,
          y: 1,
          widthTiles: 1,
          heightTiles: 1,
          blocksMovement: true,
        },
      ],
    });

    expect(resolveMovementAt(area, 0, 1, player)).toMatchObject({
      canMove: false,
      reason: "Blocked by House.",
    });
  });

  it("blocks out-of-bounds movement", () => {
    expect(resolveMovementAt(makeArea(), -1, 0, player)).toMatchObject({
      canMove: false,
      reason: "Out of bounds.",
    });
  });

  it("blocks movement through NPC instances", () => {
    const area = makeArea({
      npcs: [
        {
          id: "captain",
          npcDefinitionId: "captain-definition",
          areaId: "test-area",
          x: 0,
          y: 1,
          blocksMovement: true,
          movementMode: "stationary",
        },
      ],
    });

    expect(resolveMovementAt(area, 0, 1, player)).toMatchObject({
      canMove: false,
      reason: "Blocked by NPC.",
    });
  });
});
