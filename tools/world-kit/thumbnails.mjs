// Uses the product's cached GLTF loader and exact thumbnail renderer. Run against
// the local Vite editor after author.py; never downloads or compiles character art.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.WORLD_KIT_URL ?? "http://127.0.0.1:5173";
const manifest = JSON.parse(
	await fs.readFile("public/assets/world-kit/manifest.json", "utf8"),
);
await fs.mkdir("public/assets/world-kit/thumbnails", { recursive: true });
await fs.mkdir("test-results/world-kit", { recursive: true });
const browser = await chromium.launch();
try {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 1200 },
	});
	await page.goto(base);
	const results = await page.evaluate(async (assets) => {
		const THREE = await import("/node_modules/three/build/three.module.js");
		const { requestThreeVisualAsset } = await import(
			"/src/runtime/three/threeVisualAssetLoader.ts"
		);
		const { renderAssetThumbnail } = await import(
			"/src/editor/sections/assetThumbnail.ts"
		);
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		const results = [];
		for (const asset of assets) {
			const definition = { ...asset, kind: "glb" };
			let loaded = requestThreeVisualAsset(definition);
			if (loaded.status === "loading") {
				await new Promise((resolve) =>
					requestThreeVisualAsset(definition, { onStateChange: resolve }),
				);
				loaded = requestThreeVisualAsset(definition);
			}
			if (loaded.status !== "loaded")
				throw new Error(`Thumbnail load failed: ${asset.id}`);
			results.push({
				id: asset.id,
				data: renderAssetThumbnail(renderer, loaded.object),
				analysis: loaded.analysis,
			});
		}
		renderer.dispose();
		return results;
	}, manifest.assets);
	for (const result of results) {
		await fs.writeFile(
			`public/assets/world-kit/thumbnails/${result.id.slice(6)}.png`,
			Buffer.from(result.data.split(",")[1], "base64"),
		);
	}
	await fs.writeFile(
		"test-results/world-kit/load-roundtrip.json",
		JSON.stringify(
			results.map(({ data, ...rest }) => rest),
			null,
			2,
		),
	);
	await page.setContent(
		`<body style="background:#d2d8dc;font:16px system-ui"><main style="display:grid;grid-template-columns:repeat(5,240px);gap:10px">${results.map((result, i) => `<figure style="margin:0;text-align:center"><img width="240" src="${result.data}"><figcaption>${manifest.assets[i].name}</figcaption></figure>`).join("")}</main></body>`,
	);
	await page.screenshot({
		path: "test-results/world-kit/contact-sheet.png",
		fullPage: true,
	});
	console.log(
		`Loaded and rendered ${results.length} kit GLBs through the shared product loader.`,
	);
} finally {
	await browser.close();
}
