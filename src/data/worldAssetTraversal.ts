// Metres in normalized GLB-local coordinates (Y up, +Z toward the viewer).
// Bounds come from the checked-in world-kit manifest; unusual profiles follow
// tools/world-kit/author.py. This data has no renderer or loader dependency.
export type TraversalBox = {
	min: [number, number, number];
	max: [number, number, number];
};
export type TraversalSurface = {
	x: [number, number];
	z: [number, number];
	// Height at the two Z ends. Equal values describe a floor.
	y: [number, number];
};
export type AssetTraversalProfile = {
	solids?: TraversalBox[];
	surfaces?: TraversalSurface[];
};
const box = (x: number, y: number, z: number): TraversalBox => ({
	min: [-x / 2, 0, -z / 2],
	max: [x / 2, y, z / 2],
});
const solid = (x: number, y: number, z: number): AssetTraversalProfile => ({
	solids: [box(x, y, z)],
});

export const WORLD_ASSET_TRAVERSAL: Record<string, AssetTraversalProfile> = {
	"world-barrel": solid(1.087, 1, 1.087),
	"world-crate": solid(0.98, 0.7, 1.19),
	"world-chest": solid(0.5334, 0.5638, 0.5496),
	"world-table": solid(1.4, 0.775, 0.894),
	"world-stool": solid(0.4924, 0.4404, 0.48),
	"world-rock-large": solid(1.8337, 1.1669, 1.3066),
	"world-rock-small": solid(0.6469, 0.3749, 0.5898),
	"world-wall": solid(2, 2.4, 0.215),
	"world-post": solid(0.195, 2.4, 0.195),
	"world-railing": solid(2, 1.1, 0.15),
	// Deck/plank heights measured from the GLB: overall bounds include posts
	// and raised edge details, which must not lift the player's feet.
	"world-dock": {
		surfaces: [
			{ x: [-0.9999, 0.9999], z: [-1.005, 1.005], y: [0.445782, 0.445782] },
		],
		solids: [-1, 1].flatMap((x) =>
			[-1, 1].map(
				(z) =>
					({
						min: [x * 0.85 - 0.11, 0, z * 0.87 - 0.11],
						max: [x * 0.85 + 0.11, 0.65, z * 0.87 + 0.11],
					}) as TraversalBox,
			),
		),
	},
	"world-floor": {
		surfaces: [
			{
				x: [-0.98685, 0.98685],
				z: [-0.99185, 0.99185],
				y: [0.157895, 0.157895],
			},
		],
	},
	// Three 18 cm risers. A ramp follows the tread centres, capped at the
	// top/bottom tread heights. Blender +Y exports as GLTF -Z.
	"world-stairs": {
		surfaces: [
			{ x: [-0.6, 0.6], z: [-0.525, -0.35], y: [0.54, 0.54] },
			{ x: [-0.6, 0.6], z: [-0.35, 0.35], y: [0.54, 0.18] },
			{ x: [-0.6, 0.6], z: [0.35, 0.525], y: [0.18, 0.18] },
		],
	},
	"world-shack": {
		solids: [
			{ min: [-1.475, 0, -1.175], max: [-1.325, 2.4, 1.175] },
			{ min: [1.325, 0, -1.175], max: [1.475, 2.4, 1.175] },
			{ min: [-1.475, 0, -1.175], max: [1.475, 2.4, -1.025] },
			{ min: [-1.475, 0, 1.025], max: [-0.5, 2.4, 1.2] },
			{ min: [0.5, 0, 1.025], max: [1.475, 2.4, 1.2] },
			{ min: [-0.6, 2.09, 1.025], max: [0.6, 2.4, 1.21] },
		],
	},
};
