import { Bone, Group, Vector3 } from "three";
import { expect, it } from "vitest";
import { createVehicleSeat } from "./vehiclePresentation";

it("keeps a rider's pelvis on the moving saddle through a turn and follows its gait", () => {
	const horse = new Group();
	horse.position.set(3, 1, 4);
	horse.rotation.y = Math.PI / 2;
	const saddle = new Bone();
	saddle.name = "Saddle";
	saddle.position.set(0, 1.52, 0.1);
	horse.add(saddle);
	const rider = new Group();
	const hips = new Bone();
	hips.position.y = 0.949;
	rider.add(hips);
	const seatRider = createVehicleSeat(horse, { node: "Saddle", height: 1.52 });
	seatRider(rider, hips);
	expect(hips.getWorldPosition(new Vector3()).x).toBeCloseTo(3.1);
	expect(rider.position.y).toBeCloseTo(1 + 1.52 + 0.09 - 0.949);
	saddle.position.y += 0.04;
	horse.position.z += 2;
	seatRider(rider, hips);
	expect(rider.position.y).toBeCloseTo(1 + 1.56 + 0.09 - 0.949);
	expect(rider.position.z).toBeCloseTo(6);
});

it("places a seated rider on a fixed skiff bench above the keel", () => {
	const skiff = new Group();
	skiff.position.y = -0.19;
	const rider = new Group();
	const hips = new Bone();
	hips.position.y = 0.949;
	rider.add(hips);
	createVehicleSeat(skiff, { height: 0.49 })(rider, hips);
	expect(hips.getWorldPosition(new Vector3()).y).toBeCloseTo(0.39);
});
