import type { ReactNode } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	ConditionExpression,
	GameProject,
	GameRule,
	SingleCondition,
} from "../../types/game";
import type { DialogueEntityRef } from "./dialogueEntities";
import { openEntitySource } from "./editorSource";
import {
	appendLogicExpression,
	directBehaviourWarning,
	editLogicExpression,
	findLogicExpression,
	logicConditionLabel,
	logicConditionOptions,
	logicGroup,
	makeEntityTrigger,
	makeLogicCondition,
	moveLogicExpression,
	removeLogicExpression,
	triggerEntityOptions,
	triggerLabel,
	triggerReference,
} from "./logicBlocksModel";
import {
	moveStoryEntry,
	readStoryOrder,
	STORY_ORDER_MIME,
	StoryActionStack,
} from "./StoryActionStack";
import { StoryEntityInsert } from "./StoryEntityInsert";

export function LogicBlocks({
	project,
	rule,
	selected,
	update,
	advancedTrigger,
	advancedCondition,
}: {
	project: GameProject;
	rule: GameRule;
	selected?: DialogueEntityRef;
	update: (rule: GameRule) => void;
	advancedTrigger: ReactNode;
	advancedCondition: (condition: SingleCondition) => ReactNode;
}) {
	const owner = `rule:${rule.id}:conditions`;
	const existing = (p: GameProject) => p.rules.find((r) => r.id === rule.id);
	const ref = triggerReference(project, rule.trigger),
		warning = directBehaviourWarning(project, rule.trigger);
	const groups: { id: string; label: string }[] = [];
	function collectGroups(
		expression: ConditionExpression | undefined,
		path = "IF",
	) {
		if (expression?.type !== "group") return;
		groups.push({
			id: expression.id,
			label: `${path} ${expression.operator === "AND" ? "ALL" : "ANY"}`,
		});
		expression.conditions.forEach(
			(child, i) => void collectGroups(child, `${path}.${i + 1}`),
		);
	}
	collectGroups(rule.conditionTree);
	const updateTree = (tree: ConditionExpression | undefined) =>
		update({ ...rule, conditionTree: tree });
	function insertCondition(groupId?: string, label = "Add IF condition") {
		return (
			<StoryEntityInsert
				project={project}
				selected={selected}
				slot="logic-condition"
				label={label}
				options={logicConditionOptions}
				ownerExists={(p) =>
					Boolean(existing(p)) &&
					(!groupId ||
						findLogicExpression(existing(p)?.conditionTree, groupId)?.type ===
							"group")
				}
				insert={(draft, entity, operation) => {
					const condition = makeLogicCondition(draft, entity, operation);
					if (condition) {
						const current = existing(draft)!;
						current.conditionTree = appendLogicExpression(
							current.conditionTree,
							condition,
							groupId,
						);
					}
				}}
			/>
		);
	}
	function expressionBlock(
		expression: ConditionExpression,
		path: string,
		parent?: Extract<ConditionExpression, { type: "group" }>,
		index = 0,
	): ReactNode {
		const group = expression.type === "group";
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Drop target has alternative move controls.
			<div
				key={expression.id}
				className={`story-logic-expression ${group ? "story-logic-group" : "story-logic-leaf"}`}
				data-story-field={`condition:${expression.id}`}
				onDragOver={(e) => {
					if (e.dataTransfer.types.includes(STORY_ORDER_MIME)) {
						e.preventDefault();
						e.stopPropagation();
					}
				}}
				onDrop={(e) => {
					const id = readStoryOrder(
						e.dataTransfer.getData(STORY_ORDER_MIME),
						owner,
					);
					if (!id || !rule.conditionTree || (!group && !parent)) return;
					e.preventDefault();
					e.stopPropagation();
					updateTree(
						moveLogicExpression(
							rule.conditionTree,
							id,
							group ? expression.id : parent!.id,
							group ? undefined : expression.id,
						),
					);
				}}
			>
				<div className="story-step-title">
					{parent && (
						<button
							type="button"
							draggable
							aria-label={`Drag ${path}`}
							onDragStart={(e) => {
								e.stopPropagation();
								e.dataTransfer.setData(
									STORY_ORDER_MIME,
									JSON.stringify({ owner, id: expression.id }),
								);
							}}
						>
							↕
						</button>
					)}
					{group ? (
						<label>
							{path}
							<select
								aria-label={`${path} match`}
								value={expression.operator}
								onChange={(e) =>
									updateTree(
										editLogicExpression(
											rule.conditionTree!,
											expression.id,
											(value) =>
												value.type === "group"
													? {
															...value,
															operator: e.target.value as "AND" | "OR",
														}
													: value,
										),
									)
								}
							>
								<option value="AND">ALL</option>
								<option value="OR">ANY</option>
							</select>
						</label>
					) : (
						<strong>{logicConditionLabel(project, expression)}</strong>
					)}
				</div>
				{group ? (
					<>
						{expression.conditions.length === 0 && (
							<p role="status" className="validation-message">
								Empty condition group currently passes.
							</p>
						)}
						{expression.conditions.map((child, i) =>
							expressionBlock(child, `${path}.${i + 1}`, expression, i),
						)}
						{insertCondition(expression.id, `Add ${path} condition`)}
						<div className="dialogue-toolbar">
							{(["AND", "OR"] as const).map((operator) => (
								<button
									type="button"
									key={operator}
									onClick={() =>
										updateTree(
											appendLogicExpression(
												rule.conditionTree,
												logicGroup(operator),
												expression.id,
											),
										)
									}
								>
									Add {operator === "AND" ? "ALL" : "ANY"} group
								</button>
							))}
						</div>
					</>
				) : (
					<details>
						<summary>Advanced condition fields</summary>
						{advancedCondition(expression)}
					</details>
				)}
				<div className="dialogue-toolbar">
					{parent && (
						<>
							<button
								type="button"
								aria-label={`Move ${path} up`}
								disabled={index === 0}
								onClick={() =>
									updateTree(
										editLogicExpression(
											rule.conditionTree!,
											parent.id,
											(value) =>
												value.type === "group"
													? {
															...value,
															conditions: moveStoryEntry(
																value.conditions,
																index,
																index - 1,
															),
														}
													: value,
										),
									)
								}
							>
								↑
							</button>
							<button
								type="button"
								aria-label={`Move ${path} down`}
								disabled={index === parent.conditions.length - 1}
								onClick={() =>
									updateTree(
										editLogicExpression(
											rule.conditionTree!,
											parent.id,
											(value) =>
												value.type === "group"
													? {
															...value,
															conditions: moveStoryEntry(
																value.conditions,
																index,
																index + 1,
															),
														}
													: value,
										),
									)
								}
							>
								↓
							</button>
							<label>
								Move to group
								<select
									aria-label={`Move ${path} to group`}
									value=""
									onChange={(e) => {
										if (e.target.value)
											updateTree(
												moveLogicExpression(
													rule.conditionTree!,
													expression.id,
													e.target.value,
												),
											);
									}}
								>
									<option value="">Choose group</option>
									{groups
										.filter(
											(g) =>
												g.id !== parent.id &&
												!findLogicExpression(expression, g.id),
										)
										.map((g) => (
											<option key={g.id} value={g.id}>
												{g.label}
											</option>
										))}
								</select>
							</label>
						</>
					)}
					<button
						type="button"
						aria-label={`Remove ${path}`}
						onClick={() =>
							updateTree(
								removeLogicExpression(rule.conditionTree, expression.id),
							)
						}
					>
						Remove {group ? "group" : "condition"}
					</button>
				</div>
			</div>
		);
	}
	return (
		<div className="story-logic-blocks">
			<section className="story-when" data-story-field="trigger">
				<h3>WHEN</h3>
				<strong>{triggerLabel(project, rule.trigger)}</strong>
				{ref && (
					<button type="button" onClick={() => openEntitySource(ref)}>
						Open trigger source
					</button>
				)}
				<StoryEntityInsert
					project={project}
					selected={selected}
					slot="trigger"
					label="Choose WHEN entity"
					options={triggerEntityOptions}
					ownerExists={(p) => Boolean(existing(p))}
					insert={(draft, entity, operation) => {
						const trigger = makeEntityTrigger(draft, entity, operation);
						if (trigger) existing(draft)!.trigger = trigger;
					}}
				/>
				<button
					type="button"
					onClick={() =>
						update({ ...rule, trigger: { type: "on_game_start" } })
					}
				>
					When a new game starts
				</button>
				<details>
					<summary>Advanced trigger fields</summary>
					{advancedTrigger}
				</details>
				{warning && (
					<p className="validation-message" role="status">
						{warning}
					</p>
				)}
			</section>
			<section className="story-if">
				<h3>IF</h3>
				{rule.conditionTree ? (
					expressionBlock(rule.conditionTree, "IF")
				) : (
					<>
						<p>Always passes until you add a condition.</p>
						{insertCondition()}
						<button type="button" onClick={() => updateTree(logicGroup("AND"))}>
							Add ALL group
						</button>
						<button type="button" onClick={() => updateTree(logicGroup("OR"))}>
							Add ANY group
						</button>
					</>
				)}
			</section>
			{(["actions", "elseActions"] as const).map((field) => (
				<StoryActionStack
					key={field}
					project={project}
					actions={rule[field] ?? []}
					selected={selected}
					label={field === "actions" ? "THEN" : "ELSE"}
					ownerKey={`${rule.id}:${field}`}
					ownerExists={(p) => Boolean(existing(p))}
					readActions={(p) => existing(p)?.[field] ?? []}
					writeActions={(actions, draft) => {
						if (draft) existing(draft)![field] = actions;
						else update({ ...rule, [field]: actions });
					}}
				/>
			))}
			<p className="help-text">
				ELSE runs only when IF fails. On a once rule, ELSE does not consume the
				once state; a successful THEN consumes it after its actions finish.
			</p>
		</div>
	);
}
