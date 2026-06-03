import { describe, expect, it } from "vitest";
import type { NPCDefinition, NPCInstance } from "../types/game";
import { resolveNPCInstance } from "./npcResolver";
import { createRuntimeState } from "./ruleEngine";

function makeDefinition(patch: Partial<NPCDefinition> = {}): NPCDefinition {
  return {
    id: "npc_bandit",
    name: "Bandit",
    mapAvatarId: "scout",
    defaultAttributes: {
      maxHealth: 80,
      health: 80,
      faction: "pirates",
      alignment: "hostile",
      canInteract: true,
      movementSpeed: 1.5,
    },
    defaultMovement: {
      movementMode: "patrol",
      movementSpeed: 1.5,
      patrolPath: { loop: true, points: [{ x: 1, y: 1 }, { x: 3, y: 1 }] },
    },
    defaultEnemyBehaviour: {
      enabled: true,
      detectionRadiusTiles: 4,
      chaseRadiusTiles: 7,
      returnToOrigin: true,
      contactDamage: 10,
    },
    ...patch,
  };
}

function makeInstance(patch: Partial<NPCInstance> = {}): NPCInstance {
  return {
    id: "npc_instance_bandit",
    npcDefinitionId: "npc_bandit",
    areaId: "area",
    x: 1,
    y: 1,
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

describe("resolveNPCInstance", () => {
  it("uses NPC definition defaults when an instance has no overrides", () => {
    const resolved = resolveNPCInstance(makeDefinition(), makeInstance());

    expect(resolved.name).toBe("Bandit");
    expect(resolved.attributes).toMatchObject({ faction: "pirates", alignment: "hostile", health: 80 });
    expect(resolved.movementMode).toBe("patrol");
    expect(resolved.patrolPath?.points).toHaveLength(2);
    expect(resolved.enemyBehaviour?.enabled).toBe(true);
  });

  it("lets instance overrides replace definition defaults", () => {
    const resolved = resolveNPCInstance(
      makeDefinition(),
      makeInstance({
        attributesOverride: { health: 25, alignment: "neutral" },
        movementOverride: { movementMode: "wander", wanderZone: { x: 2, y: 2, width: 3, height: 3 } },
        enemyBehaviourOverride: { enabled: false },
      }),
    );

    expect(resolved.attributes).toMatchObject({ health: 25, alignment: "neutral", faction: "pirates" });
    expect(resolved.movementMode).toBe("wander");
    expect(resolved.wanderZone).toEqual({ x: 2, y: 2, width: 3, height: 3 });
    expect(resolved.enemyBehaviour?.enabled).toBe(false);
  });

  it("uses safe fallbacks when defaults are missing", () => {
    const resolved = resolveNPCInstance(undefined, makeInstance({ attributes: { ...makeInstance().attributes, health: 40 } }));

    expect(resolved.name).toBe("NPC");
    expect(resolved.attributes.health).toBe(40);
    expect(resolved.movementMode).toBe("stationary");
    expect(resolved.movementSpeed).toBe(1);
  });

  it("initializes runtime NPC state from resolved definition defaults", () => {
    const runtime = createRuntimeState(
      { flags: {}, variables: {} },
      [makeInstance()],
      [makeDefinition()],
    );

    expect(runtime.npcs.npc_instance_bandit).toMatchObject({
      faction: "pirates",
      alignment: "hostile",
      health: 80,
    });
  });
});
