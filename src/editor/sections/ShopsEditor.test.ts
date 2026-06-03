import { describe, expect, it } from "vitest";
import { isShopReferenced } from "./ShopsEditor";

describe("ShopsEditor helpers", () => {
  it("detects shop references in rule actions", () => {
    expect(
      isShopReferenced(
        [
          {
            actions: [{ type: "open_shop", shopId: "general" }],
          },
        ],
        "general",
      ),
    ).toBe(true);

    expect(isShopReferenced([{ actions: [{ type: "end_game" }] }], "general")).toBe(false);
  });
});
