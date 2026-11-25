import { place } from "./scenery.mjs";

const round = (n) => Math.round(n * 100) / 100;
const clamp = (n) => Math.max(0, Math.min(1, n));

// Source coordinate noise. Reordering a planting pass won't move the forest.
function variation(x, y, salt) {
	let n =
		Math.imul(x + 7, 374761393) ^
		Math.imul(y + 11, 668265263) ^
		Math.imul(salt, 2246822519);
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function dressLandscape(area, config, oswin) {
	const { width, height } = config;
	const road = Math.floor(width / 2);
	const villages = [17];
	for (let y = 65; y < height - 38; y += 52) villages.push(y);
	villages.push(height - 17);

	function creek(y) {
		// The channel opens into pools between the settled reaches.
		const mid =
			width * 0.21 + Math.sin(y / 15) * width * 0.046 + 1.1 * Math.sin(y / 5.8);
		const half =
			1.4 + (1 + Math.cos((y - 34) / 14)) * Math.min(2.7, width * 0.027);
		return { mid, half };
	}
	function crossLane(x, village) {
		// The footpath descends to a stone causeway and rises to the orchard.
		return village + 3.1 * Math.sin((x - road) / 8.5);
	}
	function distances(x, y) {
		const { mid, half } = creek(y);
		const bank = Math.abs(x - mid) - half;
		const junction = Math.min(
			...villages.map((v) => Math.abs(y - crossLane(x, v))),
		);
		const trail = Math.abs(x - (mid + half + 2.7));
		return { bank, junction, trail };
	}
	function topography(x, y) {
		const dx = Math.abs(x - road);
		const { bank, junction, trail } = distances(x, y);
		const hamletEnd = road + Math.min(17, width * 0.32);
		const onLane = junction <= 1.15 && x >= 3 && x <= hamletEnd;
		const towpath = trail < 0.9;
		const arterial = dx <= 2 + 0.65 * (1 + Math.sin(y / 7.6));
		if (bank < 0 && !onLane) return { tileId: "water", height: 0 };
		if (onLane || arterial || towpath) return { tileId: "dirt", height: 0 };
		if (bank < 0.85) return { tileId: "sand", height: 0 };
		// The east ridge rises in long folds behind the crofts; keep both the
		// village platforms and surface on the five-tile coach road level.
		const setback =
			clamp((dx - 4) / 9) *
			clamp((junction - 7) / 8) *
			clamp((bank - 2) / 5) *
			clamp((trail - 1) / 4);
		const fold =
			2.3 + 1.65 * Math.sin(x / 7 + y / 16) + 1.45 * Math.cos(y / 10 - x / 14);
		const lift = Math.round(Math.max(0, fold) * setback);
		return {
			tileId: lift >= 4 && Math.sin(x / 2 + y / 4) > 0.5 ? "rock" : "grass",
			height: lift,
		};
	}
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const cell = topography(x, y);
			area.terrainTiles.push({ x, y, tileId: cell.tileId });
			// Feather the outer four metres into the flat, fogged runtime apron.
			// The same ground-cover mask still determines the planting palette.
			const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
			const grade = Math.round(cell.height * clamp(edgeDistance / 4));
			if (grade) area.terrainHeights.push({ x, y, height: grade });
		}

	// Each junction has a public square and a destination on either side.
	// Alternate a well green and a watch court to break up the roofline.
	const reserved = [];
	for (const [i, y] of villages.entries()) {
		const landmark = i % 2 ? "watchtower" : "well";
		const radius = i % 2 ? 2.4 : 1.1;
		const name =
			[
				"chandlers-green",
				"reeves-cross",
				"ashfold",
				"upper-ford",
				"last-watch",
			][i] ?? `stead-${i}`;
		function building(suffix, asset, xOffset, yOffset, yaw, size, clearance) {
			const x = road + xOffset;
			const z = y + yOffset;
			place(area, `${name}-${suffix}`, asset, x, z, yaw, size);
			reserved.push({ x, y: z, r: clearance });
		}
		building("cottage", "lane-cottage", 6.7, 5.9, -124, 0.94, 3.9);
		building("byre", "cottage", 11.5, -3.0, -52, 0.77, 3.1);
		building(
			"landmark",
			landmark,
			-5.7,
			2.6,
			11 + i * 17,
			i % 2 ? 0.88 : 1,
			radius,
		);
		building("lamppost", "lantern", -4.4, -2.1, 40, 0.82, 0.8);
		building("cordwood", "lane-woodpile", 8.85, 8.05, 28, 1, 1.15);
		building("dyke", "lane-wall", 11.7, 6.8, 17, 1.06, 1.6);
		building("dyke-end", "lane-wall", 14.42, 6.01, 17, 0.92, 1.5);
		building("ash", "lane-ash", 14, 3.4, 48, 0.85, 2.0);
		building("bank", "lane-bank", 12.9, 7.05, 22, 1.08, 1.2);
		// Paving belongs to the compact square; the earth road continues through.
		place(area, `${name}-stones`, "cobbles", road + 0.14, y, 3, 0.94, 0.006);
	}
	// A crossing with a purpose: the lamplit farm lane ends at the weathered
	// signal keep on the far bank. Its silhouette marks the last river crossing.
	const keepX = 3.6;
	const lastY = villages[villages.length - 1];
	const keepY = crossLane(keepX, lastY) - 3.9;
	place(area, "west-bank-keep", "watchtower", keepX, keepY, 19, 0.88);
	reserved.push({ x: keepX, y: keepY, r: 2.7 });

	for (let i = 0; i < config.npcs; i++) {
		const nominalY = 7 + Math.floor((i * (height - 14)) / config.npcs);
		const x = road + (i % 2 === 0 ? 4 : -4);
		const y = [0, 2, -2, 4, -4, 6, -6]
			.map((dy) => nominalY + dy)
			.find(
				(z) =>
					z > 0 &&
					z < height - 1 &&
					reserved.every((p) => Math.hypot(p.x - x, p.y - z) > p.r + 0.7),
			);
		if (y === undefined)
			throw new Error(`No clear roadside position for keeper ${i}`);
		area.npcs.push({
			...oswin,
			id: `road-keeper-${i + 1}`,
			areaId: area.id,
			x,
			y,
			facing: i % 2 ? "right" : "left",
			blocksMovement: false,
		});
		reserved.push({ x, y, r: 1.0 });
	}
	// A jittered lattice controls local spacing. Exposure selects either pine
	// stands, ash in the lower groves, meadow openings, or rocky crest ground.
	for (let gy = 0; gy < height; gy += 3)
		for (let gx = 0; gx < width; gx += 3) {
			const x = round(gx + 0.5 + variation(gx, gy, 1) * 1.8);
			const y = round(gy + 0.5 + variation(gx, gy, 2) * 1.8);
			if (x > width - 2 || y > height - 2 || Math.abs(x - road) < 4.7) continue;
			const cell = area.terrainTiles[Math.round(y) * width + Math.round(x)];
			if (cell.tileId !== "grass" && cell.tileId !== "rock") continue;
			const { bank, junction, trail } = distances(x, y);
			if (
				junction < 2 ||
				trail < 2 ||
				reserved.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 1.1)
			)
				continue;
			const wood =
				Math.sin(x / 8 + y / 17) * 0.52 +
				Math.cos(y / 8 - x / 12) * 0.28 +
				Math.sin(x / 3.7 + y / 12.4) * 0.2;
			const chance = variation(gx, gy, 3);
			const kind = variation(gx, gy, 4);
			let asset;
			if (cell.tileId === "rock") {
				if (chance > 0.38) continue;
				asset = "crag";
			} else if (bank < 3.8) {
				if (chance > 0.74) continue;
				asset = kind < 0.23 ? "lane-ash" : "lane-bank";
			} else if (wood > 0.06) {
				if (chance > 0.83) continue;
				asset = kind < 0.72 ? "spruce" : kind < 0.89 ? "lane-ash" : "lane-bank";
			} else {
				if (chance > 0.14) continue;
				asset = kind < 0.59 ? "verge" : kind < 0.84 ? "lane-bank" : "crag";
			}
			const size = round(0.64 + 0.57 * variation(gx, gy, 5));
			place(
				area,
				`plant-${gx}-${gy}`,
				asset,
				x,
				y,
				variation(gx, gy, 6) * 360 - 180,
				size,
			);
		}
	area.objects.push({
		id: "bracken",
		objectDefinitionId: "mere-mare",
		areaId: area.id,
		x: road,
		y: 13,
		blocksMovement: true,
	});
}
