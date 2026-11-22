import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
	legacyProjectKey,
	openEditor,
	readGameSave,
	reloadProject,
	requireGameSave,
	savedProject,
	savedProjectJson,
} from "./projectNavigation";

const sequenceName = "The Light Across the Mere";
const runtimeViewport = "Three runtime viewport";

test.use({
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
});

async function openMerewatch(page: Page) {
	const project = await fs.readFile("hollow-kingdom.project.json", "utf8");
	await page.addInitScript(
		({ key, projectJson }) => localStorage.setItem(key, projectJson),
		{ key: legacyProjectKey, projectJson: project },
	);
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page
		.getByRole("button", { name: /The Hollow Kingdom.*Merewatch/ })
		.click();
}

async function moveToTile(page: Page, key: string, x: number, y: number) {
	const position = page.locator(".three-runtime-hud").getByText(/^Pos: /);
	const destination = `Pos: ${x}, ${y}`;
	await expect
		.poll(async () => {
			const current = await position.innerText();
			if (current === destination) return current;
			await page.keyboard.press(key);
			return position.innerText();
		})
		.toBe(destination);
}

async function acceptOswinsOffer(page: Page) {
	await openEditor(page, "map");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const canvas = page.getByLabel(runtimeViewport, { exact: true });
	await expect(canvas).toBeVisible();
	await expect(page.locator(".three-runtime-hud")).toContainText("Pos: 20, 56");
	const inspect = page.getByRole("button", { name: "Inspect", exact: true });
	// Inspect camera keeps keyboard movement aligned with the map route.
	await inspect.click();
	await expect(inspect).toHaveClass(/\bactive\b/);
	await canvas.focus();
	await moveToTile(page, "ArrowRight", 21, 56);
	await moveToTile(page, "ArrowRight", 22, 56);
	for (let y = 55; y >= 44; y--) await moveToTile(page, "ArrowUp", 22, y);
	await moveToTile(page, "ArrowRight", 23, 44);
	await moveToTile(page, "ArrowUp", 23, 43);

	const dialogue = page.getByRole("dialog", { name: "Conversation" });
	await expect
		.poll(
			async () => {
				if (!(await dialogue.isVisible())) await page.keyboard.press("e");
				return dialogue.isVisible();
			},
			{ timeout: 15_000 },
		)
		.toBe(true);
	await dialogue
		.getByRole("button", { name: "She hasn't shuttered it tonight?" })
		.click();
	await dialogue
		.getByRole("button", { name: "Lend me a blade. I'll bring back word." })
		.click();
}

for (const outcome of ["complete", "skip"] as const) {
	test(`Merewatch's original cinematic can ${outcome} and resume Oswin's quest once @cinematic-playback`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(180_000);
		await openMerewatch(page);
		const authoredProject = await savedProjectJson(page);
		await acceptOswinsOffer(page);
		const cinematic = page.getByRole("dialog", {
			name: sequenceName,
			exact: true,
		});
		await expect(cinematic).toBeVisible();
		if (outcome === "skip") {
			await cinematic
				.getByRole("button", { name: "Skip cinematic", exact: true })
				.click();
		} else {
			await expect(cinematic).toContainText("Follow the jetty lantern.", {
				timeout: 15_000,
			});
			await page.screenshot({
				path: testInfo.outputPath("merewatch-cinematic.png"),
			});
		}
		await expect(cinematic).toBeHidden({ timeout: 15_000 });
		const dialogue = page.getByRole("dialog", { name: "Conversation" });
		await expect(dialogue).toContainText("Take my hanger.");
		await dialogue.getByRole("button", { name: "End conversation" }).click();
		await expect(dialogue).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Inspect", exact: true }),
		).toHaveClass(/\bactive\b/);
		await page.getByLabel(runtimeViewport, { exact: true }).focus();
		await moveToTile(page, "ArrowDown", 23, 44);

		await page.getByRole("button", { name: "Save Game", exact: true }).click();
		await expect(page.locator(".runtime-save-status")).toHaveText(
			"Game saved.",
		);
		const gameSave = await requireGameSave(page);
		expect(gameSave.quests.statuses["last-watch"]).toBe("active");
		expect(gameSave.state.inventory["watch-sword"]).toBe(1);
		await page
			.getByRole("button", { name: "Back to Edit", exact: true })
			.click();
		expect(await savedProjectJson(page)).toBe(authoredProject);
	});
}

function previewWav() {
	// Unsigned 8-bit PCM, mono at 8 kHz. Keep the cue audible until the test skips.
	const rate = 8000;
	const sampleCount = rate * 8;
	const wav = Buffer.alloc(44 + sampleCount);
	wav.write("RIFF", 0);
	wav.writeUInt32LE(36 + sampleCount, 4);
	wav.write("WAVEfmt ", 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate, 28);
	wav.writeUInt16LE(1, 32);
	wav.writeUInt16LE(8, 34);
	wav.write("data", 36);
	wav.writeUInt32LE(sampleCount, 40);
	for (let i = 0; i < sampleCount; i++) {
		wav[44 + i] =
			128 + Math.round(10 * Math.sin((2 * Math.PI * 440 * i) / rate));
	}
	return wav;
}

declare global {
	interface Window {
		__cinematicWavPlayers?: HTMLAudioElement[];
	}
}

async function playAndSkipWavPreview(page: Page) {
	await page.getByRole("button", { name: "Play preview", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.__cinematicWavPlayers?.some(
					(player) =>
						!player.paused && player.currentTime > 0 && player.duration === 8,
				),
			),
		)
		.toBe(true);
	await page.getByRole("button", { name: "Skip preview", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.__cinematicWavPlayers?.every(
					(player) => player.paused && !player.hasAttribute("src"),
				),
			),
		)
		.toBe(true);
	await expect(
		page.getByRole("button", { name: "Play preview", exact: true }),
	).toBeEnabled();
}

test("plays an imported PCM WAV in the stage and releases native audio on skip @cinematic-playback", async ({
	page,
}, testInfo) => {
	test.setTimeout(120_000);
	await page.addInitScript(() => {
		// Observe real media state while leaving decoding, playback and events to Chromium.
		const players: HTMLAudioElement[] = [];
		window.__cinematicWavPlayers = players;
		window.Audio = new Proxy(window.Audio, {
			construct(Audio, args) {
				const element = new Audio(args[0]);
				if (element.src.startsWith("data:audio/wav;base64,"))
					players.push(element);
				return element;
			},
		});
	});
	await openMerewatch(page);
	await openEditor(page, "cutscenes");
	await page.getByRole("button", { name: sequenceName, exact: true }).click();
	await page.getByRole("button", { name: "Advanced", exact: true }).click();
	await page.getByRole("button", { name: "Add audio", exact: true }).click();
	const wav = previewWav();
	await page.getByLabel("Import audio file", { exact: true }).setInputFiles({
		name: "merewatch-preview.wav",
		mimeType: "audio/wav",
		buffer: wav,
	});
	await expect(
		page.getByText("merewatch-preview.wav", { exact: true }),
	).toBeVisible();
	await page
		.getByRole("button", { name: "Add audio cue", exact: true })
		.click();
	const duration = page.getByLabel("Cue duration (ms)", { exact: true });
	await duration.fill("8000");
	await duration.blur();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const project = await savedProject(page);
	const source = project.cutscenes
		.find(({ name }) => name === sequenceName)
		?.cinematic?.cues?.find((cue) => cue.type === "audio");
	expect(source).toMatchObject({
		durationMs: 8000,
		sourceName: "merewatch-preview.wav",
		url: `data:audio/wav;base64,${wav.toString("base64")}`,
	});
	const gameSaveBeforePreview = await readGameSave(page);
	await expect(page.getByLabel(runtimeViewport, { exact: true })).toBeVisible();
	await page.screenshot({
		path: testInfo.outputPath("merewatch-wav-preview.png"),
	});
	await playAndSkipWavPreview(page);

	await reloadProject(page, false);
	await openEditor(page, "cutscenes");
	await page.getByRole("button", { name: sequenceName, exact: true }).click();
	await page.getByRole("button", { name: "Advanced", exact: true }).click();
	await expect(
		page
			.getByRole("group", { name: "Audio track", exact: true })
			.getByRole("button", { name: /merewatch-preview\.wav/ }),
	).toBeVisible();
	await playAndSkipWavPreview(page);

	expect(await readGameSave(page)).toEqual(gameSaveBeforePreview);
	expect(await savedProject(page)).toEqual(project);
});
