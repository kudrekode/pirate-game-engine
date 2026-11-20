import { type Object3D, Vector3 } from "three";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

/** Both wrappers use their own model-forward offset around the same heading. */
export function seatRiderHeading(
	vehicleYaw: number,
	vehicleOffset: number,
	riderOffset: number,
): number {
	return vehicleYaw - vehicleOffset + riderOffset;
}

/** The registry seat is measured from the asset's grounded origin. A saddle
 * bone also follows the animated back of the horse through each stride. */
export function createVehicleSeat(
	vehicle: Object3D,
	seat: NonNullable<ThreeVisualAssetDefinition["mountedSeat"]>,
) {
	const socket = seat.node ? vehicle.getObjectByName(seat.node) : undefined;
	const seatPosition = new Vector3();
	const pelvis = new Vector3();
	return (rider: Object3D, hips: Object3D | undefined) => {
		if (socket) socket.getWorldPosition(seatPosition);
		else vehicle.localToWorld(seatPosition.set(0, seat.height, 0));
		if (hips) {
			hips.getWorldPosition(pelvis);
			// Golden's pelvis joint is nine centimetres above the seat in Ride.
			seatPosition.y += 0.09 * rider.scale.y;
			rider.position.add(seatPosition.sub(pelvis));
		} else rider.position.copy(seatPosition);
	};
}
