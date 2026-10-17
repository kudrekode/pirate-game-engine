import { useCallback, useRef, useState } from "react";
import type { GameProject } from "../types/game";
import type { QuestView } from "./questEngine";
import { getQuestTrackerState } from "./runtimeHud";

export function questProgressMessages(
	before: QuestView[],
	after: QuestView[],
): string[] {
	const messages: string[] = [];
	for (const quest of after) {
		const previous = before.find((entry) => entry.id === quest.id);
		const justCompleted =
			quest.status === "completed" &&
			(previous
				? previous.status !== "completed"
				: quest.completedThisSession === true);
		if (
			(quest.status === "active" || quest.status === "completed") &&
			previous?.status !== quest.status &&
			previous?.status !== "active"
		) {
			if (
				quest.status === "active" ||
				previous?.status === "inactive" ||
				justCompleted
			)
				messages.push(`New Quest: ${quest.name}`);
		}
		for (const objective of quest.objectives) {
			if (
				objective.complete &&
				!previous?.objectives.find((entry) => entry.id === objective.id)
					?.complete &&
				(previous || quest.status === "active" || justCompleted)
			)
				messages.push(`Objective Complete: ${objective.description}`);
		}
		const current = quest.objectives.find(
			(objective) => objective.state === "active" && !objective.complete,
		);
		const oldCurrent = previous?.objectives.find(
			(objective) => objective.state === "active" && !objective.complete,
		);
		if (quest.status === "active" && current && current.id !== oldCurrent?.id)
			messages.push(`New Objective: ${current.description}`);
		if (justCompleted)
			messages.push(
				`Quest Complete: ${quest.name}${quest.completionMessage ? ` — ${quest.completionMessage}` : ""}`,
			);
	}
	return messages;
}

export function useQuestPresentation(notify: (message: string) => void) {
	const previous = useRef<QuestView[]>([]);
	const [quests, update] = useState<QuestView[]>([]);
	const setQuests = useCallback(
		(next: QuestView[]) => {
			questProgressMessages(previous.current, next).forEach(notify);
			previous.current = next;
			update(next);
		},
		[notify],
	);
	return { quests, setQuests };
}

export function QuestObjectiveTracker({
	project,
	quests,
	className = "quest-tracker",
}: {
	project: GameProject;
	quests: QuestView[];
	className?: string;
}) {
	if (!project.quests.length) return null;
	const tracker = getQuestTrackerState(project, quests);
	if (tracker.kind !== "quest")
		return (
			<aside className={className} aria-label="Current objective">
				<strong>{tracker.title}</strong>
			</aside>
		);
	const current = tracker.quest.objectives.find(
		(objective) => !objective.complete && objective.state !== "inactive",
	);
	return (
		<aside className={className} aria-label="Current objective">
			<strong>{tracker.quest.name}</strong>
			<span>{current?.description ?? "No objectives configured"}</span>
		</aside>
	);
}
