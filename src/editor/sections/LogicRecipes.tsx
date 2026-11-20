import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameProject, GameRule } from "../../types/game";
import { StoryDialog } from "./DialogueEntityControls";
import {
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
} from "./dialogueEntities";
import {
	directBehaviourWarning,
	type LogicRecipeInput,
	makeLogicRecipe,
} from "./logicBlocksModel";

export function LogicRecipes({
	project,
	selected,
	onCreated,
}: {
	project: GameProject;
	selected?: DialogueEntityRef;
	onCreated: (id: string) => void;
}) {
	const [kind, setKind] = useState<"locked" | "npc">(),
		[targetKey, setTargetKey] = useState(""),
		[itemId, setItemId] = useState(""),
		[flag, setFlag] = useState(""),
		[destinationKey, setDestinationKey] = useState(""),
		[cutsceneId, setCutsceneId] = useState("");
	const [preview, setPreview] = useState<{
		input: LogicRecipeInput;
		rule: GameRule;
	}>();
	const entities = dialogueEntities(project);
	const select = (
		label: string,
		value: string,
		set: (value: string) => void,
		kinds: DialogueEntityRef["kind"][],
		keys = false,
	) => (
		<label>
			{label}
			<select
				value={value}
				onChange={(e) => {
					set(e.target.value);
					setPreview(undefined);
				}}
			>
				<option value="">Choose {label.toLowerCase()}</option>
				{entities
					.filter((e) => kinds.includes(e.ref.kind))
					.map((e) => (
						<option
							key={entityKey(e.ref)}
							value={keys ? entityKey(e.ref) : e.ref.id}
						>
							{e.label}
						</option>
					))}
			</select>
		</label>
	);
	return (
		<>
			<div className="dialogue-toolbar">
				<button
					type="button"
					onClick={() => {
						setKind("locked");
						setTargetKey(selected ? entityKey(selected) : "");
						setPreview(undefined);
					}}
				>
					Locked Passage recipe
				</button>
				<button
					type="button"
					onClick={() => {
						setKind("npc");
						setTargetKey(selected?.kind === "npc" ? entityKey(selected) : "");
						setPreview(undefined);
					}}
				>
					Conditional NPC recipe
				</button>
			</div>
			{kind && (
				<StoryDialog
					label={
						kind === "locked"
							? "Locked Passage recipe"
							: "Conditional NPC recipe"
					}
					onClose={() => setKind(undefined)}
				>
					{select(
						"Target",
						targetKey,
						setTargetKey,
						kind === "npc" ? ["npc"] : ["object", "npc", "event"],
						true,
					)}
					{kind === "locked" ? (
						<>
							{select("Key", itemId, setItemId, ["item"])}
							{select(
								"Destination",
								destinationKey,
								setDestinationKey,
								["event"],
								true,
							)}
						</>
					) : (
						select("Permission state", flag, setFlag, ["flag"])
					)}
					{select("Story moment", cutsceneId, setCutsceneId, ["cutscene"])}
					<p>
						{kind === "locked"
							? "This rule-driven passage teleports and does not produce native door_used facts. Use actual Door behavior for a Use Door objective."
							: "This rule can play a warning when permission is No. It does not cancel the character’s direct dialogue."}
					</p>
					<button
						type="button"
						onClick={() => {
							const target = entities.find(
								(e) => entityKey(e.ref) === targetKey,
							)?.ref;
							if (!target) return;
							const input: LogicRecipeInput = {
								kind,
								target,
								itemId,
								flag,
								cutsceneId,
								destination: entities.find(
									(e) => entityKey(e.ref) === destinationKey,
								)?.ref,
							};
							const rule = makeLogicRecipe(project, input);
							if (rule) setPreview({ input, rule });
						}}
					>
						Preview rule
					</button>
					{preview && (
						<section aria-label="Rule recipe preview">
							<p>
								Create “{preview.rule.name}” with one condition and{" "}
								{kind === "locked"
									? "Go to in THEN, Play story moment in ELSE"
									: "Play story moment in THEN"}
								.
							</p>
							<p>{directBehaviourWarning(project, preview.rule.trigger)}</p>
							<button
								type="button"
								onClick={() => {
									const current = useProjectStore.getState();
									if (!makeLogicRecipe(current.project, preview.input)) return;
									current.updateProject((draft) =>
										draft.rules.push(preview.rule),
									);
									onCreated(preview.rule.id);
									setKind(undefined);
								}}
							>
								Create rule from recipe
							</button>
						</section>
					)}
				</StoryDialog>
			)}
		</>
	);
}
