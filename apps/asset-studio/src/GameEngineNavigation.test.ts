import { describe, expect, it } from "vitest";
import { gameEngineUrl } from "./GameEngineNavigation";

describe("Game Engine return navigation", () => {
	it("uses the launching editor's origin, path and query", () => {
		const origin = "https://editor.example/game/?project=one#map";
		expect(
			gameEngineUrl(
				`https://studio.example/?returnTo=${encodeURIComponent(origin)}`,
			),
		).toBe(origin);
	});
	it("allows a configured alternate origin and standalone same-host fallback", () => {
		expect(
			gameEngineUrl(
				"https://studio.example/?returnTo=https://old.example",
				"https://game.example/editor/",
			),
		).toBe("https://game.example/editor/");
		expect(gameEngineUrl("http://my-machine:5174/")).toBe(
			"http://my-machine:5173/",
		);
	});
	it("rejects unsafe or malformed targets", () => {
		for (const value of [
			"javascript:alert(1)",
			"bad address",
			"https://user:password@example.com",
		])
			expect(
				gameEngineUrl(
					`https://studio.example/?returnTo=${encodeURIComponent(value)}`,
				),
			).toBeUndefined();
	});
});
