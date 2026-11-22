import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import merewatch from "../../hollow-kingdom.project.json";
import { importProjectJson } from "../data/projectImport";
import { createProjectFromPreset } from "../data/projectPresets";
import {
	cloneCurrentProject,
	useMapEditHistory,
} from "../editor/sections/useMapEditHistory";
import { useMapFoliageBrush } from "../editor/sections/useMapFoliageBrush";
import { useProjectStore } from "../store/useProjectStore";

beforeEach(() =>
	useProjectStore.getState().setProject(createProjectFromPreset("blank")),
);

it("does not record reference navigation to another area as an authoring edit", async () => {
	const initial = useProjectStore.getState().project;
	useProjectStore.getState().updateProject((p) => {
		p.areas.push({ ...structuredClone(p.areas[0]), id: "story_other_area" });
	});
	const { result } = renderHook(() =>
		useMapEditHistory(initial.activeAreaId, true),
	);
	await act(async () => {
		useProjectStore.getState().setActiveArea("story_other_area");
	});
	expect(result.current.canUndo).toBe(false);
	await act(async () => {
		useProjectStore.getState().updateMetadata({ name: "Story edit" });
	});
	expect(result.current.canUndo).toBe(true);
	act(() => result.current.undoMapEdit());
	expect(useProjectStore.getState().project.activeAreaId).toBe(
		"story_other_area",
	);
	expect(useProjectStore.getState().project.metadata.name).toBe(
		initial.metadata.name,
	);
});

it("restores isolated snapshots and selection, preserves redo on no-op and clears it on a new edit", () => {
	const areaId = useProjectStore.getState().project.activeAreaId;
	const { result } = renderHook(() => useMapEditHistory(areaId));
	const original = cloneCurrentProject();
	act(() => {
		useProjectStore.getState().updateMetadata({ name: "Edited" });
		result.current.recordMapEdit(original);
	});
	act(() => result.current.undoMapEdit());
	expect(useProjectStore.getState().project.metadata.name).toBe(
		original.metadata.name,
	);
	expect(useProjectStore.getState().editorSelection).toEqual({
		type: "area",
		areaId,
	});
	expect(result.current.canRedo).toBe(true);
	act(() => result.current.recordMapEdit(cloneCurrentProject()));
	expect(result.current.canRedo).toBe(true);
	act(() => result.current.redoMapEdit());
	expect(useProjectStore.getState().project.metadata.name).toBe("Edited");
	act(() =>
		useProjectStore.getState().updateMetadata({ name: "Outside transaction" }),
	);
	act(() => result.current.undoMapEdit());
	act(() => result.current.redoMapEdit());
	expect(useProjectStore.getState().project.metadata.name).toBe("Edited");
	act(() => result.current.undoMapEdit());
	act(() => {
		const before = cloneCurrentProject();
		useProjectStore.getState().updateMetadata({ name: "New branch" });
		result.current.recordMapEdit(before);
	});
	expect(result.current.canRedo).toBe(false);
});

it("retains only the last fifty transactions within a workspace mount", () => {
	const { result, unmount } = renderHook(() =>
		useMapEditHistory(useProjectStore.getState().project.activeAreaId),
	);
	for (let index = 1; index <= 51; index++)
		act(() => {
			const before = cloneCurrentProject();
			useProjectStore.getState().updateMetadata({ name: String(index) });
			result.current.recordMapEdit(before);
		});
	for (let index = 0; index < 50; index++)
		act(() => result.current.undoMapEdit());
	expect(result.current.canUndo).toBe(false);
	expect(useProjectStore.getState().project.metadata.name).toBe("1");
	unmount();
	const remounted = renderHook(() =>
		useMapEditHistory(useProjectStore.getState().project.activeAreaId),
	);
	expect(remounted.result.current.canRedo).toBe(false);
	expect(remounted.result.current.canUndo).toBe(false);
});

it("commits a Merewatch foliage stroke as one reversible edit and erases the same group", () => {
	useProjectStore
		.getState()
		.setProject(importProjectJson(JSON.stringify(merewatch)));
	const { result, rerender } = renderHook(
		({ mode }: { mode: "paint" | "erase" }) => {
			const project = useProjectStore((state) => state.project);
			const area = project.areas[0];
			return {
				history: useMapEditHistory(area.id, true),
				brush: useMapFoliageBrush(project, area, mode).brush,
			};
		},
		{ initialProps: { mode: "paint" } },
	);
	const painted = () =>
		useProjectStore
			.getState()
			.project.areas[0].objects.filter(
				(object) => object.state?.foliageGroupId,
			);
	function stroke() {
		act(() => {
			const { history, brush } = result.current;
			history.beginMapEdit();
			brush.apply({ x: 11, y: 43 });
			brush.apply({ x: 14, y: 43 });
			brush.finish(true);
			history.endMapEdit();
		});
	}
	stroke();
	const planted = painted();
	expect(planted.length).toBeGreaterThan(2);
	expect(
		new Set(planted.map((object) => object.state?.foliageGroupId)).size,
	).toBe(1);
	act(() => result.current.history.undoMapEdit());
	expect(painted()).toEqual([]);
	act(() => result.current.history.redoMapEdit());
	expect(painted()).toEqual(planted);
	rerender({ mode: "erase" });
	stroke();
	expect(painted()).toEqual([]);
	act(() => result.current.history.undoMapEdit());
	expect(painted()).toEqual(planted);
});
