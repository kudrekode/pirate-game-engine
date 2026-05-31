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
    expect(project.items).toEqual([]);
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
});
