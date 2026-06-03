import { describe, expect, it } from "vitest";
import type { VehicleMovementConfig } from "./movement";
import { createBoardedVehicleState } from "./vehicleRuntime";

describe("vehicle runtime helpers", () => {
  it("creates active vehicle state when boarding a boat", () => {
    const boat: VehicleMovementConfig = {
      type: "vehicle",
      vehicleType: "boat",
      movementMode: "sail",
      allowedTerrainIds: ["water"],
      dismountAllowedTerrainIds: ["grass"],
    };

    expect(createBoardedVehicleState("boat_1", boat)).toEqual({
      active: true,
      vehicleObjectInstanceId: "boat_1",
      vehicleType: "boat",
      movementMode: "sail",
    });
  });
});
