import { isTerrainWaterTileId } from "../data/terrainHeight";
import {
	createTerrainSurfaceSampler,
	type TerrainSurfaceMode,
} from "../data/terrainSurface";
import {
	type TraversalBox,
	type TraversalSurface,
	WORLD_ASSET_TRAVERSAL,
} from "../data/worldAssetTraversal";
import type {
	GameArea,
	GameProject,
	MapEntityTransform,
	ThreeVisualConfig,
} from "../types/game";
import { resolveMovementAt } from "./movement";

// Below knee height for the 1.82 m authored human. Also admits the harbour's
// 36 cm transition where the stair landing meets the sloping shoreline.
export const MAX_STEP_HEIGHT = 0.4;
export const MAX_STEP_DOWN = 0.4;
export const PLAYER_HALF_WIDTH = 0.18;
export const PLAYER_BODY_HEIGHT = 1.75;
const EPS = 0.001;
type Vec = [number, number, number];
export type TraversalPosition = { x: number; y: number; height: number };
type Frame = { origin: Vec; axes: [Vec, Vec, Vec]; scale: Vec };
export type TraversalSolid = {
	id: string;
	center: Vec;
	axes: [Vec, Vec, Vec];
	half: Vec;
};
export type TraversalFloor = {
	id: string;
	corners: [Vec, Vec, Vec, Vec];
	normal: Vec;
};
type Candidate = { solid?: TraversalSolid; floor?: TraversalFloor };
export type TraversalWorld = ReturnType<typeof createTraversalWorld>;
export type RuntimeTraversal = {
	world: TraversalWorld;
	position: TraversalPosition;
	grid: { x: number; y: number };
	// Accepted, swept samples also ground presentation between transaction ends.
	path: TraversalPosition[];
	startMs: number;
	durationMs: number;
	lastReason?: string;
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const axes: [Vec, Vec, Vec] = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

// Same XYZ Euler order as the marker wrapper; non-uniform scales precede rotation.
export function traversalFrame(
	origin: Vec,
	transform?: MapEntityTransform,
	visual?: ThreeVisualConfig,
): Frame {
	const rx = ((transform?.rotation.x ?? 0) * Math.PI) / 180;
	const ry =
		(((transform?.rotation.y ?? 0) +
			Math.max(-360, Math.min(360, visual?.rotationOffset ?? 0))) *
			Math.PI) /
		180;
	const rz = ((transform?.rotation.z ?? 0) * Math.PI) / 180;
	const a = Math.cos(rx),
		b = Math.sin(rx),
		c = Math.cos(ry),
		d = Math.sin(ry),
		e = Math.cos(rz),
		f = Math.sin(rz);
	const scale = Math.max(0.1, Math.min(5, visual?.scale ?? 1));
	return {
		origin: [
			origin[0] + (transform?.position.x ?? 0),
			origin[1] +
				(transform?.position.y ?? 0) +
				Math.max(-5, Math.min(5, visual?.heightOffset ?? 0)),
			origin[2] + (transform?.position.z ?? 0),
		],
		axes: [
			[c * e, a * f + b * e * d, b * f - a * e * d],
			[-c * f, a * e - b * f * d, b * e + a * f * d],
			[d, -b * c, a * c],
		],
		scale: [
			scale * (transform?.scale.x ?? 1),
			scale * (transform?.scale.y ?? 1),
			scale * (transform?.scale.z ?? 1),
		],
	};
}
export function transformTraversalPoint(frame: Frame, point: Vec): Vec {
	return frame.origin.map(
		(value, i) =>
			value +
			frame.axes.reduce(
				(sum, axis, j) => sum + axis[i] * point[j] * frame.scale[j],
				0,
			),
	) as Vec;
}
export function transformTraversalBox(
	id: string,
	frame: Frame,
	box: TraversalBox,
): TraversalSolid {
	return {
		id,
		axes: frame.axes,
		center: transformTraversalPoint(
			frame,
			box.min.map((v, i) => (v + box.max[i]) / 2) as Vec,
		),
		half: box.min.map(
			(v, i) => ((box.max[i] - v) * Math.abs(frame.scale[i])) / 2,
		) as Vec,
	};
}
function transformFloor(
	id: string,
	frame: Frame,
	floor: TraversalSurface,
): TraversalFloor {
	const corners = [
		[floor.x[0], floor.y[0], floor.z[0]],
		[floor.x[1], floor.y[0], floor.z[0]],
		[floor.x[1], floor.y[1], floor.z[1]],
		[floor.x[0], floor.y[1], floor.z[1]],
	].map((p) =>
		transformTraversalPoint(frame, p as Vec),
	) as TraversalFloor["corners"];
	const normal = cross(
		sub(corners[3], corners[0]),
		sub(corners[1], corners[0]),
	);
	const length = Math.hypot(...normal);
	return { id, corners, normal: normal.map((v) => v / length) as Vec };
}
export function floorHeightAt(
	floor: TraversalFloor,
	x: number,
	z: number,
): number | undefined {
	// Steep/overturned authored floors are not ladders or ceilings to stand on.
	if (floor.normal[1] < 0.65) return undefined;
	const a = floor.corners[0];
	const y =
		a[1] -
		(floor.normal[0] * (x - a[0]) + floor.normal[2] * (z - a[2])) /
			floor.normal[1];
	const point: Vec = [x, y, z];
	const u = sub(floor.corners[1], a),
		v = sub(floor.corners[3], a),
		p = sub(point, a);
	const uu = dot(u, u),
		vv = dot(v, v),
		uv = dot(u, v),
		pu = dot(p, u),
		pv = dot(p, v);
	const det = uu * vv - uv * uv;
	const s = (pu * vv - pv * uv) / det,
		t = (pv * uu - pu * uv) / det;
	const seamU = 0.015 / Math.sqrt(uu),
		seamV = 0.015 / Math.sqrt(vv);
	return s >= -seamU && s <= 1 + seamU && t >= -seamV && t <= 1 + seamV
		? y
		: undefined;
}
export function intersectsTraversalSolid(
	solid: TraversalSolid,
	position: TraversalPosition,
): boolean {
	const center: Vec = [
		position.x,
		position.height + PLAYER_BODY_HEIGHT / 2 + EPS,
		position.y,
	];
	const half: Vec = [
		PLAYER_HALF_WIDTH,
		PLAYER_BODY_HEIGHT / 2 - EPS,
		PLAYER_HALF_WIDTH,
	];
	const delta = sub(center, solid.center);
	// Separating-axis test for the upright player box against a transformed box.
	for (const axis of [
		...axes,
		...solid.axes,
		...axes.flatMap((a) => solid.axes.map((b) => cross(a, b))),
	]) {
		if (dot(axis, axis) < 1e-10) continue;
		const radius =
			axes.reduce((n, a, i) => n + Math.abs(dot(axis, a)) * half[i], 0) +
			solid.axes.reduce(
				(n, a, i) => n + Math.abs(dot(axis, a)) * solid.half[i],
				0,
			);
		if (Math.abs(dot(delta, axis)) >= radius - EPS) return false;
	}
	return true;
}

export function createTraversalWorld(
	project: GameProject,
	area: GameArea,
	mode: TerrainSurfaceMode = "smooth",
) {
	const sampler = createTerrainSurfaceSampler(area);
	const solids: TraversalSolid[] = [],
		floors: TraversalFloor[] = [];
	const profiledObjects = new Set<string>();
	const labels = new Map<string, string>();
	for (const object of area.objects) {
		const definition = project.objects.find(
			(d) => d.id === object.objectDefinitionId,
		);
		const visual = { ...definition?.threeVisual, ...object.threeVisual };
		const profile =
			visual.mode === "asset" && visual.assetId
				? WORLD_ASSET_TRAVERSAL[visual.assetId]
				: undefined;
		if (!profile) continue;
		profiledObjects.add(object.id);
		labels.set(
			object.id,
			object.nameOverride ?? definition?.name ?? "solid object",
		);
		const width = object.widthTiles ?? definition?.widthTiles ?? 1;
		const depth = object.heightTiles ?? definition?.heightTiles ?? 1;
		let base = sampler.sampleSurfaceY(object, mode);
		for (let y = object.y; y < object.y + depth; y++)
			for (let x = object.x; x < object.x + width; x++)
				base = Math.max(base, sampler.sampleSurfaceY({ x, y }, mode));
		const frame = traversalFrame(
			[
				object.x + (width - 1) / 2,
				Math.max(0, base),
				object.y + (depth - 1) / 2,
			],
			object.transform,
			visual,
		);
		solids.push(
			...(profile.solids ?? []).map((b) =>
				transformTraversalBox(object.id, frame, b),
			),
		);
		floors.push(
			...(profile.surfaces ?? []).map((f) =>
				transformFloor(object.id, frame, f),
			),
		);
	}
	// A floor rotated upright is a barrier, not an invisible non-walkable plane.
	for (const floor of floors) {
		if (floor.normal[1] >= 0.65) continue;
		const u = sub(floor.corners[1], floor.corners[0]);
		const v = sub(floor.corners[3], floor.corners[0]);
		const width = Math.hypot(...u),
			depth = Math.hypot(...v);
		solids.push({
			id: floor.id,
			center: floor.corners[0].map(
				(n, i) => (n + floor.corners[2][i]) / 2,
			) as Vec,
			axes: [
				u.map((n) => n / width) as Vec,
				floor.normal,
				v.map((n) => n / depth) as Vec,
			],
			half: [width / 2, 0.05, depth / 2],
		});
	}
	const buckets = new Map<string, Candidate[]>();
	const key = (x: number, z: number) => `${Math.floor(x)}:${Math.floor(z)}`;
	const add = (candidate: Candidate, points: Vec[]) => {
		const minX = Math.max(
			-1,
			Math.floor(Math.min(...points.map((p) => p[0])) - PLAYER_HALF_WIDTH),
		);
		const maxX = Math.min(
			area.width,
			Math.floor(Math.max(...points.map((p) => p[0])) + PLAYER_HALF_WIDTH),
		);
		const minZ = Math.max(
			-1,
			Math.floor(Math.min(...points.map((p) => p[2])) - PLAYER_HALF_WIDTH),
		);
		const maxZ = Math.min(
			area.height,
			Math.floor(Math.max(...points.map((p) => p[2])) + PLAYER_HALF_WIDTH),
		);
		for (let x = minX; x <= maxX; x++)
			for (let z = minZ; z <= maxZ; z++) {
				const k = key(x, z);
				const bucket = buckets.get(k) ?? [];
				bucket.push(candidate);
				buckets.set(k, bucket);
			}
	};
	for (const solid of solids)
		add(
			{ solid },
			[-1, 1].flatMap((x) =>
				[-1, 1].flatMap((y) =>
					[-1, 1].map(
						(z) =>
							solid.center.map(
								(n, i) =>
									n +
									solid.axes[0][i] * solid.half[0] * x +
									solid.axes[1][i] * solid.half[1] * y +
									solid.axes[2][i] * solid.half[2] * z,
							) as Vec,
					),
				),
			),
		);
	for (const floor of floors) add({ floor }, floor.corners);
	return {
		areaId: area.id,
		mode,
		sampler,
		solids,
		floors,
		profiledObjects,
		labels,
		candidates: (x: number, z: number) => buckets.get(key(x, z)) ?? [],
	};
}

export function resolveTraversalFloor(
	world: TraversalWorld,
	area: GameArea,
	project: GameProject,
	point: { x: number; y: number },
	previousHeight: number,
) {
	const x = Math.round(point.x),
		y = Math.round(point.y);
	const cell = world.sampler.getTile(x, y);
	const candidates: { height: number; surface?: string }[] = [];
	const terrainMove = resolveMovementAt(area, x, y, project.player, {
		ignoredObjectIds: world.profiledObjects,
	});
	if (cell && !isTerrainWaterTileId(cell.tileId) && terrainMove.canMove)
		candidates.push({ height: sampleTraversalTerrain(world, point) });
	for (const candidate of world.candidates(point.x, point.y)) {
		if (!candidate.floor) continue;
		const height = floorHeightAt(candidate.floor, point.x, point.y);
		if (height !== undefined)
			candidates.push({ height, surface: candidate.floor.id });
	}
	return candidates
		.filter(
			(c) =>
				c.height <= previousHeight + MAX_STEP_HEIGHT + EPS &&
				c.height >= previousHeight - MAX_STEP_DOWN - EPS,
		)
		.sort((a, b) => b.height - a.height)[0];
}

export function sampleTraversalTerrain(
	world: TraversalWorld,
	point: { x: number; y: number },
): number {
	if (world.mode === "blocky")
		return world.sampler.sampleSurfaceY(point, world.mode);
	const x = Math.floor(point.x + 0.5),
		z = Math.floor(point.y + 0.5),
		u = point.x + 0.5 - x,
		v = point.y + 0.5 - z;
	const a = world.sampler.getCornerSurfaceY(x, z),
		b = world.sampler.getCornerSurfaceY(x + 1, z),
		c = world.sampler.getCornerSurfaceY(x + 1, z + 1),
		d = world.sampler.getCornerSurfaceY(x, z + 1);
	// Match the rendered top-left / bottom-right diagonal, not a bilinear patch.
	return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
}

function checkPosition(
	world: TraversalWorld,
	area: GameArea,
	project: GameProject,
	point: { x: number; y: number },
	height: number,
): { position?: TraversalPosition; reason?: string } {
	if (
		point.x < -0.5 + PLAYER_HALF_WIDTH ||
		point.y < -0.5 + PLAYER_HALF_WIDTH ||
		point.x > area.width - 0.5 - PLAYER_HALF_WIDTH ||
		point.y > area.height - 0.5 - PLAYER_HALF_WIDTH
	)
		return { reason: "Out of bounds." };
	const floor = resolveTraversalFloor(world, area, project, point, height);
	if (!floor)
		return { reason: "No reachable floor (water, void or step too high)." };
	const movement = resolveMovementAt(
		area,
		Math.round(point.x),
		Math.round(point.y),
		project.player,
		{
			ignoredObjectIds: world.profiledObjects,
			walkableSurface: !!floor.surface,
		},
	);
	if (!movement.canMove) return { reason: movement.reason };
	const position = { ...point, height: floor.height };
	for (const candidate of world.candidates(point.x, point.y)) {
		if (candidate.solid && intersectsTraversalSolid(candidate.solid, position))
			return {
				reason: `Blocked by ${world.labels.get(candidate.solid.id) ?? "solid object"}.`,
			};
		if (candidate.floor) {
			const top = floorHeightAt(candidate.floor, point.x, point.y);
			if (
				top !== undefined &&
				top > floor.height + MAX_STEP_HEIGHT + EPS &&
				top < floor.height + PLAYER_BODY_HEIGHT
			)
				return { reason: "Raised floor blocks movement." };
		}
	}
	return { position };
}

// Sweep in at most 4 cm increments, including diagonals. Never validate just the
// endpoint: thin walls, high steps and unsupported gaps must not be skipped.
export function sweepTraversal(
	world: TraversalWorld,
	area: GameArea,
	project: GameProject,
	from: TraversalPosition,
	delta: { x: number; y: number },
) {
	const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / 0.04));
	const path = [from];
	let reason: string | undefined;
	for (let i = 1; i <= count; i++) {
		const result = checkPosition(
			world,
			area,
			project,
			{ x: from.x + (delta.x * i) / count, y: from.y + (delta.y * i) / count },
			path[path.length - 1].height,
		);
		if (!result.position) {
			reason = result.reason;
			break;
		}
		path.push(result.position);
	}
	return { position: path[path.length - 1], path, reason };
}

export function createRuntimeTraversal(
	world: TraversalWorld,
	area: GameArea,
	project: GameProject,
	grid: { x: number; y: number },
	previousPosition?: TraversalPosition,
): RuntimeTraversal {
	const point = previousPosition ?? grid;
	const base =
		previousPosition?.height ?? world.sampler.sampleSurfaceY(point, world.mode);
	const floor = resolveTraversalFloor(world, area, project, point, base);
	// Do not teleport away from a bad spawn or snap to a roof above it.
	const position = { ...point, height: floor?.height ?? base };
	return {
		world,
		position,
		grid: { ...grid },
		path: [position],
		startMs: 0,
		durationMs: 0,
	};
}

export function sampleTraversalMotion(
	state: RuntimeTraversal,
	nowMs: number,
): TraversalPosition {
	const progress = state.durationMs
		? Math.max(0, Math.min(1, (nowMs - state.startMs) / state.durationMs))
		: 1;
	const index = progress * (state.path.length - 1),
		a = state.path[Math.floor(index)],
		b = state.path[Math.min(state.path.length - 1, Math.floor(index) + 1)],
		t = index - Math.floor(index);
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		height: a.height + (b.height - a.height) * t,
	};
}
