import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { DialogueDefinition, GameProject } from "../../types/game";
import { DialogueEntitySlot } from "./DialogueEntityControls";
import {
	actionSummary,
	type DialogueEntityRef,
	dialogueAssignmentPatch,
	dialogueEntities,
	placedDialogueNpc,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { openEntitySource } from "./editorSource";

export function DialogueAssignments({
	project,
	dialogue,
	selected,
}: {
	project: GameProject;
	dialogue: DialogueDefinition;
	selected?: DialogueEntityRef;
}) {
	const [pending, setPending] = useState<DialogueEntityRef>();
	const npc = pending && placedDialogueNpc(project, pending);
	const entity = pending && resolveDialogueEntity(project, pending);
	const assigned = dialogueEntities(project).filter(
		(e) =>
			e.ref.kind === "npc" &&
			placedDialogueNpc(project, e.ref)?.interaction?.type ===
				"start_dialogue" &&
			placedDialogueNpc(project, e.ref)?.interaction?.dialogueId ===
				dialogue.id,
	);
	return (
		<section
			className="dialogue-assignments"
			aria-label="Conversation assignments"
		>
			<strong>Conversation assignments</strong>
			{assigned.length ? (
				<ul>
					{assigned.map((e) => (
						<li key={JSON.stringify(e.ref)}>
							{e.label}
							<div className="dialogue-toolbar">
								<button type="button" onClick={() => openEntitySource(e.ref)}>
									Show on map
								</button>
								<button
									type="button"
									onClick={() => {
										openEntitySource(e.ref);
									}}
								>
									Open assignment
								</button>
							</div>
							{(!placedDialogueNpc(project, e.ref)?.attributes.canInteract ||
								placedDialogueNpc(project, e.ref)?.interaction
									?.activationMode === "disabled") &&
								" · Interaction disabled"}
						</li>
					))}
				</ul>
			) : (
				<p className="help-text">
					No placed characters use this conversation yet.
				</p>
			)}
			<DialogueEntitySlot
				project={project}
				selected={selected}
				slot="assignment"
				label="Assign conversation"
				onUse={setPending}
			/>
			{pending && (
				<fieldset
					className="dialogue-assignment-review"
					aria-label="Review assignment"
				>
					{npc && entity ? (
						<>
							<p>
								Assign “{dialogue.name}” to <strong>{entity.label}</strong>.
								Enable interaction and use the “
								{npc.interaction?.prompt || "Talk"}” prompt.
							</p>
							{npc.interaction && (
								<p>
									{npc.interaction.type === "start_dialogue"
										? `Current conversation: ${project.dialogues.find((d) => d.id === npc.interaction?.dialogueId)?.name ?? npc.interaction.dialogueId ?? "Missing"}. Prompt and completion effects are retained.`
										: `Replaces this placement’s ${npc.interaction.type.replace(/_/g, " ")} interaction, including its completion effects.`}
								</p>
							)}
							{npc.interaction?.completionActions?.length ? (
								<p>
									Current completion effects:{" "}
									{npc.interaction.completionActions
										.map((a) => actionSummary(a, project))
										.join(" → ")}
									. These run when a conversation closes, including early close.
								</p>
							) : null}
							<p className="help-text">
								Applies only to this placement. Speaker text is edited
								separately.
							</p>
							<button
								type="button"
								onClick={() => {
									useProjectStore.getState().updateProject((draft) => {
										const patch = dialogueAssignmentPatch(
											draft,
											pending,
											dialogue.id,
										);
										if (!patch || pending.kind !== "npc") return;
										const placed = draft.areas
											.find((a) => a.id === pending.areaId)
											?.npcs.find((n) => n.id === pending.id);
										if (placed) Object.assign(placed, patch);
									});
									setPending(undefined);
								}}
							>
								{npc.interaction ? "Replace assignment" : "Confirm assignment"}
							</button>
						</>
					) : (
						<p role="alert">This placed character no longer exists.</p>
					)}
					<button type="button" onClick={() => setPending(undefined)}>
						Cancel assignment
					</button>
				</fieldset>
			)}
		</section>
	);
}
