import type { PlayerVehicleState } from "../types/game";
import type { VehicleMovementConfig } from "./movement";

export function createBoardedVehicleState(
	vehicleObjectInstanceId: string,
	behaviour: VehicleMovementConfig,
): PlayerVehicleState {
	return {
		active: true,
		vehicleObjectInstanceId,
		vehicleType: behaviour.vehicleType,
		movementMode: behaviour.movementMode,
	};
}
