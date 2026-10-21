import { BOW } from "../data/bow";
import { getStructurePreset } from "../data/mapVisuals";
import type { GameArea } from "../types/game";
import {
	beginRuntimeCombatAttack,
	damageRuntimeNpc,
	type RuntimeCombatEventEmitter,
} from "./runtimeCombat";
import type { RuntimeSessionState } from "./runtimeSession";
import type { TraversalSolid, TraversalWorld } from "./traversal";
import { getEquippedWeapon } from "./weaponRuntime";

/** Grid metres: x east, y height, z south. No renderer objects in gameplay. */
export type ProjectilePoint = { x: number; y: number; z: number };
export type BowAim = { origin: ProjectilePoint; direction: ProjectilePoint };
export type ArrowProjectile = {
	id: number;
	position: ProjectilePoint;
	previous: ProjectilePoint;
	direction: ProjectilePoint;
	speed: number;
	remainingRange: number;
	remainingMs: number;
	sourceActor: "player";
	weapon: "bow";
	damage: number;
};
export type RuntimeProjectiles = {
	areaId: string;
	nextId: number;
	pending?: { remainingMs: number; aim: BowAim };
	arrows: ArrowProjectile[];
	spawned: number;
	removed: number;
	lastImpact?: {
		kind: "world" | "npc" | "expired";
		id?: string;
		position: ProjectilePoint;
	};
};
const axes: TraversalSolid["axes"] = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];
const vector = (p: ProjectilePoint) => [p.x, p.y, p.z];
const mix = (
	a: ProjectilePoint,
	b: ProjectilePoint,
	t: number,
): ProjectilePoint => ({
	x: a.x + (b.x - a.x) * t,
	y: a.y + (b.y - a.y) * t,
	z: a.z + (b.z - a.z) * t,
});
export function normalizedProjectileDirection(
	direction: ProjectilePoint,
): ProjectilePoint | undefined {
	const length = Math.hypot(direction.x, direction.y, direction.z);
	return Number.isFinite(length) && length > 1e-8
		? {
				x: direction.x / length,
				y: direction.y / length,
				z: direction.z / length,
			}
		: undefined;
}

/** Slab sweep in the existing box's local axes, including origins inside a solid. */
export function projectileBoxFraction(
	from: ProjectilePoint,
	to: ProjectilePoint,
	box: TraversalSolid,
): number | undefined {
	const start = vector(from),
		end = vector(to);
	let near = 0,
		far = 1;
	for (let i = 0; i < 3; i++) {
		const axis = box.axes[i];
		const origin = axis.reduce(
			(n, a, j) => n + a * (start[j] - box.center[j]),
			0,
		);
		const delta = axis.reduce((n, a, j) => n + a * (end[j] - start[j]), 0);
		if (Math.abs(delta) < 1e-9) {
			if (Math.abs(origin) > box.half[i]) return undefined;
		} else {
			const a = (-box.half[i] - origin) / delta,
				b = (box.half[i] - origin) / delta;
			near = Math.max(near, Math.min(a, b));
			far = Math.min(far, Math.max(a, b));
			if (near > far) return undefined;
		}
	}
	return near;
}

function triangleFraction(
	from: ProjectilePoint,
	to: ProjectilePoint,
	vertices: number[][],
): number | undefined {
	const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
	const dot = (a: number[], b: number[]) =>
		a.reduce((n, v, i) => n + v * b[i], 0);
	const cross = (a: number[], b: number[]) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
	const direction = sub(vector(to), vector(from)),
		edge1 = sub(vertices[1], vertices[0]),
		edge2 = sub(vertices[2], vertices[0]);
	const h = cross(direction, edge2),
		det = dot(edge1, h);
	if (Math.abs(det) < 1e-9) return undefined;
	const s = sub(vector(from), vertices[0]),
		u = dot(s, h) / det;
	if (u < 0 || u > 1) return undefined;
	const q = cross(s, edge1),
		v = dot(direction, q) / det;
	if (v < 0 || u + v > 1) return undefined;
	const t = dot(edge2, q) / det;
	return t >= 0 && t <= 1 ? t : undefined;
}

export function traceProjectile(
	session: RuntimeSessionState,
	area: GameArea,
	world: TraversalWorld,
	from: ProjectilePoint,
	to: ProjectilePoint,
): { fraction: number; kind: "world" | "npc"; id: string } | undefined {
	let hit: ReturnType<typeof traceProjectile>;
	const consider = (
		fraction: number | undefined,
		kind: "world" | "npc",
		id: string,
	) => {
		if (fraction !== undefined && (!hit || fraction < hit.fraction))
			hit = { fraction, kind, id };
	};
	for (const solid of world.solids)
		consider(projectileBoxFraction(from, to, solid), "world", solid.id);
	for (const floor of world.floors) {
		consider(
			triangleFraction(from, to, [
				floor.corners[0],
				floor.corners[1],
				floor.corners[2],
			]),
			"world",
			floor.id,
		);
		consider(
			triangleFraction(from, to, [
				floor.corners[0],
				floor.corners[2],
				floor.corners[3],
			]),
			"world",
			floor.id,
		);
	}
	// Legacy unprofiled content retains its authored blocking footprint.
	for (const object of [...area.structures, ...area.objects]) {
		if (world.profiledObjects.has(object.id)) continue;
		const structure = "structureId" in object ? object : undefined;
		const definition =
			"objectDefinitionId" in object
				? session.project.objects.find(
						(d) => d.id === object.objectDefinitionId,
					)
				: undefined;
		const blocks =
			(object.blocksMovement ?? definition?.blocksMovement) ||
			(structure &&
				(
					structure.movementRule ??
					getStructurePreset(structure.structureId).movementRule
				).walkable === false);
		if (!blocks) continue;
		const width = object.widthTiles ?? definition?.widthTiles ?? 1,
			depth = object.heightTiles ?? definition?.heightTiles ?? 1;
		const base = world.sampler.sampleSurfaceY(object, world.mode);
		consider(
			projectileBoxFraction(from, to, {
				id: object.id,
				axes,
				center: [
					object.x + (width - 1) / 2,
					base + 1,
					object.y + (depth - 1) / 2,
				],
				half: [width / 2, 1, depth / 2],
			}),
			"world",
			object.id,
		);
	}
	// Visit the cells crossed by the segment and intersect their terrain triangles.
	// Neighbour cells include corner crossings; exact sweeps, not point collision tests.
	const cells = new Set<string>();
	const steps = Math.max(
		1,
		Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z)) * 2),
	);
	for (let i = 0; i <= steps; i++) {
		const p = mix(from, to, i / steps),
			x = Math.floor(p.x + 0.5),
			z = Math.floor(p.z + 0.5);
		for (let dx = -1; dx <= 1; dx++)
			for (let dz = -1; dz <= 1; dz++) cells.add(`${x + dx}:${z + dz}`);
	}
	for (const cell of cells) {
		const [x, z] = cell.split(":").map(Number);
		if (!world.sampler.getTile(x, z)) continue;
		if (world.mode === "blocky") {
			const top = world.sampler.getCellSurfaceY(x, z);
			consider(
				projectileBoxFraction(from, to, {
					id: cell,
					axes,
					center: [x, top - 100, z],
					half: [0.5, 100, 0.5],
				}),
				"world",
				"terrain",
			);
		} else {
			const a = [x - 0.5, world.sampler.getCornerSurfaceY(x, z), z - 0.5];
			const b = [x + 0.5, world.sampler.getCornerSurfaceY(x + 1, z), z - 0.5];
			const c = [
				x + 0.5,
				world.sampler.getCornerSurfaceY(x + 1, z + 1),
				z + 0.5,
			];
			const d = [x - 0.5, world.sampler.getCornerSurfaceY(x, z + 1), z + 0.5];
			consider(triangleFraction(from, to, [a, b, c]), "world", "terrain");
			consider(triangleFraction(from, to, [a, c, d]), "world", "terrain");
		}
	}
	for (const npc of area.npcs) {
		if (session.defeatedNpcIds.has(npc.id)) continue;
		const offset = npc.transform?.position;
		const x = npc.x + (offset?.x ?? 0),
			z = npc.y + (offset?.z ?? 0);
		const base =
			world.sampler.sampleSurfaceY({ x, y: z }, world.mode) + (offset?.y ?? 0);
		consider(
			projectileBoxFraction(from, to, {
				id: npc.id,
				axes,
				center: [x, base + 0.85, z],
				half: [0.32, 0.85, 0.32],
			}),
			"npc",
			npc.id,
		);
	}
	return hit;
}

/** Aim at the first actual ray intersection, with a far point for a miss. No aim assist. */
export function resolveBowAimPoint(
	session: RuntimeSessionState,
	area: GameArea,
	world: TraversalWorld,
	aim: BowAim,
): ProjectilePoint {
	const direction = normalizedProjectileDirection(aim.direction) ?? {
		x: 0,
		y: 0,
		z: 1,
	};
	const far = {
		x: aim.origin.x + direction.x * BOW.maxRange,
		y: aim.origin.y + direction.y * BOW.maxRange,
		z: aim.origin.z + direction.z * BOW.maxRange,
	};
	const hit = traceProjectile(session, area, world, aim.origin, far);
	return mix(aim.origin, far, hit?.fraction ?? 1);
}

export function attemptRuntimeBowAttack(
	session: RuntimeSessionState,
	time: number,
	aim: BowAim,
	emit: RuntimeCombatEventEmitter,
): boolean {
	if (
		getEquippedWeapon(session)?.id !== "bow" ||
		session.projectiles?.pending ||
		!normalizedProjectileDirection(aim.direction) ||
		!vector(aim.origin).every(Number.isFinite)
	)
		return false;
	if (!beginRuntimeCombatAttack(session, time, emit)) return false;
	if (session.projectiles?.areaId !== session.currentAreaId)
		session.projectiles = {
			areaId: session.currentAreaId,
			nextId: 1,
			arrows: [],
			spawned: 0,
			removed: 0,
		};
	session.projectiles.pending = {
		remainingMs: BOW.releaseDelayMs,
		aim: { origin: { ...aim.origin }, direction: { ...aim.direction } },
	};
	return true;
}

/** Called once from the adapter's existing update loop. All collision/damage is shared. */
export function advanceRuntimeProjectiles(
	session: RuntimeSessionState,
	area: GameArea,
	world: TraversalWorld,
	deltaMs: number,
	spawn: { body: ProjectilePoint; muzzle: ProjectilePoint },
	emit: RuntimeCombatEventEmitter,
	blocked = false,
): void {
	const state = session.projectiles;
	if (!state) return;
	if (state.areaId !== area.id || session.runtimePlayerHealth <= 0) {
		session.projectiles = undefined;
		return;
	}
	if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
	// Menus suspend the same transient clock as NPC gameplay. Continue never restores it.
	if (blocked) return;
	let newArrow: ArrowProjectile | undefined,
		newDelta = deltaMs;
	if (state.pending) {
		const pending = state.pending;
		pending.remainingMs -= deltaMs;
		if (pending.remainingMs <= 0) {
			state.pending = undefined;
			const aimPoint = resolveBowAimPoint(session, area, world, pending.aim);
			// Sweep from the body to the socket BEFORE launch. Camera visibility cannot bypass a wall.
			const obstruction = traceProjectile(
				session,
				area,
				world,
				spawn.body,
				spawn.muzzle,
			);
			const origin = obstruction
				? mix(spawn.body, spawn.muzzle, obstruction.fraction)
				: spawn.muzzle;
			const direction =
				normalizedProjectileDirection({
					x: aimPoint.x - origin.x,
					y: aimPoint.y - origin.y,
					z: aimPoint.z - origin.z,
				}) ?? normalizedProjectileDirection(pending.aim.direction)!;
			newArrow = {
				id: state.nextId++,
				position: { ...origin },
				previous: { ...origin },
				direction,
				speed: BOW.projectileSpeed,
				remainingRange: BOW.maxRange,
				remainingMs: BOW.lifetimeMs,
				sourceActor: "player",
				weapon: "bow",
				damage: BOW.attackDamage,
			};
			state.spawned++;
			if (obstruction) {
				impact(obstruction, newArrow);
				newArrow = undefined;
			} else {
				state.arrows.push(newArrow);
				newDelta = -pending.remainingMs;
			}
		}
	}
	function impact(
		hit: { kind: "world" | "npc"; id: string },
		arrow: ArrowProjectile,
	) {
		state!.removed++;
		state!.lastImpact = { ...hit, position: { ...arrow.position } };
		if (hit.kind === "npc") {
			const npc = area.npcs.find((npc) => npc.id === hit.id);
			if (npc) damageRuntimeNpc(session, area, npc, arrow.damage, emit);
		}
	}
	for (let i = state.arrows.length - 1; i >= 0; i--) {
		const arrow = state.arrows[i],
			elapsed = Math.min(
				arrow.remainingMs,
				arrow === newArrow ? newDelta : deltaMs,
			);
		const distance = Math.min(
			arrow.remainingRange,
			(arrow.speed * elapsed) / 1000,
		);
		arrow.previous = { ...arrow.position };
		const to = {
			x: arrow.position.x + arrow.direction.x * distance,
			y: arrow.position.y + arrow.direction.y * distance,
			z: arrow.position.z + arrow.direction.z * distance,
		};
		const hit = traceProjectile(session, area, world, arrow.position, to);
		arrow.position = mix(arrow.position, to, hit?.fraction ?? 1);
		arrow.remainingMs -= elapsed;
		arrow.remainingRange -= distance;
		if (hit) {
			state.arrows.splice(i, 1);
			impact(hit, arrow);
		} else if (arrow.remainingMs <= 0 || arrow.remainingRange <= 1e-8) {
			state.arrows.splice(i, 1);
			state.removed++;
			state.lastImpact = { kind: "expired", position: { ...arrow.position } };
		}
	}
}
