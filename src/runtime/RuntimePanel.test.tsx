import { describe, expect, it } from "vitest";
import { blankProject } from "../data/projectPresets";
import type { QuestView } from "./questEngine";
import { getCurrencyHudEntries, getQuestTrackerState } from "./runtimeHud";

describe("runtime HUD helpers", () => {
	it("shows all owned inventory currency items", () => {
		const project = {
			...blankProject,
			items: [
				{
					id: "silver",
					name: "Silver",
					category: "currency" as const,
					stackable: true,
					maxStack: 999,
				},
				{
					id: "apple",
					name: "Apple",
					category: "consumable" as const,
					stackable: true,
					maxStack: 12,
				},
			],
		};

		expect(getCurrencyHudEntries(project, { silver: 4, apple: 2 })).toEqual([
			{ id: "silver", name: "Silver", quantity: 4 },
		]);
	});

	it("falls back to the first active quest when no tracked quest is selected", () => {
		const quests: QuestView[] = [
			{
				id: "quest-a",
				name: "Quest A",
				status: "active",
				objectives: [],
			},
		];

		expect(getQuestTrackerState(blankProject, quests)).toMatchObject({
			kind: "quest",
			quest: quests[0],
		});
	});

	it("shows a completed tracked quest state instead of hiding the tracker", () => {
		const project = { ...blankProject, trackedQuestId: "quest-a" };
		const quests: QuestView[] = [
			{
				id: "quest-a",
				name: "Quest A",
				status: "completed",
				objectives: [],
			},
		];

		expect(getQuestTrackerState(project, quests)).toMatchObject({
			kind: "message",
			title: "Tracked quest completed",
			message: "Quest A completed.",
		});
	});
});
