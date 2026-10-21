// Exact opt-in review; uses existing dressed bodies and the production attachment.
import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args[0] === "--list") {
	console.log(
		"--body athletic|broad|fuller|canonical: bow Fire, plus equipped Idle/Walk/Run/Jump/Fall/Land/Hit/Death/Interact/Pickup on canonical. Four views; no character builds.",
	);
	process.exit(0);
}
assert(args.length === 2 && args[0] === "--body");
const body = args[1];
assert(["athletic", "broad", "fuller", "canonical"].includes(body));
const asset =
	body === "canonical"
		? "/assets/derived/authored-humans/everyday-v1/mannequin.glb"
		: `/test-results/first-outfit/compiled/${body}/mannequin.glb`;
await access(body === "canonical" ? `public${asset}` : asset.slice(1));
const dir = `test-results/ranged-combat-v1/review-${body}`;
await mkdir(dir, { recursive: true });
await writeFile(
	`${dir}/index.html`,
	'<!doctype html><style>body{margin:0;background:#19222e;color:white;font:15px system-ui}header{height:40px;display:flex;align-items:center;padding:0 16px;gap:25px}canvas{display:block}</style><header><b id="title"></b><span id="clock"></span></header><script type="module" src="/tools/blender-character/golden-movement-review.browser.mjs"></script>',
);
const root = "/assets/derived/humanoid-animations/";
const cases = [
	{
		name: "Fire",
		library:
			process.env.BOW_REVIEW_LIBRARY ?? root + "golden-bow-v1/actions.glb",
		times: [0, 0.15, 0.266667, 0.3, 0.45, 0.85],
	},
];
if (body === "canonical") {
	for (const name of ["Run", "Jump", "Fall", "Land"])
		cases.push({ name, library: root + "golden-movement-v1/actions.glb" });
	for (const name of ["Hit", "Death"])
		cases.push({ name, library: root + "golden-combat-v3/actions.glb" });
	for (const name of ["Interact", "Pickup"])
		cases.push({ name, library: root + "golden-interaction-v1/actions.glb" });
	cases.push(
		{
			name: "GoldenReference_Idle",
			library: root + "golden-reference-v0/idle.glb",
		},
		{
			name: "GoldenReference_Walk_InPlace",
			library: root + "golden-reference-v0/walk-in-place.glb",
		},
	);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 800 },
	});
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	for (const c of cases) {
		await page.goto(
			`http://127.0.0.1:5173/${dir}/index.html?${new URLSearchParams({ action: c.name, library: c.library, asset, bow: "1", label: body })}`,
		);
		await page.waitForFunction(() => window.reviewReady);
		await page.waitForTimeout(250);
		await page.evaluate(() => window.pause());
		const info = await page.evaluate(() => window.review);
		const times =
			c.times ?? [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => t * info.duration);
		for (let i = 0; i < times.length; i++) {
			await page.evaluate((t) => window.sample(t), times[i]);
			await page.screenshot({ path: `${dir}/${c.name}-${i}.png` });
		}
		if (c.name === "Fire") {
			const frames = [];
			for (let i = 0; i <= 27; i++) {
				frames.push(
					await page.evaluate(
						(t) => {
							window.sample(t);
							return document.querySelector("canvas").toDataURL().split(",")[1];
						},
						Math.min(i / 30, 0.9),
					),
				);
			}
			await writeFile(
				`${dir}/Fire-frames.json`,
				JSON.stringify({ duration: 0.9, frames }),
			);
		}
	}
	assert.deepEqual(errors, []);
	console.log(dir);
} finally {
	await browser.close();
}
