import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Hold a destination-only model at the actual ridge gate. Fail its first
 * request, then allow Retry models to use the normal asset route. */
export async function verifyRidgeRecovery({
	page,
	cross,
	ready,
	snapshot,
	authored,
}) {
	const original = await authored();
	const originScene = await page.evaluateHandle(() =>
		window.hollowScene.deref(),
	);
	const asset = "**/chapter-one/vigil-altar.glb";
	const release = Promise.withResolvers();
	let requests = 0;
	const intercept = async (route) => {
		if (++requests === 1) {
			await release.promise;
			await route.abort("failed");
		} else await route.fallback();
	};
	await page.route(asset, intercept);
	const crossing = cross();
	try {
		await Promise.race([
			crossing.then(() => {
				throw new Error(
					"Hollowwood reported ready before the held model settled",
				);
			}),
			expect.poll(() => requests).toBe(1),
		]);
		await expect(
			page.locator(".three-runtime-panel .scene-loading"),
		).toContainText(/Loading scene models/);
		// A stalled transfer must still allow the destination to draw and tick
		// using its existing placeholder while the model is outstanding.
		await expect
			.poll(
				async () => {
					const state = await snapshot();
					return (
						state?.scene.areaId === "hollowwood" &&
						state.raf.activeLoopCount === 1 &&
						state.asset.statusCounts.loading > 0 &&
						(await originScene.evaluate(
							(origin) => window.hollowScene.deref() !== origin,
						))
					);
				},
				{ timeout: 15000 },
			)
			.toBe(true);
		release.resolve();
		await crossing;
		const retry = page.getByRole("button", { name: "Retry models" });
		await expect(retry).toBeVisible();
		await retry.click();
		await expect.poll(() => requests).toBe(2);
		await ready();
		await expect(retry).toHaveCount(0);
		const result = await snapshot();
		assert.equal(result.scene.areaId, "hollowwood");
		assert.equal(result.raf.activeLoopCount, 1);
		assert.equal(result.asset.statusCounts.error, 0);
		assert.equal(await authored(), original);
	} finally {
		release.resolve();
		await crossing.catch(() => {});
		await page.unroute(asset, intercept);
		await originScene.dispose();
	}
}
