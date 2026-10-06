import { describe, expect, it } from "vitest";
import { areaEntitiesToMarkers } from "../editor/sections/entityMarkers";
import { resolveMovementAt } from "../runtime/movement";
import { resolveNPCInstance } from "../runtime/npcResolver";
import { createRuntimeSession } from "../runtime/runtimeSession";
import { resolveThreeCharacterVisual } from "../runtime/three/threeVisuals";
import { useProjectStore } from "../store/useProjectStore";
import type { CharacterGameAsset } from "../types/game";
import {
	addCharacterNpcDefinition,
	characterAssetProblem,
	registerCharacterAsset,
} from "./characterAssets";
import { migrateProject } from "./migrateProject";
import { createProjectFromPreset } from "./projectPresets";

function characterAssetFixture(digit = "a"): CharacterGameAsset {
	const id = `character-${digit.repeat(64)}`;
	const root = `/assets/project-characters/${id}`;
	return {
		id,
		name: "Dressed adventurer",
		kind: "character",
		state: "finalised",
		geometryFamily: "authored-human",
		glbUrl: `${root}/character.glb`,
		artifactHash: digit.repeat(64),
		recipeHash: "b".repeat(64),
		manifestUrl: `${root}/manifest.json`,
		recipeUrl: `${root}/character.recipe.json`,
		rigProfile: "golden-humanoid-v0",
		animationSet: "golden-idle-walk-v1",
	};
}

describe("project character assets", () => {
	it("retains player, two NPCs, transforms and stable asset identities after serialization", () => {
		const previous = useProjectStore.getState().project;
		try {
			const project = createProjectFromPreset("blank");
			const asset = characterAssetFixture();
			registerCharacterAsset(project, asset);
			registerCharacterAsset(project, asset);
			project.player.threeVisual = { mode: "asset", assetId: asset.id };
			const npcId = addCharacterNpcDefinition(project, asset);
			useProjectStore.getState().setProject(project);
			const one = useProjectStore.getState().addNpc(3, 4, npcId);
			useProjectStore.getState().addNpc(6, 4, npcId);
			useProjectStore.getState().updateNpc(one, {
				threeVisual: {
					mode: "asset",
					assetId: asset.id,
					scale: 1.2,
					rotationOffset: 35,
					heightOffset: 0.1,
				},
				facing: "left",
			});
			const saved = useProjectStore.getState().project;
			const restored = migrateProject(JSON.parse(JSON.stringify(saved)));
			expect(restored).toEqual(saved);
			expect(restored.characterAssets).toHaveLength(1);
			const player = resolveThreeCharacterVisual(
				{ kind: "player", threeVisual: restored.player.threeVisual },
				restored.characterAssets,
			);
			expect(player.mode).toBe("asset");
			expect(player.asset?.animations?.walk?.clipName).toBe(
				"GoldenReference_Walk_InPlace",
			);
			const markers = areaEntitiesToMarkers(
				restored.areas[0],
				restored.objects,
				restored.npcs,
				false,
				"blocky",
				restored.characterAssets,
			).filter((marker) => marker.kind === "npc");
			expect(markers.map((marker) => marker.visual?.assetId)).toEqual([
				asset.id,
				asset.id,
			]);
			expect(markers[0].visual?.scale).toBe(1.2);
			expect(markers[1].visual?.scale).toBe(1);
			expect(
				resolveMovementAt(restored.areas[0], 3, 4, restored.player),
			).toMatchObject({ canMove: false, reason: "Blocked by NPC." });
			expect(
				resolveMovementAt(restored.areas[0], 4, 4, restored.player),
			).toEqual(
				resolveMovementAt(restored.areas[0], 4, 4, {
					...restored.player,
					threeVisual: undefined,
				}),
			);
			const session = createRuntimeSession(restored);
			if (!session.project.player.threeVisual)
				throw new Error("Expected the runtime player visual.");
			session.project.player.threeVisual.scale = 2;
			expect(restored.player.threeVisual?.scale).toBeUndefined();
			registerCharacterAsset(restored, characterAssetFixture("c"));
			expect(restored.player.threeVisual?.assetId).toBe(asset.id);
			expect(
				resolveThreeCharacterVisual({
					kind: "player",
					threeVisual: restored.player.threeVisual,
				}).mode,
			).toBe("placeholder");
			const npc = restored.areas[0].npcs[0];
			expect(
				resolveNPCInstance(restored.npcs[0], {
					...npc,
					threeVisual: { scale: 1.4 },
				}).threeVisual,
			).toMatchObject({ mode: "asset", assetId: asset.id, scale: 1.4 });
			expect(
				resolveNPCInstance(restored.npcs[0], { ...npc, threeVisual: undefined })
					.threeVisual,
			).toEqual(restored.npcs[0].threeVisual);
		} finally {
			useProjectStore.getState().setProject(previous);
		}
	});
	it("keeps invalid and deleted references without silently choosing another character", () => {
		const project = createProjectFromPreset("blank");
		const asset = {
			...characterAssetFixture(),
			rigProfile: "unsupported",
			glbUrl: "blob:temporary",
		};
		project.characterAssets = [asset];
		project.player.threeVisual = { mode: "asset", assetId: asset.id };
		const restored = migrateProject(project);
		expect(restored.characterAssets?.[0]).toEqual(asset);
		expect(characterAssetProblem(asset)).toMatch(/Unsupported/);
		const visual = resolveThreeCharacterVisual(
			{ kind: "player", threeVisual: restored.player.threeVisual },
			restored.characterAssets,
		);
		expect(visual).toMatchObject({
			mode: "placeholder",
			requestedMode: "asset",
			assetId: asset.id,
		});
		project.characterAssets = [];
		expect(migrateProject(project).characterAssets).toEqual([]);
		delete project.characterAssets;
		expect(migrateProject(project).characterAssets).toBeUndefined();
	});
});
