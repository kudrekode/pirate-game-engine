import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { storyNodeCatalogue } from "../src/story/storyCatalogue";
import type { GameProject, StoryGraph, StoryNode } from "../src/types/game";
import {
	importProjectFile,
	openEditor,
	reloadProject,
	requireGameSave,
	savedProject,
	savedProjectJson,
} from "./projectNavigation";

const graphName = "The Beacon Trail";
const cinematicName = "The Light Across the Mere";
const storyTag = "@story-editor";

test.use({
	channel: "chrome",
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
	viewport: { width: 1440, height: 900 },
});

function button(page: Page, name: string | RegExp) {
	return page.getByRole("button", { name, exact: typeof name === "string" });
}

function graphCanvas(page: Page) {
	return page.getByRole("region", { name: "Graph canvas" });
}

function nodeLabel(node: StoryNode) {
	return node.title || storyNodeCatalogue[node.type].label;
}

function nodeOfType(graph: StoryGraph, type: StoryNode["type"]) {
	const node = graph.nodes.find((candidate) => candidate.type === type);
	if (!node) throw new Error(`Expected a ${type} node in ${graph.name}.`);
	return node;
}

async function importMerewatch(page: Page, campCleared = false) {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	if (!campCleared) {
		await importProjectFile(page, "hollow-kingdom.project.json", false);
		return;
	}
	const project: GameProject = JSON.parse(
		await fs.readFile("hollow-kingdom.project.json", "utf8"),
	);
	// Start this acceptance run with the poacher camp already cleared. The
	// shipped coffer still grants the key only through its real interaction.
	const merewatch = project.areas.find((area) => area.id === "merewatch");
	if (!merewatch) throw new Error("Expected the Merewatch map.");
	for (const id of ["pine-lookout", "ash-coat"]) {
		project.gameState.flags[`npc_defeated_${id}`] = true;
		merewatch.npcs = merewatch.npcs.filter((npc) => npc.id !== id);
	}
	await importProjectFile(
		page,
		{
			name: "merewatch-story-acceptance.project.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(project)),
		},
		false,
	);
}

function beaconGraph(project: GameProject) {
	const graph = project.storyGraphs?.find((entry) => entry.name === graphName);
	if (!graph) throw new Error("Expected the bundled Beacon Trail graph.");
	return graph;
}

test(`authors, validates and reloads a graph with working workspace links ${storyTag}`, async ({
	page,
}, testInfo) => {
	test.setTimeout(140_000);
	page.setDefaultTimeout(35_000);
	await page.addInitScript(() =>
		localStorage.setItem("map-workspace-view-v1", "2d"),
	);
	await importMerewatch(page);
	const graph = beaconGraph(await savedProject(page));
	await openEditor(page, "story");
	const canvas = graphCanvas(page);
	const findNode = (type: StoryNode["type"]) =>
		canvas.getByRole("button", {
			name: `Select ${nodeLabel(nodeOfType(graph, type))}`,
			exact: true,
		});
	await expect(canvas).toBeVisible();
	await button(page, "Fit graph").click();
	await expect(
		canvas.getByRole("button", { name: /True output$/ }),
	).toBeVisible();
	await expect(
		canvas.getByRole("button", { name: /False output$/ }),
	).toBeVisible();
	await findNode("waitNpc").click();
	await page.screenshot({ path: testInfo.outputPath("pr05-story-editor.png") });
	await button(page, "Find in Map").click();
	await expect(page.getByLabel("Scene name")).toHaveValue("Oswin the Ferryman");
	await openEditor(page, "story");
	await expect(findNode("waitNpc")).toHaveAttribute("aria-pressed", "true");
	await button(page, "Edit Asset").click();
	await expect(
		page.locator(".creator-asset-card[aria-pressed='true']"),
	).toContainText(/Oswin|Ferryman/);
	await openEditor(page, "story");
	await expect(findNode("waitNpc")).toHaveAttribute("aria-pressed", "true");
	await findNode("cinematic").click();
	await button(page, "Open Cinematic").click();
	await expect(button(page, cinematicName)).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await openEditor(page, "story");
	await expect(findNode("cinematic")).toHaveAttribute("aria-pressed", "true");

	await button(page, /New Graph$/).click();
	const title = page.getByLabel("Graph name", { exact: true });
	await title.fill("Epilogue Acceptance");
	await title.blur();
	const search = page.getByRole("searchbox", { name: "Search nodes" });
	await search.fill("On New Game");
	await button(page, "Add On New Game").click();
	await search.fill("Wait for NPC");
	await button(page, "Add Wait for NPC Interaction").click();
	await expect(page.getByRole("button", { name: /Test Flow$/ })).toBeDisabled();
	await page
		.getByRole("combobox", { name: "Map", exact: true })
		.selectOption("merewatch");
	await page
		.getByRole("combobox", { name: "Placed NPC", exact: true })
		.selectOption("oswin-at-the-well");
	await expect(button(page, "Find in Map")).toBeVisible();
	await button(page, "Delete node").click();
	await search.fill("End");
	await button(page, "Add End").click();
	await button(page, "Fit graph").click();
	const entry = canvas.getByRole("button", {
		name: "Select On New Game",
		exact: true,
	});
	const end = canvas.getByRole("button", { name: "Select End", exact: true });
	const connection = canvas.getByRole("button", {
		name: "On New Game Next to End",
		exact: true,
	});
	await canvas
		.getByRole("button", { name: "On New Game Next output", exact: true })
		.click();
	await canvas.getByRole("button", { name: "End input", exact: true }).click();
	await expect(connection).toBeAttached();
	await button(page, /Undo$/).click();
	await expect(connection).toHaveCount(0);
	await button(page, /Redo$/).click();
	await expect(connection).toBeAttached();

	const initialEnd = await end.boundingBox();
	if (!initialEnd) throw new Error("Expected the End node to be visible.");
	await page.mouse.move(
		initialEnd.x + initialEnd.width / 2,
		initialEnd.y + initialEnd.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		initialEnd.x + initialEnd.width / 2 + 50,
		initialEnd.y + initialEnd.height / 2 + 60,
		{ steps: 5 },
	);
	await page.mouse.up();
	await expect
		.poll(async () => (await end.boundingBox())?.y)
		.toBeGreaterThan(initialEnd.y + 30);
	await end.click();
	await button(page, "Duplicate node").click();
	await expect(canvas.getByRole("button", { name: /Select End/ })).toHaveCount(
		2,
	);
	await button(page, "Delete node").click();
	await expect(canvas.getByRole("button", { name: /Select End/ })).toHaveCount(
		1,
	);

	const zoomBefore = await button(page, "Fit graph").innerText();
	await button(page, "Zoom in").click();
	await expect(button(page, "Fit graph")).not.toHaveText(zoomBefore);
	await button(page, "Fit graph").click();
	await expect(entry).toBeVisible();
	const surface = canvas.locator(".story-graph-surface");
	const previousTransform = await surface.evaluate(
		(node) => node.style.transform,
	);
	const panArea = await canvas
		.getByLabel("Story nodes and connections")
		.boundingBox();
	if (!panArea) throw new Error("Expected the story canvas to be visible.");
	await page.mouse.move(
		panArea.x + panArea.width / 4,
		panArea.y + panArea.height - 80,
	);
	await page.mouse.down();
	await page.mouse.move(
		panArea.x + panArea.width / 4 + 45,
		panArea.y + panArea.height - 115,
		{ steps: 5 },
	);
	await page.mouse.up();
	await expect
		.poll(() => surface.evaluate((node) => node.style.transform))
		.not.toBe(previousTransform);
	await button(page, "Fit graph").click();
	await button(page, /^Validate/).click();
	await expect(
		page.getByText("No graph issues.", { exact: true }),
	).toBeVisible();
	await button(page, "Save").click();
	const authored = (await savedProject(page)).storyGraphs?.find(
		(value) => value.name === "Epilogue Acceptance",
	);
	expect(authored?.nodes).toHaveLength(2);
	expect(authored?.edges).toEqual([
		expect.objectContaining({
			from: authored?.nodes.find(({ type }) => type === "newGame")?.id,
			to: authored?.nodes.find(({ type }) => type === "end")?.id,
			port: "next",
		}),
	]);
	await reloadProject(page, false);
	await openEditor(page, "story");
	await button(page, /^Epilogue Acceptance/).click();
	await expect(connection).toBeAttached();
	await expect(
		canvas.getByRole("button", { name: /Test Flow$/ }),
	).toBeEnabled();
});

function runtimeViewport(page: Page) {
	return page.getByLabel("Three runtime viewport", { exact: true });
}

function conversation(page: Page) {
	return page.getByRole("dialog", { name: "Conversation" });
}

function cinematic(page: Page) {
	return page.getByRole("dialog", { name: cinematicName, exact: true });
}

async function startStoryPlay(page: Page, resume: boolean) {
	await openEditor(page, "story");
	await button(page, /Test Flow$/).click();
	if (resume) await button(page, "Continue").click();
	await expect(runtimeViewport(page)).toBeVisible();
	const inspect = button(page, "Inspect");
	await inspect.click();
	await expect(inspect).toHaveClass(/\bactive\b/);
	await runtimeViewport(page).focus();
}

async function walk(page: Page, x: number, y: number, exact = false) {
	const host = page.locator(".three-runtime-host");
	await expect
		.poll(
			async () => {
				const raw = await host.getAttribute("data-traversal");
				if (!raw) return "Loading movement";
				const position = JSON.parse(raw) as {
					x: number;
					y: number;
					grid: { x: number; y: number };
					reason?: string;
				};
				const current = exact ? position : position.grid;
				const tolerance = exact ? 0.19 : 0;
				if (Math.abs(x - current.x) > tolerance) {
					await page.keyboard.press(x > current.x ? "ArrowRight" : "ArrowLeft");
				} else if (Math.abs(y - current.y) > tolerance) {
					await page.keyboard.press(y > current.y ? "ArrowDown" : "ArrowUp");
				} else {
					return `${x}, ${y}`;
				}
				return `${current.x}, ${current.y} ${position.reason ?? ""}`.trim();
			},
			{ intervals: [90, 110, 120], timeout: 22_000 },
		)
		.toBe(`${x}, ${y}`);
}

async function interact(page: Page) {
	await runtimeViewport(page).focus();
	await expect
		.poll(async () => {
			if (await conversation(page).isVisible()) return true;
			await page.keyboard.press("e");
			return conversation(page).isVisible();
		})
		.toBe(true);
}

async function takeOswinsOffer(page: Page) {
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 20, 56");
	await expect(conversation(page)).toBeHidden();
	await expect(cinematic(page)).toBeHidden();
	await walk(page, 22, 56);
	await walk(page, 22, 44);
	await walk(page, 23, 44);
	await walk(page, 23, 43);
	await expect(conversation(page)).toBeHidden();
	await expect(cinematic(page)).toBeHidden();
	await interact(page);
	await expect(cinematic(page)).toBeHidden();
	await conversation(page)
		.getByRole("button", { name: "She hasn't shuttered it tonight?" })
		.click();
	await conversation(page)
		.getByRole("button", { name: "Lend me a blade. I'll bring back word." })
		.click();
	await expect(cinematic(page)).toBeVisible();
	await expect(conversation(page)).toBeHidden();
}

async function saveGame(page: Page) {
	await button(page, "Save Game").click();
	const replace = button(page, "Replace save");
	if (await replace.isVisible()) await replace.click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	return requireGameSave(page);
}

test(`completes the cinematic and reaches the false-branch item wait ${storyTag}`, async ({
	page,
}, testInfo) => {
	await importMerewatch(page);
	const authored = await savedProjectJson(page);
	await startStoryPlay(page, false);
	await takeOswinsOffer(page);
	await expect(cinematic(page)).toContainText("Follow the jetty lantern.", {
		timeout: 20_000,
	});
	await page.screenshot({
		path: testInfo.outputPath("pr05-story-cinematic.png"),
	});
	await expect(cinematic(page)).toBeHidden({ timeout: 20_000 });
	await expect(conversation(page)).toContainText("Take my hanger.");
	await button(page, "End conversation").click();
	const save = await saveGame(page);
	expect(save.quests.statuses["last-watch"]).toBe("active");
	expect(save.quests.statuses["beacon-trail"]).toBe("active");
	expect(save.quests.completedObjectiveIds).toContain("beacon-trail:briefed");
	expect(save.story?.cursors).toContainEqual(
		expect.objectContaining({
			graphId: "beacon-trail",
			nodeId: "wait-for-key",
			status: "waiting",
		}),
	);
	expect(save.state.inventory["watch-sword"]).toBe(1);
	expect(save.state.inventory["beacon-key"]).toBeUndefined();
	await button(page, "Back to Edit").click();
	expect(await savedProjectJson(page)).toBe(authored);
	await expect(page.locator('[data-node-id="wait-for-key"]')).toHaveAttribute(
		"data-debug",
		"waiting",
	);
	await page.screenshot({
		path: testInfo.outputPath("pr05-story-wait-debug.png"),
	});
});

async function boardSkiff(page: Page) {
	const host = page.locator(".three-runtime-host");
	await expect
		.poll(async () => {
			if ((await host.getAttribute("data-vehicle"))?.includes("oswins-ferry"))
				return true;
			await page.keyboard.press("e");
			return (await host.getAttribute("data-vehicle"))?.includes(
				"oswins-ferry",
			);
		})
		.toBe(true);
}

async function leaveSkiff(page: Page) {
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-host")).not.toHaveAttribute(
		"data-vehicle",
		/oswins-ferry/,
	);
}

test(`skips the cinematic, resumes the wait, collects the key and completes both Merewatch quests ${storyTag}`, async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	await importMerewatch(page, true);
	const authored = await savedProjectJson(page);
	const graph = beaconGraph(await savedProject(page));
	await startStoryPlay(page, false);
	await takeOswinsOffer(page);
	await cinematic(page).getByRole("button", { name: "Skip cinematic" }).click();
	await expect(cinematic(page)).toBeHidden();
	await expect(conversation(page)).toContainText("Take my hanger.");
	await button(page, "End conversation").click();
	const waiting = await saveGame(page);
	expect(waiting.quests.statuses["beacon-trail"]).toBe("active");
	expect(waiting.quests.completedObjectiveIds).toContain(
		"beacon-trail:briefed",
	);
	expect(waiting.state.inventory["beacon-key"]).toBeUndefined();
	expect(waiting.story?.cursors).toContainEqual(
		expect.objectContaining({
			graphId: graph.id,
			nodeId: "wait-for-key",
			status: "waiting",
		}),
	);
	await button(page, "Back to Edit").click();
	await expect(page.locator('[data-node-id="wait-for-key"]')).toHaveAttribute(
		"data-debug",
		"waiting",
	);
	await reloadProject(page, false);
	await startStoryPlay(page, true);
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 23, 43");
	await expect(cinematic(page)).toBeHidden();
	await expect(conversation(page)).toBeHidden();
	await walk(page, 23, 44);
	await walk(page, 22, 44);
	await walk(page, 22, 56);
	await walk(page, 36, 56.2, true);
	await page.keyboard.press("ArrowRight");
	await interact(page);
	await button(page, "Lift the lid and take the key.").click();
	await expect(conversation(page)).toContainText(
		"A bronze key and three ferry pennies",
	);
	await button(page, "End conversation").click();
	const found = await saveGame(page);
	expect(found.state.inventory["beacon-key"]).toBe(1);
	expect(found.state.inventory["ferry-penny"]).toBe(3);
	expect(found.quests.statuses["beacon-trail"]).toBe("active");
	expect(found.quests.completedObjectiveIds).toContain("last-watch:coffer");
	expect(found.story?.cursors).toContainEqual(
		expect.objectContaining({
			graphId: graph.id,
			nodeId: nodeOfType(graph, "waitLocation").id,
			status: "waiting",
		}),
	);
	await page.screenshot({
		path: testInfo.outputPath("pr05-story-key-collected.png"),
	});
	await runtimeViewport(page).focus();

	await walk(page, 22, 56);
	await walk(page, 22, 38);
	await walk(page, 23.35, 38, true);
	await walk(page, 23.35, 32, true);
	await walk(page, 24, 32, true);
	await walk(page, 24, 30, true);
	await page.keyboard.press("ArrowRight");
	await boardSkiff(page);
	await walk(page, 25, 12);
	await leaveSkiff(page);

	await walk(page, 23.4, 12, true);
	await walk(page, 23.4, 10, true);
	await walk(page, 23, 9, true);
	await walk(page, 23, 8, true);
	await walk(page, 22.7, 7, true);
	await walk(page, 22.5, 5, true);
	const arrived = await saveGame(page);
	expect(arrived.quests.statuses["beacon-trail"]).toBe("completed");
	expect(arrived.state.inventory["watch-letter"]).toBeUndefined();
	await interact(page);
	await button(page, "Turn the beacon key.").click();
	await expect(conversation(page)).toContainText(
		"Keep your lamp in the window.",
	);
	await button(page, "End conversation").click();
	const tower = await saveGame(page);
	expect(tower.quests.statuses["beacon-trail"]).toBe("completed");
	expect(tower.quests.statuses["last-watch"]).toBe("active");
	expect(tower.state.inventory["watch-letter"]).toBe(1);
	expect(tower.story?.cursors).toContainEqual(
		expect.objectContaining({
			graphId: graph.id,
			status: "completed",
		}),
	);
	await page.screenshot({
		path: testInfo.outputPath("pr05-story-watchtower.png"),
	});
	await runtimeViewport(page).focus();

	await walk(page, 22.7, 7, true);
	await walk(page, 23, 9, true);
	await walk(page, 23.4, 10, true);
	await walk(page, 23.4, 12, true);
	await walk(page, 24, 12, true);
	await boardSkiff(page);
	await walk(page, 25, 30);
	await leaveSkiff(page);
	await walk(page, 24, 32, true);
	await walk(page, 23.4, 32, true);
	await walk(page, 23.4, 38, true);
	await walk(page, 22, 38);
	await walk(page, 22, 44);
	await walk(page, 23, 44);
	await walk(page, 23, 43);
	await interact(page);
	await button(page, "She left this for you.").click();
	await expect(conversation(page)).toContainText("take these twelve pennies");
	await button(page, "End conversation").click();
	const complete = await saveGame(page);
	expect(complete.quests.statuses).toMatchObject({
		"beacon-trail": "completed",
		"last-watch": "completed",
	});
	expect(complete.state.inventory).toMatchObject({
		"beacon-key": 1,
		"watch-sword": 1,
		"ferry-penny": 15,
	});
	expect(complete.state.flags["oswin-read-letter"]).toBe(true);
	expect(complete.state.inventory["watch-letter"]).toBeUndefined();
	await button(page, "Back to Edit").click();
	expect(await savedProjectJson(page)).toBe(authored);
	await startStoryPlay(page, true);
	const continued = await saveGame(page);
	expect(continued.state.inventory).toEqual(complete.state.inventory);
	expect(continued.quests).toEqual(complete.quests);
	expect(continued.story).toEqual(complete.story);
});
