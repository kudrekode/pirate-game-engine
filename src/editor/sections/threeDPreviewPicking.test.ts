import { describe, expect, it } from "vitest";
import type { GameArea } from "../../types/game";
import {
	getCanvasPointerNdc,
	type PreviewSelectableObject,
	resolveSelectionMetadataFromObject,
	terrainIntersectionToPreviewGridPosition,
} from "./threeDPreviewPicking";

function makeArea(overrides: Partial<GameArea> = {}): GameArea {
	return {
		eventBlocks: [],
		height: 4,
		id: "area",
		kind: "outdoor",
		name: "Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: [],
		tileSize: 32,
		width: 5,
		...overrides,
	};
}

describe("3D preview picking helpers", () => {
	it("maps a page-origin canvas center pointer to NDC 0/0", () => {
		expect(
			getCanvasPointerNdc(
				{ clientX: 160, clientY: 120 },
				{ height: 240, left: 0, top: 0, width: 320 },
			),
		).toEqual({
			localX: 160,
			localY: 120,
			x: 0,
			y: -0,
		});
	});

	it("maps an offset canvas center pointer to NDC 0/0", () => {
		expect(
			getCanvasPointerNdc(
				{ clientX: 260, clientY: 170 },
				{ height: 240, left: 100, top: 50, width: 320 },
			),
		).toMatchObject({
			localX: 160,
			localY: 120,
			x: 0,
			y: -0,
		});
	});

	it("maps canvas corners to NDC corners", () => {
		const bounds = { height: 200, left: 20, top: 10, width: 400 };

		expect(getCanvasPointerNdc({ clientX: 20, clientY: 10 }, bounds)).toEqual({
			localX: 0,
			localY: 0,
			x: -1,
			y: 1,
		});
		expect(getCanvasPointerNdc({ clientX: 420, clientY: 210 }, bounds)).toEqual(
			{
				localX: 400,
				localY: 200,
				x: 1,
				y: -1,
			},
		);
	});

	it("uses the current canvas bounds instead of stale dimensions", () => {
		const point = { clientX: 200, clientY: 100 };

		expect(
			getCanvasPointerNdc(point, {
				height: 200,
				left: 0,
				top: 0,
				width: 400,
			}),
		).toMatchObject({ x: 0, y: -0 });
		expect(
			getCanvasPointerNdc(point, {
				height: 200,
				left: 0,
				top: 0,
				width: 800,
			}),
		).toMatchObject({ x: -0.5, y: -0 });
	});

	it("returns undefined for empty canvas bounds", () => {
		expect(
			getCanvasPointerNdc(
				{ clientX: 0, clientY: 0 },
				{ height: 0, left: 0, top: 0, width: 320 },
			),
		).toBeUndefined();
		expect(
			getCanvasPointerNdc(
				{ clientX: 0, clientY: 0 },
				{ height: 240, left: 0, top: 0, width: 0 },
			),
		).toBeUndefined();
	});

	it("maps terrain hit points through the shared x/z grid convention", () => {
		const area = makeArea({ height: 4, width: 5 });

		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: { userData: {} },
				point: { x: 0, z: 0 },
			}),
		).toEqual({ x: 2, y: 2 });
		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: { userData: {} },
				point: { x: -1.49, z: -0.51 },
			}),
		).toEqual({ x: 1, y: 1 });
	});

	it("keeps tile boundary rounding deterministic", () => {
		const area = makeArea({ height: 3, width: 3 });

		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: { userData: {} },
				point: { x: -0.51, z: -0.51 },
			}),
		).toEqual({ x: 0, y: 0 });
		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: { userData: {} },
				point: { x: -0.5, z: -0.5 },
			}),
		).toEqual({ x: 1, y: 1 });
	});

	it("resolves elevated terrain hits from the visible intersection point", () => {
		const area = makeArea({ height: 3, width: 3 });

		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: {
					userData: {
						selectionMetadata: {
							areaId: "area",
							entityType: "terrain",
							x: 0,
							y: 0,
						},
					},
				},
				point: { x: 1.02, z: 0.98 },
			}),
		).toEqual({ x: 2, y: 2 });
	});

	it("falls back to terrain metadata when a test intersection has no point", () => {
		const area = makeArea({ height: 3, width: 3 });

		expect(
			terrainIntersectionToPreviewGridPosition(area, {
				object: {
					userData: {
						selectionMetadata: {
							areaId: "area",
							entityType: "terrain",
							x: 2,
							y: 1,
						},
					},
				},
			}),
		).toEqual({ x: 2, y: 1 });
	});

	it("resolves entity identity through transformed child hit objects", () => {
		const metadata = {
			areaId: "area",
			entityId: "object-1",
			entityType: "object",
			x: 1,
			y: 2,
		};
		const parent: PreviewSelectableObject = {
			userData: { selectionMetadata: metadata },
		};
		const child: PreviewSelectableObject = {
			parent,
			userData: {},
		};

		expect(resolveSelectionMetadataFromObject(child)).toBe(metadata);
	});
});
