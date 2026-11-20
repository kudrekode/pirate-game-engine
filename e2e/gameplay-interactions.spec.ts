import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("authors and plays Harbour Trouble through real controls @quest-objectives", async ({
	page,
}) => {
	test.setTimeout(900_000);
	page.setDefaultTimeout(30_000);
	const output = "docs/assets/quest-objectives";
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
		.setInputFiles(
			"docs/assets/gameplay-interactions/tidewatch-harbour.project.json",
		);
	await page.getByRole("button", { name: "Quests", exact: true }).click();
	await page.getByRole("button", { name: "Add quest", exact: true }).click();
	await page.getByLabel("Name", { exact: true }).fill("Harbour Trouble");
	await page
		.getByLabel("Quest completion message")
		.fill("You found the key and gained access to the shack.");
	async function addObjective(
		index: number,
		text: string,
		type: string,
		target: RegExp,
	) {
		await page.getByRole("button", { name: "Add objective" }).click();
		await page
			.getByLabel(`Objective ${index} text`, { exact: true })
			.fill(text);
		const row = page.locator(".quest-objective").nth(index - 1);
		await row.getByLabel("Objective condition type").selectOption(type);
		const value = await row
			.getByRole("option", { name: target })
			.getAttribute("value");
		expect(value).toBeTruthy();
		await row
			.getByLabel(type === "has_item" ? "Objective item" : "Objective target", {
				exact: true,
			})
			.selectOption(value!);
	}
	await addObjective(
		1,
		"Talk to the Harbour Keeper",
		"interaction_completed",
		/Harbour Keeper/,
	);
	await addObjective(2, "Find the Harbour Key", "has_item", /^Harbour Key$/);
	await addObjective(3, "Enter the shack", "enter_event", /Shack interior/);
	await page.getByRole("button", { name: "Map", exact: true }).click();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByLabel("Search scene").fill("Harbour Keeper");
	await page.getByRole("option", { name: /Harbour Keeper/ }).click();
	if ((await page.locator(".scene-gameplay").getAttribute("open")) === null)
		await page.getByText("Properties & gameplay", { exact: true }).click();
	await page
		.getByLabel("Start Quest", { exact: true })
		.selectOption({ label: "Harbour Trouble" });
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	expect(saved).toBeTruthy();
	await fs.writeFile(`${output}/tidewatch-harbour.project.json`, saved! + "\n");
	await page.screenshot({ path: `${output}/authoring.png` });
	const position = async (): Promise<{ x: number; y: number } | null> =>
		JSON.parse(
			(await page
				.locator(".three-runtime-hud")
				.getAttribute("data-traversal-target")) ?? "null",
		);
	async function go(x: number, y: number) {
		console.log(`Quest route: walk to ${x}, ${y}`);
		for (const axis of ["x", "y"] as const)
			for (let step = 0; step < 90; step++) {
				const before = await position();
				if (!before) throw new Error("Player position unavailable");
				const difference = (axis === "x" ? x : y) - before[axis];
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
				const after = await position();
				if (!after) throw new Error("Player position unavailable");
				expect(
					Math.abs(after[axis] - before[axis]),
					`Route blocked at ${JSON.stringify(before)}`,
				).toBeGreaterThan(0.005);
				if (step === 89) throw new Error("Route failed");
			}
	}
	const tracker = page.getByLabel("Current objective", { exact: true });
	const prompt = page.locator(".runtime-interaction-prompt");
	const dialog = page.getByRole("dialog", { name: "Conversation" });
	async function playRoute(replay: boolean) {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect
			.poll(async () => !!(await position()), { timeout: 45_000 })
			.toBe(true);
		await expect(tracker).toContainText("No active quest");
		await page.getByLabel("Three runtime viewport", { exact: true }).focus();
		await go(9, 9.4);
		await go(4.8, 9.4);
		await go(4.8, 5.8);
		await go(6.2, 5.8);
		await expect(prompt).toHaveText("E — Talk");
		await page.keyboard.press("e");
		await expect(dialog).toContainText("Storm did a number on the pier.");
		await expect(tracker).toContainText("No active quest");
		await dialog.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(dialog).toContainText("keep hold of that key");
		await page.keyboard.press("e");
		await expect(dialog).toHaveCount(0);
		await expect(tracker).toContainText("Harbour Trouble");
		await expect(tracker).toContainText("Find the Harbour Key");
		await go(4.8, 5.8);
		await go(4.8, 7.6);
		await go(5.8, 7.6);
		await expect(prompt).toHaveText("E — Open chest");
		await page.keyboard.press("e");
		await expect(tracker).toContainText("Enter the shack");
		await expect(page.locator(".inventory-notifications")).toContainText(
			"Objective Complete: Find the Harbour Key",
		);
		await expect(page.locator(".inventory-notifications")).toContainText(
			"New Objective: Enter the shack",
		);
		if (!replay)
			await page.screenshot({ path: `${output}/objective-update.png` });
		await page.keyboard.press("e");
		await expect(prompt).toHaveText("E — Empty chest");
		await go(4.8, 7.6);
		await go(4.8, 5.2);
		await go(5, 5.2);
		await expect(prompt).toHaveText("E — Enter Shack · Harbour Key retained");
		await page.keyboard.press("e");
		await expect
			.poll(
				async () =>
					JSON.parse(
						(await page
							.locator(".three-runtime-host")
							.getAttribute("data-traversal")) ?? "null",
					)?.y ?? -1,
				{ timeout: 30_000 },
			)
			.toBeCloseTo(4, 1);
		await expect(page.locator(".inventory-notifications")).toContainText(
			"Quest Complete: Harbour Trouble",
		);
		await expect(page.locator(".inventory-notifications")).toContainText(
			"You found the key and gained access to the shack.",
		);
		if (!replay)
			await page.screenshot({ path: `${output}/quest-complete.png` });
		await page
			.getByRole("button", { name: "Back to Edit", exact: true })
			.click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		expect(
			await page.evaluate(() =>
				localStorage.getItem("adventure-builder-project-v1"),
			),
		).toBe(saved);
	}
	await playRoute(false);
	await page.reload();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await playRoute(true);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/observations.json`,
		JSON.stringify(
			{
				errors,
				authoredThroughControls: true,
				explicitStart: true,
				dialogueFinishedBeforeStart: true,
				sequentialObjectives: true,
				pickupFeedback: true,
				keyDoorEntry: true,
				completionFeedback: true,
				authoredProjectUnchanged: true,
				saveReloadEqual: true,
				freshSessionReplayCompleted: true,
			},
			null,
			2,
		) + "\n",
	);
});

test("inspects and retains the Harbour Key with real player input @inventory-items", async ({
	page,
}) => {
	test.setTimeout(600_000);
	page.setDefaultTimeout(30_000);
	const output = "docs/assets/inventory-items";
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
		.setInputFiles(
			"docs/assets/gameplay-interactions/tidewatch-harbour.project.json",
		);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	expect(saved).toBeTruthy();
	const position = async (): Promise<{
		x: number;
		y: number;
		height: number;
	} | null> =>
		JSON.parse(
			(await page
				.locator(".three-runtime-hud")
				.getAttribute("data-traversal-target")) ?? "null",
		);
	async function play() {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect
			.poll(async () => !!(await position()), { timeout: 45_000 })
			.toBe(true);
		await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	}
	async function go(x: number, y: number) {
		console.log(`Inventory route: walk to ${x}, ${y}`);
		for (const axis of ["x", "y"] as const) {
			for (let step = 0; step < 90; step++) {
				const before = await position();
				if (!before) throw new Error("Player position unavailable");
				const difference = (axis === "x" ? x : y) - before[axis];
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
				const after = await position();
				if (!after) throw new Error("Player position unavailable");
				expect(
					Math.abs(after[axis] - before[axis]),
					`Route blocked at ${JSON.stringify(before)}`,
				).toBeGreaterThan(0.005);
				if (step === 89) throw new Error("Route failed");
			}
		}
	}
	const inventory = page.getByRole("dialog", {
		name: "Inventory",
		exact: true,
	});
	const prompt = page.locator(".runtime-interaction-prompt");
	await play();
	await page.getByRole("button", { name: "Inventory I", exact: true }).click();
	await expect(inventory).toContainText("Your inventory is empty");
	const resting = await position();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("e");
	expect(await position()).toEqual(resting);
	await page.keyboard.press("Escape");
	await expect(inventory).toHaveCount(0);
	await go(9, 9.4);
	await go(4.8, 9.4);
	await go(4.8, 5.2);
	await go(5, 5.2);
	await expect(prompt).toHaveText("Requires Harbour Key");
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Door is locked. Requires Harbour Key.",
	);
	await page.screenshot({ path: `${output}/locked-door.png` });
	await go(4.8, 7.6);
	await go(5.8, 7.6);
	await expect(prompt).toHaveText("E — Open chest");
	await page.keyboard.press("i");
	await page.keyboard.press("e");
	await expect(inventory).toContainText("Your inventory is empty");
	await page.keyboard.press("i");
	await expect(prompt).toHaveText("E — Open chest");
	await page.keyboard.press("e");
	await expect(page.locator(".inventory-notifications")).toContainText(
		"Harbour Key acquired",
	);
	await page.screenshot({ path: `${output}/pickup.png` });
	await expect(prompt).toHaveText("E — Empty chest");
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Container is empty.",
	);
	await page.keyboard.press("i");
	await expect(
		inventory.getByRole("button", { name: "Harbour Key ×1", exact: true }),
	).toBeVisible();
	await inventory
		.getByRole("button", { name: "Harbour Key ×1", exact: true })
		.click();
	await expect(
		inventory.getByRole("region", { name: "Item details" }),
	).toContainText("Opens the small shack at Tidewatch Harbour.");
	await expect(inventory).toContainText("Key Item");
	await page.screenshot({ path: `${output}/inventory.png` });
	await inventory.getByRole("button", { name: "Close Esc" }).click();
	await go(4.8, 7.6);
	await go(4.8, 5.2);
	await go(5, 5.2);
	await expect(prompt).toHaveText("E — Enter Shack · Harbour Key retained");
	await page.keyboard.press("e");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-traversal")) ?? "null",
				)?.y ?? -1,
			{ timeout: 30_000 },
		)
		.toBeCloseTo(4, 1);
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Harbour Key retained",
	);
	await page.keyboard.press("i");
	await expect(
		inventory.getByRole("button", { name: "Harbour Key ×1", exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
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
	await page.keyboard.press("i");
	await expect(inventory).toContainText("Your inventory is empty");
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/observations.json`,
		`${JSON.stringify({ errors, lockedRequirement: true, pickupToast: true, keyInspected: true, keyRetained: true, duplicatePrevented: true, modalBlocksInput: true, authoredProjectUnchanged: true, saveReloadEqual: true, freshSessionEmpty: true }, null, "\t")}\n`,
	);
});

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
	await expect(prompt).toHaveText("E — Enter · Harbour Key retained");
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
