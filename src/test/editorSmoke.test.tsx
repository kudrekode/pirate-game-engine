import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { GameStateEditor } from "../editor/sections/GameStateEditor";
import { ItemsEditor } from "../editor/sections/ItemsEditor";
import { MapEditor } from "../editor/sections/MapEditor";
import { NpcsEditor } from "../editor/sections/NpcsEditor";
import { ObjectsEditor } from "../editor/sections/ObjectsEditor";
import { ProgressionEditor } from "../editor/sections/ProgressionEditor";
import { QuestsEditor } from "../editor/sections/QuestsEditor";
import { ShopsEditor } from "../editor/sections/ShopsEditor";
import {
	AUTOSAVE_DRAFT_STORAGE_KEY,
	STORAGE_KEY,
	useProjectStore,
} from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({
	RuntimePanel: () => <div>Runtime mock</div>,
}));

beforeEach(() => {
	localStorage.clear();
	useProjectStore.getState().setProject(cloneProject(defaultProject));
	localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProject));
});

function getMapTile(name: string) {
	const button = document.querySelector<HTMLButtonElement>(
		`button[aria-label="${name}"]`,
	);
	expect(button).not.toBeNull();
	if (!button) {
		throw new Error(`Map tile not found: ${name}`);
	}
	return button;
}

function getButtonByText(text: string) {
	const button = Array.from(
		document.querySelectorAll<HTMLButtonElement>("button"),
	).find((candidate) => candidate.textContent?.trim() === text);
	expect(button).not.toBeNull();
	if (!button) {
		throw new Error(`Button not found: ${text}`);
	}
	return button;
}

function getPresetButton(name: string) {
	return screen.getByRole("button", { name: new RegExp(name) });
}

describe("editor smoke tests", () => {
	it("renders App and switches to the Logic tab", async () => {
		render(<App />);

		expect(
			await screen.findByDisplayValue("Demo Adventure"),
		).toBeInTheDocument();
		expect(screen.getByText("Saved")).toBeInTheDocument();
		const logicTab = getButtonByText("Logic");
		expect(logicTab).toHaveAttribute(
			"title",
			"Build plain-English rules using triggers, conditions, and actions.",
		);
		fireEvent.change(screen.getByDisplayValue("Demo Adventure"), {
			target: { value: "Edited Adventure" },
		});
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
		fireEvent.click(logicTab);
		expect(screen.getByText("Friendly Logic Builder")).toBeInTheDocument();
	}, 15000);

	it("shows project validation issues from the top bar", async () => {
		const project = cloneProject(defaultProject);
		project.rules[0].actions.push({
			type: "give_item",
			itemId: "missing_item",
			quantity: 1,
		});
		useProjectStore.getState().setProject(project);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(project));

		render(<App />);

		await screen.findByDisplayValue("Demo Adventure");
		fireEvent.click(getButtonByText("1 warning"));
		expect(
			screen.getByLabelText("Project validation issues"),
		).toHaveTextContent('missing item "missing_item"');
	}, 15000);

	it("saves with Ctrl+S", async () => {
		localStorage.removeItem(STORAGE_KEY);
		render(<App />);
		fireEvent.click(
			await screen.findByRole("button", { name: /Demo Project/ }),
		);

		fireEvent.change(screen.getByDisplayValue("Demo Adventure"), {
			target: { value: "Shortcut Save" },
		});
		fireEvent.keyDown(window, { ctrlKey: true, key: "s" });

		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject(
			{
				metadata: { name: "Shortcut Save" },
			},
		);
		expect(screen.getByText("Saved to localStorage.")).toBeInTheDocument();
	}, 15000);

	it("replaces the current project from a preset after confirming unsaved changes", async () => {
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<App />);

		await screen.findByDisplayValue("Demo Adventure");
		fireEvent.change(screen.getByDisplayValue("Demo Adventure"), {
			target: { value: "Unsaved Adventure" },
		});
		fireEvent.click(getButtonByText("New Project"));
		fireEvent.click(getPresetButton("Blank Project"));
		expect(useProjectStore.getState().project.metadata.name).toBe(
			"Unsaved Adventure",
		);

		confirm.mockReturnValue(true);
		fireEvent.click(getPresetButton("Blank Project"));

		const project = useProjectStore.getState().project;
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(project.metadata.name).toBe("Blank Project");
		expect(project.areas).toHaveLength(1);
		expect(project.items).toEqual([]);
		expect(project.npcs).toEqual([]);
		expect(screen.getByText("Created Blank Project.")).toBeInTheDocument();
	}, 15000);

	it("autosaves changes to a separate draft key", () => {
		vi.useFakeTimers();
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(AUTOSAVE_DRAFT_STORAGE_KEY);
		render(<App />);
		fireEvent.click(getPresetButton("Demo Project"));

		fireEvent.change(screen.getByDisplayValue("Demo Adventure"), {
			target: { value: "Autosaved Draft" },
		});
		act(() => vi.advanceTimersByTime(3000));

		expect(
			JSON.parse(localStorage.getItem(AUTOSAVE_DRAFT_STORAGE_KEY) ?? "{}"),
		).toMatchObject({ metadata: { name: "Autosaved Draft" } });
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(screen.getByText(/Draft autosaved/)).toBeInTheDocument();
		vi.useRealTimers();
	}, 15000);

	it("shows the preset chooser on first load and creates a blank project", () => {
		localStorage.clear();
		render(<App />);

		expect(
			screen.getByLabelText("Choose a starter project"),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Close preset chooser"),
		).not.toBeInTheDocument();
		fireEvent.click(getPresetButton("Blank Project"));

		const project = useProjectStore.getState().project;
		expect(project.metadata.name).toBe("Blank Project");
		expect(project.areas).toHaveLength(1);
		expect(project.areas[0].objects).toEqual([]);
		expect(project.areas[0].npcs).toEqual([]);
	}, 15000);

	it("selects the feature demo with a clean active area on first load", () => {
		localStorage.clear();
		render(<App />);

		fireEvent.click(getPresetButton("Demo Project"));

		const project = useProjectStore.getState().project;
		expect(project.metadata.name).toBe("Demo Adventure");
		expect(project.activeAreaId).toBe("area_demo_blank");
		expect(project.areas[0].name).toBe("Blank Demo Area");
		expect(project.items.length).toBeGreaterThan(0);
	}, 15000);

	it("loads an autosaved draft instead of showing the startup chooser", async () => {
		localStorage.clear();
		const draft = cloneProject(defaultProject);
		draft.metadata.name = "Recovered Draft";
		localStorage.setItem(AUTOSAVE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

		render(<App />);

		expect(
			await screen.findByDisplayValue("Recovered Draft"),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Choose a starter project"),
		).not.toBeInTheDocument();
		expect(screen.getByText("Loaded autosaved draft.")).toBeInTheDocument();
	});

	it("restores editor panel scroll position when switching tabs", () => {
		render(<App />);
		const mapToolPanel = document.querySelector<HTMLElement>(
			".map-tool-panel-content",
		);
		expect(mapToolPanel).not.toBeNull();
		if (!mapToolPanel) {
			throw new Error("Map tool panel not found.");
		}
		mapToolPanel.scrollTop = 180;

		fireEvent.click(getButtonByText("Logic"));
		fireEvent.click(getButtonByText("Map"));

		expect(
			document.querySelector<HTMLElement>(".map-tool-panel-content")?.scrollTop,
		).toBe(180);
	}, 15000);

	it("renders Map Editor", () => {
		render(<MapEditor />);

		expect(screen.getByText("Map size")).toBeInTheDocument();
		expect(getButtonByText("Reset Zoom")).toBeInTheDocument();
	}, 15000);

	it("edits selected NPC attributes in the Map inspector", () => {
		render(<MapEditor />);

		fireEvent.click(getButtonByText("Select"));
		fireEvent.pointerDown(getMapTile("Tile 3, 4"));
		fireEvent.change(screen.getByLabelText("Faction"), {
			target: { value: "sailors" },
		});
		fireEvent.change(screen.getByLabelText("Alignment"), {
			target: { value: "neutral" },
		});

		const captain = useProjectStore
			.getState()
			.project.areas[0].npcs.find(
				(npc) => npc.id === "npc_instance_captain_mira",
			);
		expect(captain?.attributes).toMatchObject({
			faction: "sailors",
			alignment: "neutral",
		});
	}, 15000);

	it("shows enemy behaviour controls for hostile NPCs", () => {
		render(<MapEditor />);

		fireEvent.click(getButtonByText("Select"));
		fireEvent.pointerDown(getMapTile("Tile 16, 8"));

		expect(screen.getByText("Enemy Behaviour")).toBeInTheDocument();
		expect(screen.getByLabelText("Detection radius")).toBeInTheDocument();
	}, 15000);

	it("selects explicit map tool modes", () => {
		render(<MapEditor />);

		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Tool: Select",
		);

		fireEvent.keyDown(window, { key: "2" });
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Tool: Paint",
		);

		fireEvent.keyDown(window, { key: "3" });
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Tool: Erase",
		);
	}, 15000);

	it("does not paint when clicking in select mode", () => {
		render(<MapEditor />);

		fireEvent.click(getButtonByText("Water"));
		fireEvent.click(getButtonByText("Select"));
		fireEvent.pointerDown(getMapTile("Tile 1, 1"));

		const tile = useProjectStore
			.getState()
			.project.areas[0].terrainTiles.find((candidate) => {
				return candidate.x === 1 && candidate.y === 1;
			});
		expect(tile?.tileId).toBe("grass");
	}, 15000);

	it("erases objects, NPCs, pickups, and event blocks", () => {
		render(<MapEditor />);

		fireEvent.click(getButtonByText("Erase"));
		for (const tileName of [
			"Tile 6, 4",
			"Tile 3, 4",
			"Tile 3, 2",
			"Tile 18, 10",
		]) {
			const tileButton = getMapTile(tileName);
			fireEvent.pointerDown(tileButton);
			fireEvent.pointerUp(tileButton);
		}

		const area = useProjectStore.getState().project.areas[0];
		expect(
			area.objects.some((object) => object.x === 6 && object.y === 4),
		).toBe(false);
		expect(area.npcs.some((npc) => npc.x === 3 && npc.y === 4)).toBe(false);
		expect(
			area.pickups.some((pickup) => pickup.x === 3 && pickup.y === 2),
		).toBe(false);
		expect(
			area.eventBlocks.some((eventBlock) => {
				return eventBlock.x === 18 && eventBlock.y === 10;
			}),
		).toBe(false);
	}, 15000);

	it("undoes and redoes deleted and painted map edits", () => {
		render(<MapEditor />);

		fireEvent.click(getButtonByText("Erase"));
		const objectTile = getMapTile("Tile 6, 4");
		fireEvent.pointerDown(objectTile);
		fireEvent.pointerUp(objectTile);
		expect(
			useProjectStore
				.getState()
				.project.areas[0].objects.some(
					(object) => object.x === 6 && object.y === 4,
				),
		).toBe(false);

		fireEvent.click(getButtonByText("Undo"));
		expect(
			useProjectStore
				.getState()
				.project.areas[0].objects.some(
					(object) => object.x === 6 && object.y === 4,
				),
		).toBe(true);

		fireEvent.click(getButtonByText("Redo"));
		expect(
			useProjectStore
				.getState()
				.project.areas[0].objects.some(
					(object) => object.x === 6 && object.y === 4,
				),
		).toBe(false);

		fireEvent.click(getButtonByText("Water"));
		const paintTile = getMapTile("Tile 1, 1");
		fireEvent.pointerDown(paintTile);
		fireEvent.pointerUp(paintTile);
		expect(
			useProjectStore
				.getState()
				.project.areas[0].terrainTiles.find(
					(tile) => tile.x === 1 && tile.y === 1,
				)?.tileId,
		).toBe("water");

		fireEvent.click(getButtonByText("Undo"));
		expect(
			useProjectStore
				.getState()
				.project.areas[0].terrainTiles.find(
					(tile) => tile.x === 1 && tile.y === 1,
				)?.tileId,
		).toBe("grass");

		fireEvent.click(getButtonByText("Redo"));
		expect(
			useProjectStore
				.getState()
				.project.areas[0].terrainTiles.find(
					(tile) => tile.x === 1 && tile.y === 1,
				)?.tileId,
		).toBe("water");
	}, 15000);

	it("renders map status for active tool and selection", () => {
		render(<MapEditor />);

		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Tool: Select",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Palette: Terrain",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Selected: Main Area",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Area: Main Area",
		);
	}, 15000);

	it("resizes and persists the Map sidebars", () => {
		render(<MapEditor />);
		const paletteHandle = document.querySelector<HTMLElement>(
			".palette-resize-handle",
		);
		const palette = paletteHandle?.parentElement;
		const inspectorHandle = document.querySelector<HTMLElement>(
			".inspector-resize-handle",
		);
		const inspector = inspectorHandle?.parentElement;
		const mapEditor = document.querySelector<HTMLElement>(".map-editor");
		expect(paletteHandle).not.toBeNull();
		expect(palette).not.toBeNull();
		expect(inspectorHandle).not.toBeNull();
		expect(inspector).not.toBeNull();
		expect(mapEditor).not.toBeNull();
		if (
			!paletteHandle ||
			!palette ||
			!inspectorHandle ||
			!inspector ||
			!mapEditor
		) {
			throw new Error("Map sidebar resize elements not found.");
		}
		paletteHandle.setPointerCapture = vi.fn();
		paletteHandle.hasPointerCapture = vi.fn(() => true);
		paletteHandle.releasePointerCapture = vi.fn();
		palette.getBoundingClientRect = vi.fn(() => ({ left: 100 }) as DOMRect);
		inspectorHandle.setPointerCapture = vi.fn();
		inspectorHandle.hasPointerCapture = vi.fn(() => true);
		inspectorHandle.releasePointerCapture = vi.fn();
		inspector.getBoundingClientRect = vi.fn(() => ({ right: 800 }) as DOMRect);

		fireEvent.pointerDown(paletteHandle, { pointerId: 1 });
		fireEvent.pointerMove(paletteHandle, { clientX: 400, pointerId: 1 });
		fireEvent.pointerUp(paletteHandle, { pointerId: 1 });
		fireEvent.pointerDown(inspectorHandle, { pointerId: 2 });
		fireEvent.pointerMove(inspectorHandle, { clientX: 500, pointerId: 2 });
		fireEvent.pointerUp(inspectorHandle, { pointerId: 2 });

		expect(mapEditor.style.getPropertyValue("--map-palette-width")).toBe(
			"300px",
		);
		expect(mapEditor.style.getPropertyValue("--map-inspector-width")).toBe(
			"300px",
		);
		expect(localStorage.getItem("map-editor-palette-width-v3")).toBe("300");
		expect(localStorage.getItem("map-editor-inspector-width-v1")).toBe("300");
	}, 15000);

	it("keeps the Map palette scrollbar separate from its resize handle", () => {
		render(<MapEditor />);

		const sidebar = document.querySelector<HTMLElement>(".map-tool-panel");
		const content = document.querySelector<HTMLElement>(
			".map-tool-panel-content",
		);
		const handle = document.querySelector<HTMLElement>(
			".palette-resize-handle",
		);
		if (!sidebar || !content || !handle) {
			throw new Error("Map palette layout elements not found.");
		}

		expect(sidebar.children).toHaveLength(2);
		expect(sidebar.children[0]).toBe(content);
		expect(sidebar.children[1]).toBe(handle);
	}, 15000);

	it("warns when a selected map target has direct interaction and rule logic", () => {
		const project = cloneProject(defaultProject);
		const captain = project.areas[0].npcs.find(
			(candidate) => candidate.id === "npc_instance_captain_mira",
		);
		if (!captain) {
			throw new Error("Captain instance not found.");
		}
		captain.interactionOverride = {
			type: "set_flag",
			activationMode: "on_interact",
			flag: "flag_1",
			value: true,
		};
		useProjectStore.getState().setProject(project);

		render(<MapEditor />);
		fireEvent.click(getButtonByText("Select"));
		fireEvent.pointerDown(getMapTile("Tile 3, 4"));

		expect(
			screen.getByText(
				"This target has a direct interaction and rule-based logic. Both may run.",
			),
		).toBeInTheDocument();
	}, 15000);

	it("renders Logic Builder", () => {
		render(<ProgressionEditor />);

		expect(screen.getByText("Friendly Logic Builder")).toBeInTheDocument();
		expect(screen.getAllByDisplayValue("Opening / Tutorial")).toHaveLength(2);
		expect(screen.getByText("Set flag to:")).toBeInTheDocument();
	});

	it("warns about and quick-creates a missing rule flag", () => {
		const project = cloneProject(defaultProject);
		project.rules = [
			{
				id: "missing-flag-rule",
				name: "Missing flag rule",
				enabled: true,
				trigger: { type: "on_game_start" },
				actions: [{ type: "set_flag", flag: "flag_1", value: true }],
			},
		];
		useProjectStore.getState().setProject(project);

		render(<ProgressionEditor />);

		expect(screen.getByText("Unknown flag: flag_1")).toBeInTheDocument();
		fireEvent.click(getButtonByText("Create flag"));

		expect(useProjectStore.getState().project.gameState.flags.flag_1).toBe(
			false,
		);
		expect(screen.queryByText("Unknown flag: flag_1")).not.toBeInTheDocument();
	});

	it("sets a rule to run once and shows it in the summary", () => {
		render(<ProgressionEditor />);

		fireEvent.change(screen.getByLabelText("Run"), {
			target: { value: "once" },
		});

		expect(useProjectStore.getState().project.rules[0].runPolicy).toBe("once");
		expect(screen.getAllByText("Runs once").length).toBeGreaterThan(0);
	});

	it("renders Game State Editor", () => {
		render(<GameStateEditor />);

		expect(screen.getByText("Game State")).toBeInTheDocument();
		expect(screen.getByText("intro_seen")).toBeInTheDocument();
		expect(screen.getByText("gold")).toBeInTheDocument();
		expect(
			screen.getByText(/Variables are abstract numbers\/text used by logic/),
		).toBeInTheDocument();
	});

	it("renders Items Editor", () => {
		render(<ItemsEditor />);

		expect(screen.getByText("Item Definition")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Gold Coin")).toBeInTheDocument();
		expect(
			screen.getByText(/Currency items are physical inventory items/),
		).toBeInTheDocument();
	});

	it("renders Shops Editor", () => {
		render(<ShopsEditor />);

		expect(screen.getByText("Shop Definition")).toBeInTheDocument();
		expect(screen.getByDisplayValue("General Store")).toBeInTheDocument();
		expect(screen.getByText(/not Game State variables/)).toBeInTheDocument();
	});

	it("renders Quests Editor", () => {
		render(<QuestsEditor />);

		expect(screen.getAllByText("Get Tavern Access")).toHaveLength(2);
		expect(screen.getByDisplayValue("Have 5 Gold Coins")).toBeInTheDocument();
		expect(screen.getByText("Tracked Quest HUD")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Choose which active quest appears during play. With none selected, the first active quest appears automatically.",
			),
		).toBeInTheDocument();
	});

	it("warns about an unknown quest objective flag ID", () => {
		const project = cloneProject(defaultProject);
		project.quests[0].objectives = [
			{
				id: "mismatch",
				description: "Watch mismatched flag",
				condition: { type: "flag", flag: "flag-1", value: true },
			},
		];
		useProjectStore.getState().setProject(project);

		render(<QuestsEditor />);

		expect(screen.getByLabelText("Objective flag ID")).toHaveValue("flag-1");
		expect(screen.getByText("Unknown flag: flag-1")).toBeInTheDocument();
	});

	it("explains that inactive quests do not progress", () => {
		const project = cloneProject(defaultProject);
		project.quests[0].status = "inactive";
		useProjectStore.getState().setProject(project);

		render(<QuestsEditor />);

		expect(
			screen.getByText(
				"Inactive quests do not progress until activated by a rule.",
			),
		).toBeInTheDocument();
	});

	it("creates new quests active by default", () => {
		const project = cloneProject(defaultProject);
		project.quests = [];
		project.trackedQuestId = undefined;
		useProjectStore.getState().setProject(project);
		render(<QuestsEditor />);

		fireEvent.click(screen.getByRole("button", { name: "Add quest" }));

		expect(useProjectStore.getState().project.quests[0].status).toBe("active");
		expect(
			screen.getByDisplayValue("Active - can progress during play"),
		).toBeInTheDocument();
	});

	it("warns when deleting a quest referenced by rules", () => {
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<QuestsEditor />);

		fireEvent.click(screen.getByRole("button", { name: "Delete quest" }));

		expect(confirm).toHaveBeenCalledWith(
			expect.stringContaining("appear as validation warnings"),
		);
		confirm.mockRestore();
	});

	it("renders NPCs Editor", () => {
		render(<NpcsEditor />);

		expect(screen.getByText("NPC Definition")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Captain Mira")).toBeInTheDocument();
		expect(screen.getByText("Placed NPC Overview")).toBeInTheDocument();
		expect(screen.getByText("pirates")).toBeInTheDocument();
	});

	it("renders Objects Editor", () => {
		render(<ObjectsEditor />);

		expect(screen.getByText("Object Definition")).toBeInTheDocument();
		expect(screen.getByText("Default Behaviour")).toBeInTheDocument();
		expect(screen.getAllByDisplayValue("Sign").length).toBeGreaterThan(0);
	});
});
