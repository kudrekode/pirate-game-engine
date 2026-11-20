import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerCharacterAsset } from "../data/characterAssets";
import { createProjectFromPreset } from "../data/projectPresets";
import { AssetCreatorLauncher } from "../editor/AssetCreatorLauncher";
import { CharacterEditor } from "../editor/sections/CharacterEditor";
import { MapEditor } from "../editor/sections/MapEditor";
import { useProjectStore } from "../store/useProjectStore";
import type { CharacterGameAsset } from "../types/game";

const id = `character-${"a".repeat(64)}`;
const root = `/assets/project-characters/${id}`;
const asset: CharacterGameAsset = {
	id,
	name: "Navy adventurer",
	kind: "character",
	state: "finalised",
	geometryFamily: "authored-human",
	glbUrl: `${root}/character.glb`,
	artifactHash: "a".repeat(64),
	recipeHash: "b".repeat(64),
	manifestUrl: `${root}/manifest.json`,
	recipeUrl: `${root}/character.recipe.json`,
	rigProfile: "golden-humanoid-v0",
	animationSet: "golden-idle-walk-v1",
};
let previous = useProjectStore.getState().project;
beforeEach(() => {
	previous = useProjectStore.getState().project;
	const project = createProjectFromPreset("blank");
	registerCharacterAsset(project, asset);
	useProjectStore.getState().setProject(project);
	useProjectStore.getState().setMapPaletteSelection({ type: "none" });
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url, options) =>
			options?.method === "HEAD"
				? new Response("", { headers: { "content-type": "model/gltf-binary" } })
				: new Response(
						JSON.stringify({
							outputHash: asset.artifactHash,
							recipeHash: asset.recipeHash,
							validationLevel: "full",
						}),
					),
		),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	useProjectStore.getState().setProject(previous);
	useProjectStore.getState().setMapPaletteSelection({ type: "none" });
});

it("assigns player, places and duplicates NPCs, edits transforms, deletes and saves/reloads", async () => {
	const character = render(<CharacterEditor />);
	fireEvent.click(
		screen.getByRole("button", { name: "Set as Player Character" }),
	);
	expect(useProjectStore.getState().project.player.threeVisual?.assetId).toBe(
		id,
	);
	fireEvent.click(screen.getByRole("button", { name: "Add to NPC palette" }));
	await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	character.unmount();
	const map = render(<MapEditor />);
	fireEvent.pointerDown(screen.getByLabelText("Tile 5, 5"), { button: 0 });
	fireEvent.pointerUp(window);
	fireEvent.keyDown(window, { key: "1" });
	fireEvent.pointerDown(screen.getByLabelText("Tile 5, 5"), { button: 0 });
	fireEvent.pointerUp(window);
	expect(useProjectStore.getState().project.areas[0].npcs).toHaveLength(1);
	fireEvent.change(screen.getByLabelText("Scale", { exact: true }), {
		target: { value: "1.2" },
	});
	fireEvent.change(screen.getByLabelText("Rotation offset"), {
		target: { value: "30" },
	});
	fireEvent.click(screen.getByText("Duplicate NPC instance"));
	fireEvent.change(screen.getByLabelText("Position X"), {
		target: { value: "6" },
	});
	fireEvent.click(screen.getByText("Duplicate NPC instance"));
	fireEvent.click(screen.getByText("Delete NPC instance"));
	const saved = useProjectStore.getState().project;
	expect(saved.areas[0].npcs).toHaveLength(2);
	expect(saved.areas[0].npcs[0].threeVisual).toEqual(
		saved.areas[0].npcs[1].threeVisual,
	);
	expect(saved.areas[0].npcs[0].x).toBe(5);
	expect(saved.areas[0].npcs[1].x).toBe(6);
	useProjectStore.getState().saveToLocalStorage();
	map.unmount();
	act(() => {
		useProjectStore.getState().resetProject();
		useProjectStore.getState().loadFromLocalStorage();
	});
	expect(useProjectStore.getState().project).toEqual(saved);
});

it("shows a missing manifest message without discarding project references", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("not found", { status: 404 })),
	);
	render(<CharacterEditor />);
	await screen.findByRole("alert");
	expect(screen.getByRole("alert")).toHaveTextContent(
		"Restore the project asset folder",
	);
	expect(useProjectStore.getState().project.characterAssets).toEqual([asset]);
});

it("accepts imports only from the launched creator and refuses a changed project context", async () => {
	const child = { postMessage: vi.fn() };
	const open = vi
		.spyOn(window, "open")
		.mockReturnValue(child as unknown as Window);
	const originalFetch = vi.mocked(fetch);
	const view = render(<AssetCreatorLauncher />);
	try {
		fireEvent.click(screen.getByText("Open Asset Creator"));
		const target = new URL(String(open.mock.calls[0][0]));
		const data = {
			type: "game-character-import",
			token: target.searchParams.get("gameContext"),
			character: { requestId: "finalised" },
		};
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: child as unknown as Window,
					origin: "https://example.com",
					data,
				}),
			);
		});
		expect(originalFetch).not.toHaveBeenCalled();
		act(() =>
			useProjectStore.getState().setProject(createProjectFromPreset("blank")),
		);
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: child as unknown as Window,
					origin: target.origin,
					data,
				}),
			);
		});
		await waitFor(() => expect(child.postMessage).toHaveBeenCalled());
		expect(child.postMessage.mock.calls[0][0].error).toMatch(/project changed/);
		expect(originalFetch).not.toHaveBeenCalled();
		expect(useProjectStore.getState().project.characterAssets).toBeUndefined();
	} finally {
		view.unmount();
		open.mockRestore();
	}
});
