import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { ThreePerformanceSnapshot } from "../src/runtime/three/threePerformanceDiagnostics";

type AnimationObservation = {
	frames: number;
	states: Partial<Record<"walk" | "idle" | "attack", ThreePerformanceSnapshot>>;
	last: ThreePerformanceSnapshot | null;
	raf: number;
};

declare global {
	interface Window {
		__THREE_ANIMATION_SMOKE__?: AnimationObservation;
	}
}

// Install before input so a short-lived state cannot be missed between driver polls.
// This observes the real RAF/animation path; it neither advances nor freezes time.
async function observeAnimation(page: Page): Promise<void> {
	await page.evaluate(() => {
		const previous = window.__THREE_ANIMATION_SMOKE__;
		if (previous) cancelAnimationFrame(previous.raf);
		const observation: AnimationObservation = {
			frames: 0,
			states: {},
			last: null,
			raf: 0,
		};
		window.__THREE_ANIMATION_SMOKE__ = observation;
		const sample = () => {
			const snapshot =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
			if (snapshot) {
				observation.frames++;
				observation.last = snapshot;
				const state = snapshot.asset.character.animation.playerState;
				if (state === "idle" || state === "walk" || state === "attack") {
					observation.states[state] ??= snapshot;
				}
			}
			observation.raf = requestAnimationFrame(sample);
		};
		observation.raf = requestAnimationFrame(sample);
	});
}

function expectAnimationSnapshot(
	snapshot: ThreePerformanceSnapshot | null | undefined,
): void {
	expect(snapshot).toBeTruthy();
	if (!snapshot) throw new Error("Runtime animation snapshot missing.");
	const animation = snapshot.asset.character.animation;
	expect(animation.activeMixers).toBeGreaterThanOrEqual(3);
	expect(animation.loadingSourceCount).toBe(0);
	expect(animation.missingClipCount).toBe(0);
	expect(animation.incompatibleClipCount).toBe(0);
	expect(animation.sourceAssetIds).toEqual(
		expect.arrayContaining([
			"pirate-character-walk",
			"pirate-character-attack",
			"pirate-character-dead",
		]),
	);
	expect(snapshot.phases.animationUpdate.count).toBeGreaterThan(0);
}

async function expectObservedState(
	page: Page,
	state: "walk" | "attack",
): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(
					(expected) =>
						Boolean(window.__THREE_ANIMATION_SMOKE__?.states[expected]),
					state,
				),
			{
				message:
					"Movement/input completed, but no rendered " +
					state +
					" state was observed. See animation-observation.json.",
				timeout: 5000,
			},
		)
		.toBe(true);
	expectAnimationSnapshot(
		await page.evaluate(
			(expected) => window.__THREE_ANIMATION_SMOKE__?.states[expected],
			state,
		),
	);
}

async function expectIdle(page: Page): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
						?.asset.character.animation.playerState,
			),
		)
		.toBe("idle");
	expectAnimationSnapshot(
		await page.evaluate(() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel"),
		),
	);
}

test("observes Three runtime movement and animation transitions", async ({
	context,
	page,
}, testInfo) => {
	await context.addInitScript(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	const observations: Record<string, unknown> = {};
	try {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.getByRole("button", { name: /Demo Project/ }).click();
		await page
			.getByRole("combobox", { name: "Editing" })
			.selectOption("area_main");
		await page.getByRole("button", { exact: true, name: "Play" }).click();
		await page.getByRole("button", { name: "Play 3D Experimental" }).click();
		const canvas = page.getByLabel("Three runtime viewport", { exact: true });
		await expect(canvas).toBeVisible();
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page.getByText("Pos: 2, 2", { exact: true })).toBeVisible();
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const snapshot =
							window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
								"ThreeRuntimePanel",
							);
						const animation = snapshot?.asset.character.animation;
						return Boolean(
							animation &&
								animation.activeMixers >= 3 &&
								animation.loadingSourceCount === 0 &&
								animation.missingClipCount === 0 &&
								animation.incompatibleClipCount === 0 &&
								[
									"pirate-character-walk",
									"pirate-character-attack",
									"pirate-character-dead",
								].every((id) => animation.sourceAssetIds.includes(id)),
						);
					}),
				{ timeout: 30_000 },
			)
			.toBe(true);

		await canvas.focus();
		await observeAnimation(page);
		// Demo spawn (2,2) -> grass (2,1): no blocking entities or touch events.
		// The HUD assertion distinguishes rejected input/collision from animation failure.
		await page.keyboard.press("ArrowUp");
		await expect(page.getByText("Pos: 2, 1", { exact: true })).toBeVisible();
		await expectObservedState(page, "walk");
		await expectIdle(page);
		observations.movement = await page.evaluate(
			() => window.__THREE_ANIMATION_SMOKE__,
		);

		await observeAnimation(page);
		await page.keyboard.press("Space");
		await expectObservedState(page, "attack");
		await expectIdle(page);
		observations.attack = await page.evaluate(
			() => window.__THREE_ANIMATION_SMOKE__,
		);
		expect(pageErrors).toEqual([]);
	} finally {
		observations.last = await page
			.evaluate(() => {
				const observation = window.__THREE_ANIMATION_SMOKE__;
				if (observation) cancelAnimationFrame(observation.raf);
				return {
					observation,
					hud: document.querySelector(".three-runtime-hud")?.textContent,
				};
			})
			.catch(() => null);
		const artifactPath = testInfo.outputPath("animation-observation.json");
		await fs.mkdir(path.dirname(artifactPath), { recursive: true });
		await fs.writeFile(
			artifactPath,
			JSON.stringify({ observations, pageErrors }, null, 2),
		);
		await testInfo.attach("animation-observation.json", {
			path: artifactPath,
			contentType: "application/json",
		});
	}
});
