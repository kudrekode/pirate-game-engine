import { describe, expect, it } from "vitest";
import { migrateProject } from "./migrateProject";

describe("migrateProject", () => {
  it("migrates a legacy single map into one area", () => {
    const project = migrateProject({
      metadata: { name: "Legacy", version: "0.0.1" },
      map: {
        width: 2,
        height: 1,
        tileSize: 32,
        tiles: [
          { x: 0, y: 0, tileId: "grass" },
          { x: 1, y: 0, tileId: "dirt" },
        ],
        eventBlocks: [],
      },
    });

    expect(project.areas).toHaveLength(1);
    expect(project.areas[0]).toMatchObject({
      id: "area_main",
      name: "Main Area",
      width: 2,
      height: 1,
    });
    expect(project.areas[0].terrainTiles).toEqual([
      { x: 0, y: 0, tileId: "grass" },
      { x: 1, y: 0, tileId: "dirt" },
    ]);
    expect(project.areas[0].pickups).toEqual([]);
    expect(project.areas[0].npcs).toEqual([]);
    expect(project.areas[0].objects).toEqual([]);
    expect(project.items).toEqual([]);
    expect(project.shops).toEqual([]);
    expect(project.quests).toEqual([]);
    expect(project.npcs).toEqual([]);
    expect(project.objects).toEqual([]);
  });

  it("adds default game state when older projects omit it", () => {
    const project = migrateProject({});

    expect(project.gameState.flags).toMatchObject({
      intro_seen: false,
      has_boat: false,
      cave_open: false,
    });
    expect(project.gameState.variables).toMatchObject({
      gold: 3,
      reputation: 0,
    });
    expect(project.gameState.inventory).toEqual({});
  });

  it("migrates flat rule conditions into an AND condition group", () => {
    const project = migrateProject({
      rules: [
        {
          id: "legacy-rule",
          name: "Legacy Rule",
          enabled: true,
          trigger: { type: "on_game_start" },
          conditions: [
            { type: "flag_is", flag: "intro_seen", value: false },
            { type: "variable_compare", variable: "gold", operator: ">=", value: 5 },
          ],
          actions: [{ type: "set_flag", flag: "intro_seen", value: true }],
        },
      ],
    });

    expect(project.rules[0].conditionTree).toMatchObject({
      type: "group",
      operator: "AND",
      conditions: [
        { type: "flag_is", flag: "intro_seen", value: false },
        { type: "variable_compare", variable: "gold", operator: ">=", value: 5 },
      ],
    });
  });

  it("fills missing project fields safely", () => {
    const project = migrateProject({
      metadata: { name: "Partial" },
      areas: [{ id: "partial-area", width: 1, height: 1 }],
    });

    expect(project.metadata).toMatchObject({ name: "Partial", version: "0.1.0" });
    expect(project.camera.viewportWidthTiles).toBeGreaterThan(0);
    expect(project.player.mapAvatarId).toBeTruthy();
    expect(project.ruleGroups).toEqual([]);
    expect(project.rules).toEqual([]);
    expect(project.items).toEqual([]);
    expect(project.shops).toEqual([]);
    expect(project.quests).toEqual([]);
    expect(project.npcs).toEqual([]);
    expect(project.objects).toEqual([]);
  });

  it("migrates object definitions and placed object instances", () => {
    const project = migrateProject({
      objects: [{ id: "sign", name: "Sign", category: "sign", widthTiles: 1, heightTiles: 1, defaultBehaviour: { type: "sign", text: "Hello" } }],
      areas: [
        {
          id: "area_main",
          width: 2,
          height: 2,
          objects: [{ id: "sign-instance", objectDefinitionId: "sign", x: 1, y: 1, widthTiles: 1, heightTiles: 1, state: { read: false } }],
        },
      ],
    });

    expect(project.objects[0]).toMatchObject({
      id: "sign",
      name: "Sign",
      category: "sign",
      widthTiles: 1,
      heightTiles: 1,
      blocksMovement: false,
      defaultBehaviour: { type: "sign", text: "Hello" },
    });
    expect(project.areas[0].objects[0]).toMatchObject({
      id: "sign-instance",
      objectDefinitionId: "sign",
      areaId: "area_main",
      x: 1,
      y: 1,
      widthTiles: 1,
      heightTiles: 1,
      state: { read: false },
    });
  });

  it("migrates inventory rules and pickups", () => {
    const project = migrateProject({
      areas: [
        {
          id: "area_test",
          width: 2,
          height: 2,
          pickups: [{ id: "pickup_key", itemId: "tavern_key", quantity: 1, x: 1, y: 1 }],
        },
      ],
      items: [{ id: "tavern_key", name: "Tavern Key", category: "key", stackable: false }],
      gameState: { flags: {}, variables: {}, inventory: { tavern_key: 1 } },
      rules: [
        {
          id: "key-rule",
          name: "Use key",
          trigger: { type: "on_game_start" },
          conditionTree: { type: "has_item", itemId: "tavern_key" },
          actions: [{ type: "remove_item", itemId: "tavern_key", quantity: 1 }],
        },
      ],
    });

    expect(project.areas[0].pickups[0]).toMatchObject({
      id: "pickup_key",
      areaId: "area_test",
      pickupMode: "on_touch",
      once: true,
    });
    expect(project.gameState.inventory).toEqual({ tavern_key: 1 });
    expect(project.rules[0].conditionTree).toMatchObject({ type: "has_item", quantity: 1 });
    expect(project.rules[0].actions[0]).toEqual({ type: "remove_item", itemId: "tavern_key", quantity: 1 });
  });

  it("migrates shops and open shop rule actions", () => {
    const project = migrateProject({
      items: [{ id: "gold_coin", name: "Gold Coin", category: "currency", stackable: true }],
      shops: [
        {
          id: "general",
          name: "General Store",
          currencyItemId: "gold_coin",
          entries: [{ id: "key", itemId: "tavern_key", buyPrice: 5, stock: 1 }],
        },
      ],
      rules: [
        {
          id: "merchant",
          name: "Merchant",
          trigger: { type: "on_interact", targetId: "npc-merchant" },
          actions: [{ type: "open_shop", shopId: "general" }],
        },
      ],
    });

    expect(project.shops[0]).toEqual({
      id: "general",
      name: "General Store",
      currencyItemId: "gold_coin",
      entries: [{ id: "key", itemId: "tavern_key", buyPrice: 5, stock: 1 }],
    });
    expect(project.rules[0].actions[0]).toEqual({ type: "open_shop", shopId: "general" });
  });

  it("migrates quests and defaults missing quest fields", () => {
    const project = migrateProject({
      trackedQuestId: "quest_test",
      quests: [
        {
          id: "quest_test",
          name: "Test Quest",
          status: "active",
          objectives: [
            { description: "Enter", condition: { type: "enter_area", areaId: "area_house" } },
          ],
          rewards: [{ type: "item", itemId: "boat_pass", quantity: 1 }],
        },
      ],
    });

    expect(project.trackedQuestId).toBe("quest_test");
    expect(project.quests[0]).toMatchObject({
      id: "quest_test",
      status: "active",
      objectives: [{ description: "Enter", condition: { type: "enter_area", areaId: "area_house" } }],
      rewards: [{ type: "item", itemId: "boat_pass", quantity: 1 }],
    });
  });

  it("migrates NPC definitions and placed NPC instances", () => {
    const project = migrateProject({
      npcs: [{ id: "captain", name: "Captain Mira", mapAvatarId: "ranger" }],
      areas: [
        {
          id: "area_main",
          width: 2,
          height: 2,
          npcs: [{ id: "captain-instance", npcDefinitionId: "captain", x: 1, y: 1 }],
        },
      ],
    });

    expect(project.npcs[0]).toMatchObject({ id: "captain", name: "Captain Mira", mapAvatarId: "ranger" });
    expect(project.areas[0].npcs[0]).toMatchObject({
      id: "captain-instance",
      npcDefinitionId: "captain",
      areaId: "area_main",
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
    });
  });
});
