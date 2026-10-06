import { useRef, useState } from "react";
import { cloneProject } from "../../data/migrateProject";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameProject } from "../../types/game";

type MapEditHistoryEntry = {
	before: GameProject;
	after: GameProject;
};

export function cloneCurrentProject() {
	return cloneProject(useProjectStore.getState().project);
}

// One workspace lifetime; gesture callers choose transaction boundaries.
// Preserve full-project snapshots, 50-entry limits and area selection on restore.
export function useMapEditHistory(activeAreaId: string) {
	const setProject = useProjectStore((state) => state.setProject);
	const setSelection = useProjectStore((state) => state.setEditorSelection);
	const historyRef = useRef<{
		undo: MapEditHistoryEntry[];
		redo: MapEditHistoryEntry[];
	}>({ undo: [], redo: [] });

	const [historyRevision, setHistoryRevision] = useState(0);
	function recordMapEdit(before: GameProject) {
		const after = cloneCurrentProject();
		if (JSON.stringify(before) === JSON.stringify(after)) {
			return;
		}

		historyRef.current.undo = [
			...historyRef.current.undo,
			{ before, after },
		].slice(-50);
		historyRef.current.redo = [];
		setHistoryRevision((revision) => revision + 1);
	}

	function restoreMapHistoryProject(projectSnapshot: GameProject) {
		setProject(cloneProject(projectSnapshot));
		const nextAreaId =
			projectSnapshot.activeAreaId ??
			projectSnapshot.areas[0]?.id ??
			activeAreaId;
		setSelection({ type: "area", areaId: nextAreaId });
	}

	function undoMapEdit() {
		const entry = historyRef.current.undo[historyRef.current.undo.length - 1];
		if (!entry) {
			return;
		}

		historyRef.current.undo = historyRef.current.undo.slice(0, -1);
		historyRef.current.redo = [...historyRef.current.redo, entry].slice(-50);
		restoreMapHistoryProject(entry.before);
		setHistoryRevision((revision) => revision + 1);
	}

	function redoMapEdit() {
		const entry = historyRef.current.redo[historyRef.current.redo.length - 1];
		if (!entry) {
			return;
		}

		historyRef.current.redo = historyRef.current.redo.slice(0, -1);
		historyRef.current.undo = [...historyRef.current.undo, entry].slice(-50);
		restoreMapHistoryProject(entry.after);
		setHistoryRevision((revision) => revision + 1);
	}

	return {
		recordMapEdit,
		undoMapEdit,
		redoMapEdit,
		canUndo: historyRevision >= 0 && historyRef.current.undo.length > 0,
		canRedo: historyRevision >= 0 && historyRef.current.redo.length > 0,
	};
}
