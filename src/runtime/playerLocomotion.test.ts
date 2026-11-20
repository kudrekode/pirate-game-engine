import { describe, expect, it, vi } from "vitest";
import { createProjectFromPreset } from "../data/projectPresets";
import { createGameSave, restoreGameSave } from "./gameSave";
import {
	AIR_CONTROL_MULTIPLIER,
	advancePlayerLocomotion,
	isPlayerAirborne,
	JUMP_GRAVITY,
	JUMP_SPEED,
	SPRINT_MULTIPLIER,
	setPlayerSprint,
	tryPlayerJump,
} from "./playerLocomotion";
import { attemptPlayerMove } from "./playerMovementTransaction";
import { attemptRuntimeCombatAttack } from "./runtimeCombat";
import { createRuntimeSession } from "./runtimeSession";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	sampleTraversalMotion,
} from "./traversal";

function fixture(asset?: string, offset = 0) {
	const p = createProjectFromPreset("blank"),
		area = p.areas[0];
	area.width = 24;
	area.height = 14;
	area.objects = [];
	area.npcs = [];
	area.structures = [];
	area.eventBlocks = [];
	area.overlayTiles = [];
	area.terrainTiles = Array.from({ length: 336 }, (_, i) => ({
		x: i % 24,
		y: Math.floor(i / 24),
		tileId: "sand",
	}));
	p.player.canWalkOn = ["sand"];
	p.player.speed = 6;
	p.objects = [];
	if (asset) {
		p.objects.push({
			id: "prop",
			name: asset,
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			threeVisual: { mode: "asset", assetId: asset },
		});
		area.objects.push({
			id: "prop",
			objectDefinitionId: "prop",
			areaId: area.id,
			x: 7,
			y: 5,
			transform: {
				position: { x: 0, y: offset, z: 0 },
				rotation: { x: 0, y: 90, z: 0 },
				scale: { x: 1, y: 1, z: 1 },
			},
		});
	}
	const session = createRuntimeSession(p),
		a = session.project.areas[0];
	session.playerPosition = { x: 3, y: 5 };
	session.traversal = createRuntimeTraversal(
		createTraversalWorld(session.project, a),
		a,
		session.project,
		session.playerPosition,
	);
	return { session, area: a, authored: p, traversal: session.traversal };
}
function tick(
	session: ReturnType<typeof createRuntimeSession>,
	seconds: number,
	start = 1000,
) {
	let landed = false;
	for (let i = 1; i <= Math.round(seconds * 120); i++)
		landed =
			advancePlayerLocomotion(session, 1 / 120, start + (i * 1000) / 120) ||
			landed;
	return landed;
}

describe("player locomotion V2", () => {
	it("activates sprint only with held input and movement, uses 1.65x speed and releases cleanly", () => {
		const { session, traversal } = fixture();
		setPlayerSprint(session, true, false);
		expect(traversal.motion.sprinting).toBe(false);
		const walk = attemptPlayerMove(session, { x: 1, y: 0 }, 1000, 0.2);
		setPlayerSprint(session, true, true);
		expect(traversal.motion.sprinting).toBe(true);
		const run = attemptPlayerMove(session, { x: 1, y: 0 }, 2000, 0.2);
		if (walk.type !== "moved" || run.type !== "moved")
			throw Error("Expected movement");
		expect(walk.moveDurationMs / run.moveDurationMs).toBeCloseTo(
			SPRINT_MULTIPLIER,
		);
		setPlayerSprint(session, false, true);
		expect(traversal.motion.sprinting).toBe(false);
		const released = attemptPlayerMove(session, { x: 1, y: 0 }, 3000, 0.2);
		expect(released.type === "moved" && released.moveDurationMs).toBeCloseTo(
			walk.moveDurationMs,
		);
	});
	it("starts immediately, integrates gravity, reaches a modest apex, falls and lands at rest", () => {
		const { session, traversal } = fixture(),
			base = traversal.position.height;
		expect(tryPlayerJump(session, 1000)).toBe(true);
		expect(isPlayerAirborne(session)).toBe(true);
		expect(tryPlayerJump(session, 1001)).toBe(false);
		advancePlayerLocomotion(session, 0.1, 1100);
		expect(traversal.motion.height - base).toBeCloseTo(
			JUMP_SPEED * 0.1 - (JUMP_GRAVITY * 0.01) / 2,
		);
		expect(traversal.motion.verticalVelocity).toBeCloseTo(
			JUMP_SPEED - JUMP_GRAVITY * 0.1,
		);
		let apex = 0;
		const phases = new Set<string>();
		for (let i = 1; i < 140; i++) {
			advancePlayerLocomotion(session, 1 / 120, 1100 + (i * 1000) / 120);
			apex = Math.max(apex, traversal.motion.height - base);
			phases.add(traversal.motion.phase);
		}
		expect(apex).toBeCloseTo(JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY), 2);
		expect(phases).toEqual(new Set(["jump", "fall", "land", "grounded"]));
		expect(traversal.motion.height).toBeCloseTo(base);
		expect(traversal.motion.verticalVelocity).toBe(0);
	});
	it("retains moving Run through Jump/Fall/Land and permits modest air control", () => {
		const { session, traversal } = fixture();
		setPlayerSprint(session, true, true);
		const run = attemptPlayerMove(session, { x: 1, y: 0 }, 1000, 0.2);
		expect(tryPlayerJump(session, 1000)).toBe(true);
		tick(session, 0.15);
		const air = attemptPlayerMove(session, { x: 1, y: 0 }, 1200, 0.2);
		if (run.type !== "moved" || air.type !== "moved")
			throw Error("Expected air control");
		expect(air.moveDurationMs / run.moveDurationMs).toBeCloseTo(
			1 / AIR_CONTROL_MULTIPLIER,
		);
		tick(session, 1, 1200);
		expect(isPlayerAirborne(session)).toBe(false);
		expect(traversal.motion.sprinting).toBe(true);
		expect(traversal.position.x).toBeGreaterThan(3.3);
	});
	it.each([
		"water",
		"void",
	])("rejects a jump without support and never crosses unsupported %s", (kind) => {
		const { session, area, traversal } = fixture();
		area.terrainTiles =
			kind === "void"
				? area.terrainTiles.filter((t) => t.x !== 5)
				: area.terrainTiles.map((t) =>
						t.x === 5 ? { ...t, tileId: "water" } : t,
					); // actual void, rebuilt once as authored area initialization
		traversal.world = createTraversalWorld(session.project, area);
		expect(tryPlayerJump(session, 1000)).toBe(true);
		tick(session, 0.2);
		attemptPlayerMove(session, { x: 1, y: 0 }, 1300, 8);
		expect(traversal.position.x).toBeLessThan(4.5);
		expect(traversal.lastReason).toContain("floor");
		tick(session, 1, 1400);
		expect(isPlayerAirborne(session)).toBe(false);
		session.playerPosition = { x: 5, y: 5 };
		session.traversal = createRuntimeTraversal(
			traversal.world,
			area,
			session.project,
			session.playerPosition,
		);
		expect(tryPlayerJump(session, 3000)).toBe(false);
	});
	it.each([
		"world-wall",
		"world-crate",
		"world-rock-small",
	])("retains conservative %s blockers while airborne", (asset) => {
		const { session, traversal } = fixture(asset);
		tryPlayerJump(session, 1000);
		tick(session, 0.3);
		attemptPlayerMove(session, { x: 1, y: 0 }, 1400, 10);
		expect(traversal.position.x).toBeLessThan(7);
		expect(traversal.lastReason).toContain("Blocked");
	});
	it("permits an explicit low raised floor only after feet clear it and lands on that support", () => {
		const { session, traversal } = fixture("world-floor", 0.492105),
			base = traversal.position.height;
		attemptPlayerMove(session, { x: 1, y: 0 }, 1000, 3.8);
		expect(traversal.position.x).toBeLessThan(6.1);
		expect(tryPlayerJump(session, 2000)).toBe(true);
		tick(session, 0.3, 2000);
		const move = attemptPlayerMove(session, { x: 1, y: 0 }, 2350, 0.8);
		expect(move.type).toBe("moved");
		expect(traversal.position.height - base).toBeCloseTo(0.65, 3);
		tick(session, 0.8, 2350);
		expect(traversal.motion.height - base).toBeCloseTo(0.65, 3);
	});
	it("stops upward travel at the existing body/ceiling geometry", () => {
		const { session, area, traversal } = fixture("world-wall");
		// Same authored wall scaled to a thin lintel above this actor, then compiled normally.
		area.objects[0].x = 3;
		area.objects[0].transform!.position.y = 2.1;
		area.objects[0].transform!.scale.y = 0.1;
		traversal.world = createTraversalWorld(session.project, area);
		expect(tryPlayerJump(session, 1000)).toBe(true);
		tick(session, 0.12);
		expect(traversal.motion.height - traversal.position.height).toBeLessThan(
			0.4,
		);
		expect(traversal.motion.phase).toBe("fall");
		tick(session, 0.6, 1500);
		expect(isPlayerAirborne(session)).toBe(false);
	});
	it("blocks modal/defeated/vehicle jumping and sprinting without changing authored data", () => {
		const { session, authored, traversal } = fixture();
		const before = JSON.stringify(authored);
		session.startupPending = true;
		expect(tryPlayerJump(session, 1000)).toBe(false);
		setPlayerSprint(session, true, true);
		expect(traversal.motion.sprinting).toBe(false);
		session.startupPending = false;
		expect(tryPlayerJump(session, 1000, true)).toBe(false);
		session.playerVehicleState.active = true;
		expect(tryPlayerJump(session, 1000)).toBe(false);
		session.playerVehicleState.active = false;
		session.runtimePlayerHealth = 0;
		expect(tryPlayerJump(session, 1000)).toBe(false);
		expect(JSON.stringify(authored)).toBe(before);
	});
	it("blocks airborne combat and saves, then saves/continues a grounded position with transient motion reset", () => {
		const { session, authored, traversal, area } = fixture();
		const emit = vi.fn();
		setPlayerSprint(session, true, true);
		tryPlayerJump(session, 1000);
		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(false);
		expect(emit).not.toHaveBeenCalled();
		expect(session.nextAttackAt).toBe(0);
		expect(() => createGameSave(authored, session)).toThrow(
			"Land before saving",
		);
		tick(session, 1);
		const save = createGameSave(authored, session);
		expect(JSON.stringify(save)).not.toContain("verticalVelocity");
		expect(JSON.stringify(save)).not.toContain("sprinting");
		const restored = restoreGameSave(authored, save);
		expect(restored.traversal!.position).toEqual(traversal.position);
		expect(restored.traversal!.motion).toMatchObject({
			phase: "grounded",
			verticalVelocity: 0,
			sprinting: false,
			elapsed: 0,
		});
		attemptRuntimeCombatAttack(session, area, 2500, emit);
		expect(emit).toHaveBeenCalledWith(
			expect.objectContaining({ type: "attackStarted" }),
		);
	});
	it("does not emit ordinary touch/trigger interactions from an airborne cell entry", () => {
		const { session, area } = fixture();
		area.eventBlocks = [
			{
				id: "trigger",
				name: "Trigger",
				x: 4,
				y: 5,
				tag: "landing",
				kind: "trigger",
				interaction: {
					activationMode: "on_touch",
					type: "show_message",
					lines: ["Touched"],
				},
			},
		];
		session.waitingForTrigger = { eventBlockId: "trigger" };
		tryPlayerJump(session, 1000);
		tick(session, 0.15);
		const move = attemptPlayerMove(session, { x: 1, y: 0 }, 1200, 1);
		expect(move).toMatchObject({
			type: "moved",
			touchTargets: [],
			triggerTargets: [],
		});
	});
});
