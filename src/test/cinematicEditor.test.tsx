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

it("creates and edits a sequence with shots, subtitles, actors and audio, then mounts a preview of the authored project", async () => {
	render(<CutsceneEditor />);
	click("Add cutscene");
	click("Create 3D sequence");
	const firstProject = useProjectStore.getState().project;
	expect(screen.getByLabelText("Sequence area")).toHaveValue(
		firstProject.activeAreaId,
	);

	click("Add shot");
	editOnBlur(screen.getByLabelText("Shot duration (ms)"), "1200");
	fireEvent.click(screen.getByLabelText("Move camera during shot"));
	const endPose = screen.getByRole("group", { name: "End pose" });
	editOnBlur(within(endPose).getByLabelText("Position X"), "-3.25");
	click("Move shot earlier");
	expect(
		useProjectStore.getState().project.cutscenes[0].cinematic?.shots,
	).toMatchObject([
		{ durationMs: 1200, to: { position: { x: -3.25 } } },
		{ durationMs: 2500 },
	]);

	click("Add subtitle");
	editOnBlur(screen.getByLabelText("Start (ms)"), "400");
	fireEvent.change(screen.getByLabelText("Subtitle speaker"), {
		target: { value: "Narrator" },
	});
	editOnBlur(screen.getByLabelText("Subtitle text"), "The watch begins.");
	click("Add actor action");
	fireEvent.change(screen.getByLabelText("Animation"), {
		target: { value: "interact" },
	});
	fireEvent.click(screen.getByLabelText("Face a map point"));
	editOnBlur(screen.getByLabelText("Face X"), "2.5");
	click("Add audio");
	fireEvent.change(screen.getByLabelText("Audio file URL"), {
		target: { value: "/audio/watch.ogg" },
	});
	click("Add audio cue");
	editOnBlur(screen.getByLabelText("Volume"), "0.5");

	const project = useProjectStore.getState().project;
	const [cutscene] = project.cutscenes;
	expect(cutscene.cinematic?.cues).toMatchObject([
		{
			type: "subtitle",
			startMs: 400,
			speaker: "Narrator",
			text: "The watch begins.",
		},
		{
			type: "actor",
			actorId: "runtime_player",
			animation: "interact",
			face: { x: 2.5 },
		},
		{ type: "audio", url: "/audio/watch.ogg", volume: 0.5 },
	]);
	expect(
		importProjectJson(JSON.stringify(project)).cutscenes[0].cinematic,
	).toEqual(cutscene.cinematic);

	click("Preview 3D sequence");
	expect(await screen.findByText("Preview mounted")).toBeInTheDocument();
	expect(renderPreview).toHaveBeenCalledWith(
		expect.objectContaining({ project, previewCutsceneId: cutscene.id }),
	);
	click("Replay");
	expect(renderPreview).toHaveBeenCalledTimes(2);
	click("Close preview");
	expect(
		screen.queryByRole("dialog", { name: "3D sequence preview" }),
	).not.toBeInTheDocument();
	expect(useProjectStore.getState().project).toBe(project);
});
