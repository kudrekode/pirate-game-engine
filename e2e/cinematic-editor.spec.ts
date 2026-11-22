import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import {
	importProjectFile,
	openEditor,
	readGameSave,
	reloadProject,
	savedProject,
} from "./projectNavigation";

const sequenceName = "The Ferryman's Warning";

test.use({
	viewport: { width: 1440, height: 900 },
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: false },
});

test("authors and reopens a four-shot Merewatch conversation @integration @cinematic-editor", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await importProjectFile(page, "hollow-kingdom.project.json", false);
	await openEditor(page, "cutscenes");
	const stage = page.locator(".cinema-stage");
	const inspector = page.getByRole("complementary", {
		name: "Cinematic inspector",
	});
	const storyboard = page.getByRole("region", { name: "Storyboard" });
	const click = (name: string) =>
		page.getByRole("button", { name, exact: true }).click();
	await expect(stage.locator("canvas")).toBeVisible();
	await expect(page.getByRole("button", { name: "Simple" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("button", {
			name: "The Light Across the Mere",
			exact: true,
		}),
	).toBeVisible();

	await click("+ New sequence");
	await inspector.getByText("Sequence settings", { exact: true }).click();
	await inspector.getByLabel("Sequence name").fill(sequenceName);
	await inspector
		.getByLabel("Stage player near")
		.selectOption("oswin-at-the-well");
	await inspector.getByText("Sequence settings", { exact: true }).click();
	await page.getByRole("checkbox", { name: /Oswin the Ferryman/ }).check();
	await expect(page.getByRole("checkbox", { name: /^Player/ })).toBeChecked();
	await inspector.getByLabel("Look at").selectOption("well-8");
	await click("Close-up");
	await inspector.getByLabel("Look at").selectOption("oswin-at-the-well");
	await inspector
		.getByRole("combobox", { name: "Speaker", exact: true })
		.selectOption("oswin-at-the-well");
	await inspector
		.getByLabel("Dialogue / Subtitle")
		.fill("Keep to the lanterns. I saw a light in the tower.");
	await inspector.getByLabel("Dialogue / Subtitle").blur();
	await inspector.getByLabel("Actor action").selectOption("interact");
	await expect(stage).toContainText("Keep to the lanterns.");
	await expect(stage).toHaveAttribute("data-ready", "true", {
		timeout: 60_000,
	});
	await click("Over-shoulder");
	await expect(inspector.getByLabel("Foreground actor")).toHaveValue(
		"runtime_player",
	);
	await inspector
		.getByRole("combobox", { name: "Speaker", exact: true })
		.selectOption("runtime_player");
	await inspector
		.getByLabel("Dialogue / Subtitle")
		.fill("I’ll follow the path.");
	await inspector.getByLabel("Dialogue / Subtitle").blur();
	await click("Reveal");
	await inspector.getByLabel("Look at").selectOption("watchtower-15");
	await expect(
		storyboard.getByRole("button", { name: /^4. Reveal/ }),
	).toBeVisible();

	await storyboard
		.getByRole("button", { name: /^4. Reveal/ })
		.dragTo(storyboard.getByRole("button", { name: /^3. Over-shoulder/ }));
	await expect(
		storyboard.getByRole("button", { name: /^3. Reveal/ }),
	).toBeVisible();
	await click("Undo");
	await expect(
		storyboard.getByRole("button", { name: /^4. Reveal/ }),
	).toBeVisible();
	await click("Redo");
	await expect(
		storyboard.getByRole("button", { name: /^3. Reveal/ }),
	).toBeVisible();
	await click("Undo");
	await storyboard.getByRole("button", { name: /^4. Reveal/ }).click();
	await click("Duplicate");
	await click("Orbit view");
	const canvas = stage.locator("canvas");
	await canvas.hover();
	await page.mouse.wheel(0, 150);
	await click("Use Current View");
	await expect(
		storyboard.getByRole("button", { name: /^5. Current View/ }),
	).toBeVisible();
	await click("Delete shot");

	await storyboard.getByRole("button", { name: /^2. Close-up/ }).click();
	await page.screenshot({
		path: testInfo.outputPath("cinematics-simple.png"),
		animations: "disabled",
	});
	await click("Advanced");
	const advanced = page.getByRole("region", { name: "Advanced inspector" });
	await advanced.getByLabel("Field of view").fill("43");
	await advanced.getByLabel("Field of view").blur();
	const verticalOffset = advanced
		.getByRole("group", { name: "Camera offset" })
		.getByLabel("Y");
	await verticalOffset.fill("0.2");
	await verticalOffset.blur();
	await click("Simple");
	await click("Advanced");
	await expect(advanced.getByLabel("Field of view")).toHaveValue("43");
	await expect(verticalOffset).toHaveValue("0.2");
	await page.screenshot({
		path: testInfo.outputPath("cinematics-advanced.png"),
		animations: "disabled",
	});

	await click("Save");
	const saved = await savedProject(page);
	const sequence = saved.cutscenes.find(
		({ name }) => name === sequenceName,
	)?.cinematic;
	expect(sequence?.shots.map(({ preset }) => preset)).toEqual([
		"establishing",
		"close-up",
		"over-shoulder",
		"reveal",
	]);
	expect(sequence?.shots[1]).toMatchObject({
		fov: 43,
		positionOffset: { y: 0.2 },
		targetId: "oswin-at-the-well",
	});
	expect(sequence?.shots[3].targetId).toBe("watchtower-15");
	expect(new Set(sequence?.shots.map(({ id }) => id)).size).toBe(4);
	expect(sequence?.castIds).toEqual(["runtime_player", "oswin-at-the-well"]);
	expect(sequence?.cues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				speakerId: "oswin-at-the-well",
				type: "subtitle",
			}),
			expect.objectContaining({
				speakerId: "runtime_player",
				type: "subtitle",
			}),
			expect.objectContaining({
				actorId: "oswin-at-the-well",
				animation: "interact",
				type: "actor",
			}),
		]),
	);
	await reloadProject(page, false);
	await openEditor(page, "cutscenes");
	await click(sequenceName);
	await storyboard.getByRole("button", { name: /^2. Close-up/ }).click();
	await expect(stage).toHaveAttribute("data-ready", "true", {
		timeout: 60_000,
	});
	await expect(stage).toContainText("Keep to the lanterns.");
	const beforePreview = await savedProject(page);
	const savedGame = await readGameSave(page);
	await click("Play preview");
	await click("Skip preview");
	expect(await savedProject(page)).toEqual(beforePreview);
	expect(await readGameSave(page)).toEqual(savedGame);

	const authored = beforePreview.cutscenes.find(
		({ name }) => name === sequenceName,
	);
	if (!authored) throw new Error("Expected the saved cinematic.");
	// Launch the same saved sequence through an existing progression trigger in
	// a separate test project, leaving Merewatch's authored Oswin event alone.
	await importProjectFile(
		page,
		{
			name: "cinematic-runtime-test.json",
			mimeType: "application/json",
			buffer: Buffer.from(
				JSON.stringify({
					...beforePreview,
					progression: [
						...beforePreview.progression,
						{
							id: "test-cinematic-trigger",
							action: { type: "play_cutscene", cutsceneId: authored.id },
						},
					],
				}),
			),
		},
		false,
	);
	await click("Play");
	await click("Play 3D Experimental");
	const cinematic = page.getByRole("dialog", {
		name: authored.name,
		exact: true,
	});
	await expect(cinematic).toContainText("Keep to the lanterns.", {
		timeout: 45_000,
	});
	await click("Skip cinematic");
	await expect(cinematic).toBeHidden();
	const position = page.locator(".three-runtime-hud").getByText(/^Pos: /);
	const beforeMove = await position.innerText();
	await click("Inspect");
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await expect
		.poll(async () => {
			const current = await position.innerText();
			if (current !== beforeMove) return current;
			await page.keyboard.press("ArrowRight");
			return position.innerText();
		})
		.not.toBe(beforeMove);
	expect(errors).toEqual([]);
});
