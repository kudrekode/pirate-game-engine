import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", viewport: { width: 1100, height: 800 } });
test("authors and plays Tidewatch interactions with real input @gameplay-interactions", async ({
	page,
}) => {
	test.setTimeout(600_000);
	page.setDefaultTimeout(30000);
	const output = "docs/assets/gameplay-interactions";
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("docs/assets/world-kit/tidewatch-harbour.project.json");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	async function select(name: string) {
		console.log(`Authoring: ${name}`);
		await page
			.getByLabel("Search scene")
			.fill(name.replace(/ (object|Character|Event)$/, ""));
		await page.getByRole("option", { name, exact: true }).click();
		if ((await page.locator(".scene-gameplay").getAttribute("open")) === null)
			await page.getByText("Properties & gameplay", { exact: true }).click();
	}
	const fields = page.getByRole("region", { name: "Interaction", exact: true });
	async function enable() {
		await fields.getByLabel("Enable interaction").check();
	}
	await select("Harbour Signpost object");
	await enable();
	await fields.getByLabel("Prompt label").fill("Read sign");
	await fields
		.getByLabel("Message text")
		.fill(
			"Tidewatch Harbour — Traders, sailors and questionable cargo welcome.",
		);
	await select("Wooden Barrel object");
	await enable();
	await fields.getByLabel("Message text").fill("Smells strongly of rum.");
	await fields.getByLabel("Prompt label").fill("Examine barrel");
	await select("Harbour Keeper Character");
	await enable();
	await fields
		.getByLabel("Dialogue line 1")
		.fill("Storm did a number on the pier.");
	await fields.getByRole("button", { name: "Add dialogue line" }).click();
	await fields
		.getByLabel("Dialogue line 2")
		.fill("If you're heading inland, keep hold of that key.");
	await select("Treasure Chest object");
	await page.getByLabel("Position X", { exact: true }).fill("5.8");
	await page.getByLabel("Position Z", { exact: true }).fill("6.8");
	await enable();
	await expect(fields.getByLabel("Interaction type")).toHaveValue("container");
	await fields.getByText("Create reward item", { exact: true }).click();
	await fields.getByLabel("New item name").fill("Harbour Key");
	await fields.getByRole("button", { name: "Create item and use" }).click();
	await expect(fields.getByLabel("Reward quantity")).toHaveValue("1");
	// Existing scene duplication and transforms author two event points.
	await select("Entry Event");
	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	await page.getByLabel("Scene name").fill("Shack interior");
	await page.getByLabel("Position X", { exact: true }).fill("5");
	await page.getByLabel("Position Z", { exact: true }).fill("4");
	await select("Entry Event");
	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	await page.getByLabel("Scene name").fill("Quayside");
	await page.getByLabel("Position X", { exact: true }).fill("9");
	await page.getByLabel("Position Z", { exact: true }).fill("6");
	await page
		.getByRole("combobox", { name: "Kind", exact: true })
		.selectOption("trigger");
	await enable();
	await fields
		.getByLabel("Message text")
		.fill("The eastern quay. Mind the loose boards.");
	await select("Small Shack object");
	await enable();
	await fields.getByLabel("Interaction type").selectOption("door");
	await fields.getByLabel("Destination area").selectOption("area_main");
	await fields
		.getByLabel("Arrival point")
		.selectOption({ label: "Shack interior" });
	await fields
		.getByLabel("Required item")
		.selectOption({ label: "Harbour Key" });
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	console.log("Authored and saved the interaction route");
	expect(saved).toBeTruthy();
	await fs.writeFile(
		`${output}/tidewatch-harbour.project.json`,
		JSON.stringify(JSON.parse(saved!), null, 2) + "\n",
	);
	const position = async () =>
		JSON.parse(
			(await page
				.locator(".three-runtime-hud")
				.getAttribute("data-traversal-target")) ?? "null",
		) as { x: number; y: number; height: number };
	async function play() {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect
			.poll(async () => !!(await position()), { timeout: 45000 })
			.toBe(true);
		await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	}
	async function go(x: number, y: number) {
		console.log(`Walk to ${x}, ${y}`);
		for (const axis of ["x", "y"] as const)
			for (let step = 0; step < 90; step++) {
				const before = await position(),
					difference = (axis === "x" ? x : y) - before[axis];
				if (Math.abs(difference) < 0.115) break;
				await page.keyboard.press(
					axis === "x"
						? difference > 0
							? "ArrowRight"
							: "ArrowLeft"
						: difference > 0
							? "ArrowDown"
							: "ArrowUp",
				);
				await page.waitForTimeout(90);
				expect(
					Math.abs((await position())[axis] - before[axis]),
					`route to ${x},${y} from ${JSON.stringify(before)}`,
				).toBeGreaterThan(0.005);
				if (step === 89) throw new Error("Route failed");
			}
	}
	const prompt = page.locator(".runtime-interaction-prompt");
	const dialog = page.getByRole("dialog", { name: "Conversation" });
	await play();
	await go(9, 9.4);
	await go(7.2, 9.4);
	await expect(prompt).toHaveText("E — Read sign");
	await page.keyboard.press("e");
	await expect(dialog).toContainText("questionable cargo welcome");
	const resting = await position();
	await page.keyboard.press("ArrowRight");
	expect(await position()).toEqual(resting);
	await page.screenshot({ path: `${output}/message.png` });
	await page.keyboard.press("Escape");
	await go(5.8, 9.4);
	await go(5.8, 7.6);
	await expect(prompt).toHaveText("E — Open chest");
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Received: Harbour Key ×1.",
	);
	await expect(page.locator(".runtime-opened-label")).toHaveText("Opened");
	await expect(prompt).toHaveText("E — Empty chest");
	await page.screenshot({ path: `${output}/opened-chest.png` });
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Container is empty.",
	);
	await go(4.8, 7.6);
	await go(4.8, 5.8);
	await go(6.2, 5.8);
	await expect(prompt).toHaveText("E — Talk");
	await page.keyboard.press("e");
	await expect(dialog).toContainText("Storm did a number on the pier.");
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await expect(dialog).toContainText("keep hold of that key");
	await page.keyboard.press("e");
	await expect(dialog).toHaveCount(0);
	await go(6.2, 5.2);
	await go(9, 5.2);
	await go(9, 5.8);
	await expect(dialog).toContainText("Mind the loose boards.");
	await page.keyboard.press("Escape");
	await go(9, 6.2);
	await go(9, 5.2);
	await go(9, 6.2);
	await expect(dialog).toHaveCount(0);
	await go(9, 5.2);
	await go(5, 5.2);
	await expect(prompt).toHaveText("E — Enter");
	await page.keyboard.press("e");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-traversal")) ?? "null",
				)?.y ?? -1,
			{ timeout: 30000 },
		)
		.toBeCloseTo(4, 1);
	// Interior wall still stops real movement after the key-gated transition.
	await page.keyboard.down("ArrowLeft");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-traversal")) ?? "{}",
				).reason ?? "",
			{ timeout: 30000 },
		)
		.toMatch(/Blocked by Small Shack/);
	await page.keyboard.up("ArrowLeft");
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await page.reload();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await play();
	await go(9, 9.4);
	await go(5.8, 9.4);
	await go(5.8, 7.6);
	await expect(prompt).toHaveText("E — Open chest");
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Received: Harbour Key ×1.",
	);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/observations.json`,
		JSON.stringify(
			{
				errors,
				authoredObjectCount: JSON.parse(saved!).areas[0].objects.length,
				chestPosition: { x: 5.8, z: 6.8 },
				signRead: true,
				inputPaused: true,
				chestRewardOnce: true,
				dialogueCompleted: true,
				triggerOnce: true,
				keyDoorTransition: true,
				interiorWallBlocked: true,
				exactProjectEquality: true,
				reloadRewardReset: true,
			},
			null,
			2,
		) + "\n",
	);
});
