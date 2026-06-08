import { describe, expect, it } from "vitest";
import { defaultProject } from "./defaultProject";
import { cloneProject } from "./migrateProject";
import { validateProject } from "./validateProject";

describe("validateProject", () => {
	it("detects a missing item referenced by a rule", () => {
		const project = cloneProject(defaultProject);
		project.rules[0].actions.push({
			type: "give_item",
			itemId: "missing_item",
			quantity: 1,
		});

		const issues = validateProject(project);

		expect(
			issues.some(
				(issue) =>
					issue.entityType === "Rule" &&
					issue.message.includes('missing item "missing_item"'),
			),
		).toBe(true);
	});

	it("detects a missing event block referenced by teleport", () => {
		const project = cloneProject(defaultProject);
		project.rules[0].actions.push({
			type: "teleport",
			areaId: project.areas[0].id,
			eventBlockId: "missing_event",
		});

		const issues = validateProject(project);

		expect(
			issues.some((issue) =>
				issue.message.includes('missing event block "missing_event"'),
			),
		).toBe(true);
	});

	it("detects a missing quest objective item", () => {
		const project = cloneProject(defaultProject);
		project.quests[0].objectives.push({
			id: "missing_item_objective",
			description: "Find the missing item",
			condition: { type: "has_item", itemId: "missing_item", quantity: 1 },
		});

		const issues = validateProject(project);

		expect(
			issues.some(
				(issue) =>
					issue.entityType === "Quest" &&
					issue.message.includes('missing item "missing_item"'),
			),
		).toBe(true);
	});

	it("detects a missing shop currency", () => {
		const project = cloneProject(defaultProject);
		project.shops[0].currencyItemId = "missing_currency";

		const issues = validateProject(project);

		expect(
			issues.some(
				(issue) =>
					issue.entityType === "Shop" &&
					issue.message.includes('missing currency item "missing_currency"'),
			),
		).toBe(true);
	});

	it("has no errors or known warnings for the default demo project", () => {
		expect(validateProject(cloneProject(defaultProject))).toEqual([]);
	});
});
