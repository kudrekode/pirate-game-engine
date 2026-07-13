export type OrbitCameraPreset = "top" | "isometric" | "low";

export type CameraVector3 = {
	x: number;
	y: number;
	z: number;
};

export type OrbitCameraState = {
	distance: number;
	focus: CameraVector3;
	pitch: number;
	yaw: number;
};

export type OrbitCameraBounds = {
	maxDistance: number;
	maxPitch: number;
	minDistance: number;
	minPitch: number;
};

export type OrbitCameraDimensions = {
	height: number;
	width: number;
};

export type ThirdPersonCameraOptions = {
	distance: number;
	height: number;
	lookAtHeight: number;
	pitchDegrees: number;
	yawDegrees: number;
};

export type CameraRig = {
	lookAt: CameraVector3;
	position: CameraVector3;
};

export type GridDirection = {
	x: number;
	y: number;
};

export type ThirdPersonMouseLookState = {
	currentPitchOffsetDegrees: number;
	currentYawOffsetDegrees: number;
	targetPitchOffsetDegrees: number;
	targetYawOffsetDegrees: number;
};

export type ThirdPersonMouseLookOptions = {
	maxPitchDegrees?: number;
	minPitchDegrees?: number;
	pitchSensitivityDegrees?: number;
	yawSensitivityDegrees?: number;
};

const DEFAULT_FOCUS: CameraVector3 = { x: 0, y: 0, z: 0 };
const DEFAULT_CAMERA_BASE_DISTANCE_SCALE = 0.9;
const DEFAULT_MIN_DISTANCE = 3;
const DEFAULT_MIN_PITCH = (3 * Math.PI) / 180;
const DEFAULT_MAX_PITCH = (86 * Math.PI) / 180;
const DEFAULT_THIRD_PERSON_MIN_PITCH_DEGREES = -10;
const DEFAULT_THIRD_PERSON_MAX_PITCH_DEGREES = 75;
const DEFAULT_THIRD_PERSON_YAW_SENSITIVITY_DEGREES = 0.22;
const DEFAULT_THIRD_PERSON_PITCH_SENSITIVITY_DEGREES = 0.18;
const ORBIT_SENSITIVITY = 0.005;
const PAN_SENSITIVITY = 0.0016;
const ZOOM_SENSITIVITY = 0.0015;
const CARDINAL_SNAP_EPSILON = 0.000001;

function cloneFocus(focus: CameraVector3 = DEFAULT_FOCUS): CameraVector3 {
	return { x: focus.x, y: focus.y, z: focus.z };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function lerp(start: number, end: number, alpha: number): number {
	const clampedAlpha = clamp(alpha, 0, 1);
	return start + (end - start) * clampedAlpha;
}

function snapVectorToCardinalDirection(x: number, y: number): GridDirection {
	if (Math.abs(x) + CARDINAL_SNAP_EPSILON >= Math.abs(y)) {
		return { x: x >= 0 ? 1 : -1, y: 0 };
	}
	return { x: 0, y: y >= 0 ? 1 : -1 };
}

function getBaseCameraDistance(dimensions: OrbitCameraDimensions): number {
	return (
		Math.max(dimensions.width, dimensions.height, 8) *
		DEFAULT_CAMERA_BASE_DISTANCE_SCALE
	);
}

function getPresetOffset(
	preset: OrbitCameraPreset,
	dimensions: OrbitCameraDimensions,
): CameraVector3 {
	const baseDistance = getBaseCameraDistance(dimensions);
	if (preset === "top") {
		return { x: 0, y: baseDistance * 1.35, z: baseDistance * 0.08 };
	}
	if (preset === "low") {
		return {
			x: baseDistance * 1.1,
			y: baseDistance * 0.38,
			z: baseDistance * 1.1,
		};
	}
	return { x: baseDistance, y: baseDistance * 0.85, z: baseDistance };
}

function stateFromOffset(
	offset: CameraVector3,
	focus: CameraVector3,
	bounds: OrbitCameraBounds,
): OrbitCameraState {
	const distance = Math.max(0.0001, Math.hypot(offset.x, offset.y, offset.z));
	return clampOrbitCameraState(
		{
			distance,
			focus: cloneFocus(focus),
			pitch: Math.asin(clamp(offset.y / distance, -1, 1)),
			yaw: Math.atan2(offset.x, offset.z),
		},
		bounds,
	);
}

export function getOrbitCameraBounds(
	dimensions: OrbitCameraDimensions,
): OrbitCameraBounds {
	const baseDistance = getBaseCameraDistance(dimensions);
	return {
		maxDistance: Math.max(DEFAULT_MIN_DISTANCE * 2, baseDistance * 5),
		maxPitch: DEFAULT_MAX_PITCH,
		minDistance: DEFAULT_MIN_DISTANCE,
		minPitch: DEFAULT_MIN_PITCH,
	};
}

export function createOrbitCameraState(
	preset: OrbitCameraPreset,
	dimensions: OrbitCameraDimensions,
	focus: CameraVector3 = DEFAULT_FOCUS,
	bounds: OrbitCameraBounds = getOrbitCameraBounds(dimensions),
): OrbitCameraState {
	return stateFromOffset(getPresetOffset(preset, dimensions), focus, bounds);
}

export function createOrbitCameraStateFromView(
	position: CameraVector3,
	focus: CameraVector3,
	bounds: OrbitCameraBounds,
): OrbitCameraState {
	return stateFromOffset(
		{
			x: position.x - focus.x,
			y: position.y - focus.y,
			z: position.z - focus.z,
		},
		focus,
		bounds,
	);
}

export function resetOrbitCameraState(
	dimensions: OrbitCameraDimensions,
	focus: CameraVector3 = DEFAULT_FOCUS,
): OrbitCameraState {
	return createOrbitCameraState("isometric", dimensions, focus);
}

export function clampOrbitCameraState(
	state: OrbitCameraState,
	bounds: OrbitCameraBounds,
): OrbitCameraState {
	return {
		distance: clamp(state.distance, bounds.minDistance, bounds.maxDistance),
		focus: cloneFocus(state.focus),
		pitch: clamp(state.pitch, bounds.minPitch, bounds.maxPitch),
		yaw: state.yaw,
	};
}

export function getOrbitCameraPosition(state: OrbitCameraState): CameraVector3 {
	const horizontalDistance = Math.cos(state.pitch) * state.distance;
	return {
		x: state.focus.x + Math.sin(state.yaw) * horizontalDistance,
		y: state.focus.y + Math.sin(state.pitch) * state.distance,
		z: state.focus.z + Math.cos(state.yaw) * horizontalDistance,
	};
}

export function getOrbitCameraLookTarget(
	state: OrbitCameraState,
): CameraVector3 {
	return cloneFocus(state.focus);
}

export function getThirdPersonCameraRig(
	playerPosition: CameraVector3,
	options: ThirdPersonCameraOptions,
): CameraRig {
	const distance = Math.max(0.1, options.distance);
	const pitch = degreesToRadians(clamp(options.pitchDegrees, -89, 89));
	const yaw = degreesToRadians(options.yawDegrees);
	const horizontalDistance = Math.cos(pitch) * distance;
	return {
		lookAt: {
			x: playerPosition.x,
			y: playerPosition.y + options.lookAtHeight,
			z: playerPosition.z,
		},
		position: {
			x: playerPosition.x + Math.sin(yaw) * horizontalDistance,
			y: playerPosition.y + options.height + Math.sin(pitch) * distance,
			z: playerPosition.z + Math.cos(yaw) * horizontalDistance,
		},
	};
}

export function resolveCameraRelativeGridDirection(
	inputDirection: GridDirection,
	cameraYawDegrees: number,
): GridDirection {
	const yaw = degreesToRadians(cameraYawDegrees);
	const forward = {
		x: -Math.sin(yaw),
		y: -Math.cos(yaw),
	};
	const right = {
		x: Math.cos(yaw),
		y: -Math.sin(yaw),
	};
	const intended = {
		x: right.x * inputDirection.x + forward.x * -inputDirection.y,
		y: right.y * inputDirection.x + forward.y * -inputDirection.y,
	};
	return snapVectorToCardinalDirection(intended.x, intended.y);
}

export function createThirdPersonMouseLookState(
	overrides: Partial<ThirdPersonMouseLookState> = {},
): ThirdPersonMouseLookState {
	return {
		currentPitchOffsetDegrees: 0,
		currentYawOffsetDegrees: 0,
		targetPitchOffsetDegrees: 0,
		targetYawOffsetDegrees: 0,
		...overrides,
	};
}

export function getThirdPersonMouseLookPitchDegrees(
	basePitchDegrees: number,
	state: ThirdPersonMouseLookState,
): number {
	return basePitchDegrees + state.currentPitchOffsetDegrees;
}

export function getThirdPersonMouseLookYawOffsetDegrees(
	state: ThirdPersonMouseLookState,
): number {
	return state.currentYawOffsetDegrees;
}

export function updateThirdPersonMouseLookTarget(
	state: ThirdPersonMouseLookState,
	deltaX: number,
	deltaY: number,
	basePitchDegrees: number,
	options: ThirdPersonMouseLookOptions = {},
): ThirdPersonMouseLookState {
	const yawSensitivity =
		options.yawSensitivityDegrees ??
		DEFAULT_THIRD_PERSON_YAW_SENSITIVITY_DEGREES;
	const pitchSensitivity =
		options.pitchSensitivityDegrees ??
		DEFAULT_THIRD_PERSON_PITCH_SENSITIVITY_DEGREES;
	const minPitch =
		options.minPitchDegrees ?? DEFAULT_THIRD_PERSON_MIN_PITCH_DEGREES;
	const maxPitch =
		options.maxPitchDegrees ?? DEFAULT_THIRD_PERSON_MAX_PITCH_DEGREES;
	const targetPitch = clamp(
		basePitchDegrees +
			state.targetPitchOffsetDegrees -
			deltaY * pitchSensitivity,
		minPitch,
		maxPitch,
	);
	return {
		...state,
		targetPitchOffsetDegrees: targetPitch - basePitchDegrees,
		targetYawOffsetDegrees:
			state.targetYawOffsetDegrees + deltaX * yawSensitivity,
	};
}

export function advanceThirdPersonMouseLook(
	state: ThirdPersonMouseLookState,
	alpha: number,
): ThirdPersonMouseLookState {
	return {
		...state,
		currentPitchOffsetDegrees: lerp(
			state.currentPitchOffsetDegrees,
			state.targetPitchOffsetDegrees,
			alpha,
		),
		currentYawOffsetDegrees: lerp(
			state.currentYawOffsetDegrees,
			state.targetYawOffsetDegrees,
			alpha,
		),
	};
}

export function rotateOrbitCamera(
	state: OrbitCameraState,
	deltaX: number,
	deltaY: number,
	bounds: OrbitCameraBounds,
): OrbitCameraState {
	return clampOrbitCameraState(
		{
			...state,
			yaw: state.yaw + deltaX * ORBIT_SENSITIVITY,
			pitch: state.pitch - deltaY * ORBIT_SENSITIVITY,
		},
		bounds,
	);
}

export function zoomOrbitCamera(
	state: OrbitCameraState,
	wheelDeltaY: number,
	bounds: OrbitCameraBounds,
): OrbitCameraState {
	const scale = 1 + wheelDeltaY * ZOOM_SENSITIVITY;
	return clampOrbitCameraState(
		{
			...state,
			distance: state.distance * Math.max(0.1, scale),
		},
		bounds,
	);
}

export function panOrbitCamera(
	state: OrbitCameraState,
	deltaX: number,
	deltaY: number,
): OrbitCameraState {
	const scale = state.distance * PAN_SENSITIVITY;
	const right = { x: Math.cos(state.yaw), z: -Math.sin(state.yaw) };
	const backward = { x: Math.sin(state.yaw), z: Math.cos(state.yaw) };
	const horizontal = -deltaX * scale;
	const depth = deltaY * scale;
	return {
		...state,
		focus: {
			x: state.focus.x + right.x * horizontal + backward.x * depth,
			y: state.focus.y,
			z: state.focus.z + right.z * horizontal + backward.z * depth,
		},
	};
}
