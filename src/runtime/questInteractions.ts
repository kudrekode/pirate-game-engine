import type { Interaction } from "../types/game";
import { recordQuestFact } from "./questEngine";
import { runActions } from "./ruleEngine";
import {
	type RuntimeProgressionEventEmitter,
	syncRuntimeQuestProgress,
} from "./runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEventEmitter,
} from "./runtimeRuleActionDispatcher";
import type { RuntimeSessionState } from "./runtimeSession";

export function finishQuestInteraction(
	session: RuntimeSessionState,
	areaId: string,
	targetId: string,
	interaction: Interaction,
	emit: RuntimeRuleEventEmitter,
	progress: RuntimeProgressionEventEmitter,
): void {
	recordQuestFact(
		session.runtimeQuestState,
		"interaction_completed",
		areaId,
		targetId,
	);
	runActions(
		interaction.completionActions ?? [],
		createRuntimeRuleContext(session, emit),
		() => syncRuntimeQuestProgress(session, progress),
	);
}

export function finishQuestConversation(
	session: RuntimeSessionState,
	emit: RuntimeRuleEventEmitter,
	progress: RuntimeProgressionEventEmitter,
): void {
	const pending = session.pendingInteraction;
	session.pendingInteraction = undefined;
	if (pending)
		finishQuestInteraction(
			session,
			pending.areaId,
			pending.targetId,
			pending.interaction,
			emit,
			progress,
		);
}

// Called after an accepted move, never from the render loop. Facts are a bounded
// set of authored targets, so repeated visits do not grow a log or repeat feedback.
export function observeQuestLocation(
	session: RuntimeSessionState,
	progress: RuntimeProgressionEventEmitter,
): void {
	const before = session.runtimeQuestState.facts.size;
	const area = session.project.areas.find(
		(candidate) => candidate.id === session.currentAreaId,
	);
	if (!area) return;
	for (const event of area?.eventBlocks ?? []) {
		if (
			event.x === session.playerPosition.x &&
			event.y === session.playerPosition.y
		)
			recordQuestFact(
				session.runtimeQuestState,
				"enter_event",
				area.id,
				event.id,
			);
	}
	if (before !== session.runtimeQuestState.facts.size)
		syncRuntimeQuestProgress(session, progress);
}
