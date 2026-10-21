import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", viewport: { width: 1100, height: 800 } });

test("unchanged Tidewatch traversal and persistence @traversal", async ({
	page,
}, testInfo) => {
	test.setTimeout(600_000);
	const output = "docs/assets/traversal",
		errors: string[] = [],
		checkpoints: unknown[] = [];
	await fs.mkdir(output, { recursive: true });
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
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	const snapshot = () =>
		page.evaluate(() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel"),
		);
	const state = async () =>
		JSON.parse(
			(await page
				.locator(".three-runtime-host")
				.getAttribute("data-traversal")) ?? "null",
		) as {
			x: number;
			y: number;
			height: number;
			rootY: number;
			moving: boolean;
			reason?: string;
		};
	const target = async () =>
		JSON.parse(
			(await page
				.locator(".three-runtime-hud")
				.getAttribute("data-traversal-target")) ?? "null",
		) as { x: number; y: number; height: number };
	async function enterPlay() {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect
			.poll(
				async () => (await snapshot())?.asset.character.animation.activeMixers,
				{ timeout: 45000 },
			)
			.toBe(2);
		await expect
			.poll(
				async () =>
					!!(await page
						.locator(".three-runtime-host")
						.getAttribute("data-traversal")),
			)
			.toBe(true);
		await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	}
	async function checkpoint(name: string) {
		await expect
			.poll(async () => (await state()).moving, { timeout: 10000 })
			.toBe(false);
		await expect
			.poll(
				async () => {
					const p = await state(),
						t = await target();
					return Math.hypot(p.x - t.x, p.y - t.y);
				},
				{ timeout: 10000 },
			)
			.toBeLessThan(0.001);
		const p = await state();
		expect(p.rootY).toBeCloseTo(p.height, 3);
		checkpoints.push({ name, ...p });
		console.log(name, JSON.stringify(p));
		return p;
	}
	// Every step enters through real keyboard input. No runtime state writes,
	// teleport hooks or project changes are used to reach checkpoints.
	async function go(x: number, y: number) {
		for (const axis of ["x", "y"] as const) {
			for (let step = 0; step < 100; step++) {
				const before = await target(),
					difference = (axis === "x" ? x : y) - before[axis];
				if (Math.abs(difference) < 0.115) break;
				const key =
					axis === "x"
						? difference > 0
							? "ArrowRight"
							: "ArrowLeft"
						: difference > 0
							? "ArrowDown"
							: "ArrowUp";
				await page.keyboard.press(key);
				await page.waitForTimeout(80);
				expect(
					Math.abs((await target())[axis] - before[axis]),
					`route to ${x},${y} from ${JSON.stringify(before)}`,
				).toBeGreaterThan(0.005);
				if (step === 99) throw new Error(`Could not reach ${x},${y}`);
			}
		}
	}
	async function pressBlocked(key: string, reason: RegExp) {
		await page.keyboard.down(key);
		try {
			await expect
				.poll(async () => (await state()).reason ?? "", { timeout: 30000 })
				.toMatch(reason);
		} finally {
			await page.keyboard.up(key);
		}
	}
	await enterPlay();
	expect((await checkpoint("beach spawn")).height).toBe(1);
	await pressBlocked("ArrowLeft", /Blocked by Wooden Barrel/);
	expect((await checkpoint("rotated barrel blocks")).x).toBeGreaterThan(8.6);
	await go(9, 8);
	await go(9, 9.4);
	await go(8.8, 9.4);
	await go(8.8, 9.8);
	expect((await checkpoint("upper stair tread")).height).toBeGreaterThan(1.2);
	await page
		.getByLabel("Three runtime viewport", { exact: true })
		.screenshot({ path: `${output}/stairs.png` });
	await go(8.8, 11.4);
	expect((await checkpoint("first dock")).height).toBeCloseTo(0.625782, 3);
	await go(8.8, 12.4);
	expect((await checkpoint("dock seam")).height).toBeCloseTo(0.625782, 3);
	await go(8.8, 13.4);
	await checkpoint("second dock");
	await page
		.getByLabel("Three runtime viewport", { exact: true })
		.screenshot({ path: `${output}/dock.png` });
	await go(8.8, 10.4);
	await go(8.8, 9.4);
	expect((await checkpoint("returned over stairs to beach")).height).toBe(1);
	await go(9, 9.4);
	await go(9, 6.6);
	await go(5, 6.6);
	await pressBlocked("ArrowUp", /Blocked by Treasure Chest/);
	const doorway = await checkpoint("existing chest obstructs shack doorway");
	expect(doorway.y).toBeGreaterThan(5.5);
	await go(3.2, 5.7);
	await go(3.2, 4);
	await pressBlocked("ArrowRight", /Blocked by Small Shack/);
	expect((await checkpoint("shack side wall blocks")).x).toBeLessThan(3.4);
	await go(3.2, 4);
	await go(3.2, 5.9);
	await go(5, 5.9);
	await go(5, 9.4);
	await pressBlocked("ArrowDown", /No reachable floor/);
	expect((await checkpoint("deep water blocks")).y).toBeLessThan(10.51);
	await go(5, 9.4);
	await go(4.8, 8.4);
	await pressBlocked("ArrowLeft", /Blocked by Supply Crate/);
	expect((await checkpoint("rotated supply crate blocks")).x).toBeGreaterThan(
		4.15,
	);
	await go(4.8, 8.4);
	await go(4.8, 9.4);
	await go(9, 9.4);
	await go(9, 8);
	await checkpoint("returned to spawn");
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await page.reload();
	const recover = page.getByRole("button", {
		name: "Use saved project",
		exact: true,
	});
	await expect(
		recover.or(page.getByRole("button", { name: "Play", exact: true })),
	).toBeVisible();
	if (await recover.isVisible()) await recover.click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await enterPlay();
	await go(9, 9.4);
	await go(8.8, 9.4);
	await go(8.8, 9.8);
	expect((await checkpoint("reloaded stair traversal")).height).toBeGreaterThan(
		1.2,
	);
	await page.keyboard.down("ArrowUp");
	try {
		await expect
			.poll(
				async () => (await snapshot())?.asset.character.animation.playerState,
				{ timeout: 10000, intervals: [100, 200] },
			)
			.toBe("walk");
	} finally {
		await page.keyboard.up("ArrowUp");
	}
	await expect
		.poll(
			async () => (await snapshot())?.asset.character.animation.playerState,
			{ timeout: 10000 },
		)
		.toBe("idle");
	await checkpoint("authored character walk then idle");
	const diagnostics = await snapshot();
	expect(diagnostics?.asset.loadFailureCount).toBe(0);
	expect(diagnostics?.asset.character.animation.missingClipCount).toBe(0);
	await fs.writeFile(
		`${output}/observations.json`,
		JSON.stringify(
			{
				checkpoints,
				projectUnchanged: true,
				observedAnimationStates: ["walk", "idle"],
				errors,
				character: diagnostics?.asset.character,
				limitation:
					"The unchanged chest at (5,5.2) physically obstructs the shack doorway; interior/door opening is verified in deterministic geometry tests.",
			},
			null,
			2,
		),
	);
	await testInfo.attach("traversal observations", {
		path: `${output}/observations.json`,
		contentType: "application/json",
	});
	expect(errors).toEqual([]);
});
