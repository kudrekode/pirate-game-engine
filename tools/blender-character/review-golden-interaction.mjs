// Opt-in art review only. Start root Vite first. No Blender or production hooks.
import assert from "node:assert/strict";
import { mkdir, writeFile, access } from "node:fs/promises";
import { chromium } from "playwright";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--list") {
	console.log(
		"Usage: --body chest|canonical|athletic|broad|fuller. Two interaction actions, four views, no character builds. Outputs: test-results/interaction-v1/review-REVISION-BODY. Requires root Vite on 5173.",
	);
	process.exit(0);
}
assert(
	args.length === 2 && args[0] === "--body",
	"Use --list for exact selectors",
);
const revision = "v1",
	body = args[1];
assert(["athletic", "broad", "fuller", "canonical", "chest"].includes(body));
const asset =
	body === "chest"
		? "/assets/pirate-demo/crate.glb"
		: body === "canonical"
			? "/assets/derived/authored-humans/everyday-v1/mannequin.glb"
			: `/test-results/first-outfit/compiled/${body}/mannequin.glb`;
await access(
	["canonical", "chest"].includes(body) ? `public${asset}` : asset.slice(1),
);
const library =
	body === "chest"
		? asset
		: `/assets/derived/humanoid-animations/golden-interaction-${revision}/actions.glb`;
const dir = `test-results/interaction-v1/review-${revision}-${body}`;
await mkdir(dir, { recursive: true });
await writeFile(
	`${dir}/index.html`,
	'<!doctype html><style>body{margin:0;background:#19222e;color:white;font:15px system-ui}header{height:40px;display:flex;align-items:center;padding:0 16px;gap:25px}canvas{display:block}</style><header><b id="title"></b><span id="clock"></span><span>Space: replay / pause</span></header><script type="module" src="/tools/blender-character/golden-movement-review.browser.mjs"></script>',
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		recordVideo: { dir, size: { width: 1280, height: 800 } },
	});
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const times =
		body === "chest"
			? { open: [0, 0.05, 0.1, 0.15, 0.25, 0.3] }
			: {
					Interact: [0, 0.1, 0.25, 0.31, 0.45, 0.6],
					Pickup: [0, 0.16, 0.34, 0.4, 0.59, 0.8],
				};
	const observations = { revision, body, asset, library, errors, clips: {} };
	for (const name of Object.keys(times)) {
		await page.goto(
			`http://127.0.0.1:5173/${dir}/index.html?${new URLSearchParams({ action: name, library, asset, label: revision + " " + body })}`,
			{ waitUntil: "domcontentloaded" },
		);
		await page.waitForFunction(() => window.reviewReady);
		await page.waitForTimeout(1600);
		await page.evaluate(() => window.pause());
		for (let i = 0; i < times[name].length; i++) {
			await page.evaluate((t) => window.sample(t), times[name][i]);
			await page.screenshot({ path: `${dir}/${name}-${i}.png` });
		}
		const frames = [];
		const info = await page.evaluate(() => window.review);
		for (let i = 0; i <= Math.ceil(info.duration * 30); i++) {
			const t = Math.min(i / 30, info.duration);
			frames.push(
				await page.evaluate((t) => {
					window.sample(t);
					return document.querySelector("canvas").toDataURL().split(",")[1];
				}, t),
			);
		}
		await writeFile(
			`${dir}/${name}-frames.json`,
			JSON.stringify({ duration: info.duration, frames }),
		);
		observations.clips[name] = info;
	}
	assert.deepEqual(errors, []);
	await writeFile(
		`${dir}/observations.json`,
		JSON.stringify(observations, null, 2) + "\n",
	);
	await context.close();
	console.log(dir);
} finally {
	await browser.close();
}
