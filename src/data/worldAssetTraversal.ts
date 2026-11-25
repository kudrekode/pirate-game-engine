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

const cottage: AssetTraversalProfile = {
	solids: [
		box(4.78, 4.6, 4.55),
		{ min: [2.32, 0, -0.54], max: [2.9, 4.55, 1.36] },
	],
};

export const WORLD_ASSET_TRAVERSAL: Record<string, AssetTraversalProfile> = {
	"chapter-chapel-arch": {
		solids: [
			{ min: [-2.7, 0, -0.74], max: [-1.28, 4.0, 0.74] },
			{ min: [1.28, 0, -0.74], max: [2.7, 4.0, 0.74] },
		],
	},
	"chapter-chapel-wall": solid(6, 3.1, 0.75),
	"chapter-vigil-altar": solid(2.6, 1.6, 1.05),
	"chapter-mere-mouth": {
		solids: [
			{ min: [-4, 0, -0.9], max: [-1.72, 3.6, 0.9] },
			{ min: [1.72, 0, -0.9], max: [4, 3.6, 0.9] },
		],
	},
	"chapter-cinder-crystal": solid(1.28, 1.85, 0.86),
	"mere-cottage": cottage,
	"mere-lane-cottage": cottage,
	"mere-lane-ash": solid(0.38, 6, 0.38),
	"mere-lane-wall": solid(2.8, 0.68, 0.51),
	"mere-lane-woodpile": solid(1.3, 0.69, 0.64),
	"mere-well": solid(1.58, 1, 1.58),
	"mere-lantern": solid(0.41, 2.85, 0.41),
	"mere-barrel": solid(0.74, 0.93, 0.74),
	"mere-crag": solid(3.8, 1.6, 2.1),
	"mere-spruce": solid(0.38, 6, 0.38),
	"mere-watchtower": solid(3.62, 8, 3.62),
	"mere-dock": {
		surfaces: [{ x: [-1, 1], z: [-2, 2], y: [0.83, 0.83] }],
		solids: [-0.87, 0.87].flatMap((x) =>
			[-1.56, 1.56].map(
				(z) =>
					({
						min: [x - 0.12, 0, z - 0.12],
						max: [x + 0.12, 1.44, z + 0.12],
					}) as TraversalBox,
			),
		),
	},
	"world-barrel": solid(1.087, 1, 1.087),
	"world-crate": solid(0.98, 0.7, 1.19),
	"world-chest": solid(0.5334, 0.5638, 0.5496),
	// Kenney closed bounds. The body remains solid when the lid opens.
	"world-animated-chest": solid(1.275, 1.1475, 1.275),
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
