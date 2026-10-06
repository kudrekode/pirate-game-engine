import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { createProjectFromPreset } from "../data/projectPresets";
import {
	cloneCurrentProject,
	useMapEditHistory,
} from "../editor/sections/useMapEditHistory";
import { useProjectStore } from "../store/useProjectStore";

beforeEach(() =>
	useProjectStore.getState().setProject(createProjectFromPreset("blank")),
);

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
