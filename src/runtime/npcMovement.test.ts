import { describe, expect, it } from "vitest";
import type { GameArea, NPCInstance } from "../types/game";
import {
  generateWanderDestination,
  isNpcTileWalkable,
  updatePatrolNPC,
  updateStationaryNPC,
  updateWanderNPC,
} from "./npcMovement";

function makeArea(patch: Partial<GameArea> = {}): GameArea {
  return {
    id: "area",
    name: "Area",
    kind: "outdoor",
    width: 4,
    height: 4,
    tileSize: 32,
    terrainTiles: Array.from({ length: 16 }, (_, index) => ({
      x: index % 4,
      y: Math.floor(index / 4),
      tileId: "grass",
    })),
    overlayTiles: [],
    structures: [],
    objects: [],
    pickups: [],
    npcs: [],
    eventBlocks: [],
    ...patch,
  };
}

function makeNpc(patch: Partial<NPCInstance> = {}): NPCInstance {
  return {
    id: "npc",
    npcDefinitionId: "definition",
    areaId: "area",
    x: 1,
    y: 1,
    facing: "down",
    blocksMovement: true,
    movementMode: "stationary",
    attributes: {
      maxHealth: 100,
      health: 100,
      faction: "villagers",
      alignment: "friendly",
      canInteract: true,
      movementSpeed: 1,
    },
    ...patch,
  };
}

describe("NPC movement helpers", () => {
  it("keeps stationary NPCs in place", () => {
    expect(updateStationaryNPC(makeNpc())).toMatchObject({ moved: false, x: 1, y: 1, facing: "down" });
  });

  it("progresses through patrol points and updates facing", () => {
    const npc = makeNpc({
      movementMode: "patrol",
      patrolPath: { loop: false, points: [{ x: 1, y: 1 }, { x: 3, y: 1 }] },
    });

    const first = updatePatrolNPC(npc);
    expect(first).toMatchObject({ moved: true, x: 2, y: 1, facing: "right" });

    const second = updatePatrolNPC({ ...npc, x: first.x, y: first.y }, first.state);
    expect(second).toMatchObject({ moved: true, x: 3, y: 1 });

    const stopped = updatePatrolNPC({ ...npc, x: second.x, y: second.y }, second.state);
    expect(stopped.moved).toBe(false);
    expect(stopped.state.stopped).toBe(true);
  });

  it("loops patrol paths", () => {
    const npc = makeNpc({
      x: 2,
      movementMode: "patrol",
      patrolPath: { loop: true, points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
    });

    expect(updatePatrolNPC(npc, { patrolIndex: 1 })).toMatchObject({
      moved: true,
      x: 1,
      y: 1,
      facing: "left",
      state: { patrolIndex: 0 },
    });
  });

  it("generates wander destinations inside a clamped zone", () => {
    const npc = makeNpc({
      movementMode: "wander",
      wanderZone: { x: 3, y: 3, width: 5, height: 5 },
    });

    expect(generateWanderDestination(npc, makeArea(), () => 0.99)).toEqual({ x: 3, y: 3 });
  });

  it("walks toward wander destinations and skips blocked steps", () => {
    const npc = makeNpc({
      movementMode: "wander",
      wanderZone: { x: 0, y: 0, width: 4, height: 4 },
    });

    expect(updateWanderNPC(npc, makeArea(), { patrolIndex: 0, wanderTarget: { x: 3, y: 1 } })).toMatchObject({
      moved: true,
      x: 2,
      y: 1,
    });
    expect(updateWanderNPC(npc, makeArea(), { patrolIndex: 0, wanderTarget: { x: 3, y: 1 } }, () => false).moved).toBe(false);
  });

  it("rejects out-of-bounds and blocked terrain movement", () => {
    const area = makeArea({
      terrainTiles: [
        { x: 0, y: 0, tileId: "grass" },
        { x: 1, y: 0, tileId: "water" },
      ],
    });

    expect(isNpcTileWalkable(area, "npc", -1, 0)).toBe(false);
    expect(isNpcTileWalkable(area, "npc", 1, 0)).toBe(false);
    expect(isNpcTileWalkable(area, "npc", 0, 0)).toBe(true);
  });
});
