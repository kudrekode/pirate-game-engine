import type { GameProject } from "../types/game";
import type { QuestView } from "./questEngine";

export type QuestTrackerState =
	| { kind: "quest"; label: string; quest: QuestView }
	| { kind: "message"; label: string; title: string; message: string };

export function getCurrencyHudEntries(
	project: GameProject,
	inventory: Record<string, number>,
) {
	return project.items
		.filter((item) => item.category === "currency")
		.map((item) => ({
			id: item.id,
			name: item.name,
			quantity: inventory[item.id] ?? 0,
		}))
		.filter((entry) => entry.quantity > 0);
}

export function getQuestTrackerState(
	project: GameProject,
	quests: QuestView[],
): QuestTrackerState {
	const trackedQuest = project.trackedQuestId
		? quests.find((quest) => quest.id === project.trackedQuestId)
		: undefined;
	if (trackedQuest?.status === "active") {
		return { kind: "quest", label: "Current Quest", quest: trackedQuest };
	}

	if (!project.trackedQuestId) {
		const firstActiveQuest = quests.find((quest) => quest.status === "active");
		if (firstActiveQuest) {
			return { kind: "quest", label: "Current Quest", quest: firstActiveQuest };
		}
		return {
			kind: "message",
			label: "Quest Tracker",
			title: "No active quest",
			message: "No tracked quest selected.",
		};
	}

	if (trackedQuest?.status === "completed") {
		return {
			kind: "message",
			label: "Quest Tracker",
			title: "Tracked quest completed",
			message: `${trackedQuest.name} completed.`,
		};
	}

	if (trackedQuest) {
		return {
			kind: "message",
			label: "Quest Tracker",
			title: "No active quest",
			message: `${trackedQuest.name} is ${trackedQuest.status}.`,
		};
	}

	return {
		kind: "message",
		label: "Quest Tracker",
		title: "No tracked quest selected",
		message: "Tracked quest not found.",
	};
}
