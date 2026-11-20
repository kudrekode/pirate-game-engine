import { useEffect, useMemo, useRef, useState } from "react";
import { portraitPresets } from "../../data/presets";
import { validateDialogue } from "../../data/validateDialogue";
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
import {
	DialogueActionFields,
	DialogueValueField,
	makeDialogueAction,
} from "./DialogueActionFields";
import { DialogueAssignments } from "./DialogueAssignments";
import {
	DialogueEntityPicker,
	DialogueEntitySlot,
	DialogueWiringChip,
	EntityOperationMenu,
} from "./DialogueEntityControls";
import { DialogueGraph } from "./DialogueGraph";
import { DialogueQuestGiver } from "./DialogueQuestGiver";
import {
	createDialogueEntity,
	type DialogueEntityRef,
	type DialogueWiringTarget,
	dialogueEntities,
	entityKey,
	entityOperations,
	hasWiringTarget,
	insertDialogueEntity,
	type NewDialogueEntity,
	resolveDialogueEntity,
} from "./dialogueEntities";
import {
	autoLayoutDialogue,
	dialogueLinks,
	duplicateDialogue,
	duplicateDialogueNode,
	makeChoice,
	makeNode,
	nodeTitle,
	removeDialogueNode,
	reorder,
} from "./dialogueGraphModel";
import { openEntitySource, useEditorSource } from "./editorSource";
import { useMapEditHistory } from "./useMapEditHistory";

const nodeTypes: DialogueNode["type"][] = ["text", "choice", "end"];
const comparisonOperators: VariableComparisonOperator[] = [
	"==",
	"!=",
	">",
	"<",
	">=",
	"<=",
];

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

export function DialogueEditor() {
	const project = useProjectStore((state) => state.project);
	const addDialogue = useProjectStore((state) => state.addDialogue);
	const updateDialogue = useProjectStore((state) => state.updateDialogue);
	const deleteDialogue = useProjectStore((state) => state.deleteDialogue);
	const requestedDialogueId = useProjectStore(
		(state) => state.requestedDialogueId,
	);
	const [selectedDialogueId, setSelectedDialogueId] = useState(
		project.dialogues[0]?.id ?? "",
	);
	const [selectedNodeId, setSelectedNodeId] = useState(
		project.dialogues[0]?.nodes[0]?.id ?? "",
	);
	const [view, setView] = useState<"graph" | "list">("graph");
	const [selectedEntity, setSelectedEntity] = useState<DialogueEntityRef>();
	const [pendingWire, setPendingWire] = useState<{
		target: DialogueWiringTarget;
		ref?: DialogueEntityRef;
		draft?: NewDialogueEntity;
	}>();
	useEditorSource("dialogues", (source) => {
		setSelectedDialogueId(source.id);
		const dialogue = useProjectStore
			.getState()
			.project.dialogues.find((d) => d.id === source.id);
		setSelectedNodeId(source.nodeId ?? dialogue?.startNodeId ?? "");
		setView("graph");
		if (source.entityKey)
			setSelectedEntity(
				dialogueEntities(useProjectStore.getState().project).find(
					(e) => entityKey(e.ref) === source.entityKey,
				)?.ref,
			);
	});
	const history = useMapEditHistory(project.activeAreaId, true);
	useEffect(() => {
		if (!requestedDialogueId) return;
		const dialogue = project.dialogues.find(
			(d) => d.id === requestedDialogueId,
		);
		if (dialogue) {
			setSelectedDialogueId(dialogue.id);
			setSelectedNodeId(dialogue.startNodeId);
			setView("graph");
		}
		useProjectStore.getState().openDialogueEditor(null);
	}, [requestedDialogueId, project.dialogues]);

	const selectedDialogue = useMemo(
		() =>
			project.dialogues.find((dialogue) => dialogue.id === selectedDialogueId),
		[project.dialogues, selectedDialogueId],
	);
	const selectedNode = useMemo(
		() => selectedDialogue?.nodes.find((node) => node.id === selectedNodeId),
		[selectedDialogue, selectedNodeId],
	);

	useEffect(() => {
		if (!selectedDialogue && project.dialogues.length > 0) {
			setSelectedDialogueId(project.dialogues[0].id);
		}
	}, [project.dialogues, selectedDialogue]);

	useEffect(() => {
		if (selectedDialogue && selectedNodeId && !selectedNode) {
			setSelectedNodeId(selectedDialogue.nodes[0]?.id ?? "");
		}
	}, [selectedDialogue, selectedNode, selectedNodeId]);
	const issues = useMemo(
		() => (selectedDialogue ? validateDialogue(project, selectedDialogue) : []),
		[project, selectedDialogue],
	);

	function updateSelectedDialogue(patch: Partial<DialogueDefinition>) {
		if (selectedDialogue) {
			updateDialogue(selectedDialogue.id, {
				editorLayout:
					selectedDialogue.editorLayout ?? autoLayoutDialogue(selectedDialogue),
				...patch,
			});
		}
	}

	function updateSelectedNode(nextNode: DialogueNode) {
		if (!selectedDialogue) {
			return;
		}
		updateSelectedDialogue(
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
			startNodeId:
				selectedDialogue.nodes.length === 0
					? node.id
					: selectedDialogue.startNodeId,
			editorLayout: {
				nodes: {
					...(selectedDialogue.editorLayout?.nodes ??
						autoLayoutDialogue(selectedDialogue).nodes),
					[node.id]: {
						x: 40 + (selectedDialogue.nodes.length % 3) * 410,
						y: 40 + Math.floor(selectedDialogue.nodes.length / 3) * 650,
					},
				},
			},
		});
		setSelectedNodeId(node.id);
	}

	function deleteSelectedNode() {
		if (!selectedDialogue || !selectedNode) return;
		const count = dialogueLinks(selectedDialogue).filter(
			(link) => link.target === selectedNode.id,
		).length;
		if (
			!window.confirm(
				`Delete this node? It is referenced by ${count} branches.${selectedDialogue.startNodeId === selectedNode.id ? " It is the Start node." : ""} Incoming links will be disconnected; choose a new Start if needed. Undo is available.`,
			)
		)
			return;
		updateDialogue(
			selectedDialogue.id,
			removeDialogueNode(selectedDialogue, selectedNode.id),
		);
		setSelectedNodeId("");
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

	function applyEntity(
		ref: DialogueEntityRef,
		target: DialogueWiringTarget,
		operation?: string,
	) {
		const current = useProjectStore.getState().project;
		if (
			!hasWiringTarget(current, target) ||
			!resolveDialogueEntity(current, ref)
		)
			return;
		if (target.slot !== "speaker" && !operation) {
			setPendingWire({ target, ref });
			return;
		}
		useProjectStore
			.getState()
			.updateProject((draft) =>
				insertDialogueEntity(draft, target, ref, operation),
			);
		setSelectedEntity(ref);
	}

	function createEntity(
		entity: NewDialogueEntity,
		target?: DialogueWiringTarget,
		operation?: string,
	) {
		if (target && !hasWiringTarget(useProjectStore.getState().project, target))
			return;
		if (target && !operation) {
			setPendingWire({ target, draft: entity });
			return;
		}
		let ref: DialogueEntityRef | undefined;
		useProjectStore.getState().updateProject((draft) => {
			ref = createDialogueEntity(draft, entity);
			if (target) insertDialogueEntity(draft, target, ref, operation);
		});
		setSelectedEntity(ref);
	}

	function entitySlot(
		slot: DialogueWiringTarget["slot"],
		label: string,
		choiceId?: string,
	) {
		if (!selectedDialogue || !selectedNode) return null;
		const target = {
			dialogueId: selectedDialogue.id,
			nodeId: selectedNode.id,
			slot,
			choiceId,
		};
		return (
			<DialogueEntitySlot
				key={`${selectedDialogue.id}:${selectedNode.id}:${slot}:${choiceId ?? ""}`}
				project={project}
				selected={selectedEntity}
				slot={slot}
				label={label}
				onUse={(ref) => applyEntity(ref, target)}
				onCreate={(draft) => createEntity(draft, target)}
			/>
		);
	}

	function renderCondition(
		choice: DialogueChoice,
		condition: DialogueCondition,
		index: number,
	) {
		return (
			<DialogueWiringChip
				key={`${choice.id}:${index}`}
				sourceField={`choice:${choice.id}:condition:${index}`}
				value={condition}
				project={project}
				condition
				onChange={(value) =>
					updateCondition(choice, index, value as DialogueCondition)
				}
				controls={
					<button
						type="button"
						aria-label={`Delete condition ${index + 1}`}
						onClick={() =>
							updateChoice(choice.id, {
								conditions: (choice.conditions ?? []).filter(
									(_, i) => i !== index,
								),
							})
						}
					>
						Remove condition
					</button>
				}
			>
				<div className="state-row variable">
					<select
						aria-label={`Condition ${index + 1} type`}
						onChange={(event) =>
							updateCondition(
								choice,
								index,
								(condition.type === "has_item" ||
									condition.type === "not_has_item") &&
									(event.target.value === "has_item" ||
										event.target.value === "not_has_item")
									? { ...condition, type: event.target.value }
									: makeCondition(
											event.target.value as DialogueCondition["type"],
										),
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
								list="dialogue-flags"
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
								<option value="true">Yes</option>
								<option value="false">No</option>
							</select>
						</>
					) : null}
					{condition.type === "variable_compare" ? (
						<>
							<input
								list="dialogue-variables"
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
							<DialogueValueField
								label={`Condition ${index + 1} compare value`}
								value={condition.value}
								onChange={(value) =>
									updateCondition(choice, index, { ...condition, value })
								}
							/>
						</>
					) : null}
					{condition.type === "has_item" ||
					condition.type === "not_has_item" ? (
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
								{condition.itemId &&
									!project.items.some((i) => i.id === condition.itemId) && (
										<option value={condition.itemId}>
											Missing: {condition.itemId}
										</option>
									)}
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
										quantity: Math.max(
											1,
											Math.round(Number(event.target.value)),
										),
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
								{condition.questId &&
									!project.quests.some((q) => q.id === condition.questId) && (
										<option value={condition.questId}>
											Missing: {condition.questId}
										</option>
									)}
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
				</div>
			</DialogueWiringChip>
		);
	}

	function renderAction(action: GameAction, index: number) {
		const actions = selectedNode?.actions ?? [];
		return (
			<DialogueWiringChip
				key={index}
				sourceField={`actions:${index}`}
				value={action}
				project={project}
				onChange={(value) => updateAction(index, value as GameAction)}
				controls={
					<>
						<small>Effect {index + 1}</small>
						<button
							type="button"
							aria-label={`Move action ${index + 1} up`}
							disabled={index === 0}
							onClick={() =>
								selectedNode &&
								updateSelectedNode({
									...selectedNode,
									actions: reorder(actions, index, -1),
								})
							}
						>
							↑
						</button>
						<button
							type="button"
							aria-label={`Move action ${index + 1} down`}
							disabled={index === actions.length - 1}
							onClick={() =>
								selectedNode &&
								updateSelectedNode({
									...selectedNode,
									actions: reorder(actions, index, 1),
								})
							}
						>
							↓
						</button>
						<button
							type="button"
							aria-label={`Delete action ${index + 1}`}
							onClick={() =>
								selectedNode &&
								updateSelectedNode({
									...selectedNode,
									actions: actions.filter((_, i) => i !== index),
								})
							}
						>
							Remove
						</button>
					</>
				}
			>
				<div className="dialogue-action-fields">
					<DialogueActionFields
						action={action}
						index={index}
						project={project}
						onChange={(action) => updateAction(index, action)}
					/>
				</div>
			</DialogueWiringChip>
		);
	}

	function coerceNodeType(
		node: DialogueNode,
		type: DialogueNode["type"],
	): DialogueNode {
		if (node.type === type) {
			return node;
		}
		if (
			!window.confirm(
				"Change node type? Outgoing links/responses will be removed. Text, speaker, portrait and entry actions are retained.",
			)
		)
			return node;
		return {
			...makeNode(type),
			id: node.id,
			speaker: node.speaker,
			portraitId: node.portraitId,
			text: node.text ?? "",
			actions: node.actions,
		};
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Captures history shortcuts and focus changes from child controls.
		<section
			className="editor-panel dialogue-editor"
			onFocusCapture={(event) => {
				if ((event.target as HTMLElement).matches("input, textarea"))
					history.beginMapEdit();
			}}
			onBlurCapture={(event) => {
				if ((event.target as HTMLElement).matches("input, textarea"))
					history.endMapEdit();
			}}
			onKeyDown={(event) => {
				if (
					(event.ctrlKey || event.metaKey) &&
					event.key.toLowerCase() === "z"
				) {
					event.preventDefault();
					if (event.shiftKey) history.redoMapEdit();
					else history.undoMapEdit();
				}
			}}
		>
			<datalist id="dialogue-flags">
				{Object.keys(project.gameState.flags).map((flag) => (
					<option key={flag} value={flag} />
				))}
			</datalist>
			<datalist id="dialogue-variables">
				{Object.keys(project.gameState.variables).map((variable) => (
					<option key={variable} value={variable} />
				))}
			</datalist>
			<datalist id="dialogue-speakers">
				{project.npcs.map((npc) => (
					<option key={npc.id} value={npc.name} />
				))}
			</datalist>
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
						setSelectedNodeId(
							useProjectStore
								.getState()
								.project.dialogues.find((dialogue) => dialogue.id === id)
								?.startNodeId ?? "",
						);
					}}
					type="button"
				>
					Add dialogue
				</button>
				<DialogueQuestGiver
					project={project}
					selected={selectedEntity}
					onCreated={(id) => {
						setSelectedDialogueId(id);
						setSelectedNodeId(
							useProjectStore
								.getState()
								.project.dialogues.find((d) => d.id === id)!.startNodeId,
						);
					}}
				/>
				<div className="panel-title secondary">Entity palette</div>
				<p className="help-text">
					Select an entity, then use it in the inspector. Or drag it onto a
					condition or entry effect.
				</p>
				<DialogueEntityPicker
					project={project}
					selected={selectedEntity}
					onSelect={setSelectedEntity}
					onCreate={createEntity}
				/>
				{selectedEntity && (
					<div className="dialogue-selected-entity" role="status">
						Selected:{" "}
						{resolveDialogueEntity(project, selectedEntity)?.label ??
							`Missing ${selectedEntity.kind}: ${selectedEntity.id}`}
						{selectedEntity.kind === "quest" &&
							project.quests.some((q) => q.id === selectedEntity.id) && (
								<button
									type="button"
									onClick={() => openEntitySource(selectedEntity)}
								>
									Open quest
								</button>
							)}
						<button type="button" onClick={() => setSelectedEntity(undefined)}>
							Clear entity selection
						</button>
					</div>
				)}
			</aside>

			<div className="content-panel">
				{selectedDialogue ? (
					<div className="dialogue-edit-layout">
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
							<label data-story-field="start">
								Starting node
								<select
									onChange={(event) =>
										updateSelectedDialogue({ startNodeId: event.target.value })
									}
									value={selectedDialogue.startNodeId}
								>
									<option value="">Select start node</option>
									{selectedDialogue.nodes.map((node) => (
										<option key={node.id} value={node.id}>
											{nodeTitle(node)}
										</option>
									))}
								</select>
							</label>
							<div className="dialogue-toolbar">
								<button
									type="button"
									aria-pressed={view === "graph"}
									onClick={() => setView("graph")}
								>
									Graph
								</button>
								<button
									type="button"
									aria-pressed={view === "list"}
									onClick={() => setView("list")}
								>
									List
								</button>
								<button
									type="button"
									disabled={!history.canUndo}
									onClick={history.undoMapEdit}
								>
									Undo
								</button>
								<button
									type="button"
									disabled={!history.canRedo}
									onClick={history.redoMapEdit}
								>
									Redo
								</button>
								<button
									type="button"
									onClick={() => {
										const id = addDialogue();
										updateDialogue(id, duplicateDialogue(selectedDialogue, id));
										setSelectedDialogueId(id);
										setSelectedNodeId(
											useProjectStore
												.getState()
												.project.dialogues.find((d) => d.id === id)
												?.startNodeId ?? "",
										);
									}}
								>
									Duplicate dialogue
								</button>
							</div>
							{view === "graph" ? (
								<DialogueGraph
									key={selectedDialogue.id}
									dialogue={selectedDialogue}
									project={project}
									selectedId={selectedNodeId}
									onSelect={setSelectedNodeId}
									onChange={updateSelectedDialogue}
									onDelete={deleteSelectedNode}
									onUseEntity={(ref, nodeId, choiceId) => {
										setSelectedNodeId(nodeId);
										applyEntity(ref, {
											dialogueId: selectedDialogue.id,
											nodeId,
											choiceId,
											slot: choiceId ? "condition" : "action",
										});
									}}
								/>
							) : (
								<>
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
								</>
							)}
							<section
								className="dialogue-diagnostics"
								aria-label="Dialogue diagnostics"
							>
								<strong>
									Diagnostics ·{" "}
									{issues.filter((issue) => issue.severity === "error").length}{" "}
									errors ·{" "}
									{
										issues.filter((issue) => issue.severity === "warning")
											.length
									}{" "}
									warnings
								</strong>
								{issues.length ? (
									<ul>
										{issues.map((issue) => (
											<li key={issue.id} className={issue.severity}>
												<button
													type="button"
													onClick={() =>
														issue.nodeId && setSelectedNodeId(issue.nodeId)
													}
												>
													{issue.severity === "error" ? "Error" : "Warning"}:{" "}
													{issue.message}
												</button>
											</li>
										))}
									</ul>
								) : (
									<p>No structural issues.</p>
								)}
							</section>
							<DialogueAssignments
								key={`assignments:${selectedDialogue.id}`}
								project={project}
								dialogue={selectedDialogue}
								selected={selectedEntity}
							/>
							<div className="segmented">
								{nodeTypes.map((type) => (
									<button
										key={type}
										onClick={() => addNode(type)}
										type="button"
									>
										Add {type} node
									</button>
								))}
							</div>
							<button
								className="danger-button"
								onClick={() => {
									if (
										!window.confirm(
											"Delete this dialogue and clear its interaction assignments? Undo is available.",
										)
									)
										return;
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
									<div className="panel-title secondary">Node inspector</div>
									<small>ID: {selectedNode.id}</small>
									<div className="dialogue-toolbar">
										<button
											type="button"
											onClick={() =>
												updateSelectedDialogue({ startNodeId: selectedNode.id })
											}
										>
											Set as Start
										</button>
										<button
											type="button"
											onClick={() => {
												const copy = duplicateDialogueNode(selectedNode);
												const layout =
													selectedDialogue.editorLayout ??
													autoLayoutDialogue(selectedDialogue);
												const point =
													layout.nodes[selectedNode.id] ??
													autoLayoutDialogue(selectedDialogue).nodes[
														selectedNode.id
													];
												updateSelectedDialogue({
													nodes: [...selectedDialogue.nodes, copy],
													editorLayout: {
														nodes: {
															...layout.nodes,
															[copy.id]: { x: point.x + 40, y: point.y + 60 },
														},
													},
												});
												setSelectedNodeId(copy.id);
											}}
										>
											Duplicate node
										</button>
									</div>
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
											list="dialogue-speakers"
											value={selectedNode.speaker ?? ""}
										/>
									</label>
									{entitySlot("speaker", "Copy speaker name")}
									<small>
										Speaker is text copied into this node. Assign the
										conversation below the graph to let a character start it.
									</small>
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
											{[
												...portraitPresets,
												...Object.values(project.pixelAssets)
													.filter(
														(p) =>
															p.kind === "portrait" &&
															!portraitPresets.some(
																(preset) => preset.id === p.id,
															),
													)
													.map((p) => ({ id: p.id, label: p.name })),
											].map((portrait) => (
												<option key={portrait.id} value={portrait.id}>
													{portrait.label}
												</option>
											))}
										</select>
									</label>
									{selectedNode ? (
										<label>
											Text
											<textarea
												aria-label="Text"
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
										<label data-story-field="next">
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
												<option value="">
													Unconnected (closes conversation)
												</option>
												{selectedDialogue.nodes.map((node) => (
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
											{selectedNode.choices.map((choice, choiceIndex) => (
												<div
													className="content-card compact"
													key={choice.id}
													data-story-field={`choice:${choice.id}`}
												>
													<div className="dialogue-toolbar">
														<strong>Response {choiceIndex + 1}</strong>
														<button
															type="button"
															aria-label={`Move response ${choiceIndex + 1} up`}
															disabled={choiceIndex === 0}
															onClick={() =>
																updateSelectedNode({
																	...selectedNode,
																	choices: reorder(
																		selectedNode.choices,
																		choiceIndex,
																		-1,
																	),
																})
															}
														>
															↑
														</button>
														<button
															type="button"
															aria-label={`Move response ${choiceIndex + 1} down`}
															disabled={
																choiceIndex === selectedNode.choices.length - 1
															}
															onClick={() =>
																updateSelectedNode({
																	...selectedNode,
																	choices: reorder(
																		selectedNode.choices,
																		choiceIndex,
																		1,
																	),
																})
															}
														>
															↓
														</button>
													</div>
													<p className="help-text">
														Show this response if all conditions pass (AND).
													</p>
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
														{selectedDialogue.nodes.map((node) => (
															<option key={node.id} value={node.id}>
																{nodeTitle(node)}
															</option>
														))}
													</select>
													{(choice.conditions ?? []).map((condition, index) =>
														renderCondition(choice, condition, index),
													)}
													{entitySlot(
														"condition",
														"Add condition from entity",
														choice.id,
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
									<p className="help-text">
										Run in order, once per node per conversation opening.
									</p>
									{(selectedNode.actions ?? []).map(renderAction)}
									{entitySlot("action", "Add entry effect")}
									<button
										onClick={() =>
											updateSelectedNode({
												...selectedNode,
												actions: [
													...(selectedNode.actions ?? []),
													makeDialogueAction("set_flag", project),
												],
											})
										}
										type="button"
									>
										Add action
									</button>
									<button
										className="danger-button"
										disabled={false}
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
			{pendingWire && (
				<EntityOperationMenu
					name={
						pendingWire.draft?.name ??
						(pendingWire.ref &&
							resolveDialogueEntity(project, pendingWire.ref)?.label) ??
						"Missing entity"
					}
					operations={entityOperations(
						pendingWire.target.slot,
						pendingWire.draft?.kind ?? pendingWire.ref!.kind,
					)}
					onCancel={() => setPendingWire(undefined)}
					onChoose={(operation) => {
						if (pendingWire.draft)
							createEntity(pendingWire.draft, pendingWire.target, operation);
						else if (pendingWire.ref)
							applyEntity(pendingWire.ref, pendingWire.target, operation);
						setPendingWire(undefined);
					}}
				/>
			)}
		</section>
	);
}
