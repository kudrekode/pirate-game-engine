import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
	importProjectFile,
	openEditor,
	readGameSave,
	requireGameSave,
} from "./projectNavigation";

const button = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });
const dialog = (page: Page) =>
	page.getByRole("dialog", { name: "Conversation", exact: true });
const viewport = (page: Page) =>
	page.getByLabel("Three runtime viewport", { exact: true });
const hud = (page: Page) => page.locator(".three-runtime-hud");
const choice = (page: Page, name: string) =>
	dialog(page).getByRole("button", { name, exact: true }).click();
const close = (page: Page) => choice(page, "End conversation");
const next = (page: Page) => choice(page, "Next");

test.use({
	viewport: { width: 1160, height: 820 },
	trace: process.env.CHAPTER_OFFLINE_WEB_ROOT
		? "off"
		: { mode: "retain-on-failure", screenshots: false, snapshots: true },
});

async function serveOfflineBuild(page: Page) {
	const build = process.env.CHAPTER_OFFLINE_WEB_ROOT;
	if (!build) return;
	const roots = [resolve(build), resolve("public")];
	await page.route("http://127.0.0.1:5173/**", (route) => {
		const url = new URL(route.request().url());
		const relative =
			url.pathname === "/"
				? "index.html"
				: decodeURIComponent(url.pathname.slice(1));
		const file = roots
			.map((root) => ({ root, path: resolve(root, relative) }))
			.find(
				({ root, path }) => path.startsWith(root + sep) && existsSync(path),
			);
		return file
			? route.fulfill({ path: file.path })
			: route.fulfill({ status: 404 });
	});
}

async function inspect(page: Page) {
	await expect(viewport(page)).toBeVisible();
	await button(page, "Inspect").click();
	await viewport(page).focus();
}

async function walk(page: Page, ...waypoints: [number, number][]) {
	await viewport(page).focus();
	for (const [x, y] of waypoints) {
		await expect
			.poll(
				() =>
					page.evaluate(
						({ x, y }) => {
							const position =
								document.querySelector<HTMLElement>(".three-runtime-hud")
									?.dataset.traversalTarget;
							if (!position) return "Loading traversal";
							const current = JSON.parse(position) as { x: number; y: number };
							const dx = x - current.x,
								dy = y - current.y;
							if (Math.abs(dx) <= 0.26 && Math.abs(dy) <= 0.26)
								return `${x},${y}`;
							const key =
								Math.abs(dx) > 0.26
									? dx > 0
										? "ArrowRight"
										: "ArrowLeft"
									: dy > 0
										? "ArrowDown"
										: "ArrowUp";
							// Send one tap in the same task. A renderer stalled in software
							// can otherwise advance several held-key steps between CDP calls.
							const options = {
								key,
								code: key,
								bubbles: true,
								cancelable: true,
							};
							window.dispatchEvent(new KeyboardEvent("keydown", options));
							window.dispatchEvent(new KeyboardEvent("keyup", options));
							return `${current.x.toFixed(2)},${current.y.toFixed(2)}`;
						},
						{ x, y },
					),
				{
					intervals: [85, 110, 125],
					timeout: 42_000,
					message: `Walk to ${x},${y}`,
				},
			)
			.toBe(`${x},${y}`);
	}
}

async function interact(page: Page, name: string) {
	await viewport(page).focus();
	await expect
		.poll(
			async () => {
				if (!(await dialog(page).isVisible())) await page.keyboard.press("e");
				return dialog(page).isVisible();
			},
			{ message: `Interact with ${name}` },
		)
		.toBe(true);
}

async function answer(page: Page, subject: string, reply: string) {
	await interact(page, subject);
	await choice(page, reply);
	await close(page);
}

async function cinematic(page: Page, name: string, skip: boolean) {
	const scene = page.getByRole("dialog", { name, exact: true });
	if (skip)
		await scene
			.getByRole("button", { name: "Skip cinematic", exact: true })
			.click();
	await expect(scene).toBeHidden({ timeout: 35_000 });
	await close(page);
}

async function capture(page: Page, path: string) {
	const cdp = await page.context().newCDPSession(page);
	try {
		const { data } = await cdp.send("Page.captureScreenshot", {
			format: "png",
		});
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, Buffer.from(data, "base64"));
	} finally {
		await cdp.detach();
	}
}

async function transition(
	page: Page,
	label: string,
	reply: string,
	nextArea: string,
) {
	await answer(page, label, reply);
	await expect(hud(page).getByText(nextArea, { exact: true })).toBeVisible();
	await inspect(page);
}

async function save(page: Page) {
	await button(page, "Save Game").click();
	const replace = button(page, "Replace save");
	if (await replace.isVisible()) await replace.click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	return requireGameSave(page);
}

async function resume(page: Page) {
	await button(page, "Back to Edit").click();
	await page.getByRole("button", { name: /Test Flow$/ }).click();
	await button(page, "Continue").click();
	await inspect(page);
}

type PlayNpc = {
	id: string;
	x: number;
	y: number;
	health: number;
	clip?: string;
};
declare global {
	interface Window {
		chapterObservedClips?: Record<string, string[]>;
	}
}

async function observeClips(page: Page) {
	await page.evaluate(() => {
		const observed: Record<string, string[]> = {};
		window.chapterObservedClips = observed;
		const read = () => {
			const raw = document.querySelector<HTMLElement>(".three-runtime-host")
				?.dataset.npcs;
			for (const npc of JSON.parse(raw ?? "[]") as PlayNpc[]) {
				observed[npc.id] ??= [];
				const clips = observed[npc.id];
				if (npc.clip && !clips.includes(npc.clip)) clips.push(npc.clip);
			}
		};
		new MutationObserver(read).observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ["data-npcs"],
		});
		read();
	});
}

async function engage(page: Page, id: string) {
	await viewport(page).focus();
	await page.waitForFunction(
		(id) => {
			const area = document.querySelector<HTMLElement>(".three-runtime-host");
			if (!area?.dataset.npcs || !area.dataset.traversal) return false;
			const enemy = (JSON.parse(area.dataset.npcs) as PlayNpc[]).find(
				(entry) => entry.id === id,
			);
			if (!enemy) return true;
			const player = JSON.parse(area.dataset.traversal) as {
				x: number;
				y: number;
			};
			const dx = enemy.x - player.x,
				dy = enemy.y - player.y;
			const key =
				Math.abs(dx) > Math.abs(dy)
					? dx > 0
						? "ArrowRight"
						: "ArrowLeft"
					: dy > 0
						? "ArrowDown"
						: "ArrowUp";
			const tap = (key: string, code = key) => {
				const options = { key, code, bubbles: true, cancelable: true };
				window.dispatchEvent(new KeyboardEvent("keydown", options));
				window.dispatchEvent(new KeyboardEvent("keyup", options));
			};
			tap(key);
			if (Math.hypot(dx, dy) < 2.15) tap("f", "KeyF");
			return false;
		},
		id,
		{ polling: 150, timeout: 52_000 },
	);
}

test("walks Chapter One, saves and continues, and resolves the wyrm both ways @chapter-one", async ({
	page,
}, testInfo) => {
	test.setTimeout(930_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await serveOfflineBuild(page);
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await importProjectFile(
		page,
		"hollow-kingdom-chapter-one.project.json",
		false,
	);
	await button(page, "Save").click();
	await openEditor(page, "story");
	await page.getByRole("button", { name: /Test Flow$/ }).click();
	const started = Date.now();
	const milestones: Record<string, number> = {};
	await observeClips(page);
	await inspect(page);
	await walk(page, [22, 43]);
	await interact(page, "Oswin");
	await choice(
		page,
		"Tell me what happened after I brought you Mara's letter.",
	);
	await next(page);
	await expect(
		page.getByRole("dialog", { name: "Three Horns Under Stone" }),
	).toBeVisible();
	await expect(page.locator(".cinematic-subtitle")).toContainText(
		/bucket|throat|Mara/i,
		{ timeout: 26_000 },
	);
	await capture(page, testInfo.outputPath("01-merewatch.png"));
	await cinematic(page, "Three Horns Under Stone", false);
	console.log("Merewatch opening played.");
	await viewport(page).focus();
	await page.keyboard.press("i");
	await page.getByRole("button", { name: /^Equip/ }).click();
	await page.keyboard.press("i");
	await walk(
		page,
		[22, 47],
		[25, 47],
		[25, 50],
		[30, 50],
		[30, 52],
		[34, 52],
		[34, 53],
		[37, 53],
	);
	await transition(
		page,
		"ridge road",
		"Follow the ridge into Hollowwood.",
		"Hollowwood",
	);
	milestones.merewatch = Date.now() - started;
	await walk(page, [24, 59], [27, 59], [27, 58]);
	await answer(page, "split milestone", "Follow the marks with your eye.");
	await button(page, "Follow Player").click();
	await capture(page, testInfo.outputPath("02-hollowwood.png"));
	await inspect(page);
	await walk(
		page,
		[30, 58],
		[30, 53],
		[29, 53],
		[29, 48],
		[26, 48],
		[26, 46],
		[23, 46],
	);
	await interact(page, "Iven");
	await choice(page, "Who did this?");
	await next(page);
	await choice(
		page,
		"Cut Iven free. Leave him the seal to bargain his way home.",
	);
	await close(page);
	await walk(page, [23, 39], [22, 39], [22, 30], [21, 30], [21, 29]);
	await answer(page, "charter cairn", "Read beneath the fresh cuts.");
	await walk(page, [22, 29], [22, 27], [27, 27], [27, 26], [35, 26], [35, 19]);
	await engage(page, "ashling");
	expect(
		await page.evaluate(() => window.chapterObservedClips?.ashling),
	).toContain("BiteWindup");
	await walk(page, [36, 19], [36, 8]);
	await transition(
		page,
		"chapel gate",
		"Cross the chapel threshold.",
		"The Ashen Chapel",
	);
	milestones.hollowwood = Date.now() - started;
	console.log("Hollowwood traversed and Ashling defeated.");
	await walk(page, [16, 25], [17, 25]);
	await interact(page, "Sister Veyr");
	await choice(page, "I read the stone. It says we remembered the drowned.");
	await next(page);
	await close(page);
	await walk(page, [16, 25], [16, 13]);
	await answer(page, "palimpsest", "Read the lines aloud.");
	await walk(page, [16, 24], [10, 24]);
	await answer(page, "breath stone", "Turn the stone.");
	await walk(page, [10, 23], [21, 23], [21, 24]);
	await answer(page, "name stone", "Turn the stone.");
	await walk(page, [20, 24], [20, 14]);
	await interact(page, "water stone");
	await choice(page, "Turn the stone.");
	await expect(
		page.getByRole("dialog", { name: "What the Ash Covered" }),
	).toBeVisible();
	await capture(page, testInfo.outputPath("03-ashen-chapel.png"));
	await cinematic(page, "What the Ash Covered", true);
	await walk(page, [20, 16], [10, 16]);
	await answer(page, "choir chest", "Lift the loose board under the ash.");
	await walk(page, [16, 16], [16, 13], [18, 13], [18, 10], [16, 10], [16, 8]);
	await transition(
		page,
		"crypt latch",
		"Descend into the Wyrm's Hollow.",
		"The Wyrm's Hollow",
	);
	milestones.ashenChapel = Date.now() - started;
	console.log("Ashen Chapel puzzle and roll complete.");
	await walk(page, [19, 29]);
	await engage(page, "sluice-guard");
	await walk(page, [19, 26]);
	const checkpoint = await save(page);
	expect(checkpoint.player.areaId).toBe("wyrms-hollow");
	expect(checkpoint.state.variables.witness).toBe("freed");
	expect(checkpoint.state.flags["vigil-lit"]).toBe(true);
	expect(checkpoint.state.inventory["vigil-roll"]).toBe(1);
	await resume(page);
	await expect(hud(page)).toContainText("The Wyrm's Hollow");
	await expect(hud(page)).toContainText("Pos: 19, 26");
	await interact(page, "glowing seam");
	await choice(page, "Step out and see what Mara was holding.");
	await expect(
		page.getByRole("dialog", { name: "The Chain in the Silt" }),
	).toBeVisible();
	await expect(page.locator(".cinematic-subtitle")).toContainText(
		/trough|wire/i,
		{ timeout: 23_000 },
	);
	await capture(page, testInfo.outputPath("04-wyrm-encounter.png"));
	await cinematic(page, "The Chain in the Silt", false);
	await walk(page, [18, 26], [18, 20], [17, 20], [17, 9], [19, 9]);
	await answer(
		page,
		"flood chain",
		"Speak the vigil. Open the chain and let the wyrm go.",
	);
	await walk(page, [17, 9], [17, 5], [19, 5]);
	await transition(
		page,
		"spillway",
		"Follow the spillway back to Merewatch.",
		"Merewatch",
	);
	await walk(page, [21, 42], [21, 43], [23, 43]);
	await interact(page, "Oswin's epilogue");
	await choice(page, "Mara was buying time. I opened the flood chain.");
	await next(page);
	await close(page);
	await answer(
		page,
		"Oswin and the roll",
		"I found the names they tried to bury.",
	);
	milestones.releaseEnding = Date.now() - started;
	// The authored save remains at the cave checkpoint after the first resolution.
	expect((await readGameSave(page))?.state.variables.verdict).toBe("unsettled");
	await expect(hud(page)).toContainText("Ferry Penny: 19");
	await capture(page, testInfo.outputPath("05-merewatch-release.png"));
	console.log("The wyrm was released and the roll delivered.");
	await resume(page);
	await interact(page, "glowing seam");
	await choice(page, "Step out and see what Mara was holding.");
	await cinematic(page, "The Chain in the Silt", true);
	await walk(page, [18, 26], [18, 22], [18, 19], [19, 19]);
	await engage(page, "mere-wyrm");
	expect(
		await page.evaluate(() => window.chapterObservedClips?.["mere-wyrm"]),
	).toEqual(expect.arrayContaining(["BiteWindup", "SweepWindup"]));
	await walk(page, [19, 9]);
	await answer(
		page,
		"flood chain",
		"Cut out the tithe lock. The wyrm is dead.",
	);
	await walk(page, [17, 9], [17, 5], [19, 5]);
	await transition(
		page,
		"spillway",
		"Follow the spillway back to Merewatch.",
		"Merewatch",
	);
	await walk(page, [21, 42], [21, 43], [23, 43]);
	await interact(page, "Oswin's epilogue");
	await choice(page, "The wyrm is dead. The well is quiet now.");
	await next(page);
	await close(page);
	milestones.slayEnding = Date.now() - started;
	const result = await save(page);
	expect(result.quests.statuses["wyrm-beneath-the-mere"]).toBe("completed");
	expect(result.state.flags["npc_defeated_mere-wyrm"]).toBe(true);
	expect(result.state.variables.verdict).toBe("slain");
	expect(result.state.inventory["broken-spur"]).toBe(1);
	expect(errors).toEqual([]);
	console.log(JSON.stringify(milestones));
});
