import fs from "node:fs/promises";
import { expect, type Locator, test } from "@playwright/test";
import {
	createCompleteStoryDemo,
	createStoryAuthoringDemo,
} from "../src/test/storyAuthoringDemo";
import {
	importProjectFile,
	openEditor,
	projectTool,
	reloadProject,
	requireGameSave,
	savedProject,
	savedProjectJson,
} from "./projectNavigation";

test("navigates a complete story and authors a conditional response from context @story-workspace", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	page.setDefaultTimeout(15_000);
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await importProjectFile(page, {
		name: "story.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(createCompleteStoryDemo())),
	});
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await openEditor(page, "story");
	await page.getByLabel("Search entities", { exact: true }).fill("Guard");
	await click("Guard — Village (4, 5) · Characters");
	await expect(page.getByLabel("Story inspector")).toContainText(
		"Village (4, 5)",
	);
	const assignment = page
		.locator(".story-relationship")
		.filter({ hasText: "Assigned conversation" });
	await assignment
		.getByRole("button", { name: "Guard Conversation", exact: true })
		.click();
	await click("Open Dialogue Graph");
	await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
		"Guard Conversation",
	);
	await openEditor(page, "story");
	const start = page
		.locator(".story-relationship")
		.filter({ hasText: "Start Village Passage" });
	await start
		.getByRole("button", { name: "Open owning field", exact: true })
		.click();
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
		"Thank you. Find the Harbour Key in the Old Chest.",
	);
	await expect(page.locator('[data-story-field="actions:1"]')).toHaveAttribute(
		"data-source-focus",
		"true",
	);
	await openEditor(page, "story");
	await page
		.locator(".story-relationship")
		.filter({ hasText: "Start Village Passage" })
		.getByRole("button", { name: "Village Passage", exact: true })
		.click();
	await expect(page.getByLabel("Story inspector")).toContainText(
		"Have Harbour Key",
	);
	await expect(
		page.locator('[data-relationship-type="dependency"]'),
	).toContainText("Possible source of Harbour Key");
	await click("Open Quest Sequence");
	await expect(page.locator(".story-step")).toHaveCount(3);
	await openEditor(page, "story");
	await page.getByLabel("Search entities", { exact: true }).fill("Harbour Key");
	await click("Harbour Key · Items");
	await expect(page.getByLabel("Used by")).toContainText("Container grants");
	await expect(page.getByLabel("Used by")).toContainText("Door requires item");
	await page.screenshot({ path: testInfo.outputPath("story-item-uses.png") });
	await page.getByLabel("Search entities", { exact: true }).fill("Gate");
	await click("Harbour Gate — Village (7, 6) · World objects");
	await expect(page.getByLabel("Story inspector")).toContainText(
		"Effective behavior: door",
	);
	await expect(page.getByLabel("Used by")).toContainText("Gate reminder");
	await page.getByLabel("Search entities", { exact: true }).fill("Harbour Key");
	await click("Harbour Key · Items");
	await click("Add conditional response");
	const dialog = page.getByRole("dialog", { name: "Add conditional response" });
	await dialog
		.getByLabel("Conversation", { exact: true })
		.selectOption({ label: "Guard Conversation" });
	await dialog
		.getByLabel("Choice node", { exact: true })
		.selectOption({ label: "What do you say?" });
	await dialog
		.getByLabel("Response text", { exact: true })
		.fill("My key opens the gate.");
	await dialog
		.getByLabel("Destination node", { exact: true })
		.selectOption({ label: "I remember. Good luck out there." });
	await dialog.getByRole("button", { name: "Create response" }).click();
	await click("Open created content");
	const response = page.locator(".content-card.compact").last();
	await response
		.getByRole("button", {
			name: "Add condition from entity: Harbour Key",
			exact: true,
		})
		.click();
	await click("Have item");
	await click("List");
	await page
		.getByRole("button", { name: /^text: Thank you\. Find the Harbour/ })
		.click();
	const effects = page.getByLabel("Add entry effect", { exact: true });
	await effects.getByRole("button", { name: "Choose or create…" }).click();
	await effects.getByRole("button", { name: "Create entity here" }).click();
	await effects.getByLabel("Create", { exact: true }).selectOption("flag");
	await effects
		.getByLabel("Entity name", { exact: true })
		.fill("Key remembered");
	await effects.getByRole("button", { name: "Create and insert" }).click();
	await click("Remember Yes");
	await click("choice: What do you say?");
	await response
		.getByRole("button", {
			name: "Add condition from entity: Key remembered",
			exact: true,
		})
		.click();
	await click("Story state is Yes");
	await openEditor(page, "story");
	await page
		.getByLabel("Search entities", { exact: true })
		.fill("Key remembered");
	await click("Key remembered · Story state");
	await expect(page.getByLabel("Story inspector")).toContainText(
		"Read by 1 · Written by 1",
	);
	await page.screenshot({ path: testInfo.outputPath("story-state-uses.png") });
	await click("Save");
	const saved = await savedProject(page);
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const path = testInfo.outputPath("story-workspace.project.json");
	await (await download).saveAs(path);
	await importProjectFile(page, path);
	await click("Save");
	expect((await savedProject(page)).dialogues).toEqual(saved.dialogues);
	await openEditor(page, "map");
	await click("3D View");
	await click("Save");
	const authored = await savedProjectJson(page);
	await click("Play");
	const viewport = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(viewport).toBeVisible();
	await viewport.focus();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await page.keyboard.press("e");
	const conversation = page.getByRole("dialog", { name: "Conversation" });
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", {
			name: "My key opens the gate.",
			exact: true,
		}),
	).toHaveCount(0);
	await conversation.getByRole("button", { name: "Yes.", exact: true }).click();
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	async function go(x: number, y: number) {
		await viewport.focus();
		for (const axis of ["y", "x"] as const)
			for (let i = 0; i < 65; i++) {
				const match = (
					await page.locator(".three-runtime-hud").innerText()
				).match(/Pos: ([\d.-]+), ([\d.-]+)/)!;
				const pos = { x: Number(match[1]), y: Number(match[2]) },
					diff = (axis === "x" ? x : y) - pos[axis];
				if (Math.abs(diff) < 0.115) break;
				await page.keyboard.press(
					axis === "x"
						? diff > 0
							? "ArrowRight"
							: "ArrowLeft"
						: diff > 0
							? "ArrowDown"
							: "ArrowUp",
				);
				await page.waitForTimeout(130);
				if (i === 64) throw Error("Blocked story route");
			}
	}
	await go(5, 4);
	await page.keyboard.press("e");
	await expect(
		page.getByLabel("Current objective", { exact: true }),
	).toContainText("Successfully use");
	await go(7, 3);
	await go(7, 5);
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 8, 5");
	await click("Save Game");
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await go(4, 3);
	await go(4, 4);
	await page.keyboard.press("e");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", {
			name: "My key opens the gate.",
			exact: true,
		}),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await click("Save Game");
	const gameSave = await requireGameSave(page);
	expect(gameSave.quests.statuses.keeper_job).toBe("completed");
	expect(gameSave.state.flags.key_remembered).toBe(true);
	await click("Back to Edit");
	await click("Save");
	expect(await savedProjectJson(page)).toBe(authored);
	expect(errors).toEqual([]);
	await openEditor(page, "story");
	const large = createCompleteStoryDemo();
	for (let i = 0; i < 150; i++) {
		large.areas[0].npcs.push({
			...structuredClone(large.areas[0].npcs[0]),
			id: `scale_guard_${i}`,
			nameOverride: `Guard ${i}`,
		});
		large.items.push({
			...large.items[0],
			id: `scale_item_${i}`,
			name: `Story item ${i}`,
		});
		large.quests.push({
			...structuredClone(large.quests[0]),
			id: `scale_quest_${i}`,
			name: `Story quest ${i}`,
		});
		large.rules.push({
			...structuredClone(large.rules[0]),
			id: `scale_rule_${i}`,
			name: `Story rule ${i}`,
		});
	}
	await importProjectFile(page, {
		name: "story-scale.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(large)),
	});
	const focusStarted = Date.now();
	await openEditor(page, "story");
	await page.getByLabel("Search entities", { exact: true }).fill("Guard 149");
	await click("Guard 149 — Village (4, 5) · Characters");
	await expect(page.getByLabel("Story inspector")).toContainText("Guard 149");
	await expect(page.locator(".story-relationship")).toHaveCount(1);
	await testInfo.attach("story-scale-focus", {
		body: JSON.stringify({
			additionalEntities: 600,
			focusMilliseconds: Date.now() - focusStarted,
		}),
		contentType: "application/json",
	});
	await page.screenshot({ path: testInfo.outputPath("story-scale-focus.png") });
});

test("authors nested WHEN IF THEN ELSE blocks and plays both routes @logic-blocks", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	page.setDefaultTimeout(15_000);
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const fixture = createStoryAuthoringDemo();
	fixture.dialogues[0].nodes
		.find((n) => n.id === "accepted")!
		.actions!.push({ type: "set_flag", flag: "guard_permission", value: true });
	await page.goto("/");
	await importProjectFile(page, {
		name: "village.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(fixture)),
	});
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await openEditor(page, "progression");
	await click("Add rule");
	await page.getByLabel("Rule name", { exact: true }).fill("Gate permission");
	for (const [name, slot, operation] of [
		[
			"Harbour Gate — Village (7, 6) · World objects",
			"Choose WHEN entity",
			"Player interacts with target",
		],
		["Harbour Key · Items", "Add IF condition", "Have item"],
		[
			"Guard permission · Story state",
			"Add IF condition",
			"Story state is Yes",
		],
		[
			"Beyond Gate — Village (8, 5) · Arrival points",
			"Add THEN effect",
			"Go to arrival point",
		],
	]) {
		await page
			.getByRole("button", { name, exact: true })
			.dragTo(page.getByLabel(slot, { exact: true }));
		await click(operation);
	}
	await click("Add ANY group");
	await page
		.getByLabel("Move IF.2 to group", { exact: true })
		.selectOption({ label: "IF.3 ANY" });
	await click("Move IF.1 down");
	await click("Undo");
	await click("Redo");
	const otherwise = page.getByLabel("Add ELSE effect", { exact: true });
	await otherwise.getByRole("button", { name: "Choose or create…" }).click();
	await otherwise.getByRole("button", { name: "Create entity here" }).click();
	await otherwise
		.getByLabel("Create", { exact: true })
		.selectOption("cutscene");
	await otherwise
		.getByLabel("Entity name", { exact: true })
		.fill("Gate locked");
	await otherwise
		.getByLabel("Description", { exact: true })
		.fill("Bring the Harbour Key and speak to the Guard.");
	await otherwise.getByRole("button", { name: "Create and insert" }).click();
	await click("Play story moment");
	await page.getByLabel("Run", { exact: true }).selectOption("once");
	await click("Save");
	const before = await savedProject(page);
	await click("Advanced");
	await click("Blocks");
	await click("Save");
	expect((await savedProject(page)).rules).toEqual(before.rules);
	await page.locator(".logic-editor").evaluate((el) => {
		el.scrollTop = 0;
	});
	await page.screenshot({ path: testInfo.outputPath("logic-blocks.png") });
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const path = testInfo.outputPath("logic-blocks.project.json");
	await (await download).saveAs(path);
	await importProjectFile(page, path);
	await click("3D View");
	await click("Play");
	const viewport = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(viewport).toBeVisible();
	async function go(x: number, y: number) {
		await viewport.focus();
		for (const axis of ["y", "x"] as const)
			for (let step = 0; step < 65; step++) {
				const match = (
					await page.locator(".three-runtime-hud").innerText()
				).match(/Pos: ([\d.-]+), ([\d.-]+)/)!;
				const pos = { x: Number(match[1]), y: Number(match[2]) },
					diff = (axis === "x" ? x : y) - pos[axis];
				if (Math.abs(diff) < 0.115) break;
				await page.keyboard.press(
					axis === "x"
						? diff > 0
							? "ArrowRight"
							: "ArrowLeft"
						: diff > 0
							? "ArrowDown"
							: "ArrowUp",
				);
				await page.waitForTimeout(130);
				if (step === 64) throw Error(`Blocked at ${JSON.stringify(pos)}`);
			}
	}
	const readSave = () => requireGameSave(page);
	await go(7, 3);
	await go(7, 5);
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-modal")).toContainText(
		"Gate locked",
	);
	await page.locator(".three-runtime-modal").getByRole("button").click();
	await click("Save Game");
	expect((await readSave()).state.completedRuleIds).not.toContain(
		before.rules[0].id,
	);
	await go(4, 3);
	await go(4, 4);
	await page.keyboard.press("e");
	const conversation = page.getByRole("dialog", { name: "Conversation" });
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation.getByRole("button", { name: "Yes.", exact: true }).click();
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await go(5, 4);
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Received: Harbour Key",
	);
	await go(7, 3);
	await go(7, 5);
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 8, 5");
	await click("Save Game");
	expect((await readSave()).state.completedRuleIds).toContain(
		before.rules[0].id,
	);
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await click("Save Game");
	expect((await readSave()).state.completedRuleIds).toContain(
		before.rules[0].id,
	);
	expect(errors).toEqual([]);
});

test("authors a native Talk Have Use quest and continues it @quest-sequence", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	page.setDefaultTimeout(15_000);
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await importProjectFile(page, {
		name: "village.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(createStoryAuthoringDemo())),
	});
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await openEditor(page, "quests");
	const slot = page.getByLabel("Add objective from entity", { exact: true });
	for (const [name, operation] of [
		["Guard — Village (4, 5) · Characters", "Finish talking"],
		["Harbour Key · Items", "Have item"],
		["Harbour Gate — Village (7, 6) · World objects", "Successfully use door"],
	]) {
		await page.getByRole("button", { name, exact: true }).dragTo(slot);
		await click(operation);
	}
	await click("Save");
	const before = await savedProject(page);
	await click("Move objective 2 down");
	await click("Undo");
	await click("Save");
	expect((await savedProject(page)).quests[0].objectives).toEqual(
		before.quests[0].objectives,
	);
	await page
		.getByRole("button", {
			name: "Guard permission · Story state",
			exact: true,
		})
		.dragTo(page.getByLabel("Add Completion effect", { exact: true }));
	await click("Remember Yes");
	await page.screenshot({ path: testInfo.outputPath("quest-sequence.png") });
	await page
		.locator(".story-step")
		.first()
		.getByRole("button", { name: "Show on map" })
		.click();
	await expect(page.getByLabel("Search scene")).toBeVisible();
	await openEditor(page, "quests");
	await click("Save");
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const path = testInfo.outputPath("village-sequence.project.json");
	await (await download).saveAs(path);
	await importProjectFile(page, path);
	await openEditor(page, "quests");
	await expect(page.locator(".story-step")).toHaveCount(3);
	await openEditor(page, "map");
	await click("3D View");
	await click("Save");
	const authored = await savedProjectJson(page);
	await click("Play");
	const viewport = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(viewport).toBeVisible();
	await viewport.focus();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await page.keyboard.press("e");
	const conversation = page.getByRole("dialog", { name: "Conversation" });
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation.getByRole("button", { name: "No.", exact: true }).click();
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await click("Save Game");
	const readSave = () => requireGameSave(page);
	expect((await readSave()).quests.statuses.keeper_job).toBe("inactive");
	expect((await readSave()).state.flags.refused_keeper_job).toBe(true);
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await viewport.focus();
	await page.keyboard.press("e");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation.getByRole("button", { name: "Yes.", exact: true }).click();
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await expect(
		page.getByLabel("Current objective", { exact: true }),
	).toContainText("Have Harbour Key");
	await viewport.focus();
	await go(5, 4);
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Open",
	);
	await page.keyboard.press("e");
	await expect(
		page.getByLabel("Current objective", { exact: true }),
	).toContainText("Successfully use");
	async function go(x: number, y: number) {
		for (const axis of ["y", "x"] as const)
			for (let step = 0; step < 65; step++) {
				const hud = page.locator(".three-runtime-hud");
				const traversal = await hud.getAttribute("data-traversal-target");
				const match = (await hud.innerText()).match(
					/Pos: ([\d.-]+), ([\d.-]+)/,
				)!;
				const pos = traversal
					? JSON.parse(traversal)
					: { x: Number(match[1]), y: Number(match[2]) };
				const diff = (axis === "x" ? x : y) - pos[axis];
				if (Math.abs(diff) < 0.115) break;
				await page.keyboard.press(
					axis === "x"
						? diff > 0
							? "ArrowRight"
							: "ArrowLeft"
						: diff > 0
							? "ArrowDown"
							: "ArrowUp",
				);
				await page.waitForTimeout(90);
				if (step === 64) throw Error(`Route blocked: ${JSON.stringify(pos)}`);
			}
	}
	await go(7, 3);
	await go(7, 5);
	await expect(page.locator(".runtime-interaction-prompt")).not.toContainText(
		"chest",
	);
	await page.keyboard.press("e");
	await expect(
		page.getByLabel("Current objective", { exact: true }),
	).not.toContainText("Successfully use");
	await click("Save Game");
	const complete = await readSave();
	expect(complete.quests.statuses.keeper_job).toBe("completed");
	expect(complete.state.flags.guard_permission).toBe(true);
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await click("Save Game");
	expect((await readSave()).quests).toEqual(complete.quests);
	await click("Back to Edit");
	await click("Save");
	expect(await savedProjectJson(page)).toBe(authored);
	expect(errors).toEqual([]);
});

async function openAdvancedChip(chip: Locator) {
	for (const details of await chip.locator("details").all()) {
		if ((await details.getAttribute("open")) === null)
			await details.locator(":scope > summary").click();
	}
}

test("wires entities with native drag, inline creation, assignment and Continue @dialogue-entities", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	page.setDefaultTimeout(15_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await importProjectFile(page, "dialogue-graph-v1-demo.project.json");
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await openEditor(page, "dialogues");
	await click("Fit graph");
	await click("Select choice: What do you say?");
	await click("Focus selected");
	await page
		.getByRole("button", { name: "Harbour Key · Items", exact: true })
		.dragTo(page.getByLabel("Conditions: Ask me again.", { exact: true }));
	await click("Have item");
	const repeat = page
		.locator(".content-card.compact")
		.filter({ has: page.getByLabel("Choice repeat text", { exact: true }) });
	await expect(repeat.locator(".dialogue-wiring-chip")).toContainText(
		"Have Harbour Key ×1",
	);
	await click("Undo");
	await expect(repeat.locator(".dialogue-wiring-chip")).toHaveCount(0);
	await click("Redo");
	await expect(repeat.locator(".dialogue-wiring-chip")).toContainText(
		"Have Harbour Key ×1",
	);
	await click("List");
	await click("text: Thank you. Take the Harbour Key.");
	const effects = page.getByLabel("Add entry effect", { exact: true });
	await effects.getByRole("button", { name: "Choose or create…" }).click();
	await effects.getByRole("button", { name: "Create entity here" }).click();
	await effects.getByLabel("Create", { exact: true }).selectOption("quest");
	await effects
		.getByLabel("Entity name", { exact: true })
		.fill("Village Passage");
	await effects.getByRole("button", { name: "Create and insert" }).click();
	await click("Start quest");
	await expect(page.locator(".dialogue-wiring-chip").last()).toContainText(
		"Start Village Passage",
	);
	await click("Open quest");
	const questEditor = page.locator(".quests-editor");
	await questEditor
		.getByRole("button", { name: "Add objective", exact: true })
		.click();
	await questEditor
		.getByLabel("Objective 1 text")
		.fill("Finish helping the Keeper");
	await questEditor.getByLabel("Objective condition type").selectOption("flag");
	await questEditor
		.getByLabel("Objective flag ID")
		.selectOption("keeper_job_done");
	await openEditor(page, "dialogues");
	await click("List");
	await click("text: Thank you. Take the Harbour Key.");
	await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
		"Thank you. Take the Harbour Key.",
	);
	await expect(page.locator(".dialogue-wiring-chip").last()).not.toContainText(
		"Unfinished quest",
	);
	await page
		.getByRole("button", {
			name: "Keeper — Main Area (4, 5) · Characters",
			exact: true,
		})
		.focus();
	await page.keyboard.press("Enter");
	await click("Assign conversation: Keeper — Main Area (4, 5)");
	await expect(page.getByLabel("Review assignment")).toContainText(
		"Keeper's request",
	);
	await click("Replace assignment");
	await expect(page.getByLabel("Review assignment")).toHaveCount(0);
	await click("Graph");
	await click("Fit graph");
	await page.screenshot({ path: testInfo.outputPath("entity-wiring.png") });
	await click("Save");
	const saved = await savedProject(page);
	const quest = saved.quests.find(
		(q: { name: string }) => q.name === "Village Passage",
	);
	expect(quest.objectives).toHaveLength(1);
	expect(
		saved.dialogues[0].nodes.find((n: { id: string }) => n.id === "accepted")
			.actions[3],
	).toEqual({ type: "activate_quest", questId: quest.id });
	expect(saved.areas[0].npcs[0].interactionOverride.dialogueId).toBe(
		"keeper_dialogue",
	);
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const exported = await download;
	const exportPath = testInfo.outputPath("entity-wiring.project.json");
	await exported.saveAs(exportPath);
	await importProjectFile(page, exportPath);
	await openEditor(page, "dialogues");
	await click("Save");
	expect((await savedProject(page)).dialogues).toEqual(saved.dialogues);
	await openEditor(page, "map");
	await click("3D View");
	await click("Save");
	const beforePlay = await savedProjectJson(page);
	await click("Play");
	const viewport = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(viewport).toBeVisible();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await viewport.focus();
	await page.keyboard.press("e");
	const conversation = page.getByRole("dialog", { name: "Conversation" });
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", { name: "Ask me again.", exact: true }),
	).toHaveCount(0);
	await conversation.getByRole("button", { name: "Yes.", exact: true }).click();
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await click("Save Game");
	const gameSave = await requireGameSave(page);
	expect(gameSave.quests.statuses[quest.id]).toBe("active");
	expect(gameSave.state.inventory.harbour_key).toBe(1);
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await expect(viewport).toBeVisible();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await viewport.focus();
	await page.keyboard.press("e");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", { name: "Ask me again.", exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await click("Back to Edit");
	await click("Save");
	expect(await savedProjectJson(page)).toBe(beforePlay);
	expect(errors).toEqual([]);
});

test("visually authors dialogue, assigns the Keeper and continues saved branches @dialogue-graph", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	page.setDefaultTimeout(15_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("dialog", (dialog) => dialog.accept());
	await page.goto("/");
	await importProjectFile(page, "dialogue-graph-v1-demo.project.json");
	const click = async (name: string) => {
		await page.getByRole("button", { name, exact: true }).click();
		if (name === "Add action")
			await openAdvancedChip(page.locator(".dialogue-wiring-chip").last());
	};
	await openEditor(page, "dialogues");
	await click("Add dialogue");
	await page
		.getByLabel("Name", { exact: true })
		.fill("Browser authored Keeper");
	await page.getByLabel("Speaker", { exact: true }).fill("Keeper");
	await page
		.getByLabel("Text", { exact: true })
		.fill("Are you willing to help?");
	await click("Set as Start");
	await click("Add choice node");
	await page.getByLabel("Text", { exact: true }).fill("Your answer?");
	await click("Add choice");
	const cards = page.locator(".content-card.compact");
	await cards.nth(0).locator('input[aria-label$=" text"]').fill("Yes.");
	await cards.nth(0).getByRole("button", { name: "Add condition" }).click();
	await openAdvancedChip(cards.nth(0).locator(".dialogue-wiring-chip").last());
	await cards
		.nth(0)
		.getByLabel("Condition 1 flag", { exact: true })
		.fill("accepted_keeper_job");
	await cards
		.nth(0)
		.getByLabel("Condition 1 value", { exact: true })
		.selectOption("false");
	await click("Add choice");
	await cards.nth(1).locator('input[aria-label$=" text"]').fill("No.");
	await click("Add choice");
	await cards
		.nth(2)
		.locator('input[aria-label$=" text"]')
		.fill("I am already helping.");
	await cards.nth(2).getByRole("button", { name: "Add condition" }).click();
	await openAdvancedChip(cards.nth(2).locator(".dialogue-wiring-chip").last());
	await cards
		.nth(2)
		.getByLabel("Condition 1 flag", { exact: true })
		.fill("accepted_keeper_job");
	await click("Add text node");
	await page.getByLabel("Text", { exact: true }).fill("Thank you, helper.");
	await click("Add action");
	await page
		.getByLabel("Action 1 flag", { exact: true })
		.fill("accepted_keeper_job");
	await click("Add action");
	await page.getByLabel("Action 2 type").selectOption("activate_quest");
	await page.getByLabel("Action 2 quest").selectOption("keeper_job");
	await click("Add action");
	await page.getByLabel("Action 3 type").selectOption("give_item");
	await page.getByLabel("Action 3 item").selectOption("harbour_key");
	await click("Add text node");
	await page.getByLabel("Text", { exact: true }).fill("Perhaps another time.");
	await click("Add action");
	await page
		.getByLabel("Action 1 flag", { exact: true })
		.fill("refused_keeper_job");
	await click("Add end node");
	await page.getByLabel("Text", { exact: true }).fill("Farewell.");
	async function connect(output: string, target: string) {
		await click("Fit graph");
		await click(output);
		await click(target);
	}
	await connect(
		"Connect next: text: Are you willing to help?",
		"Connect here: choice: Your answer?",
	);
	await connect(
		"Connect response: Yes.",
		"Connect here: text: Thank you, helper.",
	);
	await connect(
		"Connect response: No.",
		"Connect here: text: Perhaps another time.",
	);
	await connect(
		"Connect response: I am already helping.",
		"Connect here: end: Farewell.",
	);
	await connect(
		"Connect next: text: Thank you, helper.",
		"Connect here: end: Farewell.",
	);
	await connect(
		"Connect next: text: Perhaps another time.",
		"Connect here: end: Farewell.",
	);
	await click("Connection Yes. to text: Thank you, helper.");
	await click("Delete connection");
	await expect(page.getByLabel("Dialogue diagnostics")).toContainText(
		'Response "Yes." targets missing node',
	);
	await connect(
		"Connect response: Yes.",
		"Connect here: text: Thank you, helper.",
	);
	await click("Add end node");
	await page.getByLabel("Text", { exact: true }).fill("Unused ending");
	await expect(page.getByLabel("Dialogue diagnostics")).toContainText(
		"unreachable",
	);
	await click("Auto layout");
	await click("Select text: Are you willing to help?");
	await click("Focus selected");
	const header = page.getByRole("button", {
		name: "Select text: Are you willing to help?",
		exact: true,
	});
	const rect = (await header.boundingBox())!;
	await page.mouse.move(rect.x + 90, rect.y + 15);
	await page.mouse.down();
	await page.mouse.move(rect.x + 135, rect.y + 55, { steps: 8 });
	await page.mouse.up();
	await click("Fit graph");
	await click("Zoom in");
	await click("Zoom out");
	const surface = (await page
		.getByRole("region", { name: "Dialogue graph", exact: true })
		.boundingBox())!;
	await page.mouse.move(
		surface.x + surface.width - 20,
		surface.y + surface.height - 20,
	);
	await page.mouse.down();
	await page.mouse.move(
		surface.x + surface.width - 45,
		surface.y + surface.height - 45,
	);
	await page.mouse.up();
	await click("Fit graph");
	await page.screenshot({ path: testInfo.outputPath("graph-authoring.png") });
	await click("Save");
	const saved = await savedProject(page);
	const authored = saved.dialogues.find(
		(d: { name: string }) => d.name === "Browser authored Keeper",
	);
	expect(Object.keys(authored.editorLayout.nodes)).toHaveLength(6);
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const exported = await download;
	const exportPath = testInfo.outputPath("authored.project.json");
	await exported.saveAs(exportPath);
	expect(JSON.parse(await fs.readFile(exportPath, "utf8")).dialogues).toEqual(
		saved.dialogues,
	);
	await reloadProject(page);
	await openEditor(page, "dialogues");
	await click("Browser authored Keeper");
	await click("Fit graph");
	await page.screenshot({ path: testInfo.outputPath("graph-reloaded.png") });
	await click("Save");
	expect((await savedProject(page)).dialogues).toEqual(saved.dialogues);
	await openEditor(page, "map");
	await click("3D View");
	await page.getByLabel("Search scene").fill("Keeper");
	await page
		.getByRole("option", { name: "Keeper Character", exact: true })
		.click();
	if ((await page.locator(".scene-gameplay").getAttribute("open")) === null)
		await page.getByText("Properties & gameplay", { exact: true }).click();
	await page.getByText("Advanced interaction", { exact: true }).click();
	await page
		.getByRole("combobox", { name: "Dialogue", exact: true })
		.selectOption(authored.id);
	await click("Open dialogue");
	await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
		"Browser authored Keeper",
	);
	await click("Save");
	const beforePlay = await savedProjectJson(page);
	await click("Play");
	const viewport = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(viewport).toBeVisible();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await viewport.focus();
	await page.keyboard.press("e");
	const conversation = page.getByRole("dialog", { name: "Conversation" });
	await expect(conversation).toContainText("Are you willing to help?");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", {
			name: "I am already helping.",
			exact: true,
		}),
	).toHaveCount(0);
	await conversation.getByRole("button", { name: "Yes.", exact: true }).click();
	await expect(conversation).toContainText("Thank you, helper.");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await click("Save Game");
	const gameSave = await requireGameSave(page);
	expect(gameSave.state.flags.accepted_keeper_job).toBe(true);
	expect(gameSave.state.inventory.harbour_key).toBe(1);
	await click("Back to Edit");
	await click("Play");
	await click("Continue");
	await expect(viewport).toBeVisible();
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Talk",
	);
	await viewport.focus();
	await page.keyboard.press("e");
	await conversation.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		conversation.getByRole("button", { name: "Yes.", exact: true }),
	).toHaveCount(0);
	await expect(
		conversation.getByRole("button", {
			name: "I am already helping.",
			exact: true,
		}),
	).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("continued-choices.png") });
	await conversation
		.getByRole("button", { name: "I am already helping.", exact: true })
		.click();
	await conversation
		.getByRole("button", { name: "End conversation", exact: true })
		.click();
	await click("Back to Edit");
	await click("Save");
	expect(await savedProjectJson(page)).toBe(beforePlay);
	expect(errors).toEqual([]);
});

test("navigates and drags a 30-node branching graph @dialogue-graph-scale", async ({
	page,
}, testInfo) => {
	page.setDefaultTimeout(15_000);
	const project = JSON.parse(
		await fs.readFile("dialogue-graph-v1-demo.project.json", "utf8"),
	);
	const dialogue = project.dialogues[0];
	for (let i = 0; i < 24; i++) {
		const id = `scale_${i}`,
			next = i === 23 ? "decision" : `scale_${i + 1}`;
		dialogue.nodes.push(
			i % 5 === 0
				? {
						id,
						type: "choice",
						text: `Scale node ${i}`,
						choices: [
							{ id: `${id}_next`, text: "Continue onward", targetNodeId: next },
							{
								id: `${id}_loop`,
								text: "Return to Keeper",
								targetNodeId: "opening",
							},
						],
					}
				: { id, type: "text", text: `Scale node ${i}`, nextNodeId: next },
		);
	}
	dialogue.nodes[1].choices.push({
		id: "scale_entry",
		text: "Tell me more",
		targetNodeId: "scale_0",
	});
	delete dialogue.editorLayout;
	await page.goto("/");
	await importProjectFile(page, {
		name: "30-node-dialogue.project.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(project)),
	});
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await openEditor(page, "dialogues");
	await click("Auto layout");
	await expect(page.locator(".dialogue-card")).toHaveCount(30);
	await expect(page.getByLabel("Dialogue diagnostics")).toContainText(
		"0 errors",
	);
	await click("List");
	await click("text: Scale node 23");
	await click("Graph");
	await click("Focus selected");
	const card = page.locator(".dialogue-card.selected"),
		oldStyle = await card.getAttribute("style");
	const rect = (await card.locator(".dialogue-card-header").boundingBox())!;
	const started = Date.now();
	await page.mouse.move(rect.x + 100, rect.y + 15);
	await page.mouse.down();
	await page.mouse.move(rect.x + 160, rect.y + 65, { steps: 15 });
	await page.mouse.up();
	await expect(card).not.toHaveAttribute("style", oldStyle!);
	await page.getByLabel("Text", { exact: true }).fill("Scale node 23 edited");
	await page.screenshot({ path: testInfo.outputPath("30-node-focused.png") });
	await click("Fit graph");
	await page.screenshot({ path: testInfo.outputPath("30-node-fit.png") });
	await click("Save");
	const saved = (await savedProject(page)).dialogues[0];
	expect(saved.nodes.map((node: { id: string }) => node.id)).toEqual(
		dialogue.nodes.map((node: { id: string }) => node.id),
	);
	expect(Object.keys(saved.editorLayout.nodes)).toHaveLength(30);
	await fs.writeFile(
		testInfo.outputPath("interaction-observation.json"),
		JSON.stringify(
			{
				nodes: 30,
				interactionSequenceMs: Date.now() - started,
				note: "Includes browser screenshots and Save; not a frame-time benchmark.",
			},
			null,
			2,
		),
	);
});

test("plays graph-authored dialogue through Phaser and saves its effects @dialogue-graph-phaser", async ({
	page,
}, testInfo) => {
	page.setDefaultTimeout(15_000);
	await page.goto("/");
	await importProjectFile(page, "dialogue-graph-v1-demo.project.json");
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const canvas = page.locator(".phaser-host canvas");
	await expect(canvas).toBeVisible();
	await canvas.click({ position: { x: 200, y: 120 } });
	await page.keyboard.press("e");
	await page.waitForTimeout(250);
	await page.keyboard.press("e");
	await page.waitForTimeout(250);
	await page.screenshot({ path: testInfo.outputPath("phaser-choices.png") });
	const rect = (await canvas.boundingBox())!;
	// Phaser's real choice hit area is (32, height - 108) in its 640×480 UI.
	await canvas.click({
		position: { x: (rect.width * 55) / 640, y: (rect.height * 382) / 480 },
	});
	await page.waitForTimeout(150);
	await page.keyboard.press("e");
	await page.waitForTimeout(150);
	await page.keyboard.press("e");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toContainText("saved");
	const save = await requireGameSave(page);
	expect(save.state.flags.accepted_keeper_job).toBe(true);
	expect(save.state.inventory.harbour_key).toBe(1);
	expect(save.quests.statuses.keeper_job).toBe("active");
});
