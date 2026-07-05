import type { CameraConfig, ThreeRuntimeCameraConfig } from "../types/game";

export const defaultThreeRuntimeCameraConfig: ThreeRuntimeCameraConfig = {
	style: "fixedIsometric",
	distance: 6,
	height: 1.5,
	pitchDegrees: 18,
	yawOffsetDegrees: 0,
	lookAtHeight: 0.2,
	followSmoothing: 9,
	lookSmoothing: 9,
	allowRuntimeOrbit: true,
};

export const defaultCameraConfig: CameraConfig = {
	viewportWidthTiles: 10,
	viewportHeightTiles: 8,
	followPlayer: true,
	followSmoothing: 0.12,
	deadzoneWidthTiles: 2,
	deadzoneHeightTiles: 2,
	three: defaultThreeRuntimeCameraConfig,
};
