import { fireEvent, render, screen } from "@testing-library/react";
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
import { useProjectStore } from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({
	RuntimePanel: () => <div>Runtime mock</div>,
}));

beforeEach(() => {
	useProjectStore.getState().setProject(cloneProject(defaultProject));
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

describe("editor smoke tests", () => {
	it("renders App and switches to the Logic tab", () => {
		render(<App />);

		expect(screen.getByDisplayValue("Demo Adventure")).toBeInTheDocument();
		expect(screen.getByText("Saved")).toBeInTheDocument();
		const logicTab = screen.getByRole("button", { name: "Logic" });
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

	it("renders Map Editor", () => {
		render(<MapEditor />);

		expect(screen.getByText("Map size")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Reset Zoom" }),
		).toBeInTheDocument();
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

		fireEvent.click(getButtonByText("Select"));
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
			"Tool: Paint",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Palette: Terrain",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Selected: Grass Tile",
		);
		expect(screen.getByLabelText("Map editor status")).toHaveTextContent(
			"Area: Main Area",
		);
	}, 15000);

	it("renders Logic Builder", () => {
		render(<ProgressionEditor />);

		expect(screen.getByText("Friendly Logic Builder")).toBeInTheDocument();
		expect(screen.getAllByDisplayValue("Opening / Tutorial")).toHaveLength(2);
	});

	it("renders Game State Editor", () => {
		render(<GameStateEditor />);

		expect(screen.getByText("Game State")).toBeInTheDocument();
		expect(screen.getByText("intro_seen")).toBeInTheDocument();
		expect(screen.getByText("gold")).toBeInTheDocument();
	});

	it("renders Items Editor", () => {
		render(<ItemsEditor />);

		expect(screen.getByText("Item Definition")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Gold Coin")).toBeInTheDocument();
	});

	it("renders Shops Editor", () => {
		render(<ShopsEditor />);

		expect(screen.getByText("Shop Definition")).toBeInTheDocument();
		expect(screen.getByDisplayValue("General Store")).toBeInTheDocument();
	});

	it("renders Quests Editor", () => {
		render(<QuestsEditor />);

		expect(screen.getAllByText("Get Tavern Access")).toHaveLength(2);
		expect(screen.getByDisplayValue("Have 5 Gold Coins")).toBeInTheDocument();
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
