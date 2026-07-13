import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import { createRuntimeSession } from "../../runtime/runtimeSession";
import {
	setThreeVisualAssetRegistryForTests,
	type ThreeVisualAssetDefinition,
} from "../../runtime/three/threeVisualAssetRegistry";
import { useProjectStore } from "../../store/useProjectStore";
import { CharacterEditor } from "./CharacterEditor";
import { NpcsEditor } from "./NpcsEditor";
import { ObjectsEditor } from "./ObjectsEditor";

const demoBoxAsset: ThreeVisualAssetDefinition = {
	category: "object",
	id: "demo-box",
	kind: "glb",
	name: "Demo Box",
	url: "/assets/demo/Box.glb",
};

const pirateChestAsset: ThreeVisualAssetDefinition = {
	category: "object",
	id: "pirate-chest",
	kind: "glb",
	name: "Pirate Chest",
	url: "/assets/pirate-demo/chest.glb",
};

const demoCharacterAsset: ThreeVisualAssetDefinition = {
	category: "character",
	id: "demo-character",
	kind: "glb",
	name: "Demo Character",
	url: "/assets/demo-character.glb",
};

let restoreRegistry: (() => void) | undefined;

beforeEach(() => {
	restoreRegistry = setThreeVisualAssetRegistryForTests([
		demoBoxAsset,
		pirateChestAsset,
		demoCharacterAsset,
	]);
	useProjectStore.getState().setProject(cloneProject(defaultProject));
});

afterEach(() => {
	restoreRegistry?.();
	restoreRegistry = undefined;
});

describe("Three visual editor integration", () => {
	it("authors player Three visuals separately from Phaser settings and runtime snapshots", () => {
		useProjectStore.getState().updatePlayer({ threeVisual: undefined });
		const runtimeSession = createRuntimeSession(
			useProjectStore.getState().project,
		);
		const originalPlayer = cloneProject(
			useProjectStore.getState().project,
		).player;

		render(<CharacterEditor />);
		expect(screen.getByText("2D / Phaser Visual")).toBeInTheDocument();
		expect(screen.getByText("3D Character Visual")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "asset" },
		});
		fireEvent.change(screen.getByLabelText("Scale"), {
			target: { value: "1.4" },
		});

		const updatedPlayer = useProjectStore.getState().project.player;
		expect(updatedPlayer.threeVisual).toMatchObject({
			assetId: "demo-character",
			mode: "asset",
			scale: 1.4,
		});
		expect(updatedPlayer.mapAvatarId).toBe(originalPlayer.mapAvatarId);
		expect(updatedPlayer.cutscenePortraitId).toBe(
			originalPlayer.cutscenePortraitId,
		);
		expect(runtimeSession.project.player.threeVisual).toBeUndefined();
		expect(screen.getByRole("option", { name: "Demo Character" })).toHaveValue(
			"demo-character",
		);
		expect(screen.queryByRole("option", { name: "Demo Box" })).toBeNull();
	});

	it("preserves and warns about an unknown player asset id", () => {
		useProjectStore.getState().updatePlayer({
			threeVisual: { assetId: "removed-player-pack", mode: "asset" },
		});

		render(<CharacterEditor />);

		expect(screen.getByLabelText("Asset")).toHaveValue("removed-player-pack");
		expect(
			screen.getByText(/Asset "removed-player-pack" is not registered/),
		).toBeInTheDocument();
	});

	it("updates authored NPC visual assets without mutating gameplay fields or runtime snapshots", () => {
		useProjectStore.getState().updateProject((draft) => {
			draft.npcs[0] = { ...draft.npcs[0], threeVisual: undefined };
		});
		const runtimeSession = createRuntimeSession(
			useProjectStore.getState().project,
		);
		const originalNpc = cloneProject(useProjectStore.getState().project)
			.npcs[0];

		render(<NpcsEditor />);
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "asset" },
		});

		const updatedNpc = useProjectStore.getState().project.npcs[0];
		expect(updatedNpc.threeVisual).toMatchObject({
			assetId: "demo-box",
			mode: "asset",
		});
		expect(updatedNpc.mapAvatarId).toBe(originalNpc.mapAvatarId);
		expect(updatedNpc.defaultAttributes).toEqual(originalNpc.defaultAttributes);
		expect(updatedNpc.defaultMovement).toEqual(originalNpc.defaultMovement);
		expect(runtimeSession.project.npcs[0].threeVisual).toBeUndefined();
	});

	it("allows NPC definitions to select character-category assets without changing gameplay", () => {
		const originalNpc = cloneProject(useProjectStore.getState().project)
			.npcs[0];

		render(<NpcsEditor />);
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "asset" },
		});
		fireEvent.change(screen.getByLabelText("Asset"), {
			target: { value: "demo-character" },
		});

		const updatedNpc = useProjectStore.getState().project.npcs[0];
		expect(updatedNpc.threeVisual).toMatchObject({
			assetId: "demo-character",
			mode: "asset",
		});
		expect(updatedNpc.defaultAttributes).toEqual(originalNpc.defaultAttributes);
		expect(updatedNpc.defaultEnemyBehaviour).toEqual(
			originalNpc.defaultEnemyBehaviour,
		);
		expect(updatedNpc.defaultMovement).toEqual(originalNpc.defaultMovement);
	});

	it("updates authored object visual assets without mutating gameplay fields or runtime snapshots", () => {
		const runtimeSession = createRuntimeSession(
			useProjectStore.getState().project,
		);
		const originalObject = cloneProject(useProjectStore.getState().project)
			.objects[0];

		render(<ObjectsEditor />);
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "asset" },
		});

		const updatedObject = useProjectStore.getState().project.objects[0];
		expect(updatedObject.threeVisual).toMatchObject({
			assetId: "demo-box",
			mode: "asset",
		});
		expect(updatedObject.category).toBe(originalObject.category);
		expect(updatedObject.defaultBehaviour).toEqual(
			originalObject.defaultBehaviour,
		);
		expect(updatedObject.blocksMovement).toBe(originalObject.blocksMovement);
		expect(runtimeSession.project.objects[0].threeVisual).toBeUndefined();
	});

	it("shows the demo object assignment through the Object editor UI", () => {
		render(<ObjectsEditor />);

		const chestButton = screen
			.getAllByText("Chest")
			.map((element) => element.closest("button"))
			.find((button): button is HTMLButtonElement => Boolean(button));
		if (!chestButton) {
			throw new Error("Expected the Chest object list row to be rendered.");
		}
		fireEvent.click(chestButton);

		expect(screen.getByLabelText("Visual source")).toHaveValue("asset");
		expect(screen.getByLabelText("Asset")).toHaveValue("pirate-chest");
		expect(screen.getByRole("option", { name: "Pirate Chest" })).toHaveValue(
			"pirate-chest",
		);
	});
});
