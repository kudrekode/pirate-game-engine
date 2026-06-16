export type RuntimeDebugEvent = {
	id: number;
	message: string;
};

export function appendRuntimeDebugEvent(
	events: RuntimeDebugEvent[],
	message: string,
	id: number,
	limit = 100,
): RuntimeDebugEvent[] {
	return [...events, { id, message }].slice(-limit);
}
