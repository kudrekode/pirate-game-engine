import type { GameAction, GameProject } from "../../types/game";
import {
	DialogueActionFields,
	makeDialogueAction,
} from "./DialogueActionFields";
import { DialogueWiringChip } from "./DialogueEntityControls";
import { type DialogueEntityRef, entityAction } from "./dialogueEntities";
import { StoryEntityInsert } from "./StoryEntityInsert";

export const STORY_ORDER_MIME = "application/x-adventure-story-order";
export function readStoryOrder(raw: string, owner: string): string | undefined {
	try {
		const data = JSON.parse(raw);
		if (data.owner === owner && typeof data.id === "string") return data.id;
	} catch {
		/* unrelated drag */
	}
}
export function moveStoryEntry<T>(entries: T[], from: number, to: number): T[] {
	if (from < 0 || to < 0 || from >= entries.length || to >= entries.length)
		return entries;
	const result = [...entries];
	const [entry] = result.splice(from, 1);
	result.splice(to, 0, entry);
	return result;
}

export function StoryActionStack({
	project,
	actions,
	selected,
	label,
	ownerKey,
	ownerExists,
	readActions,
	writeActions,
}: {
	project: GameProject;
	actions: GameAction[];
	selected?: DialogueEntityRef;
	label: string;
	ownerKey: string;
	ownerExists: (draft: GameProject) => boolean;
	readActions: (draft: GameProject) => GameAction[];
	writeActions: (actions: GameAction[], draft?: GameProject) => void;
}) {
	return (
		<section className="story-action-stack" aria-label={label}>
			<strong>{label}</strong>
			<p className="help-text">Effects run in the order shown.</p>
			{actions.map((action, index) => (
				// biome-ignore lint/a11y/noStaticElementInteractions: Drop target has alternative move buttons.
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: Actions have no persistent IDs and may be duplicates.
					key={index}
					className="story-action-row"
					data-story-field={`${label}:${index}`}
					onDragOver={(e) => {
						if (e.dataTransfer.types.includes(STORY_ORDER_MIME))
							e.preventDefault();
					}}
					onDrop={(e) => {
						const id = readStoryOrder(
							e.dataTransfer.getData(STORY_ORDER_MIME),
							ownerKey,
						);
						if (!id) return;
						e.preventDefault();
						e.stopPropagation();
						const from = actions.findIndex(
							(a, i) => JSON.stringify([i, a]) === id,
						);
						writeActions(moveStoryEntry(actions, from, index));
					}}
				>
					<button
						type="button"
						draggable
						aria-label={`Drag ${label} effect ${index + 1}`}
						onDragStart={(e) =>
							e.dataTransfer.setData(
								STORY_ORDER_MIME,
								JSON.stringify({
									owner: ownerKey,
									id: JSON.stringify([index, action]),
								}),
							)
						}
					>
						{index + 1} ↕
					</button>
					<DialogueWiringChip
						project={project}
						value={action}
						onChange={(next) =>
							writeActions(
								actions.map((a, i) => (i === index ? (next as GameAction) : a)),
							)
						}
						controls={
							<>
								<button
									type="button"
									disabled={index === 0}
									aria-label={`Move ${label} effect ${index + 1} up`}
									onClick={() =>
										writeActions(moveStoryEntry(actions, index, index - 1))
									}
								>
									↑
								</button>
								<button
									type="button"
									disabled={index === actions.length - 1}
									aria-label={`Move ${label} effect ${index + 1} down`}
									onClick={() =>
										writeActions(moveStoryEntry(actions, index, index + 1))
									}
								>
									↓
								</button>
								<button
									type="button"
									aria-label={`Remove ${label} effect ${index + 1}`}
									onClick={() =>
										writeActions(actions.filter((_, i) => i !== index))
									}
								>
									Remove
								</button>
							</>
						}
					>
						<DialogueActionFields
							project={project}
							action={action}
							prefix={`${label} effect ${index + 1}`}
							onChange={(next) =>
								writeActions(actions.map((a, i) => (i === index ? next : a)))
							}
						/>
					</DialogueWiringChip>
				</div>
			))}
			<StoryEntityInsert
				project={project}
				selected={selected}
				slot="logic-action"
				label={`Add ${label} effect`}
				ownerExists={ownerExists}
				insert={(draft, ref, op) => {
					const action = entityAction(draft, ref, op);
					if (action) writeActions([...readActions(draft), action], draft);
				}}
			/>
			<button
				type="button"
				onClick={() =>
					writeActions([...actions, makeDialogueAction("set_flag", project)])
				}
			>
				Add advanced effect
			</button>
		</section>
	);
}
