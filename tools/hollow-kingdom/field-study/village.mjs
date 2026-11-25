import { place } from "./scenery.mjs";

// Keep the original actors, solids, dock, quest targets and cinematic positions.
// The approach curves from (20,56) past the gable to Oswin at (23,42).
export function dressVillage(project) {
	const area = project.areas[0];
	project.metadata.name = "The Hollow Kingdom — Merewatch by Lamplight";
	area.name = "Merewatch · The Chandler's Lane";
	area.theme = { atmosphere: "blue-hour" };
	for (const [i, slab] of area.objects
		.filter((o) => o.objectDefinitionId === "mere-cobbles")
		.entries()) {
		slab.transform.position.y = -0.034 - (i % 3) * 0.006;
		slab.transform.scale.x = [0.88, 0.96, 0.84][i % 3];
	}
	area.objects.find((o) => o.id === "cottage-1").objectDefinitionId =
		"mere-lane-cottage";
	// Replace the two nearest scattered spruce with lighter canopies. These
	// silhouette the water and retain the open gap in front of the beacon.
	for (const id of ["spruce-78", "spruce-69"]) {
		const tree = area.objects.find((o) => o.id === id);
		tree.objectDefinitionId = "mere-lane-ash";
	}
	for (const [id, asset, x, y, yaw, size] of [
		["chandlers-firewood", "lane-woodpile", 14.65, 50.76, -18, 1.08],
		["chandlers-dyke", "lane-wall", 16.45, 54.0, 64, 1.02],
		["chandlers-dyke-return", "lane-wall", 15.16, 56.48, 65, 1],
		["chandlers-step", "lane-bank", 17.7, 52.9, 68, 0.78],
		["well-dyke", "lane-wall", 25.9, 43.95, -40, 0.94],
		["well-bank", "lane-bank", 25.9, 43.36, -51, 0.84],
		["well-crook", "lane-bank", 23.15, 47.5, 70, 0.68],
		["orchard-ash", "lane-ash", 9.7, 42.2, -37, 0.85],
		["bank-ash", "lane-ash", 11.4, 37.4, 83, 0.77],
		["ash-roots", "lane-bank", 25.5, 52.6, 37, 1.12],
		["near-lane-bank", "lane-bank", 22.63, 55.12, 60, 0.83],
		["garden-return", "lane-wall", 10.55, 40.15, -12, 0.9],
		["garden-kindling", "lane-woodpile", 12.0, 39.45, 38, 0.84],
		["grazing-bank", "lane-bank", 28.9, 46.8, 40, 1.18],
		["grazing-heath", "verge", 27.95, 45.9, -37, 1.05],
		["grazing-rushes", "lane-bank", 26.2, 45.25, -64, 0.8],
		["grazing-stones", "verge", 29.68, 47.82, 58, 0.87],
		["lower-skerry", "crag", 35.7, 25.1, -25, 0.68],
		["lower-skerry-turf", "lane-bank", 35.1, 24.72, -35, 0.65],
		["upper-skerry", "crag", 40.4, 18.8, 28, 0.85],
		["upper-skerry-turf", "verge", 41.1, 18.4, -18, 0.86],
	])
		place(area, id, asset, x, y, yaw, size);

	// A compacted apron links the two thresholds with the existing cobbles.
	// The two low skerries lie east of the ferry route.
	for (const tile of area.terrainTiles) {
		const { x, y } = tile;
		if (
			tile.tileId === "water" &&
			(Math.hypot((x - 35.5) / 2.35, (y - 25) / 1.1) < 1 ||
				Math.hypot((x - 40.6) / 2.9, (y - 18.8) / 1.5) < 1)
		)
			tile.tileId = "sand";
		if (tile.tileId !== "grass") continue;
		if (
			Math.hypot((x - 16.8) / 2.3, (y - 50.8) / 1.35) < 1 ||
			Math.hypot((x - 23) / 2.7, (y - 41.6) / 1.65) < 1
		)
			tile.tileId = "dirt";
		// Keep knolls clear of the outermost row; the flat edge supports the
		// renderer's extended shoreline beyond the playable lake.
		const height = Math.round(
			Math.max(
				0,
				2.6 - Math.hypot((x - 5) / 2.1, (y - 54) / 2.0),
				1.6 - Math.hypot((x - 29) / 2.3, (y - 55) / 1.7),
			),
		);
		if (height > 0) area.terrainHeights.push({ x, y, height });
	}
	return project;
}
