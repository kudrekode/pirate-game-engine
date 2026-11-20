import { useEffect, useRef } from "react";
import {
	type EditorSource,
	useProjectStore,
} from "../../store/useProjectStore";
import type { DialogueEntityRef } from "./dialogueEntities";

export function entitySource(ref: DialogueEntityRef): EditorSource {
	if ("areaId" in ref)
		return { section: "map", id: ref.id, areaId: ref.areaId };
	if (ref.kind === "area")
		return { section: "map", id: ref.id, areaId: ref.id };
	if (ref.kind === "dialogue") return { section: "dialogues", id: ref.id };
	if (ref.kind === "rule") return { section: "progression", id: ref.id };
	if (ref.kind === "cutscene") return { section: "cutscenes", id: ref.id };
	if (ref.kind === "shop") return { section: "shops", id: ref.id };
	return {
		section:
			ref.kind === "item"
				? "items"
				: ref.kind === "quest"
					? "quests"
					: "game-state",
		id: ref.id,
		...(ref.kind === "flag" || ref.kind === "variable"
			? { field: `state:${ref.id}` }
			: {}),
	};
}

export function openEntitySource(ref: DialogueEntityRef) {
	useProjectStore.getState().openEditorSource(entitySource(ref));
}

/** UI-only requests never create authored references or undo records. */
export function useEditorSource(
	section: EditorSource["section"],
	select: (source: EditorSource) => void,
) {
	const source = useProjectStore((state) => state.requestedEditorSource);
	const selectRef = useRef(select);
	selectRef.current = select;
	useEffect(() => {
		if (source?.section !== section) return;
		selectRef.current(source);
		const timer = window.setTimeout(() => {
			if (!source.field) return;
			const element = Array.from(
				document.querySelectorAll<HTMLElement>("[data-story-field]"),
			).find((e) => e.dataset.storyField === source.field);
			if (!element) return;
			let parent: HTMLElement | null = element;
			while (parent) {
				if (parent instanceof HTMLDetailsElement) parent.open = true;
				parent = parent.parentElement;
			}
			element.querySelectorAll("details").forEach((d) => {
				d.open = true;
			});
			element.scrollIntoView?.({ block: "center" });
			element.tabIndex = -1;
			element.focus({ preventScroll: true });
			element.dataset.sourceFocus = "true";
		}, 0);
		return () => window.clearTimeout(timer);
	}, [source, section]);
	return source?.section === section ? source : undefined;
}
