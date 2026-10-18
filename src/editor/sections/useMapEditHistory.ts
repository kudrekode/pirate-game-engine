import { useEffect, useRef, useState } from "react";
import { cloneProject } from "../../data/migrateProject";
import { useProjectStore } from "../../store/useProjectStore";
import type { EditorSelection, GameProject } from "../../types/game";
import { getSceneEntity } from "./sceneEditing";

type MapEditHistoryEntry = {
	before: GameProject;
	after: GameProject;
	selection?: EditorSelection;
};

export function cloneCurrentProject() {
	return cloneProject(useProjectStore.getState().project);
}

// One workspace lifetime; gesture callers choose transaction boundaries.
// Preserve full-project snapshots, 50-entry limits and area selection on restore.
export function useMapEditHistory(activeAreaId: string, observeEdits = false) {
	const setProject = useProjectStore((state) => state.setProject);
	const setSelection = useProjectStore((state) => state.setEditorSelection);
	const historyRef = useRef<{
		undo: MapEditHistoryEntry[];
		redo: MapEditHistoryEntry[];
	}>({ undo: [], redo: [] });
	const pendingRef = useRef<GameProject | null>(null);
	const groupRef = useRef<GameProject | null>(null);
	const restoringRef = useRef(false);

	const [historyRevision, setHistoryRevision] = useState(0);
	function recordMapEdit(before: GameProject) {
		groupRef.current = null;
		pendingRef.current = null;
		const after = cloneCurrentProject();
		if (JSON.stringify(before) === JSON.stringify(after)) {
			return;
		}
		const last = historyRef.current.undo[historyRef.current.undo.length - 1];
		if (
			last &&
			JSON.stringify(last.before) === JSON.stringify(before) &&
			JSON.stringify(last.after) === JSON.stringify(after)
		)
			return;

		historyRef.current.undo = [
			...historyRef.current.undo,
			{ before, after, selection: useProjectStore.getState().editorSelection },
		].slice(-50);
		historyRef.current.redo = [];
		setHistoryRevision((revision) => revision + 1);
	}

	function beginMapEdit() {
		groupRef.current ??= cloneCurrentProject();
	}
	function endMapEdit() {
		const before = groupRef.current;
		groupRef.current = null;
		if (before) recordMapEdit(before);
	}
	const recordRef = useRef(recordMapEdit);
	recordRef.current = recordMapEdit;
	useEffect(() => {
		if (!observeEdits) return;
		const unsubscribe = useProjectStore.subscribe((state, previous) => {
			if (restoringRef.current || state.project === previous.project) return;
			if (state.projectContextId !== previous.projectContextId) {
				historyRef.current = { undo: [], redo: [] };
				pendingRef.current = null;
				groupRef.current = null;
				setHistoryRevision((revision) => revision + 1);
				return;
			}
			if (groupRef.current) return;
			pendingRef.current ??= cloneProject(previous.project);
			queueMicrotask(() => {
				if (pendingRef.current) recordRef.current(pendingRef.current);
			});
		});
		return () => {
			unsubscribe();
			pendingRef.current = null;
			groupRef.current = null;
		};
	}, [observeEdits]);

	function restoreMapHistoryProject(
		projectSnapshot: GameProject,
		selection?: EditorSelection,
	) {
		restoringRef.current = true;
		setProject(cloneProject(projectSnapshot));
		const nextAreaId =
			projectSnapshot.activeAreaId ??
			projectSnapshot.areas[0]?.id ??
			activeAreaId;
		setSelection(
			selection && getSceneEntity(projectSnapshot, selection)
				? selection
				: { type: "area", areaId: nextAreaId },
		);
		restoringRef.current = false;
	}

	function undoMapEdit() {
		endMapEdit();
		if (pendingRef.current) recordMapEdit(pendingRef.current);
		const entry = historyRef.current.undo[historyRef.current.undo.length - 1];
		if (!entry) {
			return;
		}

		historyRef.current.undo = historyRef.current.undo.slice(0, -1);
		historyRef.current.redo = [...historyRef.current.redo, entry].slice(-50);
		restoreMapHistoryProject(entry.before, entry.selection);
		setHistoryRevision((revision) => revision + 1);
	}

	function redoMapEdit() {
		const entry = historyRef.current.redo[historyRef.current.redo.length - 1];
		if (!entry) {
			return;
		}

		historyRef.current.redo = historyRef.current.redo.slice(0, -1);
		historyRef.current.undo = [...historyRef.current.undo, entry].slice(-50);
		restoreMapHistoryProject(entry.after, entry.selection);
		setHistoryRevision((revision) => revision + 1);
	}

	return {
		beginMapEdit,
		endMapEdit,
		recordMapEdit,
		undoMapEdit,
		redoMapEdit,
		canUndo: historyRevision >= 0 && historyRef.current.undo.length > 0,
		canRedo: historyRevision >= 0 && historyRef.current.redo.length > 0,
	};
}
