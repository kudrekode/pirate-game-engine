import { useEffect, useMemo, useState } from "react";
import { portraitPresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	DialogueChoice,
	DialogueCondition,
	DialogueDefinition,
	DialogueNode,
	GameAction,
	QuestStatus,
	VariableComparisonOperator,
} from "../../types/game";

const nodeTypes: DialogueNode["type"][] = ["text", "choice", "end"];
const comparisonOperators: VariableComparisonOperator[] = [
	"==",
	"!=",
	">",
	"<",
	">=",
	"<=",
];

function makeId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}`;
}

function replaceNode(
	dialogue: DialogueDefinition,
	nodeId: string,
	nextNode: DialogueNode,
): DialogueDefinition {
	return {
		...dialogue,
		nodes: dialogue.nodes.map((node) => (node.id === nodeId ? nextNode : node)),
	};
}

function makeNode(type: DialogueNode["type"]): DialogueNode {
	const id = makeId("node");
	if (type === "choice") {
		return { id, type, text: "Choose a response.", choices: [] };
	}
	if (type === "end") {
		return { id, type, text: "Goodbye." };
	}
	return { id, type, text: "New dialogue line." };
}

function makeChoice(): DialogueChoice {
	return {
		id: makeId("choice"),
		targetNodeId: "",
		text: "New choice",
	};
}

function makeCondition(type: DialogueCondition["type"]): DialogueCondition {
	if (type === "variable_compare") {
		return { type, variable: "gold", operator: ">=", value: 1 };
	}
	if (type === "has_item" || type === "not_has_item") {
		return { type, itemId: "", quantity: 1 };
	}
	if (type === "quest_status") {
		return { type, questId: "", status: "active" };
	}
	return { type: "flag_is", flag: "flag_1", value: true };
}

function makeAction(type: GameAction["type"]): GameAction {
	if (type === "give_item" || type === "remove_item") {
		return { type, itemId: "", quantity: 1 };
	}
	if (type === "change_variable") {
		return { type, variable: "gold", amount: 1 };
	}
	if (type === "set_variable") {
		return { type, variable: "gold", value: 1 };
	}
	if (type === "play_cutscene") {
		return { type, cutsceneId: "" };
	}
	if (type === "teleport") {
		return { type, areaId: "", eventBlockId: "" };
	}
	if (
		type === "activate_quest" ||
		type === "complete_quest" ||
		type === "fail_quest"
	) {
		return { type, questId: "" };
	}
	if (type === "open_shop") {
		return { type, shopId: "" };
	}
	if (type === "change_movement_mode") {
		return { type, mode: "walk" };
	}
	if (type === "set_npc_alignment") {
		return { type, npcId: "", alignment: "friendly" };
	}
	if (type === "set_npc_health") {
		return { type, npcId: "", value: 100 };
	}
	if (type === "end_game") {
		return { type };
	}
	return { type: "set_flag", flag: "flag_1", value: true };
}

function nodeTitle(node: DialogueNode): string {
	const text =
		node.type === "choice" ? (node.text ?? "Choice") : (node.text ?? "");
	return `${node.type}: ${text.slice(0, 34) || node.id}`;
}

export function DialogueEditor() {
	const project = useProjectStore((state) => state.project);
	const addDialogue = useProjectStore((state) => state.addDialogue);
	const updateDialogue = useProjectStore((state) => state.updateDialogue);
	const deleteDialogue = useProjectStore((state) => state.deleteDialogue);
	const [selectedDialogueId, setSelectedDialogueId] = useState(
		project.dialogues[0]?.id ?? "",
	);
	const [selectedNodeId, setSelectedNodeId] = useState("");

	const selectedDialogue = useMemo(
		() =>
			project.dialogues.find((dialogue) => dialogue.id === selectedDialogueId),
		[project.dialogues, selectedDialogueId],
	);
	const selectedNode = useMemo(
		() =>
			selectedDialogue?.nodes.find((node) => node.id === selectedNodeId) ??
			selectedDialogue?.nodes[0],
		[selectedDialogue, selectedNodeId],
	);

	useEffect(() => {
		if (!selectedDialogue && project.dialogues.length > 0) {
			setSelectedDialogueId(project.dialogues[0].id);
		}
	}, [project.dialogues, selectedDialogue]);

	useEffect(() => {
		if (selectedDialogue && !selectedNode) {
			setSelectedNodeId(selectedDialogue.nodes[0]?.id ?? "");
		}
	}, [selectedDialogue, selectedNode]);

	function updateSelectedDialogue(patch: Partial<DialogueDefinition>) {
		if (selectedDialogue) {
			updateDialogue(selectedDialogue.id, patch);
		}
	}

	function updateSelectedNode(nextNode: DialogueNode) {
		if (!selectedDialogue) {
			return;
		}
		updateDialogue(
			selectedDialogue.id,
			replaceNode(selectedDialogue, nextNode.id, nextNode),
		);
	}

	function addNode(type: DialogueNode["type"]) {
		if (!selectedDialogue) {
			return;
		}
		const node = makeNode(type);
		updateDialogue(selectedDialogue.id, {
			nodes: [...selectedDialogue.nodes, node],
			startNodeId: selectedDialogue.startNodeId || node.id,
		});
		setSelectedNodeId(node.id);
	}

	function deleteSelectedNode() {
		if (
			!selectedDialogue ||
			!selectedNode ||
			selectedDialogue.nodes.length <= 1
		) {
			return;
		}
		const nodes = selectedDialogue.nodes.filter(
			(node) => node.id !== selectedNode.id,
		);
		updateDialogue(selectedDialogue.id, {
			nodes,
			startNodeId:
				selectedDialogue.startNodeId === selectedNode.id
					? (nodes[0]?.id ?? "")
					: selectedDialogue.startNodeId,
		});
		setSelectedNodeId(nodes[0]?.id ?? "");
	}

	function updateChoice(choiceId: string, patch: Partial<DialogueChoice>) {
		if (selectedNode?.type !== "choice") {
			return;
		}
		updateSelectedNode({
			...selectedNode,
			choices: selectedNode.choices.map((choice) =>
				choice.id === choiceId ? { ...choice, ...patch } : choice,
			),
		});
	}

	function updateCondition(
		choice: DialogueChoice,
		index: number,
		condition: DialogueCondition,
	) {
		const conditions = [...(choice.conditions ?? [])];
		conditions[index] = condition;
		updateChoice(choice.id, { conditions });
	}

	function updateAction(index: number, action: GameAction) {
		if (!selectedNode) {
			return;
		}
		const actions = [...(selectedNode.actions ?? [])];
		actions[index] = action;
		updateSelectedNode({ ...selectedNode, actions });
	}

	function renderCondition(
		choice: DialogueChoice,
		condition: DialogueCondition,
		index: number,
	) {
		return (
			<div className="state-row variable" key={`${choice.id}:${index}`}>
				<select
					aria-label={`Condition ${index + 1} type`}
					onChange={(event) =>
						updateCondition(
							choice,
							index,
							makeCondition(event.target.value as DialogueCondition["type"]),
						)
					}
					value={condition.type}
				>
					<option value="flag_is">Flag is</option>
					<option value="variable_compare">Variable compare</option>
					<option value="has_item">Has item</option>
					<option value="not_has_item">Does not have item</option>
					<option value="quest_status">Quest status</option>
				</select>
				{condition.type === "flag_is" ? (
					<>
						<input
							aria-label={`Condition ${index + 1} flag`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									flag: event.target.value,
								})
							}
							value={condition.flag}
						/>
						<select
							aria-label={`Condition ${index + 1} value`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									value: event.target.value === "true",
								})
							}
							value={String(condition.value)}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					</>
				) : null}
				{condition.type === "variable_compare" ? (
					<>
						<input
							aria-label={`Condition ${index + 1} variable`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									variable: event.target.value,
								})
							}
							value={condition.variable}
						/>
						<select
							aria-label={`Condition ${index + 1} operator`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									operator: event.target.value as VariableComparisonOperator,
								})
							}
							value={condition.operator}
						>
							{comparisonOperators.map((operator) => (
								<option key={operator} value={operator}>
									{operator}
								</option>
							))}
						</select>
						<input
							aria-label={`Condition ${index + 1} compare value`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									value: Number.isNaN(Number(event.target.value))
										? event.target.value
										: Number(event.target.value),
								})
							}
							value={String(condition.value)}
						/>
					</>
				) : null}
				{condition.type === "has_item" || condition.type === "not_has_item" ? (
					<>
						<select
							aria-label={`Condition ${index + 1} item`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									itemId: event.target.value,
								})
							}
							value={condition.itemId}
						>
							<option value="">Select item</option>
							{project.items.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<input
							aria-label={`Condition ${index + 1} quantity`}
							min={1}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									quantity: Math.max(1, Number(event.target.value)),
								})
							}
							type="number"
							value={condition.quantity ?? 1}
						/>
					</>
				) : null}
				{condition.type === "quest_status" ? (
					<>
						<select
							aria-label={`Condition ${index + 1} quest`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									questId: event.target.value,
								})
							}
							value={condition.questId}
						>
							<option value="">Select quest</option>
							{project.quests.map((quest) => (
								<option key={quest.id} value={quest.id}>
									{quest.name}
								</option>
							))}
						</select>
						<select
							aria-label={`Condition ${index + 1} quest status`}
							onChange={(event) =>
								updateCondition(choice, index, {
									...condition,
									status: event.target.value as QuestStatus,
								})
							}
							value={condition.status}
						>
							<option value="inactive">Inactive</option>
							<option value="active">Active</option>
							<option value="completed">Completed</option>
							<option value="failed">Failed</option>
						</select>
					</>
				) : null}
				<button
					className="danger-button compact"
					onClick={() =>
						updateChoice(choice.id, {
							conditions: (choice.conditions ?? []).filter(
								(_, conditionIndex) => conditionIndex !== index,
							),
						})
					}
					type="button"
				>
					Delete
				</button>
			</div>
		);
	}

	function renderAction(action: GameAction, index: number) {
		return (
			<div className="state-row variable" key={`${action.type}:${index}`}>
				<select
					aria-label={`Action ${index + 1} type`}
					onChange={(event) =>
						updateAction(
							index,
							makeAction(event.target.value as GameAction["type"]),
						)
					}
					value={action.type}
				>
					<option value="set_flag">Set flag</option>
					<option value="give_item">Give item</option>
					<option value="remove_item">Remove item</option>
					<option value="activate_quest">Activate quest</option>
					<option value="complete_quest">Complete quest</option>
					<option value="play_cutscene">Play cutscene</option>
					<option value="teleport">Teleport</option>
					<option value="open_shop">Open shop</option>
					<option value="end_game">End game</option>
				</select>
				{action.type === "set_flag" ? (
					<>
						<input
							aria-label={`Action ${index + 1} flag`}
							onChange={(event) =>
								updateAction(index, { ...action, flag: event.target.value })
							}
							value={action.flag}
						/>
						<select
							aria-label={`Action ${index + 1} flag value`}
							onChange={(event) =>
								updateAction(index, {
									...action,
									value: event.target.value === "true",
								})
							}
							value={String(action.value)}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					</>
				) : null}
				{action.type === "give_item" || action.type === "remove_item" ? (
					<>
						<select
							aria-label={`Action ${index + 1} item`}
							onChange={(event) =>
								updateAction(index, { ...action, itemId: event.target.value })
							}
							value={action.itemId}
						>
							<option value="">Select item</option>
							{project.items.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<input
							aria-label={`Action ${index + 1} quantity`}
							min={1}
							onChange={(event) =>
								updateAction(index, {
									...action,
									quantity: Math.max(1, Number(event.target.value)),
								})
							}
							type="number"
							value={action.quantity}
						/>
					</>
				) : null}
				{action.type === "activate_quest" ||
				action.type === "complete_quest" ||
				action.type === "fail_quest" ? (
					<select
						aria-label={`Action ${index + 1} quest`}
						onChange={(event) =>
							updateAction(index, { ...action, questId: event.target.value })
						}
						value={action.questId}
					>
						<option value="">Select quest</option>
						{project.quests.map((quest) => (
							<option key={quest.id} value={quest.id}>
								{quest.name}
							</option>
						))}
					</select>
				) : null}
				{action.type === "play_cutscene" ? (
					<select
						aria-label={`Action ${index + 1} cutscene`}
						onChange={(event) =>
							updateAction(index, { ...action, cutsceneId: event.target.value })
						}
						value={action.cutsceneId}
					>
						<option value="">Select cutscene</option>
						{project.cutscenes.map((cutscene) => (
							<option key={cutscene.id} value={cutscene.id}>
								{cutscene.name}
							</option>
						))}
					</select>
				) : null}
				{action.type === "open_shop" ? (
					<select
						aria-label={`Action ${index + 1} shop`}
						onChange={(event) =>
							updateAction(index, { ...action, shopId: event.target.value })
						}
						value={action.shopId}
					>
						<option value="">Select shop</option>
						{project.shops.map((shop) => (
							<option key={shop.id} value={shop.id}>
								{shop.name}
							</option>
						))}
					</select>
				) : null}
				<button
					className="danger-button compact"
					onClick={() =>
						selectedNode &&
						updateSelectedNode({
							...selectedNode,
							actions: (selectedNode.actions ?? []).filter(
								(_, actionIndex) => actionIndex !== index,
							),
						})
					}
					type="button"
				>
					Delete
				</button>
			</div>
		);
	}

	function coerceNodeType(
		node: DialogueNode,
		type: DialogueNode["type"],
	): DialogueNode {
		if (node.type === type) {
			return node;
		}
		return { ...makeNode(type), id: node.id, speaker: node.speaker };
	}

	return (
		<section className="editor-panel cutscene-editor">
			<aside className="tool-panel">
				<div className="panel-title">Dialogues</div>
				<div className="list-stack">
					{project.dialogues.map((dialogue) => (
						<button
							className={`list-item ${selectedDialogueId === dialogue.id ? "selected" : ""}`}
							key={dialogue.id}
							onClick={() => {
								setSelectedDialogueId(dialogue.id);
								setSelectedNodeId(dialogue.nodes[0]?.id ?? "");
							}}
							type="button"
						>
							{dialogue.name}
						</button>
					))}
				</div>
				<button
					className="primary-button full-width"
					onClick={() => {
						const id = addDialogue();
						setSelectedDialogueId(id);
					}}
					type="button"
				>
					Add dialogue
				</button>
			</aside>

			<div className="content-panel">
				{selectedDialogue ? (
					<div className="cutscene-edit-layout">
						<div className="form-stack">
							<label>
								Name
								<input
									onChange={(event) =>
										updateSelectedDialogue({ name: event.target.value })
									}
									value={selectedDialogue.name}
								/>
							</label>
							<label>
								Starting node
								<select
									onChange={(event) =>
										updateSelectedDialogue({ startNodeId: event.target.value })
									}
									value={selectedDialogue.startNodeId}
								>
									{selectedDialogue.nodes.map((node) => (
										<option key={node.id} value={node.id}>
											{nodeTitle(node)}
										</option>
									))}
								</select>
							</label>
							<div className="panel-title secondary">Nodes</div>
							<div className="list-stack">
								{selectedDialogue.nodes.map((node) => (
									<button
										className={`list-item ${selectedNode?.id === node.id ? "selected" : ""}`}
										key={node.id}
										onClick={() => setSelectedNodeId(node.id)}
										type="button"
									>
										{nodeTitle(node)}
									</button>
								))}
							</div>
							<div className="segmented">
								{nodeTypes.map((type) => (
									<button
										key={type}
										onClick={() => addNode(type)}
										type="button"
									>
										Add {type}
									</button>
								))}
							</div>
							<button
								className="danger-button"
								onClick={() => {
									deleteDialogue(selectedDialogue.id);
									setSelectedDialogueId("");
								}}
								type="button"
							>
								Delete dialogue
							</button>
						</div>

						<div className="form-stack">
							{selectedNode ? (
								<>
									<div className="panel-title secondary">Node</div>
									<label>
										Type
										<select
											onChange={(event) =>
												updateSelectedNode(
													coerceNodeType(
														selectedNode,
														event.target.value as DialogueNode["type"],
													),
												)
											}
											value={selectedNode.type}
										>
											{nodeTypes.map((type) => (
												<option key={type} value={type}>
													{type}
												</option>
											))}
										</select>
									</label>
									<label>
										Speaker
										<input
											onChange={(event) =>
												updateSelectedNode({
													...selectedNode,
													speaker: event.target.value || undefined,
												})
											}
											value={selectedNode.speaker ?? ""}
										/>
									</label>
									<label>
										Portrait
										<select
											onChange={(event) =>
												updateSelectedNode({
													...selectedNode,
													portraitId: event.target.value || undefined,
												})
											}
											value={selectedNode.portraitId ?? ""}
										>
											<option value="">None</option>
											{portraitPresets.map((portrait) => (
												<option key={portrait.id} value={portrait.id}>
													{portrait.label}
												</option>
											))}
										</select>
									</label>
									{"text" in selectedNode ? (
										<label>
											Text
											<textarea
												onChange={(event) =>
													updateSelectedNode({
														...selectedNode,
														text: event.target.value,
													})
												}
												rows={5}
												value={selectedNode.text ?? ""}
											/>
										</label>
									) : null}
									{selectedNode.type === "text" ? (
										<label>
											Next node
											<select
												onChange={(event) =>
													updateSelectedNode({
														...selectedNode,
														nextNodeId: event.target.value || undefined,
													})
												}
												value={selectedNode.nextNodeId ?? ""}
											>
												<option value="">End conversation</option>
												{selectedDialogue.nodes
													.filter((node) => node.id !== selectedNode.id)
													.map((node) => (
														<option key={node.id} value={node.id}>
															{nodeTitle(node)}
														</option>
													))}
											</select>
										</label>
									) : null}
									{selectedNode.type === "choice" ? (
										<div className="form-stack">
											<div className="panel-title secondary">Choices</div>
											{selectedNode.choices.map((choice) => (
												<div className="content-card compact" key={choice.id}>
													<input
														aria-label={`Choice ${choice.id} text`}
														onChange={(event) =>
															updateChoice(choice.id, {
																text: event.target.value,
															})
														}
														value={choice.text}
													/>
													<select
														aria-label={`Choice ${choice.id} target`}
														onChange={(event) =>
															updateChoice(choice.id, {
																targetNodeId: event.target.value,
															})
														}
														value={choice.targetNodeId}
													>
														<option value="">End conversation</option>
														{selectedDialogue.nodes
															.filter((node) => node.id !== selectedNode.id)
															.map((node) => (
																<option key={node.id} value={node.id}>
																	{nodeTitle(node)}
																</option>
															))}
													</select>
													{(choice.conditions ?? []).map((condition, index) =>
														renderCondition(choice, condition, index),
													)}
													<button
														onClick={() =>
															updateChoice(choice.id, {
																conditions: [
																	...(choice.conditions ?? []),
																	makeCondition("flag_is"),
																],
															})
														}
														type="button"
													>
														Add condition
													</button>
													<button
														className="danger-button compact"
														onClick={() =>
															updateSelectedNode({
																...selectedNode,
																choices: selectedNode.choices.filter(
																	(candidate) => candidate.id !== choice.id,
																),
															})
														}
														type="button"
													>
														Delete choice
													</button>
												</div>
											))}
											<button
												onClick={() =>
													updateSelectedNode({
														...selectedNode,
														choices: [...selectedNode.choices, makeChoice()],
													})
												}
												type="button"
											>
												Add choice
											</button>
										</div>
									) : null}
									<div className="panel-title secondary">Actions on enter</div>
									{(selectedNode.actions ?? []).map(renderAction)}
									<button
										onClick={() =>
											updateSelectedNode({
												...selectedNode,
												actions: [
													...(selectedNode.actions ?? []),
													makeAction("set_flag"),
												],
											})
										}
										type="button"
									>
										Add action
									</button>
									<button
										className="danger-button"
										disabled={selectedDialogue.nodes.length <= 1}
										onClick={deleteSelectedNode}
										type="button"
									>
										Delete node
									</button>
								</>
							) : (
								<p className="empty-state">Add a node to edit this dialogue.</p>
							)}
						</div>
					</div>
				) : (
					<p className="empty-state">Add a dialogue to edit it.</p>
				)}
			</div>
		</section>
	);
}
