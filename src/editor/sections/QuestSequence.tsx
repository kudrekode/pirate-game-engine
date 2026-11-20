import { type ReactNode, useState } from "react";
import type { GameProject, Objective, Quest } from "../../types/game";
import { StoryDialog } from "./DialogueEntityControls";
import {
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { makeDialogueId } from "./dialogueGraphModel";
import { openEntitySource } from "./editorSource";
import {
	makeEntityObjective,
	makeFetchObjectives,
	objectiveHints,
	objectiveReference,
	objectiveSummary,
	objectiveWarnings,
	questEntityOptions,
} from "./questSequenceModel";
import {
	moveStoryEntry,
	readStoryOrder,
	STORY_ORDER_MIME,
} from "./StoryActionStack";
import { StoryEntityInsert } from "./StoryEntityInsert";

function ObjectiveFields({
	objective,
	children,
}: {
	objective: Objective;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(objective.description === "New objective");
	return (
		<details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
			<summary>Advanced objective fields</summary>
			{children}
			<small>Objective ID: {objective.id}</small>
		</details>
	);
}

export function QuestSequence({
	project,
	quest,
	selected,
	advancedFields,
	update,
}: {
	project: GameProject;
	quest: Quest;
	selected?: DialogueEntityRef;
	advancedFields: (objective: Objective) => ReactNode;
	update: (patch: Partial<Quest>) => void;
}) {
	const [recipe, setRecipe] = useState(false),
		[characterKey, setCharacterKey] = useState(""),
		[itemId, setItemId] = useState("");
	const [preview, setPreview] = useState<Objective[]>();
	const entities = dialogueEntities(project);
	const owner = `quest:${quest.id}`;
	return (
		<>
			<StoryEntityInsert
				project={project}
				selected={selected}
				slot="objective"
				label="Add objective from entity"
				options={questEntityOptions}
				ownerExists={(p) => p.quests.some((q) => q.id === quest.id)}
				insert={(draft, ref, op) => {
					const objective = makeEntityObjective(draft, ref, op);
					if (objective)
						draft.quests
							.find((q) => q.id === quest.id)!
							.objectives.push(objective);
				}}
			/>
			<button
				type="button"
				onClick={() => {
					setRecipe(true);
					setPreview(undefined);
				}}
			>
				Fetch Quest recipe
			</button>
			{quest.objectives.map((objective, index) => {
				const ref = objectiveReference(project, objective.condition),
					entity = resolveDialogueEntity(project, ref);
				return (
					<article
						className="quest-objective story-step"
						key={objective.id}
						data-story-field={`objective:${objective.id}`}
						onDragOver={(e) => {
							if (e.dataTransfer.types.includes(STORY_ORDER_MIME))
								e.preventDefault();
						}}
						onDrop={(e) => {
							const fromId = readStoryOrder(
								e.dataTransfer.getData(STORY_ORDER_MIME),
								owner,
							);
							if (!fromId) return;
							e.preventDefault();
							e.stopPropagation();
							update({
								objectives: moveStoryEntry(
									quest.objectives,
									quest.objectives.findIndex((o) => o.id === fromId),
									index,
								),
							});
						}}
					>
						<div className="story-step-title">
							<button
								type="button"
								draggable
								aria-label={`Drag objective ${index + 1}`}
								onDragStart={(e) =>
									e.dataTransfer.setData(
										STORY_ORDER_MIME,
										JSON.stringify({ owner, id: objective.id }),
									)
								}
							>
								{index + 1} ↕
							</button>
							<strong>{objectiveSummary(project, objective.condition)}</strong>
						</div>
						<label>
							Objective {index + 1} text
							<input
								value={objective.description}
								onChange={(e) =>
									update({
										objectives: quest.objectives.map((o) =>
											o.id === objective.id
												? { ...o, description: e.target.value }
												: o,
										),
									})
								}
							/>
						</label>
						<small>{objectiveHints[objective.condition.type]}</small>
						{objectiveWarnings(project, quest, objective).map((message) => (
							<p key={message} role="status" className="validation-message">
								{message}
							</p>
						))}
						<div className="dialogue-toolbar">
							<button
								type="button"
								disabled={!entity}
								onClick={() => openEntitySource(ref)}
							>
								{"areaId" in ref || ref.kind === "area"
									? "Show on map"
									: "Open source"}
							</button>
							<button
								type="button"
								aria-label={`Move objective ${index + 1} up`}
								disabled={index === 0}
								onClick={() =>
									update({
										objectives: moveStoryEntry(
											quest.objectives,
											index,
											index - 1,
										),
									})
								}
							>
								Move up
							</button>
							<button
								type="button"
								aria-label={`Move objective ${index + 1} down`}
								disabled={index === quest.objectives.length - 1}
								onClick={() =>
									update({
										objectives: moveStoryEntry(
											quest.objectives,
											index,
											index + 1,
										),
									})
								}
							>
								Move down
							</button>
							<button
								type="button"
								onClick={() =>
									update({
										objectives: [
											...quest.objectives.slice(0, index + 1),
											{
												...structuredClone(objective),
												id: makeDialogueId("objective"),
											},
											...quest.objectives.slice(index + 1),
										],
									})
								}
							>
								Duplicate objective
							</button>
							<button
								type="button"
								onClick={() =>
									update({
										objectives: quest.objectives.filter(
											(o) => o.id !== objective.id,
										),
									})
								}
							>
								Delete objective
							</button>
						</div>
						<ObjectiveFields objective={objective}>
							{advancedFields(objective)}
						</ObjectiveFields>
					</article>
				);
			})}
			{recipe && (
				<StoryDialog
					label="Fetch Quest recipe"
					onClose={() => setRecipe(false)}
				>
					<label>
						Quest giver
						<select
							value={characterKey}
							onChange={(e) => {
								setCharacterKey(e.target.value);
								setPreview(undefined);
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
						Item
						<select
							value={itemId}
							onChange={(e) => {
								setItemId(e.target.value);
								setPreview(undefined);
							}}
						>
							<option value="">Choose item</option>
							{project.items.map((i) => (
								<option key={i.id} value={i.id}>
									{i.name}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						onClick={() => {
							const character = entities.find(
								(e) => entityKey(e.ref) === characterKey,
							);
							if (character)
								setPreview(
									makeFetchObjectives(project, character.ref, {
										kind: "item",
										id: itemId,
									}),
								);
						}}
						disabled={!characterKey || !itemId}
					>
						Preview fetch quest
					</button>
					{preview ? (
						<>
							<ol>
								{preview.map((o) => (
									<li key={o.id}>{o.description}</li>
								))}
							</ol>
							<p>
								Append these two steps to “{quest.name}”. A second Talk step
								would reuse the same remembered fact; this recipe does not
								require a return visit. Quest order remains{" "}
								{quest.objectiveMode === "sequence"
									? "in order"
									: "any order, all required"}
								.
							</p>
							<button
								type="button"
								onClick={() => {
									update({ objectives: [...quest.objectives, ...preview] });
									setRecipe(false);
								}}
							>
								Insert fetch steps
							</button>
						</>
					) : (
						<p>
							Choose a character with a valid conversation or message, and an
							item.
						</p>
					)}
				</StoryDialog>
			)}
		</>
	);
}
