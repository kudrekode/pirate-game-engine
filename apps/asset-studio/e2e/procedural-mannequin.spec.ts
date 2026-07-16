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
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v3");
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
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v3");
	await expect(diagnostics).toContainText("procedural-mannequin-roundtrip-v4");
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

test("compiles isolated skin color and roughness changes without changing geometry or rig", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const consoleErrors = collectErrors(page);
	await page.goto("/");
	const cases = [
		{ color: "#f1c7a5", name: "tone-1-matte", roughness: 0.82 },
		{ color: "#7d4f38", name: "tone-5-matte", roughness: 0.82 },
		{ color: "#503126", name: "tone-6-smooth", roughness: 0.36 },
	] as const;
	const results = [];
	for (const appearance of cases) {
		await page.getByLabel("Skin color", { exact: true }).fill(appearance.color);
		await page
			.getByLabel("Skin roughness", { exact: true })
			.fill(String(appearance.roughness));
		await expect(page.getByLabel("Draft skin swatch")).toHaveCSS(
			"background-color",
			/rgba?\(/u,
		);
		const hostBefore = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
		if ((await hostBefore.count()) > 0) {
			expect(await hostBefore.getAttribute("data-skin-color")).not.toBe(
				appearance.color,
			);
		}
		await page.getByRole("button", { exact: true, name: "Compile" }).click();
		await expect(page.locator("[data-compile-status]")).toHaveAttribute(
			"data-compile-status",
			"succeeded",
			{ timeout: 90_000 },
		);
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
		await expect(host).toHaveAttribute("data-skin-color", appearance.color);
		await expect(host).toHaveAttribute(
			"data-skin-roughness",
			String(appearance.roughness),
		);
		await expect(host).toHaveAttribute("data-skin-metallic", "0");
		await verifyAnimations(page);
		await page.getByRole("button", { exact: true, name: "Rest" }).click();
		await page.getByRole("button", { exact: true, name: "Front" }).click();
		const previewChrome = page.locator(
			".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
		);
		await previewChrome.evaluateAll((elements) => {
			for (const element of elements) {
				(element as HTMLElement).style.visibility = "hidden";
			}
		});
		await page.locator("canvas").screenshot({
			path: testInfo.outputPath(`${appearance.name}.png`),
		});
		await previewChrome.evaluateAll((elements) => {
			for (const element of elements) {
				(element as HTMLElement).style.visibility = "";
			}
		});
		results.push({
			geometry: await host.getAttribute("data-geometry-skinning-hash"),
			material: await host.getAttribute("data-material-hash"),
			output: await host.getAttribute("data-asset-hash"),
			recipe: await host.getAttribute("data-recipe-hash"),
			skeleton: await host.getAttribute("data-skeleton-signature"),
		});
	}
	expect(new Set(results.map((entry) => entry.geometry)).size).toBe(1);
	expect(new Set(results.map((entry) => entry.skeleton)).size).toBe(1);
	expect(new Set(results.map((entry) => entry.material)).size).toBe(
		cases.length,
	);
	expect(new Set(results.map((entry) => entry.output)).size).toBe(cases.length);
	expect(new Set(results.map((entry) => entry.recipe)).size).toBe(cases.length);
	await expect(
		page.getByLabel("Recent Compilations").getByRole("button"),
	).toHaveCount(cases.length);
	expect(consoleErrors).toEqual([]);
});
