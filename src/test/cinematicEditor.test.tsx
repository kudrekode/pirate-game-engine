import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { importProjectJson } from "../data/projectImport";
import { CutsceneEditor } from "../editor/sections/CutsceneEditor";
import { useProjectStore } from "../store/useProjectStore";

const renderPreview = vi.hoisted(() => vi.fn());
vi.mock("../runtime/three/ThreeRuntimePanel", () => ({
	ThreeRuntimePanel: (props: unknown) => {
		renderPreview(props);
		return <p>Preview mounted</p>;
	},
}));

beforeEach(() => {
	const project = cloneProject(defaultProject);
	project.cutscenes = [];
	useProjectStore.getState().setProject(project);
	renderPreview.mockClear();
});

afterEach(() =>
	useProjectStore.getState().setProject(cloneProject(defaultProject)),
);

function click(name: string) {
	fireEvent.click(screen.getByRole("button", { name }));
}

function editOnBlur(field: HTMLElement, value: string) {
	fireEvent.change(field, { target: { value } });
	fireEvent.blur(field);
}

it("writes one sequence from both modes and keeps the preview scene isolated from edits", {
	timeout: 15_000,
}, () => {
	render(<CutsceneEditor />);
	expect(screen.getByRole("button", { name: "Simple" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	click("+ New sequence");
	const firstProject = useProjectStore.getState().project;
	expect(screen.getByText("Preview mounted")).toBeInTheDocument();
	expect(renderPreview).toHaveBeenCalledWith(
		expect.objectContaining({
			project: firstProject,
			cinematicPreview: expect.objectContaining({
				current: expect.objectContaining({ playing: false }),
			}),
		}),
	);
	click("Detail");
	fireEvent.change(screen.getByLabelText("Speaker", { exact: true }), {
		target: { value: "runtime_player" },
	});
	editOnBlur(
		screen.getByLabelText("Dialogue / Subtitle"),
		"We should leave the harbour before dawn.",
	);
	fireEvent.change(screen.getByLabelText("Actor action"), {
		target: { value: "interact" },
	});
	click("← Earlier");
	click("Duplicate");
	click("Delete shot");
	click("Undo");
	click("Redo");
	fireEvent.click(
		within(screen.getByRole("region", { name: "Storyboard" })).getByRole(
			"button",
			{ name: /^1\. Detail/ },
		),
	);
	click("Advanced");
	const advanced = screen.getByRole("region", { name: "Advanced inspector" });
	editOnBlur(within(advanced).getByLabelText("Field of view"), "48");
	editOnBlur(
		within(
			within(advanced).getByRole("group", { name: "Camera offset" }),
		).getByLabelText("X"),
		"1.5",
	);
	click("Simple");
	click("Advanced");
	expect(
		within(
			screen.getByRole("region", { name: "Advanced inspector" }),
		).getByLabelText("Field of view"),
	).toHaveValue(48);
	const project = useProjectStore.getState().project;
	const [cutscene] = project.cutscenes;
	expect(cutscene.cinematic?.shots).toMatchObject([
		{ preset: "detail", fov: 48, positionOffset: { x: 1.5 } },
		{ preset: "establishing" },
	]);
	expect(cutscene.cinematic?.cues).toMatchObject([
		{
			type: "subtitle",
			startMs: 0,
			speakerId: "runtime_player",
			text: "We should leave the harbour before dawn.",
		},
		{
			type: "actor",
			startMs: 0,
			actorId: "runtime_player",
			animation: "interact",
		},
	]);
	expect(
		importProjectJson(JSON.stringify(project)).cutscenes[0].cinematic,
	).toEqual(JSON.parse(JSON.stringify(cutscene.cinematic)));
	expect(renderPreview.mock.lastCall?.[0].project).toBe(firstProject);
	expect(firstProject.cutscenes[0].cinematic?.shots).toHaveLength(1);
});

it("reports missing placements and targets while retaining the saved camera", () => {
	const project = cloneProject(defaultProject);
	project.cutscenes = [
		{
			id: "missing",
			name: "Missing references",
			text: "",
			backgroundImageId: "",
			cinematic: {
				areaId: project.activeAreaId,
				castIds: ["actor-removed"],
				shots: [
					{
						durationMs: 2000,
						preset: "close-up",
						targetId: "target-removed",
						from: {
							position: { x: 3, y: 4, z: 2 },
							lookAt: { x: 1, y: 1, z: 5 },
						},
					},
				],
			},
		},
	];
	useProjectStore.getState().setProject(project);
	const installed = useProjectStore.getState().project;
	render(<CutsceneEditor />);
	const report = screen.getByRole("list", { name: "Sequence diagnostics" });
	expect(report).toHaveTextContent("Missing actor (actor-removed).");
	expect(report).toHaveTextContent("Missing camera target (target-removed).");
	expect(useProjectStore.getState().project).toBe(installed);
});
