import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Explicit acceptance for freshly built anatomy artifacts, never a compile cache.
const cases = (
	process.env.HUMAN_FOUNDATION_CASES || "default,short-wide,tall-slim"
).split(",");
for (const name of cases) {
	test(`reviews human foundation ${name} @human-foundation`, async ({
		page,
	}, testInfo) => {
		const root = path.resolve(
			process.env.HUMAN_FOUNDATION_ROOT || "test-results/human-foundation",
			name,
		);
		const manifest = JSON.parse(
			await readFile(path.join(root, "manifest.json"), "utf8"),
		);
		const glb = await readFile(path.join(root, "mannequin.glb"));
		expect(manifest.compilerVersion).toBe("procedural-mannequin-blender-v8");
		expect(manifest.deterministicBuild).toBe(true);
		expect(createHash("sha256").update(glb).digest("hex")).toBe(
			manifest.outputHash,
		);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.route(
			"**/assets/derived/procedural-humanoids/mannequin-v0/*",
			async (route) => {
				const file = new URL(route.request().url()).pathname.split("/").at(-1);
				if (file === "mannequin.glb")
					await route.fulfill({ body: glb, contentType: "model/gltf-binary" });
				else if (file === "manifest.json")
					await route.fulfill({ json: manifest });
				else await route.continue();
			},
		);
		await page.goto("/");
		await page
			.getByLabel("Preview source")
			.selectOption("procedural-mannequin-v0");
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60000 },
		);
		const host = page.locator(
			'[data-preview-source="procedural-mannequin-v0"]',
		);
		await expect(host).toHaveAttribute(
			"data-topology-version",
			"procedural-humanoid-v4",
		);
		if ((await host.getAttribute("data-animation-playing")) === "true")
			await page.getByRole("button", { name: "Pause", exact: true }).click();
		const views =
			process.env.HUMAN_FOUNDATION_HAIR === "1"
				? [
						["Rest", "Close front", "0"],
						["Rest", "Side", "0"],
						["Rest", "Back", "0"],
					]
				: [
						["Rest", "Front", "0"],
						["Rest", "Side", "0"],
						["Rest", "Back", "0"],
						["Idle", "Front", "0.25"],
						["Walk", "Side", "0.25"],
						["Walk", "Front", "0.75"],
					];
		for (const [pose, view, time] of views) {
			await page.getByRole("button", { name: pose, exact: true }).click();
			await page.getByRole("button", { name: view, exact: true }).click();
			if (pose !== "Rest")
				await page.getByLabel("Animation sample time").fill(time);
			await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
			await page.locator("canvas").screenshot({
				path: testInfo.outputPath(`${name}-${pose}-${view}.png`),
				style:
					".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics { visibility: hidden !important; }",
			});
		}
		expect(errors).toEqual([]);
	});
}
