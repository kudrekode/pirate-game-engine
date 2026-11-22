import { assert, describe, expect, it } from "vitest";
import merewatch from "../../../hollow-kingdom.project.json";
import { defaultProject } from "../../data/defaultProject";
import { migrateProject } from "../../data/migrateProject";
import { defaultNPCAttributes } from "../../runtime/npcResolver";
import { getCameraClearFraction } from "../../runtime/three/cameraObstruction";
import { createTraversalWorld } from "../../runtime/traversal";
import type { GameArea, GameProject } from "../../types/game";
import {
	CINEMATIC_PRESETS,
	createCinematicPresetShot,
	getCinematicPlayerStart,
	getCinematicSubjects,
} from "./cinematicFraming";

function makeStage() {
	const area: GameArea = {
		id: "stage",
		name: "Stage",
		kind: "outdoor",
		width: 16,
		height: 16,
		tileSize: 32,
		terrainTiles: Array.from({ length: 16 * 16 }, (_, index) => ({
			x: index % 16,
			y: Math.floor(index / 16),
			tileId: "grass",
		})),
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		eventBlocks: [
			{ id: "spawn", name: "Start", x: 8, y: 10, kind: "spawn", tag: "" },
		],
		npcs: [
			{
				id: "npc-placement",
				nameOverride: "Named NPC",
				npcDefinitionId: "npc-definition",
				areaId: "stage",
				x: 8,
				y: 8,
				facing: "down",
				blocksMovement: false,
				movementMode: "stationary",
				attributes: defaultNPCAttributes,
			},
		],
	};
	const project: GameProject = {
		...defaultProject,
		areas: [area],
		objects: [],
		activeAreaId: area.id,
	};
	return { area, project };
}

describe("cinematic storyboard framing", () => {
	it("uses authored Merewatch actors, Player mark, and a transformed tower landmark", () => {
		const project = migrateProject(merewatch);
		const area = project.areas.find(({ id }) => id === "merewatch");
		assert(area);
		const playerMark = { x: 22, y: 44 };
		expect(getCinematicPlayerStart(area)).toEqual({ x: 20, y: 56 });
		const { actors, landmarks } = getCinematicSubjects(
			project,
			area,
			playerMark,
		);
		expect(actors[0]).toMatchObject({
			id: "runtime_player",
			position: { x: 22, z: 44 },
		});
		expect(actors).toContainEqual(
			expect.objectContaining({
				id: "oswin-at-the-well",
				name: "Oswin the Ferryman",
				position: expect.objectContaining({ x: 23, z: 42 }),
			}),
		);
		expect(landmarks).toContainEqual(
			expect.objectContaining({
				id: "watchtower-15",
				height: 7.04,
				position: expect.objectContaining({ x: 26, z: 4 }),
			}),
		);
		const shots = [
			{ preset: "establishing", targetId: "oswin-at-the-well" },
			{ preset: "close-up", targetId: "oswin-at-the-well" },
			{
				preset: "over-shoulder",
				targetId: "oswin-at-the-well",
				secondaryTargetId: "runtime_player",
			},
			{ preset: "reveal", targetId: "watchtower-15" },
		] as const;
		for (const setup of shots) {
			const result = createCinematicPresetShot(project, area, {
				...setup,
				playerMark,
			});
			expect(result.diagnostics).toEqual([]);
			expect(result.shot).toMatchObject({ ...setup, durationMode: "auto" });
		}
	});

	it("generates six distinct presets with usable camera poses and a moving reveal", () => {
		const { area, project } = makeStage();
		const result = CINEMATIC_PRESETS.map(({ id: preset, durationMs }) => {
			const result = createCinematicPresetShot(project, area, { preset });
			expect(result.diagnostics).toEqual([]);
			assert(result.shot);
			expect(result.shot).toMatchObject({ preset, durationMs });
			return result.shot;
		});
		expect(new Set(result.map(({ from }) => JSON.stringify(from))).size).toBe(
			6,
		);
		const overShoulder = result.find(
			({ preset }) => preset === "over-shoulder",
		);
		assert(overShoulder);
		expect(overShoulder.from.position.z).toBeGreaterThan(10);
		expect(overShoulder.from.lookAt.z).toBe(8);
		const twoShot = result.find(({ preset }) => preset === "two-shot");
		assert(twoShot);
		expect(twoShot.from.lookAt).toMatchObject({ x: 8, z: 9 });
		const reveal = result.find(({ preset }) => preset === "reveal");
		assert(reveal);
		expect(reveal.to?.position).not.toEqual(reveal.from.position);
	});

	it("uses a measured head socket when the preview has one", () => {
		const { area, project } = makeStage();
		const head = { x: 8.1, y: 2.75, z: 8.05 };
		const { shot } = createCinematicPresetShot(project, area, {
			preset: "close-up",
			targetId: "npc-placement",
			getSubjectGeometry: (id) =>
				id === "npc-placement" ? { head, height: 1.82 } : undefined,
		});
		expect(shot?.from.lookAt).toEqual(head);
		expect(shot?.from.position.y).toBeGreaterThan(head.y);
	});

	it("reframes around transformed world obstacles using the runtime's clearance checks", () => {
		const { area, project } = makeStage();
		const clean = createCinematicPresetShot(project, area, {
			preset: "close-up",
		}).shot;
		assert(clean);
		project.objects.push({
			id: "wall-definition",
			name: "Wall",
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			threeVisual: { mode: "asset", assetId: "world-wall" },
		});
		area.objects.push({
			id: "wall",
			objectDefinitionId: "wall-definition",
			areaId: area.id,
			x: 8,
			y: 9,
		});
		const world = createTraversalWorld(project, area);
		expect(
			getCameraClearFraction(world, clean.from.lookAt, clean.from.position),
		).toBeLessThan(1);
		const { shot, diagnostics } = createCinematicPresetShot(project, area, {
			preset: "close-up",
		});
		expect(diagnostics).toEqual([]);
		assert(shot);
		expect(shot.from.position).not.toEqual(clean.from.position);
		expect(
			getCameraClearFraction(world, shot.from.lookAt, shot.from.position),
		).toBe(1);
	});

	it("reports missing references and falls back to a named visible placeholder for unavailable assets", () => {
		const { area, project } = makeStage();
		area.npcs[0].threeVisual = { mode: "asset", assetId: "missing-glb" };
		expect(
			createCinematicPresetShot(project, area, {
				preset: "close-up",
				targetId: "removed",
			}),
		).toEqual({
			diagnostics: ["Missing camera target (removed)."],
		});
		expect(
			createCinematicPresetShot(project, area, {
				preset: "two-shot",
				secondaryTargetId: "removed",
			}),
		).toEqual({
			diagnostics: ["Missing secondary actor (removed)."],
		});
		const fallback = createCinematicPresetShot(project, area, {
			preset: "close-up",
		});
		expect(fallback.shot?.targetId).toBe("npc-placement");
		expect(fallback.diagnostics[0]).toContain(
			"Named NPC: Asset missing-glb is unavailable",
		);
		area.npcs = [];
		expect(
			createCinematicPresetShot(project, area, { preset: "two-shot" }),
		).toEqual({
			diagnostics: ["Choose two different actors for this shot."],
		});
	});
});
