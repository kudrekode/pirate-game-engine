import { expect, type Page, test } from "@playwright/test";

const SOURCE_ID = "procedural-mannequin-v0";

function collectErrors(page: Page) {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/asset|track|bind|skeleton|webgl|uncaught|compile/iu.test(message.text())
		) {
			errors.push(message.text());
		}
	});
	page.on("pageerror", (error) => errors.push(error.message));
	return errors;
}

async function verifyAnimations(page: Page) {
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
	if ((await host.getAttribute("data-animation-playing")) === "true") {
		await page.getByRole("button", { exact: true, name: "Pause" }).click();
	}
	for (const state of ["Idle", "Walk"] as const) {
		await page.getByRole("button", { exact: true, name: state }).click();
		await page.getByLabel("Animation sample time").fill("0.25");
		const firstPose = await host.getAttribute("data-pose-snapshot");
		await page.getByLabel("Animation sample time").fill("0.75");
		expect(await host.getAttribute("data-pose-snapshot")).not.toBe(firstPose);
		await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
	}
}

test("previews and animates the checked-in Body Proportions V1 mannequin", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const consoleErrors = collectErrors(page);
	await page.goto("/");
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	await expect(host).toHaveAttribute("data-deterministic-build", "true");
	await expect(host).toHaveAttribute("data-recipe-hash", /^[0-9a-f]{64}$/u);
	await expect(host).toHaveAttribute("data-semantic-hash", /^[0-9a-f]{64}$/u);
	await expect(host).toHaveAttribute(
		"data-topology-version",
		"procedural-humanoid-v1",
	);
	await expect(host).toHaveAttribute("data-topology-components", "1");
	await expect(host).toHaveAttribute("data-proportions", /"armLength":0\.5/u);
	const diagnostics = page.getByLabel("Procedural Mannequin V0 diagnostics");
	await expect(diagnostics).toContainText("procedural-mannequin-v0");
	await expect(diagnostics).toContainText("V1");
	await expect(diagnostics).toContainText("1 mesh");
	await expect(diagnostics).toContainText("2724 vertices");
	await expect(diagnostics).toContainText("5444 triangles");
	await expect(diagnostics).toContainText("procedural-humanoid-v1");
	await expect(diagnostics).toContainText("1 connected component");
	await expect(diagnostics).toContainText("manifold");
	await expect(diagnostics).toContainText("65-joint Golden template");
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v2");
	await verifyAnimations(page);

	await page
		.getByLabel("Preview source")
		.selectOption("golden-reference-humanoid-v0");
	await expect(page.locator("canvas")).toHaveCount(1);
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	await expect(page.locator("canvas")).toHaveCount(1);
	expect(consoleErrors).toEqual([]);
});

test("randomises, compiles, animates, validates, and revisits several body shapes", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const consoleErrors = collectErrors(page);
	let compileRequests = 0;
	page.on("request", (request) => {
		if (
			request.url().includes("/__asset-studio/procedural-mannequin/compile")
		) {
			compileRequests += 1;
		}
	});
	await page.goto("/");
	const seedInput = page.getByLabel("Random seed");
	const randomise = page.getByRole("button", {
		exact: true,
		name: "Randomise",
	});
	const compile = page.getByRole("button", { exact: true, name: "Compile" });
	const compileStatus = page.locator("[data-compile-status]");
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);

	async function randomiseAndCompile(seed: string) {
		await seedInput.fill(seed);
		await randomise.click();
		await expect(compileStatus).toHaveAttribute("data-compile-status", "idle");
		const recipe = JSON.parse(
			(await page.getByTestId("recipe-json").textContent()) ?? "{}",
		) as { body: { parameters: Record<string, number> } };
		expect(Object.keys(recipe.body.parameters)).toEqual([
			"height",
			"shoulderWidth",
			"torsoLength",
			"armLength",
			"legLength",
			"hipWidth",
		]);
		await expect(page.getByLabel("Body validation errors")).toHaveCount(0);
		await compile.click();
		await expect(compileStatus).toHaveAttribute(
			"data-compile-status",
			"succeeded",
			{ timeout: 90_000 },
		);
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		await expect(host).toHaveAttribute(
			"data-height-metres",
			String(recipe.body.parameters.height),
		);
		await expect(host).toHaveAttribute(
			"data-proportions",
			JSON.stringify(recipe.body.parameters),
		);
		await expect(host).toHaveAttribute("data-animation-state", "idle");
		await verifyAnimations(page);
		return {
			assetHash: (await host.getAttribute("data-asset-hash")) ?? "",
			boundsHeight: Number(await host.getAttribute("data-bounds-height")),
			parameters: recipe.body.parameters,
			recipeHash: (await host.getAttribute("data-recipe-hash")) ?? "",
		};
	}

	const seeds = ["body-e2e-11", "body-e2e-22", "body-e2e-33"];
	const bodies = [];
	for (const seed of seeds) bodies.push(await randomiseAndCompile(seed));
	expect(compileRequests).toBe(seeds.length);
	expect(new Set(bodies.map((body) => body.recipeHash)).size).toBe(
		seeds.length,
	);
	expect(new Set(bodies.map((body) => body.assetHash)).size).toBe(seeds.length);
	expect(new Set(bodies.map((body) => body.boundsHeight)).size).toBeGreaterThan(
		1,
	);
	for (const body of bodies) {
		expect(body.assetHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(body.recipeHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(body.boundsHeight).toBeCloseTo(body.parameters.height, 4);
	}

	const diagnostics = page.getByLabel("Creator compilation diagnostics");
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v2");
	await expect(diagnostics).toContainText("procedural-mannequin-roundtrip-v3");
	await page.screenshot({
		path: testInfo.outputPath("creator-random-body.png"),
	});

	await page
		.getByLabel("Recent Compilations")
		.getByRole("button", { name: new RegExp(seeds[0], "u") })
		.click();
	await expect(host).toHaveAttribute("data-recipe-hash", bodies[0].recipeHash);
	expect(compileRequests).toBe(seeds.length);
	expect(consoleErrors).toEqual([]);
});
