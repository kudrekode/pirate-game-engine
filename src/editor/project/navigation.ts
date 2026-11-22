import { createContext, useContext } from "react";
import {
	type EditorSource,
	useProjectStore,
} from "../../store/useProjectStore";
import type { WorkspaceId } from "../sections";

export function openEntity(source: EditorSource) {
	useProjectStore.getState().openEditorSource(source);
}

export type EditorNavigation = {
	openWorkspace: (id: WorkspaceId) => void;
	openEntity: typeof openEntity;
};

export const EditorNavigationContext = createContext<EditorNavigation | null>(
	null,
);

export function useEditorNavigation() {
	const navigation = useContext(EditorNavigationContext);
	if (!navigation)
		throw new Error("Editor navigation requires an open editor shell.");
	return navigation;
}
