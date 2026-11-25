import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

export async function captureStationaryGaits(page, address, output) {
	const bundle = await build({
		configFile: false,
		logLevel: "error",
		build: {
			write: false,
			lib: {
				entry: resolve("e2e/hollow-stationary-gaits.mjs"),
				formats: ["iife"],
				name: "HollowGaits",
			},
			rollupOptions: { output: { inlineDynamicImports: true } },
		},
	});
	const source = bundle[0].output.find((item) => item.type === "chunk");
	await page.route(`${address}/stationary-gaits`, (route) =>
		route.fulfill({
			contentType: "text/html",
			body: "<!doctype html><title>Stationary gaits</title>",
		}),
	);
	await page.goto(`${address}/stationary-gaits`);
	await page.addScriptTag({ content: source.code });
	const { image, ...summary } = await page.evaluate(() =>
		window.HollowGaits.renderStationaryGaits(),
	);
	await writeFile(
		resolve(output, "stationary-gaits.png"),
		Buffer.from(image, "base64"),
	);
	return summary;
}
