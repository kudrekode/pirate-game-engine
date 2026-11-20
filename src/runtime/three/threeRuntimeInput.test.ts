import { expect, it } from "vitest";
import { getThreeRuntimeAction } from "./threeRuntimeInput";

it.each([
	["Space", " ", "jump"],
	["ShiftLeft", "Shift", "sprint"],
	["ShiftRight", "Shift", "sprint"],
	["KeyF", "f", "attack"],
	["KeyF", "F", "attack"],
	["KeyE", "e", "interact"],
	["Enter", "Enter", "interact"],
	["KeyW", "w", undefined],
])("maps Three %s to %s", (code, key, action) => {
	expect(getThreeRuntimeAction({ code: code!, key: key! })).toBe(action);
});
