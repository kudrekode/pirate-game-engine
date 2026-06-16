import type { CameraConfig } from "../types/game";

export const defaultCameraConfig: CameraConfig = {
	viewportWidthTiles: 10,
	viewportHeightTiles: 8,
	followPlayer: true,
	followSmoothing: 0.12,
	deadzoneWidthTiles: 2,
	deadzoneHeightTiles: 2,
};
