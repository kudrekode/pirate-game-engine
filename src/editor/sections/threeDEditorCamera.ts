import {
	getOrbitCameraPosition,
	type OrbitCameraState,
} from "../../runtime/three/cameraControls";

const FLY_LOOK_SENSITIVITY = 0.004;

export function rotateEditorFlyCamera(
	state: OrbitCameraState,
	deltaX: number,
	deltaY: number,
	maxPitch: number,
): OrbitCameraState {
	const position = getOrbitCameraPosition(state);
	const yaw = state.yaw - deltaX * FLY_LOOK_SENSITIVITY;
	const pitch = Math.max(
		-maxPitch,
		Math.min(maxPitch, state.pitch + deltaY * FLY_LOOK_SENSITIVITY),
	);
	const horizontal = Math.cos(pitch) * state.distance;
	return {
		...state,
		yaw,
		pitch,
		focus: {
			x: position.x - Math.sin(yaw) * horizontal,
			y: position.y - Math.sin(pitch) * state.distance,
			z: position.z - Math.cos(yaw) * horizontal,
		},
	};
}

export function moveEditorFlyCamera(
	state: OrbitCameraState,
	input: { forward: number; right: number; up: number },
	distance: number,
): OrbitCameraState {
	const horizontal = Math.cos(state.pitch) * input.forward;
	const sinYaw = Math.sin(state.yaw);
	const cosYaw = Math.cos(state.yaw);
	const x = cosYaw * input.right - sinYaw * horizontal;
	const y = input.up - Math.sin(state.pitch) * input.forward;
	const z = -sinYaw * input.right - cosYaw * horizontal;
	const magnitude = Math.hypot(x, y, z);
	if (magnitude === 0 || distance === 0) return state;
	const factor = distance / magnitude;
	return {
		...state,
		focus: {
			x: state.focus.x + x * factor,
			y: state.focus.y + y * factor,
			z: state.focus.z + z * factor,
		},
	};
}

export function isMapEditorInputBlocked(
	target: EventTarget | null,
	ownerDocument: Document = document,
): boolean {
	if (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			Boolean(
				target.closest("input, select, textarea, [contenteditable='true']"),
			))
	) {
		return true;
	}
	return Array.from(
		ownerDocument.querySelectorAll("dialog[open], [role='dialog']:not(dialog)"),
	).some((dialog) => !dialog.closest("[hidden], [aria-hidden='true']"));
}
