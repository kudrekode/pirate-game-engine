/** Three-only defaults. Phaser retains Space attack. No authored binding migration. */
export function getThreeRuntimeAction(event: {
	code: string;
	key: string;
}): "sprint" | "jump" | "attack" | "interact" | undefined {
	if (event.code === "ShiftLeft" || event.code === "ShiftRight")
		return "sprint";
	if (event.code === "Space" || event.key === " ") return "jump";
	if (event.code === "KeyF" || event.key.toLowerCase() === "f") return "attack";
	if (event.key.toLowerCase() === "e" || event.key === "Enter")
		return "interact";
	return undefined;
}
