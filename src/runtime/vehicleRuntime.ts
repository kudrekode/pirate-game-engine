import type { GameArea, PlayerVehicleState } from "../types/game";
import { resolveObjectBehaviour } from "./interactionDiscovery";
import type { VehicleMovementConfig } from "./movement";
import type { RuntimeSessionState } from "./runtimeSession";

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

export function getRuntimeActiveVehicleBehaviour(
	session: RuntimeSessionState,
	area: GameArea,
) {
	const state = session.playerVehicleState;
	if (!state.active) return undefined;
	const object = area.objects.find(
		(entry) => entry.id === state.vehicleObjectInstanceId,
	);
	if (!object) return undefined;
	const behaviour = resolveObjectBehaviour(session.project, object);
	return behaviour.type === "vehicle"
		? { ...behaviour, vehicleObjectInstanceId: object.id }
		: undefined;
}
