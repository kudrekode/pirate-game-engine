import { describe, expect, it } from "vitest";
import { isObjectDefinitionPlaced } from "./ObjectsEditor";

describe("ObjectsEditor helpers", () => {
  it("guards deletion when an object definition is placed", () => {
    expect(
      isObjectDefinitionPlaced(
        [
          { objects: [{ objectDefinitionId: "object_chest" }] },
          { objects: [] },
        ],
        "object_chest",
      ),
    ).toBe(true);

    expect(isObjectDefinitionPlaced([{ objects: [] }], "object_chest")).toBe(false);
  });
});
