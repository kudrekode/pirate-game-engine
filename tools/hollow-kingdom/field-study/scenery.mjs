const kit = {
	"mere-lane-cottage": "The Chandler's Cottage",
	"mere-lane-ash": "Wind-pruned Ash",
	"mere-lane-wall": "Dry-stone Dyke",
	"mere-lane-bank": "Fern-covered Schist",
	"mere-lane-woodpile": "Split Firewood",
};

export function addKit(project) {
	for (const [id, name] of Object.entries(kit))
		project.objects.push({
			id,
			name,
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			threeVisual: { mode: "asset", assetId: id },
		});
}

// Placements keep integer gameplay cells and metre-scale renderer offsets.
export function place(area, id, asset, x, y, yaw = 0, scale = 1, lift = 0) {
	const gx = Math.round(x);
	const gy = Math.round(y);
	area.objects.push({
		id,
		objectDefinitionId: `mere-${asset}`,
		areaId: area.id,
		x: gx,
		y: gy,
		transform: {
			position: { x: +(x - gx).toFixed(3), y: lift, z: +(y - gy).toFixed(3) },
			rotation: { x: 0, y: Math.round(yaw), z: 0 },
			scale: { x: scale, y: scale, z: scale },
		},
	});
}
