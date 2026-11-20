import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameProject } from "../../types/game";
import {
	DialogueEntitySlot,
	EntityOperationMenu,
} from "./DialogueEntityControls";
import {
	createDialogueEntity,
	type DialogueEntityRef,
	type EntityOperation,
	type EntitySlot,
	entityOperations,
	type NewDialogueEntity,
	resolveDialogueEntity,
} from "./dialogueEntities";

/** Shared interaction, with creation and wiring in the same owning store update. */
export function StoryEntityInsert({
	project,
	selected,
	slot,
	label,
	options,
	ownerExists,
	insert,
}: {
	project: GameProject;
	selected?: DialogueEntityRef;
	slot: EntitySlot;
	label: string;
	options?: (project: GameProject, ref: DialogueEntityRef) => EntityOperation[];
	ownerExists: (project: GameProject) => boolean;
	insert: (
		project: GameProject,
		ref: DialogueEntityRef,
		operation: string,
	) => void;
}) {
	const [pending, setPending] = useState<{
		ref?: DialogueEntityRef;
		draft?: NewDialogueEntity;
	}>();
	const ref =
		pending?.ref ??
		(pending?.draft
			? ({ kind: pending.draft.kind, id: "pending" } as DialogueEntityRef)
			: undefined);
	const variableValue =
		pending?.draft?.value ??
		(ref?.kind === "variable"
			? project.gameState.variables[ref.id]
			: undefined);
	const operations = ref
		? options
			? options(project, ref)
			: entityOperations(
					slot,
					ref.kind,
					typeof variableValue === "boolean" ? undefined : variableValue,
				)
		: [];
	return (
		<>
			<DialogueEntitySlot
				project={project}
				selected={selected}
				slot={slot}
				label={label}
				onUse={(ref) => setPending({ ref })}
				onCreate={(draft) => setPending({ draft })}
			/>
			{pending && ref && (
				<EntityOperationMenu
					name={
						pending.draft?.name ??
						resolveDialogueEntity(project, ref)?.label ??
						"Missing entity"
					}
					operations={operations}
					onCancel={() => setPending(undefined)}
					onChoose={(operation) => {
						const current = useProjectStore.getState().project;
						if (
							!ownerExists(current) ||
							(pending.ref && !resolveDialogueEntity(current, pending.ref))
						) {
							setPending(undefined);
							return;
						}
						if (
							options &&
							pending.ref &&
							!options(current, pending.ref).some(
								(o) => o.id === operation && !o.disabled,
							)
						) {
							setPending(undefined);
							return;
						}
						useProjectStore.getState().updateProject((draft) => {
							const actual = pending.draft
								? createDialogueEntity(draft, pending.draft)
								: pending.ref!;
							insert(draft, actual, operation);
						});
						setPending(undefined);
					}}
				/>
			)}
		</>
	);
}
