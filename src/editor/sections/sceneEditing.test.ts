import { beforeEach, describe, expect, it } from "vitest";
import { defaultMapEntityTransform } from "../../data/mapEntityTransform";
import { cloneProject, migrateProject } from "../../data/migrateProject";
import { createProjectFromPreset } from "../../data/projectPresets";
import { createRuntimeSession } from "../../runtime/runtimeSession";
import { useProjectStore } from "../../store/useProjectStore";
import type { CharacterGameAsset } from "../../types/game";
import { areaEntitiesToMarkers } from "./entityMarkers";
import {
	deleteSceneSelection,
	duplicateSceneSelection,
	getSceneEntity,
	placeSceneAsset,
	readSceneTransform,
	sceneAssets,
	writeSceneTransform,
} from "./sceneEditing";

beforeEach(() =>
	useProjectStore.getState().setProject(createProjectFromPreset("blank")),
);

describe("scene editing", () => {
	it("places a real registry prop in a blank project, selects it, preserves instance edits on duplication and deletes safely", () => {
		const store = useProjectStore.getState();
		const asset = sceneAssets(store.project).find(
			(entry) => entry.id === "world-crate",
		);
		expect(asset).toBeDefined();
		if (!asset) throw new Error("Expected Supply Crate asset.");
		const selection = placeSceneAsset(asset, { x: 7, y: 4 });
		expect(useProjectStore.getState().editorSelection).toEqual(selection);
		const transform = defaultMapEntityTransform();
		transform.position = { x: 7.25, y: 2, z: 4.5 };
		transform.rotation = { x: 15, y: 45, z: 90 };
		transform.scale = { x: 2, y: 1.5, z: 0.75 };
		store.updateProject((project) =>
			writeSceneTransform(project, selection, transform),
		);
		const edited = cloneProject(useProjectStore.getState().project);
		const entity = getSceneEntity(edited, selection);
		expect(entity).toBeDefined();
		if (!entity) throw new Error("Expected placed entity.");
		expect(entity).toMatchObject({
			x: 7,
			y: 5,
			transform: { position: { x: 0.25, y: 2, z: -0.5 } },
		});
		expect(readSceneTransform(entity)).toEqual(transform);
		duplicateSceneSelection(selection);
		const copySelection = useProjectStore.getState().editorSelection;
		const copy = getSceneEntity(
			useProjectStore.getState().project,
			copySelection,
		);
		expect(copy).toBeDefined();
		if (!copy) throw new Error("Expected duplicated entity.");
		expect(copy.id).not.toBe(entity.id);
		expect(copy.transform).toEqual(entity.transform);
		expect(copy.transform).not.toBe(entity.transform);
		expect(copy).toMatchObject({ nameOverride: "Supply Crate copy" });
		deleteSceneSelection(copySelection);
		expect(useProjectStore.getState().project).toEqual(edited);
		expect(useProjectStore.getState().editorSelection?.type).toBe("area");
	});

	it("round trips transforms and visual overrides without adding transforms to legacy instances", () => {
		const project = createProjectFromPreset("demo");
		const sourceArea = project.areas.find((area) => area.objects.length);
		expect(sourceArea).toBeDefined();
		const original = sourceArea?.objects[0];
		expect(original).toBeDefined();
		if (!original) throw new Error("Expected legacy object.");
		expect(original.transform).toBeUndefined();
		original.threeVisual = { mode: "asset", assetId: "pirate-barrel" };
		original.transform = {
			position: { x: 0.25, y: 2, z: -0.25 },
			rotation: { x: 15, y: 30, z: 45 },
			scale: { x: 2, y: 1, z: 0.5 },
		};
		const saved = migrateProject(JSON.parse(JSON.stringify(project)));
		expect(saved.areas.find((area) => area.objects.length)?.objects[0]).toEqual(
			original,
		);
		const marker = areaEntitiesToMarkers(
			saved.areas.find((area) => area.objects.length),
			saved.objects,
			saved.npcs,
			true,
		).find((entry) => entry.id === original.id);
		expect(marker).toBeDefined();
		if (!marker) throw new Error("Expected visual marker.");
		expect(marker.visual?.assetId).toBe("pirate-barrel");
		expect(marker.transform).toEqual(original.transform);
		const legacy = migrateProject(createProjectFromPreset("demo"));
		expect(
			legacy.areas
				.flatMap((area) => area.objects)
				.every((entry) => !entry.transform),
		).toBe(true);
		expect(
			migrateProject({
				...saved,
				areas: saved.areas.map((area) => ({ ...area, objects: [] })),
			}).areas.every((area) => !area.objects.length),
		).toBe(true);
	});

	it("places finalised characters directly, preserves their identity and isolates runtime edits", () => {
		const id = `character-${"a".repeat(64)}`;
		const root = `/assets/project-characters/${id}/`;
		const asset: CharacterGameAsset = {
			id,
			name: "Harbour Guide",
			kind: "character",
			state: "finalised",
			geometryFamily: "authored-human",
			glbUrl: `${root}character.glb`,
			manifestUrl: `${root}manifest.json`,
			recipeUrl: `${root}character.recipe.json`,
			artifactHash: "b".repeat(64),
			recipeHash: "c".repeat(64),
			rigProfile: "golden-humanoid-v0",
			animationSet: "golden-idle-walk-v1",
		};
		useProjectStore.getState().updateProject((project) => {
			project.characterAssets = [asset];
		});
		const card = sceneAssets(useProjectStore.getState().project).find(
			(entry) => entry.id === id,
		);
		expect(card).toBeDefined();
		if (!card) throw new Error("Expected imported character asset.");
		expect(card.category).toBe("Characters");
		const selection = placeSceneAsset(card, { x: 12, y: 7 });
		const project = useProjectStore.getState().project;
		expect(selection?.type).toBe("npc");
		expect(project.npcs[0].threeVisual?.assetId).toBe(id);
		expect(project.areas[0].npcs[0]).toMatchObject({ x: 12, y: 7 });
		const snapshot = JSON.stringify(project);
		const session = createRuntimeSession(project);
		session.project.areas[0].npcs[0].x = 2;
		expect(JSON.stringify(project)).toBe(snapshot);
	});
});
