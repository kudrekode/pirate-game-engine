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

test("previews and animates the checked-in Face Readability V0 mannequin @integration", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const consoleErrors = collectErrors(page);
	const historicalRequests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("runtime-retarget-report"))
			historicalRequests.push(request.url());
	});
	await page.route("**/runtime-retarget-report.json", (route) => route.abort());
	await page.goto("/?family=legacy");
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
		"procedural-humanoid-v4",
	);
	await expect(host).toHaveAttribute("data-topology-components", "1");
	await expect(host).toHaveAttribute(
		"data-face-version",
		"procedural-face-readability-v0",
	);
	await expect(host).toHaveAttribute("data-face-eye-meshes", "2");
	await expect(host).toHaveAttribute("data-face-validation", "true");
	await expect(host).toHaveAttribute("data-eye-color", "#4b5d67");
	await expect(host).toHaveAttribute("data-proportions", /"armLength":0\.5/u);
	const diagnostics = page.getByLabel("Procedural Mannequin V0 diagnostics");
	await expect(diagnostics).toContainText("procedural-mannequin-v0");
	await expect(diagnostics).toContainText("V6");
	await expect(diagnostics).toContainText("5 mesh");
	await expect(diagnostics).toContainText(/\d+ vertices/u);
	await expect(diagnostics).toContainText(/\d+ triangles/u);
	await expect(diagnostics).toContainText("procedural-humanoid-v4");
	await expect(diagnostics).toContainText("1 connected component");
	await expect(diagnostics).toContainText("manifold");
	await expect(diagnostics).toContainText("65-joint Golden template");
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v8");
	await verifyAnimations(page);

	await page
		.getByLabel("Preview source")
		.selectOption("golden-reference-humanoid-v0");
	await expect(page.locator("canvas")).toHaveCount(1);
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	await expect(page.locator("canvas")).toHaveCount(1);
	// Exercise the extracted preview's unmount/remount boundary without compiling.
	await page
		.getByRole("navigation", { name: "Asset Studio sections" })
		.getByRole("button", { name: "Components", exact: true })
		.click();
	await expect(page.locator("canvas")).toHaveCount(0);
	await page
		.getByRole("navigation", { name: "Asset Studio sections" })
		.getByRole("button", { name: "Character", exact: true })
		.click();
	await expect(page.locator("canvas")).toHaveCount(1);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	await verifyAnimations(page);
	expect(historicalRequests).toEqual([]);
	expect(consoleErrors).toEqual([]);
});

test("compiles one real body through the browser API and previews its artifact @compiler", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const consoleErrors = collectErrors(page);
	let compileRequests = 0;
	page.on("request", (request) => {
		if (/\/procedural-mannequin\/(compile|preview)$/.test(request.url())) {
			compileRequests += 1;
		}
	});
	await page.goto("/?family=legacy");
	const seedInput = page.getByLabel("Random seed");
	const randomise = page.getByRole("button", {
		exact: true,
		name: "Randomise",
	});
	const compile = page.getByRole("button", {
		exact: true,
		name: "Generate Preview",
	});
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

	const body = await randomiseAndCompile("body-e2e-11");
	expect(compileRequests).toBe(1);
	await expect(compileStatus).toContainText("Preview ready");
	await expect(host).toHaveAttribute("data-deterministic-build", "false");
	expect(body.assetHash).toMatch(/^[0-9a-f]{64}$/u);
	expect(body.recipeHash).toMatch(/^[0-9a-f]{64}$/u);
	expect(body.boundsHeight).toBeCloseTo(body.parameters.height, 4);

	const diagnostics = page.getByLabel("Creator compilation diagnostics");
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v8");
	await expect(diagnostics).toContainText("procedural-mannequin-roundtrip-v9");
	await testInfo.attach("compiled-artifact.json", {
		body: JSON.stringify({ compileRequests, body }),
		contentType: "application/json",
	});

	await page
		.getByLabel("Recent Compilations")
		.getByRole("button", { name: /body-e2e-11/u })
		.click();
	await expect(host).toHaveAttribute("data-recipe-hash", body.recipeHash);
	expect(compileRequests).toBe(1);
	await page
		.getByRole("button", { name: "Finalise Character", exact: true })
		.click();
	await expect(compileStatus).toContainText("Character finalised", {
		timeout: 90000,
	});
	await expect(host).toHaveAttribute("data-deterministic-build", "true");
	await expect(
		page.getByRole("link", { name: "Download character GLB" }),
	).toBeVisible();
	expect(compileRequests).toBe(2);
	const finalHash = await host.getAttribute("data-asset-hash");
	await page.route("**/procedural-mannequin/preview", (route) =>
		route.fulfill({
			status: 500,
			json: {
				status: "failed",
				error:
					"Character generation failed because the selected body proportions produced an invalid torso shape.",
				technicalDetails: "Synthetic Blender regression log",
			},
		}),
	);
	await compile.click();
	await expect(compileStatus).toContainText("Generation failed");
	await expect(host).toHaveAttribute("data-asset-hash", finalHash!);
	await page.getByText("Technical details", { exact: true }).click();
	await expect(
		page.getByText("Synthetic Blender regression log"),
	).toBeVisible();
	expect(consoleErrors).toEqual([]);
});

test("compiles isolated skin color and roughness changes without changing geometry or rig @visual", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const consoleErrors = collectErrors(page);
	await page.goto("/?family=legacy");
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
		await page
			.getByRole("button", { exact: true, name: "Finalise Character" })
			.click();
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

test("compiles, animates, captures, and revisits bald and Quaternius hairstyle variants @visual", async ({
	page,
}, testInfo) => {
	test.setTimeout(600_000);
	const consoleErrors = collectErrors(page);
	await page.goto("/?family=legacy");
	const hairSelect = page.getByLabel("Hair component");
	const eyeColorInput = page.getByLabel("Eye color", { exact: true });
	const compile = page.getByRole("button", {
		exact: true,
		name: "Finalise Character",
	});
	const compileStatus = page.locator("[data-compile-status]");
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);

	async function compileHair(hair: "none" | "quaternius-hair-v0") {
		const eyeColor = await eyeColorInput.inputValue();
		await hairSelect.selectOption(hair);
		await compile.click();
		await expect(compileStatus).toHaveAttribute(
			"data-compile-status",
			"succeeded",
			{ timeout: 180_000 },
		);
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		await expect(host).toHaveAttribute("data-hair-component", hair);
		await expect(host).toHaveAttribute(
			"data-hair-attachment",
			hair === "none" ? "none" : "Head",
		);
		await expect(host).toHaveAttribute("data-hair-fit-status", "true");
		await expect(host).toHaveAttribute("data-eye-color", eyeColor);
		await expect(host).toHaveAttribute("data-face-validation", "true");
		await expect(host).toHaveAttribute(
			"data-hair-color",
			await page.getByLabel("Hair color", { exact: true }).inputValue(),
		);
		await verifyAnimations(page);
		return (await host.getAttribute("data-recipe-hash")) ?? "";
	}
	const previewChrome = page.locator(
		".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
	);
	async function captureVariant(variant: "bald" | "quaternius-hair") {
		for (const state of ["Rest", "Idle", "Walk"] as const) {
			await page.getByRole("button", { exact: true, name: state }).click();
			if (state !== "Rest") {
				await page.getByLabel("Animation sample time").fill("0.25");
			}
			for (const view of [
				"Front",
				"Side",
				"Three-quarter",
				"Close front",
				"Close three-quarter",
			] as const) {
				await page.getByRole("button", { exact: true, name: view }).click();
				await previewChrome.evaluateAll((elements) => {
					for (const element of elements) {
						(element as HTMLElement).style.visibility = "hidden";
					}
				});
				await page.locator("canvas").screenshot({
					path: testInfo.outputPath(
						`${variant}-${state.toLowerCase()}-${view.toLowerCase().replaceAll(" ", "-")}.png`,
					),
				});
				await previewChrome.evaluateAll((elements) => {
					for (const element of elements) {
						(element as HTMLElement).style.visibility = "";
					}
				});
			}
		}
	}

	await eyeColorInput.fill("#405c72");
	const baldHash = await compileHair("none");
	await captureVariant("bald");
	await eyeColorInput.fill("#5c4634");
	await page.getByLabel("Hair color", { exact: true }).fill("#bd955b");
	const hairHash = await compileHair("quaternius-hair-v0");
	await captureVariant("quaternius-hair");
	expect(hairHash).not.toBe(baldHash);
	await expect(
		page.getByRole("region", { exact: true, name: "Hair" }),
	).toContainText("Compiled Â· Quaternius Buzzed");
	const recent = page.getByLabel("Recent Compilations").getByRole("button");
	await expect(recent).toHaveCount(2);
	await recent.nth(1).click();
	await expect(host).toHaveAttribute("data-hair-component", "none");
	await expect(eyeColorInput).toHaveValue("#405c72");
	await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
		"#3b2a1f",
	);
	await expect(host).toHaveAttribute("data-eye-color", "#405c72");
	await expect(host).toHaveAttribute("data-recipe-hash", baldHash);
	await recent.nth(0).click();
	await expect(host).toHaveAttribute(
		"data-hair-component",
		"quaternius-hair-v0",
	);
	await expect(eyeColorInput).toHaveValue("#5c4634");
	await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
		"#bd955b",
	);
	await expect(host).toHaveAttribute("data-recipe-hash", hairHash);
	await expect(page.locator("canvas")).toHaveCount(1);
	expect(consoleErrors).toEqual([]);
});

test("compiles and visually validates the Hairstyle Library V2 @visual", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	const errors = collectErrors(page);
	await page.goto("/?family=legacy");
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
	const styles = [
		["quaternius-hair-short-crop-v1", "#bd955b", "Short Crop"],
		["quaternius-hair-simple-parted-v1", "#8b3f27", "Simple Parted"],
	];
	for (const [id, color, name] of styles) {
		await page.getByLabel("Hair component").selectOption(id);
		await page.getByLabel("Hair color", { exact: true }).fill(color);
		await page
			.getByRole("button", { exact: true, name: "Finalise Character" })
			.click();
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
		await expect(host).toHaveAttribute("data-hair-component", id);
		await expect(host).toHaveAttribute("data-hair-fit-status", "true");
		await expect(host).toHaveAttribute("data-face-validation", "true");
		await expect(host).toHaveAttribute("data-hair-color", color);
		await expect(
			page.getByRole("region", { exact: true, name: "Hair" }),
		).toContainText(`Compiled \u00b7 Quaternius ${name}`);
		await verifyAnimations(page);
		for (const state of ["Rest", "Idle", "Walk"]) {
			await page.getByRole("button", { exact: true, name: state }).click();
			if (state !== "Rest")
				await page.getByLabel("Animation sample time").fill("0.25");
			for (const view of [
				"Side",
				"Close front",
				"Close three-quarter",
				"Back",
			]) {
				await page.getByRole("button", { exact: true, name: view }).click();
				const chrome = page.locator(
					".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
				);
				await chrome.evaluateAll((elements) =>
					elements.forEach((element) => {
						(element as HTMLElement).style.visibility = "hidden";
					}),
				);
				await page.locator("canvas").screenshot({
					path: testInfo.outputPath(
						`${id}-${state}-${view.replaceAll(" ", "-")}.png`,
					),
				});
				await chrome.evaluateAll((elements) =>
					elements.forEach((element) => {
						(element as HTMLElement).style.visibility = "";
					}),
				);
			}
		}
	}
	const recent = page.getByLabel("Recent Compilations").getByRole("button");
	await expect(recent).toHaveCount(2);
	for (const [index, style] of styles.entries()) {
		await recent.nth(1 - index).click();
		await expect(page.getByLabel("Hair component")).toHaveValue(style[0]);
		await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
			style[1],
		);
		await expect(host).toHaveAttribute("data-hair-component", style[0]);
	}
	await expect(page.locator("canvas")).toHaveCount(1);
	expect(errors).toEqual([]);
});

test("compiles and visually validates length-aware Long and Buns @visual", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	const errors = collectErrors(page);
	await page.goto("/?family=legacy");
	const hairSelect = page.getByLabel("Hair component");
	const hairColorInput = page.getByLabel("Hair color", { exact: true });
	const compile = page.getByRole("button", {
		exact: true,
		name: "Finalise Character",
	});
	const compileStatus = page.locator("[data-compile-status]");
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
	const hairRegion = page.getByRole("region", { exact: true, name: "Hair" });
	const previewChrome = page.locator(
		".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
	);
	const styles = [
		["quaternius-hair-long-v1", "#51352a", "Long"],
		["quaternius-hair-buns-v1", "#a86832", "Buns"],
	] as const;
	const compiled = [];

	for (const [id, color, name] of styles) {
		await hairSelect.selectOption(id);
		await hairColorInput.fill(color);
		await compile.click();
		await expect(compileStatus).toHaveAttribute(
			"data-compile-status",
			"succeeded",
			{ timeout: 180_000 },
		);
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		await expect(host).toHaveAttribute("data-hair-component", id);
		await expect(host).toHaveAttribute("data-hair-attachment", "Head");
		await expect(host).toHaveAttribute("data-hair-fit-status", "true");
		await expect(host).toHaveAttribute("data-face-validation", "true");
		await expect(host).toHaveAttribute("data-hair-color", color);
		await expect(hairRegion).toContainText(
			`Compiled \u00b7 Quaternius ${name}`,
		);
		await verifyAnimations(page);
		const recipeHash = (await host.getAttribute("data-recipe-hash")) ?? "";
		expect(recipeHash).toMatch(/^[0-9a-f]{64}$/u);
		compiled.push({ color, id, recipeHash });

		for (const state of ["Rest", "Idle", "Walk"] as const) {
			await page.getByRole("button", { exact: true, name: state }).click();
			if (state !== "Rest") {
				await page.getByLabel("Animation sample time").fill("0.25");
			}
			for (const view of [
				"Side",
				"Three-quarter rear",
				"Back",
				"Close front",
				"Close three-quarter",
			] as const) {
				await page.getByRole("button", { exact: true, name: view }).click();
				await previewChrome.evaluateAll((elements) =>
					elements.forEach((element) => {
						(element as HTMLElement).style.visibility = "hidden";
					}),
				);
				await page.locator("canvas").screenshot({
					path: testInfo.outputPath(
						`${id}-${state.toLowerCase()}-${view.toLowerCase().replaceAll(" ", "-")}.png`,
					),
				});
				await previewChrome.evaluateAll((elements) =>
					elements.forEach((element) => {
						(element as HTMLElement).style.visibility = "";
					}),
				);
			}
		}
	}

	expect(new Set(compiled.map((entry) => entry.recipeHash)).size).toBe(
		styles.length,
	);
	const recent = page.getByLabel("Recent Compilations").getByRole("button");
	await expect(recent).toHaveCount(styles.length);
	for (const [index, result] of compiled.entries()) {
		await recent.nth(styles.length - 1 - index).click();
		await expect(hairSelect).toHaveValue(result.id);
		await expect(hairColorInput).toHaveValue(result.color);
		await expect(host).toHaveAttribute("data-hair-component", result.id);
		await expect(host).toHaveAttribute("data-hair-fit-status", "true");
		await expect(host).toHaveAttribute("data-face-validation", "true");
		await expect(host).toHaveAttribute("data-hair-color", result.color);
		await expect(host).toHaveAttribute("data-recipe-hash", result.recipeHash);
	}
	await expect(page.locator("canvas")).toHaveCount(1);
	expect(errors).toEqual([]);
});

// Appearance acceptance is explicit; the integration smoke above produces no success images.
test("captures the checked-in mannequin fixture for appearance review @visual", async ({
	page,
}, testInfo) => {
	const errors = collectErrors(page);
	await page.goto("/?family=legacy");
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60000 },
	);
	await verifyAnimations(page);
	for (const state of ["Rest", "Idle", "Walk"]) {
		await page.getByRole("button", { exact: true, name: state }).click();
		if (state !== "Rest")
			await page.getByLabel("Animation sample time").fill("0.25");
		for (const view of ["Front", "Side", "Three-quarter"]) {
			await page.getByRole("button", { exact: true, name: view }).click();
			const chrome = page.locator(
				".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
			);
			await chrome.evaluateAll((elements) => {
				for (const element of elements)
					(element as HTMLElement).style.visibility = "hidden";
			});
			await page.locator("canvas").screenshot({
				path: testInfo.outputPath(`oriented-bald-${state}-${view}.png`),
			});
			await chrome.evaluateAll((elements) => {
				for (const element of elements)
					(element as HTMLElement).style.visibility = "";
			});
		}
	}

	expect(errors).toEqual([]);
});
