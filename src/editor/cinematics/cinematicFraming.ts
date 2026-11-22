import type { TerrainSurfaceSampler } from "../../data/terrainSurface";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import { getCameraClearFraction } from "../../runtime/three/cameraObstruction";
import {
	type ResolvedThreeVisual,
	resolveThreeCharacterVisual,
	resolveThreeVisual,
} from "../../runtime/three/threeVisuals";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	PLAYER_BODY_HEIGHT,
	type TraversalWorld,
} from "../../runtime/traversal";
import type {
	CinematicCamera,
	CinematicShot,
	CinematicShotPreset,
	GameArea,
	GameProject,
	MapEntityTransform,
	NPCInstance,
} from "../../types/game";

export type CinematicPreset = Exclude<CinematicShotPreset, "current-view">;
export const CINEMATIC_PRESETS = [
	{ id: "establishing", label: "Establishing", durationMs: 2600, fov: 55 },
	{ id: "close-up", label: "Close-up", durationMs: 3200, fov: 40 },
	{ id: "over-shoulder", label: "Over-shoulder", durationMs: 3200, fov: 45 },
	{ id: "two-shot", label: "Two-shot", durationMs: 3200, fov: 50 },
	{ id: "detail", label: "Detail", durationMs: 2400, fov: 35 },
	{ id: "reveal", label: "Reveal", durationMs: 3800, fov: 50 },
] as const satisfies readonly {
	id: CinematicPreset;
	label: string;
	durationMs: number;
	fov: number;
}[];

type Point = CinematicCamera["position"];
type GroundDirection = Pick<Point, "x" | "z">;
type GridPoint = { x: number; y: number };

export type CinematicSubject = {
	id: string;
	name: string;
	kind: "player" | "npc" | "landmark";
	/** Position of the visual's feet or base, in cinematic grid space. */
	position: Point;
	height: number;
	facing: GroundDirection;
	assetWarning?: string;
};

/** Optional scene measurements in the same grid space as serialized cameras. */
export type CinematicSubjectGeometry = {
	position?: Point;
	height?: number;
	head?: Point;
};

type FramingSubject = CinematicSubject & { head?: Point };

function isAreaPoint(area: GameArea, point: GridPoint): boolean {
	return (
		Number.isFinite(point.x) &&
		Number.isFinite(point.y) &&
		point.x >= 0 &&
		point.x <= area.width - 1 &&
		point.y >= 0 &&
		point.y <= area.height - 1
	);
}

export function getCinematicPlayerStart(
	area: GameArea,
	playerMark?: GridPoint,
): GridPoint | undefined {
	if (playerMark && isAreaPoint(area, playerMark)) return playerMark;
	const spawn = area.eventBlocks.find(
		(event) => event.kind === "spawn" && isAreaPoint(area, event),
	);
	if (spawn) return { x: spawn.x, y: spawn.y };
	const center = {
		x: Math.floor((area.width - 1) / 2),
		y: Math.floor((area.height - 1) / 2),
	};
	if (isAreaPoint(area, center)) return center;
}

function facingVector(facing: NPCInstance["facing"]): GroundDirection {
	switch (facing) {
		case "up":
			return { x: 0, z: -1 };
		case "left":
			return { x: -1, z: 0 };
		case "right":
			return { x: 1, z: 0 };
		default:
			return { x: 0, z: 1 };
	}
}

function rotate(direction: GroundDirection, degrees: number): GroundDirection {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return {
		x: direction.x * cos + direction.z * sin,
		z: direction.z * cos - direction.x * sin,
	};
}

function subjectVisual(
	position: Point,
	visual: ResolvedThreeVisual | undefined,
	transform: MapEntityTransform | undefined,
	height: number,
) {
	const offset = transform?.position;
	return {
		position: {
			x: position.x + (offset?.x ?? 0),
			y: position.y + (offset?.y ?? 0) + (visual?.heightOffset ?? 0),
			z: position.z + (offset?.z ?? 0),
		},
		height: Math.max(
			0.15,
			height * (visual?.scale ?? 1) * Math.abs(transform?.scale.y ?? 1),
		),
		assetWarning:
			visual?.requestedMode === "asset" && visual.mode === "placeholder"
				? `Asset ${visual.assetId ?? "reference"} is unavailable. Framing uses the placeholder.`
				: undefined,
	};
}

function groundForFootprint(
	sampler: TerrainSurfaceSampler,
	point: GridPoint,
	width: number,
	depth: number,
): number {
	let ground = 0;
	for (let y = point.y; y < point.y + depth; y++) {
		for (let x = point.x; x < point.x + width; x++) {
			ground = Math.max(ground, sampler.sampleSmoothSurfaceY({ x, y }));
		}
	}
	return ground;
}

function getSubjects(
	project: GameProject,
	area: GameArea,
	world: TraversalWorld,
	playerMark?: GridPoint,
) {
	const { sampler } = world;
	const assets = project.characterAssets;
	const variants = project.assetCreator?.variants;
	const actors: CinematicSubject[] = [];
	const landmarks: CinematicSubject[] = [];
	const playerPoint = getCinematicPlayerStart(area, playerMark);
	if (playerPoint) {
		const visual = resolveThreeCharacterVisual(
			{ kind: "player", ...project.player },
			assets,
			variants,
		);
		const usesPlayerMark = !!playerMark && isAreaPoint(area, playerMark);
		const ground =
			world.profiledObjects.size && !usesPlayerMark
				? createRuntimeTraversal(world, area, project, playerPoint).position
						.height
				: sampler.sampleSmoothSurfaceY({
						x: Math.round(playerPoint.x),
						y: Math.round(playerPoint.y),
					});
		actors.push({
			id: "runtime_player",
			name: `Player (${project.player.name})`,
			kind: "player",
			facing: facingVector(undefined),
			...subjectVisual(
				{ x: playerPoint.x, y: ground, z: playerPoint.y },
				visual,
				undefined,
				visual.mode === "asset" ? PLAYER_BODY_HEIGHT : 1.25,
			),
		});
	}
	const npcDefinitions = new Map(project.npcs.map((npc) => [npc.id, npc]));
	for (const npc of area.npcs) {
		if (!isAreaPoint(area, npc)) continue;
		const resolved = resolveNPCInstance(
			npcDefinitions.get(npc.npcDefinitionId),
			npc,
		);
		const visual = resolveThreeCharacterVisual(
			{
				kind: "npc",
				...resolved,
				enemyEnabled: resolved.enemyBehaviour?.enabled,
			},
			assets,
			variants,
		);
		actors.push({
			id: npc.id,
			name: resolved.name,
			kind: "npc",
			facing: rotate(
				facingVector(npc.facing),
				(npc.transform?.rotation.y ?? 0) +
					(resolved.threeVisual?.rotationOffset ?? 0),
			),
			...subjectVisual(
				{ x: npc.x, y: sampler.sampleSmoothSurfaceY(npc), z: npc.y },
				visual,
				npc.transform,
				visual.mode === "asset" ? PLAYER_BODY_HEIGHT : 1.1,
			),
		});
	}
	const objectDefinitions = new Map(
		project.objects.map((object) => [object.id, object]),
	);
	for (const object of area.objects) {
		if (!isAreaPoint(area, object)) continue;
		const definition = objectDefinitions.get(object.objectDefinitionId);
		const name = object.nameOverride || definition?.name || object.id;
		const visual = resolveThreeVisual(
			{
				kind: "object",
				name,
				behaviour: object.behaviourOverride ?? definition?.defaultBehaviour,
				category: definition?.category,
				interaction: object.interaction ?? definition?.defaultInteraction,
				threeVisual: { ...definition?.threeVisual, ...object.threeVisual },
			},
			assets,
			variants,
		);
		const width = object.widthTiles ?? definition?.widthTiles ?? 1;
		const depth = object.heightTiles ?? definition?.heightTiles ?? 1;
		const profile = visual.asset?.traversal;
		const height = Math.max(
			0.8,
			...(profile?.solids?.map((box) => box.max[1]) ?? []),
			...(profile?.surfaces?.map((surface) => Math.max(...surface.y)) ?? []),
		);
		landmarks.push({
			id: object.id,
			name,
			kind: "landmark",
			facing: rotate(
				{ x: 0, z: 1 },
				(object.transform?.rotation.y ?? 0) + visual.rotationOffset,
			),
			...subjectVisual(
				{
					x: object.x + (width - 1) / 2,
					y: groundForFootprint(sampler, object, width, depth),
					z: object.y + (depth - 1) / 2,
				},
				visual,
				object.transform,
				height,
			),
		});
	}
	for (const structure of area.structures) {
		if (!isAreaPoint(area, structure)) continue;
		const width = structure.widthTiles;
		const depth = structure.heightTiles;
		landmarks.push({
			id: structure.id,
			name: structure.name,
			kind: "landmark",
			facing: rotate({ x: 0, z: 1 }, structure.transform?.rotation.y ?? 0),
			...subjectVisual(
				{
					x: structure.x + (width - 1) / 2,
					y: groundForFootprint(sampler, structure, width, depth),
					z: structure.y + (depth - 1) / 2,
				},
				undefined,
				structure.transform,
				1.7,
			),
		});
	}
	for (const event of area.eventBlocks) {
		if (!isAreaPoint(area, event)) continue;
		landmarks.push({
			id: event.id,
			name: event.name,
			kind: "landmark",
			facing: { x: 0, z: 1 },
			...subjectVisual(
				{ x: event.x, y: sampler.sampleSmoothSurfaceY(event), z: event.y },
				undefined,
				event.transform,
				0.8,
			),
		});
	}
	return { actors, landmarks };
}

export function getCinematicSubjects(
	project: GameProject,
	area: GameArea,
	playerMark?: GridPoint,
) {
	return getSubjects(
		project,
		area,
		createTraversalWorld(project, area),
		playerMark,
	);
}

function aimAt(subject: FramingSubject, fraction: number): Point {
	return {
		...subject.position,
		y: subject.position.y + subject.height * fraction,
	};
}

function face(subject: FramingSubject): Point {
	return (
		subject.head ?? aimAt(subject, subject.kind === "landmark" ? 0.58 : 0.85)
	);
}

function cameraAt(
	lookAt: Point,
	direction: GroundDirection,
	distance: number,
	height: number,
): CinematicCamera {
	return {
		lookAt,
		position: {
			x: lookAt.x + direction.x * distance,
			y: lookAt.y + height,
			z: lookAt.z + direction.z * distance,
		},
	};
}

function directionTo(
	from: FramingSubject,
	to: FramingSubject,
): GroundDirection {
	const x = to.position.x - from.position.x;
	const z = to.position.z - from.position.z;
	const distance = Math.hypot(x, z);
	return distance > 0.05 ? { x: x / distance, z: z / distance } : from.facing;
}

function pointBetween(from: Point, to: Point, fraction: number): Point {
	return {
		x: from.x + (to.x - from.x) * fraction,
		y: from.y + (to.y - from.y) * fraction,
		z: from.z + (to.z - from.z) * fraction,
	};
}

function makePresetCamera(
	preset: CinematicPreset,
	target: FramingSubject,
	secondary: FramingSubject | undefined,
	angle: number,
	lift: number,
): CinematicCamera {
	const size = target.height;
	const facing = rotate(target.facing, angle);
	switch (preset) {
		case "close-up":
			return cameraAt(
				face(target),
				facing,
				Math.max(1, size * 0.95),
				size * 0.08 + lift,
			);
		case "detail":
			return cameraAt(
				aimAt(target, 0.48),
				facing,
				Math.max(0.8, size * 0.6),
				size * 0.24 + lift,
			);
		case "over-shoulder": {
			const foreground = secondary ?? target;
			const back = rotate(directionTo(target, foreground), angle);
			const shoulder = rotate(back, 90);
			const shoulderWidth = Math.max(0.34, foreground.height * 0.31);
			return {
				lookAt: face(target),
				position: {
					x: foreground.position.x + back.x + shoulder.x * shoulderWidth,
					y: face(foreground).y + 0.1 + lift,
					z: foreground.position.z + back.z + shoulder.z * shoulderWidth,
				},
			};
		}
		case "two-shot": {
			const other = secondary ?? target;
			const spread = Math.hypot(
				other.position.x - target.position.x,
				other.position.z - target.position.z,
				other.position.y - target.position.y,
			);
			const height = Math.max(size, other.height);
			return cameraAt(
				pointBetween(aimAt(target, 0.65), aimAt(other, 0.65), 0.5),
				rotate(directionTo(target, other), 90 + angle),
				Math.max(2.5, height * 1.65, spread * 0.9 + height * 0.6),
				height * 0.22 + lift,
			);
		}
		case "reveal":
			return cameraAt(
				aimAt(target, 0.53),
				facing,
				Math.max(5, size * 2.15),
				Math.max(1.75, size * 0.45) + lift,
			);
		case "establishing":
			return cameraAt(
				aimAt(target, 0.6),
				facing,
				Math.max(5.8, size * 1.9),
				Math.max(3, size * 0.76) + lift,
			);
	}
}

function safeShotCameras(
	world: TraversalWorld,
	preset: CinematicPreset,
	target: FramingSubject,
	secondary?: FramingSubject,
): Pick<CinematicShot, "from" | "to"> | undefined {
	// A landmark's own geometry can encompass its aim point. It remains solid
	// when checking the lens itself and its movement between reveal endpoints.
	const sightWorld =
		target.kind === "landmark"
			? {
					...world,
					solids: world.solids.filter((solid) => solid.id !== target.id),
				}
			: world;
	const angles =
		preset === "over-shoulder"
			? [0, -25, 25]
			: [-25, 25, -60, 60, -100, 100, 180];
	const visible = (camera: CinematicCamera) =>
		getCameraClearFraction(world, camera.position, camera.position) === 1 &&
		getCameraClearFraction(sightWorld, camera.lookAt, camera.position) === 1 &&
		(!secondary ||
			preset !== "two-shot" ||
			(getCameraClearFraction(world, face(target), camera.position) === 1 &&
				getCameraClearFraction(world, face(secondary), camera.position) === 1));

	for (const lift of [0, 0.75, 1.75]) {
		for (const angle of angles) {
			const from = makePresetCamera(preset, target, secondary, angle, lift);
			if (!visible(from)) continue;
			if (preset !== "reveal") return { from };
			const to = {
				lookAt: aimAt(target, 0.65),
				position: pointBetween(from.position, from.lookAt, 0.22),
			};
			const middle = {
				lookAt: pointBetween(from.lookAt, to.lookAt, 0.5),
				position: pointBetween(from.position, to.position, 0.5),
			};
			if (
				visible(to) &&
				visible(middle) &&
				getCameraClearFraction(world, from.position, to.position) === 1
			)
				return { from, to };
		}
	}
}

type PresetOptions = {
	preset: CinematicPreset;
	targetId?: string;
	secondaryTargetId?: string;
	playerMark?: GridPoint;
	getSubjectGeometry?: (id: string) => CinematicSubjectGeometry | undefined;
};

export function createCinematicPresetShot(
	project: GameProject,
	area: GameArea,
	options: PresetOptions,
): { shot?: CinematicShot; diagnostics: string[] } {
	const {
		preset,
		targetId,
		secondaryTargetId,
		playerMark,
		getSubjectGeometry,
	} = options;
	const defaults = CINEMATIC_PRESETS.find(({ id }) => id === preset);
	if (!defaults) return { diagnostics: ["Choose a camera preset."] };
	const world = createTraversalWorld(project, area);
	const { actors, landmarks } = getSubjects(project, area, world, playerMark);
	const subject = [...actors, ...landmarks].find(({ id }) => id === targetId);
	const defaultActor = actors.find(({ kind }) => kind === "npc") ?? actors[0];
	const defaultTarget =
		preset === "reveal" || preset === "detail"
			? (landmarks[0] ?? defaultActor)
			: (defaultActor ?? landmarks[0]);
	const target = targetId ? subject : defaultTarget;
	if (!target)
		return {
			diagnostics: [
				targetId
					? `Missing camera target (${targetId}).`
					: "This area has no camera targets.",
			],
		};
	const requiresPair = preset === "two-shot" || preset === "over-shoulder";
	const secondary = secondaryTargetId
		? actors.find(({ id }) => id === secondaryTargetId)
		: requiresPair
			? actors.find(({ id }) => id !== target.id)
			: undefined;
	if (secondaryTargetId && !secondary)
		return { diagnostics: [`Missing secondary actor (${secondaryTargetId}).`] };
	if (
		requiresPair &&
		(!secondary || target.id === secondary.id || target.kind === "landmark")
	)
		return { diagnostics: ["Choose two different actors for this shot."] };

	const diagnostics: string[] = [];
	if (playerMark && !isAreaPoint(area, playerMark))
		diagnostics.push(
			"The Player's mark is outside this area. Framing uses the area start.",
		);
	const measure = (entry: CinematicSubject): FramingSubject => {
		if (entry.assetWarning)
			diagnostics.push(`${entry.name}: ${entry.assetWarning}`);
		const geometry = getSubjectGeometry?.(entry.id);
		return {
			...entry,
			position: geometry?.position ?? entry.position,
			height: geometry?.height ?? entry.height,
			head: geometry?.head,
		};
	};
	const cameras = safeShotCameras(
		world,
		preset,
		measure(target),
		secondary && measure(secondary),
	);
	if (!cameras)
		return {
			diagnostics: [
				...diagnostics,
				`Scenery blocks a clear view of ${target.name}.`,
			],
		};
	return {
		shot: {
			...cameras,
			preset,
			targetId: target.id,
			secondaryTargetId: secondary?.id,
			durationMode: "auto",
			durationMs: defaults.durationMs,
			fov: defaults.fov,
		},
		diagnostics,
	};
}
