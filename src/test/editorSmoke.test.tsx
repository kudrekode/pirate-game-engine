import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { GameStateEditor } from "../editor/sections/GameStateEditor";
import { MapEditor } from "../editor/sections/MapEditor";
import { ItemsEditor } from "../editor/sections/ItemsEditor";
import { ProgressionEditor } from "../editor/sections/ProgressionEditor";
import { QuestsEditor } from "../editor/sections/QuestsEditor";
import { NpcsEditor } from "../editor/sections/NpcsEditor";
import { useProjectStore } from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({
  RuntimePanel: () => <div>Runtime mock</div>,
}));

beforeEach(() => {
  useProjectStore.getState().setProject(cloneProject(defaultProject));
});

describe("editor smoke tests", () => {
  it("renders App and switches to the Logic tab", () => {
    render(<App />);

    expect(screen.getByDisplayValue("Demo Adventure")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logic" }));
    expect(screen.getByText("Friendly Logic Builder")).toBeInTheDocument();
  }, 15000);

  it("renders Map Editor", () => {
    render(<MapEditor />);

    expect(screen.getByText("Map size")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Zoom" })).toBeInTheDocument();
  }, 15000);

  it("edits selected NPC attributes in the Map inspector", () => {
    render(<MapEditor />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Tile 3, 4" }));
    fireEvent.change(screen.getByLabelText("Faction"), { target: { value: "sailors" } });
    fireEvent.change(screen.getByLabelText("Alignment"), { target: { value: "neutral" } });

    const captain = useProjectStore.getState().project.areas[0].npcs.find((npc) => npc.id === "npc_instance_captain_mira");
    expect(captain?.attributes).toMatchObject({ faction: "sailors", alignment: "neutral" });
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
});
