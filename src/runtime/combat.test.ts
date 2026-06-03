import { describe, expect, it } from "vitest";
import type { GameArea, NPCInstance, PlayerConfig } from "../types/game";
import {
  canAttack,
  damageNpc,
  damagePlayer,
  findAttackTarget,
  getPlayerCombatStats,
  isNpcAttackable,
  removeDefeatedNpc,
} from "./combat";
import { isNpcTileWalkable } from "./npcMovement";

function makePlayer(patch: Partial<PlayerConfig> = {}): PlayerConfig {
  return {
    name: "Ari",
    mapAvatarId: "scout",
    cutscenePortraitId: "portrait_scout",
    speed: 6,
    health: 100,
    canWalkOn: ["grass"],
    ...patch,
  };
}

function makeNpc(patch: Partial<NPCInstance> = {}): NPCInstance {
  return {
    id: "bandit",
    npcDefinitionId: "npc_bandit",
    areaId: "area_main",
    x: 2,
    y: 1,
    blocksMovement: true,
    movementMode: "stationary",
    attributes: {
      maxHealth: 100,
      health: 100,
      faction: "pirates",
      alignment: "hostile",
      canInteract: true,
      movementSpeed: 1,
    },
    ...patch,
  };
}

function makeArea(npcs: NPCInstance[]): GameArea {
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
    npcs,
    eventBlocks: [],
  };
}

describe("combat helpers", () => {
  it("defaults player combat stats safely", () => {
    expect(getPlayerCombatStats(makePlayer({ health: 5 }))).toEqual({
      maxHealth: 100,
      health: 5,
      attackDamage: 25,
      attackRangeTiles: 1,
      attackCooldownMs: 500,
    });
  });

  it("finds a hostile NPC in front of the player", () => {
    const npc = makeNpc();

    expect(
      findAttackTarget([npc], { [npc.id]: npc.attributes }, new Set(), { x: 1, y: 1 }, { x: 1, y: 0 }, 1)
        ?.id,
    ).toBe("bandit");
  });

  it("does not target defeated or non-hostile NPCs", () => {
    const npc = makeNpc();
    const defeated = new Set([npc.id]);

    expect(isNpcAttackable(npc, npc.attributes, defeated)).toBe(false);
    expect(
      isNpcAttackable(
        makeNpc({ attributes: { ...npc.attributes, alignment: "friendly" } }),
        undefined,
        new Set(),
      ),
    ).toBe(false);
  });

  it("applies NPC damage and reports defeat at zero health", () => {
    const attributes = { ...makeNpc().attributes, health: 20 };

    expect(damageNpc(attributes, 25)).toEqual({ health: 0, defeated: true });
    expect(attributes.health).toBe(0);
  });

  it("prevents attack spam while cooldown is active", () => {
    expect(canAttack(1000, 1000)).toBe(true);
    expect(canAttack(999, 1000)).toBe(false);
  });

  it("applies player damage and reports game over", () => {
    expect(damagePlayer(10, 10)).toEqual({ health: 0, defeated: true });
  });

  it("removes defeated NPCs so they no longer block movement", () => {
    const npc = makeNpc({ x: 1, y: 1 });
    const blockedArea = makeArea([npc]);
    const clearArea = { ...blockedArea, npcs: removeDefeatedNpc(blockedArea.npcs, npc.id) };

    expect(isNpcTileWalkable(blockedArea, "other", 1, 1)).toBe(false);
    expect(isNpcTileWalkable(clearArea, "other", 1, 1)).toBe(true);
  });
});
