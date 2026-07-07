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
import { NpcsEditor } from "./NpcsEditor";
import { ObjectsEditor } from "./ObjectsEditor";

const demoBoxAsset: ThreeVisualAssetDefinition = {
	category: "object",
	id: "demo-box",
	kind: "glb",
	name: "Demo Box",
	url: "/assets/demo/Box.glb",
};

let restoreRegistry: (() => void) | undefined;

beforeEach(() => {
	restoreRegistry = setThreeVisualAssetRegistryForTests([demoBoxAsset]);
	useProjectStore.getState().setProject(cloneProject(defaultProject));
});

afterEach(() => {
	restoreRegistry?.();
	restoreRegistry = undefined;
});

describe("Three visual editor integration", () => {
	it("updates authored NPC visual assets without mutating gameplay fields or runtime snapshots", () => {
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
		expect(screen.getByLabelText("Asset")).toHaveValue("demo-box");
		expect(screen.getByRole("option", { name: "Demo Box" })).toHaveValue(
			"demo-box",
		);
	});
});
