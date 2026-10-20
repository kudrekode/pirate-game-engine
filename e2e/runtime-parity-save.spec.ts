import fs from "node:fs/promises";
import { expect as baseExpect, type Page, test } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 30_000 });
// Match the established harbour acceptance viewport; this is not a performance benchmark.
test.use({
	viewport: { width: 1100, height: 800 },
	// Keep action/DOM traces and failure PNGs; continuous WebGL screencasts
	// add readbacks to every frame and are not needed by these semantic checks.
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
});
const output =
	process.env.RUNTIME_PARITY_OUTPUT ?? "docs/assets/runtime-parity";
const projectKey = "adventure-builder-project-v1";
type Npc = {
	id: string;
	x: number;
	y: number;
	facing: string;
	health: number;
	position: number[];
	animation: string;
};
type ParityObservation = {
	positions: string[];
	states: string[];
	heights: number[];
	interpolated: boolean;
};
declare global {
	interface Window {
		__PARITY_OBSERVATIONS__: Record<string, ParityObservation>;
	}
}
async function npcs(page: Page): Promise<Npc[]> {
	return JSON.parse(
		(await page.locator(".three-runtime-host").getAttribute("data-npcs")) ??
			"[]",
	);
}
async function authored(page: Page) {
	return page.evaluate((key) => localStorage.getItem(key), projectKey);
}
async function importProject(page: Page, file: string) {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	if (await page.getByRole("button", { name: /Blank Project/ }).isVisible())
		await page.getByRole("button", { name: /Blank Project/ }).click();
	await page.locator('input[type="file"]').setInputFiles(file);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	return authored(page);
}
async function play(page: Page, resume = false) {
	await page.getByRole("button", { name: "Play", exact: true }).click();
	if (resume)
		await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect(
		page.getByLabel("Three runtime viewport", { exact: true }),
	).toBeVisible();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
}
async function exitAndCheck(page: Page, original: string | null) {
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(await authored(page)).toBe(original);
}
async function saveSlot(page: Page) {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((key) =>
			key.startsWith("adventure-builder-game-save-v1:"),
		);
		return key ? JSON.parse(localStorage.getItem(key)!) : null;
	});
}

test("NPC movement, dialogue, F combat and durable defeat through real controls @runtime-parity-save", async ({
	page,
}) => {
	test.setTimeout(300_000);
	page.setDefaultTimeout(30_000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const original = await importProject(
		page,
		"docs/assets/runtime-parity/runtime-parity-demo.project.json",
	);
	await play(page);
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 2, 7");
	await expect.poll(async () => (await npcs(page)).length).toBe(5);
	// Observe RAF before any input; retain fleeting walk/interpolation states.
	await page.evaluate(() => {
		const observed: Record<
			string,
			{
				positions: string[];
				states: string[];
				heights: number[];
				interpolated: boolean;
			}
		> = {};
		window.__PARITY_OBSERVATIONS__ = observed;
		function sample() {
			const host = document.querySelector<HTMLElement>(".three-runtime-host");
			if (!host) return;
			for (const npc of JSON.parse(host.dataset.npcs ?? "[]")) {
				observed[npc.id] ??= {
					positions: [],
					states: [],
					heights: [],
					interpolated: false,
				};
				const row = observed[npc.id];
				const grid = `${npc.x},${npc.y}`;
				if (!row.positions.includes(grid)) row.positions.push(grid);
				if (!row.states.includes(npc.animation)) row.states.push(npc.animation);
				if (npc.position) {
					if (row.heights.length < 200) row.heights.push(npc.position[1]);
					row.interpolated ||= [npc.position[0], npc.position[2]].some(
						(n: number) => Math.abs(n * 2 - Math.round(n * 2)) > 0.04,
					);
				}
			}
			requestAnimationFrame(sample);
		}
		requestAnimationFrame(sample);
	});
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					["wander_west", "wander_east", "patrol_lookout"].every((id) => {
						const row = window.__PARITY_OBSERVATIONS__[id];
						return (
							row?.positions.length > 1 &&
							row.states.includes("walk") &&
							row.states.includes("idle") &&
							row.interpolated
						);
					}),
				),
			{ timeout: 60_000 },
		)
		.toBe(true);
	const observations = await page.evaluate(
		() => window.__PARITY_OBSERVATIONS__,
	);
	expect(observations.idle_guide.positions).toEqual(["2,6"]);
	expect(observations.idle_guide.states).toContain("idle");
	expect(observations.idle_guide.states).not.toContain("walk");
	expect(Math.min(...observations.wander_east.heights)).toBeGreaterThan(1.2);
	for (const npc of await npcs(page)) {
		if (npc.id === "wander_west") expect(npc.x).toBeLessThan(5);
		if (npc.id === "wander_east") expect(npc.x).toBeGreaterThan(5);
	}
	await page.keyboard.press("ArrowUp"); // face the blocking guide
	await page.keyboard.press("e");
	const dialog = page.getByRole("dialog", { name: "Conversation" });
	await expect(dialog).toContainText("Everyone pauses while we talk");
	const paused = (await npcs(page)).map(({ id, x, y }) => ({ id, x, y }));
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("KeyF");
	await page.waitForTimeout(1500);
	expect((await npcs(page)).map(({ id, x, y }) => ({ id, x, y }))).toEqual(
		paused,
	);
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 2, 7");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toContainText(
		"before saving",
	);
	expect(await saveSlot(page)).toBeNull();
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await dialog.getByRole("button", { name: "Close", exact: true }).click();
	await expect
		.poll(
			async () =>
				JSON.stringify(
					(await npcs(page)).map(({ id, x, y }) => ({ id, x, y })),
				),
			{ timeout: 15_000 },
		)
		.not.toBe(JSON.stringify(paused));
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	const beforeContact = await page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 3, 7");
	await expect
		.poll(
			async () => (await npcs(page)).find((n) => n.id === "sparring_guard")?.x,
			{ timeout: 30_000 },
		)
		.toBe(4);
	await expect(page.locator(".three-runtime-hud")).not.toContainText(
		"Health 100/100",
	);
	await page.keyboard.press("KeyF");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard 25/50",
	);
	const afterDamage = await page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
	expect(afterDamage.scene.buildCount).toBe(beforeContact.scene.buildCount);
	expect(afterDamage.asset.cloneCount).toBe(beforeContact.asset.cloneCount);
	expect(afterDamage.raf.activeLoopCount).toBe(1);
	await page.waitForTimeout(550);
	await page.keyboard.press("KeyF");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard defeated.",
	);
	await expect
		.poll(async () => (await npcs(page)).some((n) => n.id === "sparring_guard"))
		.toBe(false);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!
						.asset.character.animation.activeMixers,
			),
		)
		.toBe(5);
	const afterDefeat = await page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
	expect(afterDefeat.scene.buildCount).toBe(beforeContact.scene.buildCount);
	expect(afterDefeat.asset.cloneCount).toBe(beforeContact.asset.cloneCount);
	expect(afterDefeat.scene.cleanupCount).toBe(beforeContact.scene.cleanupCount);
	expect(afterDefeat.raf.activeLoopCount).toBe(1);
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 4, 7");
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
						?.asset.character.animation.playerState,
			),
		)
		.toBe("idle");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	const saved = await saveSlot(page);
	expect(saved.world.defeatedNpcIds).toContain("sparring_guard");
	await page.screenshot({ path: `${output}/combat-complete.png` });
	await exitAndCheck(page, original);
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await play(page, true);
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 4, 7");
	await expect.poll(async () => (await npcs(page)).length).toBe(4);
	expect((await npcs(page)).some((n) => n.id === "sparring_guard")).toBe(false);
	await exitAndCheck(page, original);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/parity-observations.json`,
		JSON.stringify(
			{
				errors,
				observations,
				saved,
				projectUnchanged: true,
				dialoguePaused: true,
				contactDamage: true,
				defeatContinued: true,
			},
			null,
			2,
		) + "\n",
	);
});

test("Tidewatch Harbour Trouble Save / reload / Continue through real controls @runtime-parity-save", async ({
	page,
}) => {
	test.setTimeout(1_200_000);
	page.setDefaultTimeout(30_000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const original = await importProject(
		page,
		"docs/assets/quest-objectives/tidewatch-harbour.project.json",
	);
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
	async function go(x: number, y: number) {
		console.log(`Save route: walk to ${x}, ${y}`);
		for (const axis of ["x", "y"] as const) {
			let before = await position();
			for (let step = 0; step < 90; step++) {
				if (!before) throw new Error("Player position unavailable");
				const diff = (axis === "x" ? x : y) - before[axis];
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
				const after = await position();
				expect(
					Math.abs(after![axis] - before[axis]),
					`Route blocked at ${JSON.stringify(before)}`,
				).toBeGreaterThan(0.005);
				before = after;
				if (step === 89) throw new Error("Route failed");
			}
		}
	}

	const tracker = page.getByLabel("Current objective", { exact: true });
	const prompt = page.locator(".runtime-interaction-prompt");
	const dialog = page.getByRole("dialog", { name: "Conversation" });
	await play(page);
	await expect.poll(async () => !!(await position())).toBe(true);
	await expect(tracker).toContainText("No active quest");
	await go(9, 9.4);
	await go(4.8, 9.4);
	await go(4.8, 5.8);
	await go(6.2, 5.8);
	await expect(prompt).toHaveText("E — Talk");
	await page.keyboard.press("e");
	await expect(dialog).toContainText("Storm did a number on the pier.");
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await page.keyboard.press("e");
	await expect(dialog).toHaveCount(0);
	await expect(tracker).toContainText("Find the Harbour Key");
	// Visit the existing one-time trigger using the previously accepted north route.
	await go(6.2, 5.2);
	await go(9, 5.2);
	await go(9, 5.8);
	await expect(dialog).toContainText("Mind the loose boards.");
	await page.keyboard.press("Escape");
	await go(9, 5.2);
	await go(4.8, 5.2);
	await go(4.8, 7.6);
	await go(5.8, 7.6);
	await expect(prompt).toHaveText("E — Open chest");
	await page.keyboard.press("e");
	await expect(tracker).toContainText("Enter the shack");
	await expect(prompt).toHaveText("E — Empty chest");
	// Save at a distinctive fractional position away from the chest.
	await go(4.8, 7.6);
	await go(4.8, 8.2);
	const atSave = await position();
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	const firstSave = await saveSlot(page);
	expect(firstSave.world.firedInteractionIds).toHaveLength(1);
	expect(firstSave.player.traversal.x).toBeCloseTo(atSave!.x, 6);
	await exitAndCheck(page, original);
	await page.reload();
	expect(await authored(page)).toBe(original);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await play(page, true);
	await expect.poll(position).toEqual(atSave);
	await expect(tracker).toContainText("Enter the shack");
	await expect(page.locator(".inventory-notifications")).toBeEmpty();
	await page.keyboard.press("i");
	const inventory = page.getByRole("dialog", {
		name: "Inventory",
		exact: true,
	});
	await expect(inventory).toContainText("Harbour Key");
	await page.keyboard.press("Escape");
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await go(4.8, 7.6);
	await go(5.8, 7.6);
	await expect(prompt).toHaveText("E — Empty chest");
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Container is empty.",
	);
	await page.screenshot({ path: `${output}/tidewatch-continued.png` });
	await go(4.8, 7.6);
	await go(4.8, 5.2);
	await go(9, 5.2);
	await go(9, 5.8);
	await expect(dialog).toHaveCount(0); // already fired before saving
	await go(9, 5.2);
	await go(5, 5.2);
	await expect(prompt).toHaveText("E — Enter Shack · Harbour Key retained");
	await page.keyboard.press("e");
	await expect(page.locator(".inventory-notifications")).toContainText(
		"Quest Complete: Harbour Trouble",
	);
	await expect.poll(position).toMatchObject({ x: 5, y: 4 });
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	const completedSave = await saveSlot(page);
	expect(Object.values(completedSave.quests.statuses)).toEqual(["completed"]);
	expect(completedSave.state.inventory).toEqual(firstSave.state.inventory);
	await exitAndCheck(page, original);
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await play(page, true);
	await expect.poll(position).toMatchObject({ x: 5, y: 4 });
	await expect(tracker).toContainText("No active quest");
	await expect(page.locator(".inventory-notifications")).toBeEmpty();
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	expect((await saveSlot(page)).quests).toEqual(completedSave.quests);
	await page.screenshot({
		path: `${output}/tidewatch-completed-continued.png`,
	});
	await exitAndCheck(page, original);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/save-observations.json`,
		JSON.stringify(
			{
				errors,
				atSave,
				firstSave,
				completedSave,
				projectUnchanged: true,
				keyRetained: true,
				chestEmpty: true,
				oneTimeTriggerNotReplayed: true,
				completionRetained: true,
			},
			null,
			2,
		) + "\n",
	);
});

test("five harbour patrols retain actors and pause hidden editor rendering @runtime-performance", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await fs.mkdir(output, { recursive: true });
	const project = JSON.parse(
		await fs.readFile(
			"docs/assets/quest-objectives/tidewatch-harbour.project.json",
			"utf8",
		),
	);
	const area = project.areas[0],
		keeper = area.npcs[0];
	for (const [i, [x, y, end]] of [
		[1, 8, 10],
		[3, 8, 10],
		[5, 8, 10],
		[8, 9, 10],
		[13, 8, 10],
	].entries()) {
		area.npcs.push({
			...structuredClone(keeper),
			id: "harbour_patrol_" + i,
			nameOverride: "Harbour patrol " + i,
			x,
			y,
			transform: undefined,
			interaction: undefined,
			interactionOverride: {
				type: "show_message",
				activationMode: "disabled",
				lines: [],
			},
			movementMode: "patrol",
			movementOverride: {
				movementMode: "patrol",
				movementSpeed: 1,
				patrolPath: {
					loop: true,
					points: [
						{ x, y },
						{ x, y: end },
					],
				},
			},
			patrolPath: {
				loop: true,
				points: [
					{ x, y },
					{ x, y: end },
				],
			},
		});
	}
	const fixture = output + "/five-patrols.project.json";
	await fs.writeFile(fixture, JSON.stringify(project));
	const original = await importProject(page, fixture);
	// Capture the settled editor canvas, after asynchronous asset replacement.
	await expect
		.poll(() =>
			page.evaluate(() => {
				const s =
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview");
				return (
					s?.asset.character.activeCloneInstances === 7 &&
					s.asset.statusCounts.loading === 0
				);
			}),
		)
		.toBe(true);
	const editorCanvas = await page
		.getByLabel("3D preview viewport")
		.locator("canvas")
		.first()
		.elementHandle();
	await play(page);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const s =
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
				return (
					s?.asset.character.animation.activeMixers === 7 &&
					s.asset.character.animation.loadingSourceCount === 0
				);
			}),
		)
		.toBe(true);
	const before = await page.evaluate(() =>
		window.__THREE_PERF_DIAGNOSTICS__!.getSnapshots(),
	);
	const actors = await page.evaluate(
		() =>
			new Promise<Record<string, { positions: string[]; states: string[] }>>(
				(resolve) => {
					const rows: Record<
						string,
						{ positions: Set<string>; states: Set<string> }
					> = {};
					const stopAt = performance.now() + 6500;
					function sample() {
						for (const n of JSON.parse(
							document.querySelector<HTMLElement>(".three-runtime-host")!
								.dataset.npcs ?? "[]",
						)) {
							rows[n.id] ??= {
								positions: new Set(),
								states: new Set(),
							};
							const row = rows[n.id];
							row.positions.add(n.x + "," + n.y);
							row.states.add(n.animation);
						}
						if (performance.now() < stopAt) requestAnimationFrame(sample);
						else
							resolve(
								Object.fromEntries(
									Object.entries(rows).map(([id, row]) => [
										id,
										{ positions: [...row.positions], states: [...row.states] },
									]),
								),
							);
					}
					sample();
				},
			),
	);
	for (let i = 0; i < 5; i++) {
		expect(actors["harbour_patrol_" + i].positions.length).toBeGreaterThan(1);
		expect(actors["harbour_patrol_" + i].states).toEqual(
			expect.arrayContaining(["idle", "walk"]),
		);
	}
	const after = await page.evaluate(() =>
		window.__THREE_PERF_DIAGNOSTICS__!.getSnapshots(),
	);
	expect(after.ThreeRuntimePanel.scene.buildCount).toBe(
		before.ThreeRuntimePanel.scene.buildCount,
	);
	expect(after.ThreeRuntimePanel.asset.cloneCount).toBe(
		before.ThreeRuntimePanel.asset.cloneCount,
	);
	expect(after.ThreeRuntimePanel.asset.loadStartedCount).toBe(
		before.ThreeRuntimePanel.asset.loadStartedCount,
	);
	expect(after.ThreeRuntimePanel.raf.activeLoopCount).toBe(1);
	expect(after.ThreeDPreview.frame.frameCount).toBe(
		before.ThreeDPreview.frame.frameCount,
	);
	expect(after.ThreeRuntimePanel.asset.character.animation.activeMixers).toBe(
		7,
	);
	await page.screenshot({ path: output + "/five-patrols.png" });
	await exitAndCheck(page, original);
	expect(await editorCanvas!.evaluate((node) => node.isConnected)).toBe(true);
	await expect(
		page.getByLabel("3D preview viewport").locator("canvas").first(),
	).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeDPreview")!.frame
						.frameCount,
			),
		)
		.toBeGreaterThan(after.ThreeDPreview.frame.frameCount);
	expect(
		await page.evaluate(() =>
			window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel"),
		),
	).toBeNull();
	expect(errors).toEqual([]);
	await fs.writeFile(
		output + "/five-patrols.json",
		JSON.stringify(
			{
				actors,
				before,
				after,
				errors,
				projectUnchanged: true,
				editorCanvasPreserved: true,
			},
			null,
			2,
		),
	);
});

// Golden combat extends this existing real-input/save route. The observer reads
// only diagnostic state; no runtime mutation or animation timing hook is used.
declare global {
	interface Window {
		__GOLDEN_COMBAT__?: {
			player: string[];
			npc: Record<string, string[]>;
			dying: string[];
			frames: number;
			firstAttackAt: number;
			firstAttackAt: number;
		};
	}
}
async function observeGoldenCombat(page: Page) {
	await page.evaluate(() => {
		const o = {
			player: [] as string[],
			npc: {} as Record<string, string[]>,
			dying: [] as string[],
			frames: 0,
			firstAttackAt: 0,
		};
		window.__GOLDEN_COMBAT__ = o;
		window.addEventListener(
			"keydown",
			(event) => {
				if (event.code === "KeyF" && !o.firstAttackAt)
					o.firstAttackAt = event.timeStamp;
			},
			{ capture: true },
		);
		const sample = () => {
			const host = document.querySelector<HTMLElement>(".three-runtime-host");
			if (!host) return;
			const d =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
			if (d) {
				o.frames++;
				const state = d.asset.character.animation.playerState;
				if (state === "attack" && !o.firstAttackAt)
					o.firstAttackAt = performance.now();
				if (!o.player.includes(state)) o.player.push(state);
			}
			for (const n of JSON.parse(host.dataset.npcs ?? "[]")) {
				o.npc[n.id] ??= [];
				if (!o.npc[n.id].includes(n.animation)) o.npc[n.id].push(n.animation);
			}
			for (const id of JSON.parse(host.dataset.dyingNpcs ?? "[]"))
				if (!o.dying.includes(id)) o.dying.push(id);
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
}
async function settledGolden(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const d =
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
				return (
					d &&
					d.asset.statusCounts.loading === 0 &&
					d.asset.character.animation.loadingSourceCount === 0 &&
					d.frame.frameCount > 30
				);
			}),
		)
		.toBe(true);
	const d = await page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
	expect(d.asset.character.animation.missingClipCount).toBe(0);
	expect(d.asset.character.animation.incompatibleClipCount).toBe(0);
	return d;
}
test("Golden combat actions, immediate collision removal, visible Death and Continue @golden-combat", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const out =
		process.env.GOLDEN_COMBAT_OUTPUT ?? "docs/assets/golden-combat-v1";
	await fs.mkdir(out, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const original = await importProject(
		page,
		"golden-combat-animation-demo.project.json",
	);
	await play(page);
	const before = await settledGolden(page);
	await observeGoldenCombat(page);
	await page.keyboard.press("KeyF");
	await page.keyboard.press("KeyF");
	await expect
		.poll(() =>
			page.evaluate(() => window.__GOLDEN_COMBAT__?.player.includes("attack")),
		)
		.toBe(true);
	expect(
		(
			await page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
			)
		).asset.character.animation.oneShotActionsTriggered,
	).toBe(1);
	const sinceFirstAttack = await page.evaluate(
		() => performance.now() - window.__GOLDEN_COMBAT__!.firstAttackAt,
	);
	await page.waitForTimeout(Math.max(0, 505 - sinceFirstAttack));
	expect(
		await page.evaluate(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!
					.asset.character.animation.playerState,
		),
	).toBe("attack");
	await page.keyboard.press("KeyF");
	expect(
		(
			await page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
			)
		).asset.character.animation.oneShotActionsTriggered,
	).toBe(2);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
						?.asset.character.animation.playerState,
			),
		)
		.toBe("idle");
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 3, 7");
	await expect
		.poll(() =>
			page.evaluate(() => window.__GOLDEN_COMBAT__?.player.includes("walk")),
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(() => window.__GOLDEN_COMBAT__?.player.includes("hit")),
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.__GOLDEN_COMBAT__?.npc.sparring_guard?.includes("attack"),
			),
		)
		.toBe(true);
	await page.keyboard.press("KeyF");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard 25/50",
	);
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.__GOLDEN_COMBAT__?.npc.sparring_guard?.includes("hit"),
			),
		)
		.toBe(true);
	await page.waitForTimeout(600);
	await page.keyboard.press("KeyF");
	await expect
		.poll(async () => (await npcs(page)).some((n) => n.id === "sparring_guard"))
		.toBe(false);
	await expect
		.poll(() =>
			page.locator(".three-runtime-host").getAttribute("data-dying-npcs"),
		)
		.toContain("sparring_guard");
	// Real movement crosses the old collider while its dying group remains.
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 4, 7");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	const saved = await saveSlot(page);
	expect(saved.world.defeatedNpcIds).toContain("sparring_guard");
	expect(JSON.stringify(saved)).not.toContain("dying");
	await page.screenshot({ path: `${out}/gameplay-death.png` });
	await expect
		.poll(() =>
			page.locator(".three-runtime-host").getAttribute("data-dying-npcs"),
		)
		.toBe("[]");
	const after = await page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
	expect(after.scene.buildCount).toBe(before.scene.buildCount);
	expect(after.scene.cleanupCount).toBe(before.scene.cleanupCount);
	expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
	expect(after.asset.character.animation.activeMixers).toBe(
		before.asset.character.animation.activeMixers - 1,
	);
	const observation = await page.evaluate(() => window.__GOLDEN_COMBAT__);
	await fs.writeFile(
		`${out}/browser-observations.json`,
		JSON.stringify(
			{
				before,
				after,
				observation,
				acceptedRepeatWhileAttack: true,
				savedDuringDeath: true,
				errors,
			},
			null,
			2,
		),
	);
	await exitAndCheck(page, original);
	await play(page, true);
	await settledGolden(page);
	expect((await npcs(page)).some((n) => n.id === "sparring_guard")).toBe(false);
	expect(
		await page.locator(".three-runtime-host").getAttribute("data-dying-npcs"),
	).toBe("[]");
	await exitAndCheck(page, original);
	expect(errors).toEqual([]);
});
test("Golden player actual death holds its pose @golden-combat", async ({
	page,
}, info) => {
	test.setTimeout(120_000);
	const fixture = JSON.parse(
		await fs.readFile("golden-combat-animation-demo.project.json", "utf8"),
	);
	fixture.metadata.name = "Golden actual defeat acceptance";
	fixture.player.combat.health = 1;
	const file = info.outputPath("actual-death.project.json");
	await fs.writeFile(file, JSON.stringify(fixture));
	const original = await importProject(page, file);
	await play(page);
	await settledGolden(page);
	await observeGoldenCombat(page);
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Health 0/100",
	);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
						?.asset.character.animation.playerState,
			),
		)
		.toBe("defeated");
	await page.waitForTimeout(1700);
	await page.screenshot({
		path: `${process.env.GOLDEN_COMBAT_OUTPUT ?? "docs/assets/golden-combat-v1"}/player-death.png`,
	});
	expect(
		await page.evaluate(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
					?.asset.character.animation.playerState,
		),
	).toBe("defeated");
	await exitAndCheck(page, original);
});
test("Golden successful completion never selects Death @golden-combat", async ({
	page,
}, info) => {
	test.setTimeout(120_000);
	const fixture = JSON.parse(
		await fs.readFile("golden-combat-animation-demo.project.json", "utf8"),
	);
	fixture.metadata.name = "Golden success acceptance";
	fixture.areas[0].npcs = [];
	fixture.areas[0].eventBlocks.push({
		id: "finish",
		name: "Finish",
		x: 3,
		y: 7,
		kind: "trigger",
		tag: "finish",
	});
	fixture.progression.push(
		{
			id: "wait",
			action: {
				type: "wait_for_trigger",
				areaId: fixture.areas[0].id,
				eventBlockId: "finish",
			},
		},
		{ id: "end", action: { type: "end_game" } },
	);
	const file = info.outputPath("successful-end.project.json");
	await fs.writeFile(file, JSON.stringify(fixture));
	const original = await importProject(page, file);
	await play(page);
	await settledGolden(page);
	await observeGoldenCombat(page);
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Game complete.",
	);
	await page.waitForTimeout(1500);
	expect(
		await page.evaluate(() =>
			window.__GOLDEN_COMBAT__?.player.includes("defeated"),
		),
	).toBe(false);
	expect(
		await page.evaluate(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
					?.asset.character.animation.playerState,
		),
	).toBe("idle");
	await page.screenshot({
		path: `${process.env.GOLDEN_COMBAT_OUTPUT ?? "docs/assets/golden-combat-v1"}/successful-completion.png`,
	});
	await exitAndCheck(page, original);
});
