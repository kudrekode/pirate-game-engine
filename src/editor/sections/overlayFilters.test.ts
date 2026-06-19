import { describe, expect, it } from "vitest";
import {
	GAMEPLAY_OVERLAY_FILTERS,
	HIDE_ALL_OVERLAY_FILTERS,
	SHOW_ALL_OVERLAY_FILTERS,
	toggleMapOverlayFilter,
} from "./overlayFilters";

describe("overlay filters", () => {
	it("toggles a single filter without changing the others", () => {
		const filters = toggleMapOverlayFilter(GAMEPLAY_OVERLAY_FILTERS, "npcs");

		expect(filters.npcs).toBe(false);
		expect(filters.objects).toBe(GAMEPLAY_OVERLAY_FILTERS.objects);
	});

	it("provides show all, hide all, and gameplay view presets", () => {
		expect(Object.values(SHOW_ALL_OVERLAY_FILTERS).every(Boolean)).toBe(true);
		expect(Object.values(HIDE_ALL_OVERLAY_FILTERS).some(Boolean)).toBe(false);
		expect(GAMEPLAY_OVERLAY_FILTERS.npcs).toBe(true);
		expect(GAMEPLAY_OVERLAY_FILTERS.eventBlocks).toBe(false);
	});
});
