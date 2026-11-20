import { useState } from "react";
import { resolveObjectBehaviour } from "../../runtime/interactionDiscovery";
import {
	type EditorSource,
	useProjectStore,
} from "../../store/useProjectStore";
import type { GameProject } from "../../types/game";
import { StoryDialog } from "./DialogueEntityControls";
import { DialogueQuestGiver } from "./DialogueQuestGiver";
import {
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { makeDialogueId } from "./dialogueGraphModel";
import { makeEntityTrigger } from "./logicBlocksModel";
import {
	addContextResponse,
	commitStoryFetch,
	configureKeyedPassage,
	createCharacterConversation,
	previewStoryFetch,
	type StoryFetchPreview,
} from "./storyRecipes";

export function StoryContextActions({
	project,
	selected,
}: {
	project: GameProject;
	selected: DialogueEntityRef;
}) {
	const [createdSource, setCreatedSource] = useState<EditorSource>();
	const [mode, setMode] = useState<"fetch" | "keyed" | "quest" | "response">();
	const [itemId, setItemId] = useState(
		selected.kind === "item" ? selected.id : "",
	);
	const [questId, setQuestId] = useState(""),
		[destinationKey, setDestinationKey] = useState("");
	const [dialogueId, setDialogueId] = useState(
			selected.kind === "dialogue" ? selected.id : "",
		),
		[nodeId, setNodeId] = useState(""),
		[targetId, setTargetId] = useState(""),
		[response, setResponse] = useState("I can help.");
	const [questName, setQuestName] = useState("Fetch quest"),
		[preview, setPreview] = useState<StoryFetchPreview>(),
		[reviewed, setReviewed] = useState(false);
	const entities = dialogueEntities(project),
		entity = resolveDialogueEntity(project, selected);
	const open = useProjectStore.getState().openEditorSource;
	const object =
		selected.kind === "object"
			? project.areas
					.find((a) => a.id === selected.areaId)
					?.objects.find((o) => o.id === selected.id)
			: undefined;
	const door =
		object && resolveObjectBehaviour(project, object).type === "door";
	function begin(next: typeof mode) {
		setMode(next);
		setPreview(undefined);
		setReviewed(false);
	}
	const choices =
		project.dialogues
			.find((d) => d.id === dialogueId)
			?.nodes.filter((n) => n.type === "choice") ?? [];
	const destinations =
		project.dialogues.find((d) => d.id === dialogueId)?.nodes ?? [];
	const createdDialogue =
		createdSource?.section === "dialogues"
			? project.dialogues.find((d) => d.id === createdSource.id)
			: undefined;
	const createdNode = createdDialogue?.nodes.find(
		(n) => n.id === createdSource?.nodeId,
	);
	const createdExists =
		createdSource?.section === "dialogues"
			? Boolean(
					createdDialogue &&
						(!createdSource.nodeId || createdNode) &&
						(!createdSource.field?.startsWith("choice:") ||
							(createdNode?.type === "choice" &&
								createdNode.choices.some(
									(c) => `choice:${c.id}` === createdSource.field,
								))),
				)
			: project.rules.some((r) => r.id === createdSource?.id);
	const questSelect = (
		<label>
			Quest
			<select
				aria-label="Quest"
				value={questId}
				onChange={(e) => {
					setQuestId(e.target.value);
					setReviewed(false);
				}}
			>
				<option value="">
					{mode === "keyed" ? "No quest objective" : "Choose quest"}
				</option>
				{project.quests.map((q) => (
					<option key={q.id} value={q.id}>
						{q.name}
					</option>
				))}
			</select>
		</label>
	);
	return (
		<div className="story-context-actions">
			<h3>Create from here</h3>
			{createdSource && (
				<button
					type="button"
					disabled={!createdExists}
					onClick={() => open(createdSource)}
				>
					Open created content
				</button>
			)}
			{selected.kind === "npc" && (
				<>
					<button
						type="button"
						onClick={() => {
							let id = "";
							useProjectStore.getState().updateProject((p) => {
								id = createCharacterConversation(p, selected)?.id ?? "";
							});
							if (id)
								setCreatedSource({
									section: "dialogues",
									id,
									entityKey: entityKey(selected),
								});
						}}
					>
						Create conversation
					</button>
					<DialogueQuestGiver
						project={project}
						selected={selected}
						onCreated={(id) => setCreatedSource({ section: "dialogues", id })}
					/>
					<button type="button" onClick={() => begin("fetch")}>
						Fetch Quest
					</button>
				</>
			)}
			{["npc", "object", "event"].includes(selected.kind) && (
				<button
					type="button"
					onClick={() => {
						let id = "";
						useProjectStore.getState().updateProject((draft) => {
							const trigger = makeEntityTrigger(draft, selected, "on_interact");
							if (!trigger) return;
							id = makeDialogueId("rule");
							draft.rules.push({
								id,
								name: `Interact with ${entity?.name ?? "target"}`,
								enabled: true,
								trigger,
								actions: [],
							});
						});
						if (id) setCreatedSource({ section: "progression", id });
					}}
				>
					Add interaction rule
				</button>
			)}
			{["npc", "object", "item", "flag", "event", "area"].includes(
				selected.kind,
			) && (
				<button type="button" onClick={() => begin("quest")}>
					{door ? "Add Use Door objective" : "Add to quest"}
				</button>
			)}
			{door && (
				<button type="button" onClick={() => begin("keyed")}>
					Keyed Passage
				</button>
			)}
			{["item", "flag", "quest", "dialogue"].includes(selected.kind) && (
				<button type="button" onClick={() => begin("response")}>
					Add conditional response
				</button>
			)}
			{mode === "quest" && (
				<StoryDialog label="Add to quest" onClose={() => setMode(undefined)}>
					{questSelect}
					<p>
						Open the selected sequence with this entity ready in its objective
						slot.
					</p>
					<button
						type="button"
						disabled={!questId}
						onClick={() =>
							open({
								section: "quests",
								id: questId,
								field: "objectives",
								entityKey: entityKey(selected),
							})
						}
					>
						Open quest sequence
					</button>
				</StoryDialog>
			)}
			{mode === "fetch" && (
				<StoryDialog label="Fetch Quest" onClose={() => setMode(undefined)}>
					<label>
						Quest name
						<input
							value={questName}
							onChange={(e) => {
								setQuestName(e.target.value);
								setPreview(undefined);
							}}
						/>
					</label>
					<label>
						Item
						<select
							aria-label="Item"
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
						disabled={!itemId || !questName.trim()}
						onClick={() =>
							setPreview(
								previewStoryFetch(
									project,
									selected,
									{ kind: "item", id: itemId },
									questName,
								),
							)
						}
					>
						Preview fetch story
					</button>
					{preview && (
						<section aria-label="Fetch story preview">
							<p>
								Create “{preview.quest.name}”, its Talk → Have Item sequence,
								and a new Yes/No conversation assigned to {entity?.label}.
								Replace the placement's interaction and completion effects. Yes
								starts the quest; No and early close do not.
							</p>
							<p>
								This recipe does not require a return visit. Repeating the same
								Talk fact would not mean “talk again later”.
							</p>
							<button
								type="button"
								onClick={() => {
									let created = false;
									useProjectStore.getState().updateProject((p) => {
										created = commitStoryFetch(p, preview);
									});
									if (created) setMode(undefined);
								}}
							>
								Create fetch story
							</button>
						</section>
					)}
				</StoryDialog>
			)}
			{mode === "keyed" && (
				<StoryDialog label="Keyed Passage" onClose={() => setMode(undefined)}>
					<label>
						Required item
						<select
							aria-label="Required item"
							value={itemId}
							onChange={(e) => {
								setItemId(e.target.value);
								setReviewed(false);
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
					<label>
						Arrival point
						<select
							aria-label="Arrival point"
							value={destinationKey}
							onChange={(e) => {
								setDestinationKey(e.target.value);
								setReviewed(false);
							}}
						>
							<option value="">Choose destination</option>
							{entities
								.filter((e) => e.ref.kind === "event")
								.map((e) => (
									<option key={entityKey(e.ref)} value={entityKey(e.ref)}>
										{e.label}
									</option>
								))}
						</select>
					</label>
					{questSelect}
					<button
						type="button"
						disabled={!itemId || !destinationKey}
						onClick={() => setReviewed(true)}
					>
						Preview keyed passage
					</button>
					{reviewed && (
						<section aria-label="Keyed passage preview">
							<p>
								Set this placement's native Door to require{" "}
								{project.items.find((i) => i.id === itemId)?.name} and travel to{" "}
								{
									entities.find((e) => entityKey(e.ref) === destinationKey)
										?.label
								}
								.
								{questId
									? " Append one Use Door objective to the selected quest."
									: ""}{" "}
								Enable the native Door interaction if it is disabled. The key is
								retained; this does not create a persistent unlocked state.
							</p>
							<button
								type="button"
								onClick={() => {
									const destination = entities.find(
										(e) => entityKey(e.ref) === destinationKey,
									)?.ref;
									if (!destination) return;
									let done = false;
									useProjectStore.getState().updateProject((p) => {
										done = configureKeyedPassage(p, {
											door: selected,
											itemId,
											destination,
											questId: questId || undefined,
										});
									});
									if (done) setMode(undefined);
								}}
							>
								Configure passage
							</button>
						</section>
					)}
				</StoryDialog>
			)}
			{mode === "response" && (
				<StoryDialog
					label="Add conditional response"
					onClose={() => setMode(undefined)}
				>
					<label>
						Conversation
						<select
							aria-label="Conversation"
							value={dialogueId}
							onChange={(e) => {
								setDialogueId(e.target.value);
								setNodeId("");
								setTargetId("");
							}}
						>
							<option value="">Choose conversation</option>
							{project.dialogues.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Choice node
						<select
							aria-label="Choice node"
							value={nodeId}
							onChange={(e) => setNodeId(e.target.value)}
						>
							<option value="">Choose question</option>
							{choices.map((n) => (
								<option key={n.id} value={n.id}>
									{n.text || "Choice"}
								</option>
							))}
						</select>
					</label>
					<label>
						Response text
						<input
							value={response}
							onChange={(e) => setResponse(e.target.value)}
						/>
					</label>
					<label>
						Destination node
						<select
							aria-label="Destination node"
							value={targetId}
							onChange={(e) => setTargetId(e.target.value)}
						>
							<option value="">Choose destination</option>
							{destinations.map((n) => (
								<option key={n.id} value={n.id}>
									{n.text || n.type}
								</option>
							))}
						</select>
					</label>
					<p>
						Add an ordinary response, then choose its conditions in the Dialogue
						editor. Until a condition is added, this response is always visible.
					</p>
					<button
						type="button"
						disabled={!nodeId || !targetId || !response.trim()}
						onClick={() => {
							let choiceId = "";
							useProjectStore.getState().updateProject((p) => {
								choiceId =
									addContextResponse(p, dialogueId, nodeId, response, targetId)
										?.id ?? "";
							});
							if (choiceId) {
								setCreatedSource({
									section: "dialogues",
									id: dialogueId,
									nodeId,
									field: `choice:${choiceId}`,
									entityKey: entityKey(selected),
								});
								setMode(undefined);
							}
						}}
					>
						Create response
					</button>
				</StoryDialog>
			)}
		</div>
	);
}
