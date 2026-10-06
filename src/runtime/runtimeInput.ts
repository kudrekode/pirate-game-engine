import type { RuntimeSessionState } from "./runtimeSession";

// Adapters provide their modal/end presentation state; shops, dialogue and startup are session-owned.
export function isRuntimeGameplayBlocked(
	session: RuntimeSessionState,
	presentationBlocked: boolean,
): boolean {
	return (
		session.startupPending ||
		Boolean(session.activeShopId || session.dialogue) ||
		presentationBlocked
	);
}

export function canAcceptRuntimeInput(
	session: RuntimeSessionState,
	nowMs: number,
	presentationBlocked: boolean,
): boolean {
	return (
		!isRuntimeGameplayBlocked(session, presentationBlocked) &&
		nowMs >= session.nextMoveAt
	);
}
