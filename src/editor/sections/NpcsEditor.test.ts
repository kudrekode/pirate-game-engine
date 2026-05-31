import { describe, expect, it } from "vitest";
import { isNpcDefinitionPlaced } from "./NpcsEditor";

describe("NPC definition deletion guard", () => {
  it("detects definitions still placed in an area", () => {
    const areas = [
      { npcs: [{ npcDefinitionId: "captain" }] },
      { npcs: [] },
    ];

    expect(isNpcDefinitionPlaced(areas, "captain")).toBe(true);
    expect(isNpcDefinitionPlaced(areas, "sailor")).toBe(false);
  });
});

