import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { DialogueDefinition, GameProject, Quest } from "../../types/game";
import { StoryDialog } from "./DialogueEntityControls";
import {
	createDialogueEntity,
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
} from "./dialogueEntities";
import {
	commitQuestGiver,
	makeQuestGiver,
	type QuestGiverInput,
} from "./questGiverRecipe";

export function DialogueQuestGiver({
	project,
	selected,
	onCreated,
}: {
	project: GameProject;
	selected?: DialogueEntityRef;
	onCreated: (id: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [characterKey, setCharacterKey] = useState("");
	const [questId, setQuestId] = useState("");
	const [questName, setQuestName] = useState("");
	const [conversationId, setConversationId] = useState("");
	const [acceptanceFlag, setAcceptanceFlag] = useState("");
	const [refusalFlag, setRefusalFlag] = useState("");
	const [preview, setPreview] = useState<{
		input: QuestGiverInput;
		dialogue: DialogueDefinition;
		quest?: Quest;
	}>();
	const entities = dialogueEntities(project);
	const character = entities.find((e) => entityKey(e.ref) === characterKey);
	function reset() {
		setPreview(undefined);
	}
	return (
		<>
			<button
				type="button"
				onClick={() => {
					setCharacterKey(selected?.kind === "npc" ? entityKey(selected) : "");
					setOpen(true);
					reset();
				}}
			>
				Quest Giver — Yes / No
			</button>
			{open && (
				<StoryDialog
					label="Quest Giver — Yes / No"
					onClose={() => setOpen(false)}
				>
					<label>
						Conversation
						<select
							aria-label="Recipe conversation"
							value={conversationId}
							onChange={(e) => {
								setConversationId(e.target.value);
								reset();
							}}
						>
							<option value="">Create new conversation</option>
							{project.dialogues.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Placed character
						<select
							value={characterKey}
							onChange={(e) => {
								setCharacterKey(e.target.value);
								reset();
							}}
						>
							<option value="">Choose character</option>
							{entities
								.filter((e) => e.ref.kind === "npc")
								.map((e) => (
									<option key={entityKey(e.ref)} value={entityKey(e.ref)}>
										{e.label}
									</option>
								))}
						</select>
					</label>
					<label>
						Quest
						<select
							value={questId}
							onChange={(e) => {
								setQuestId(e.target.value);
								reset();
							}}
						>
							<option value="">Choose quest</option>
							<option value="__new__">Create new quest</option>
							{project.quests.map((q) => (
								<option key={q.id} value={q.id}>
									{q.name}
								</option>
							))}
						</select>
					</label>
					{questId === "__new__" && (
						<label>
							New quest name
							<input
								value={questName}
								onChange={(e) => {
									setQuestName(e.target.value);
									reset();
								}}
							/>
						</label>
					)}
					{(
						[
							["Acceptance state", acceptanceFlag, setAcceptanceFlag],
							["Refusal state", refusalFlag, setRefusalFlag],
						] as const
					).map(([label, value, setValue]) => (
						<label key={label}>
							{label}
							<select
								value={value}
								onChange={(e) => {
									setValue(e.target.value);
									reset();
								}}
							>
								<option value="">None</option>
								{entities
									.filter((e) => e.ref.kind === "flag")
									.map((e) => (
										<option key={e.ref.id} value={e.ref.id}>
											{e.label}
										</option>
									))}
							</select>
						</label>
					))}
					<button
						type="button"
						disabled={
							!character ||
							!questId ||
							(questId === "__new__" && !questName.trim())
						}
						onClick={() => {
							if (!character) return;
							const scratch = structuredClone(project);
							const actualQuestId =
								questId === "__new__"
									? createDialogueEntity(scratch, {
											kind: "quest",
											name: questName,
											description: "",
											category: "quest",
											value: false,
										}).id
									: questId;
							const quest =
								questId === "__new__"
									? scratch.quests.find((q) => q.id === actualQuestId)
									: undefined;
							const input = {
								character: character.ref,
								questId: actualQuestId,
								acceptanceFlag,
								refusalFlag,
								conversationId: conversationId || undefined,
								conversationSnapshot: conversationId
									? JSON.stringify(
											project.dialogues.find((d) => d.id === conversationId),
										)
									: undefined,
							};
							const dialogue = makeQuestGiver(scratch, input);
							if (dialogue) setPreview({ input, dialogue, quest });
						}}
					>
						Preview recipe
					</button>
					{preview && (
						<section aria-label="Recipe preview">
							{preview.quest && (
								<p>
									Create inactive quest “{preview.quest.name}”. It has no
									objectives yet; open Quest Sequence to finish it before Play.
								</p>
							)}
							<p>
								{conversationId
									? `Add four fresh nodes and two responses to “${preview.dialogue.name}”. The Yes/No question becomes the new Start; Yes rejoins the previous Start and No ends. Existing nodes and IDs stay intact.`
									: `Create “${preview.dialogue.name}” with four nodes and two responses.`}{" "}
								Assign it to {character?.label}, replacing this placement’s
								interaction and completion effects.
							</p>
							<p>
								Yes → Start quest
								{acceptanceFlag ? " + remember acceptance" : ""} →{" "}
								{conversationId ? "Previous Start" : "End"}.
							</p>
							<p>
								No → {refusalFlag ? "Remember refusal → " : ""}End. Closing
								early does not start the quest.
							</p>
							<button
								type="button"
								onClick={() => {
									let created = false;
									useProjectStore.getState().updateProject((draft) => {
										created = commitQuestGiver(
											draft,
											preview.input,
											preview.dialogue,
											preview.quest,
										);
									});
									if (created) {
										onCreated(preview.dialogue.id);
										setOpen(false);
									}
								}}
							>
								Create quest giver
							</button>
						</section>
					)}
				</StoryDialog>
			)}
		</>
	);
}
