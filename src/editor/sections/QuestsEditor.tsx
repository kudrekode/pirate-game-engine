import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	GameAction,
	GameStateValue,
	Objective,
	ObjectiveCondition,
	Quest,
	QuestReward,
	VariableComparisonOperator,
} from "../../types/game";

const comparisonOperators: VariableComparisonOperator[] = [
	"==",
	"!=",
	">",
	"<",
	">=",
	"<=",
];

function makeId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	}

	return `${prefix}_${Date.now().toString(36)}`;
}

function readValue(
	rawValue: string,
	referenceValue: GameStateValue,
): GameStateValue {
	return typeof referenceValue === "number" ? Number(rawValue) : rawValue;
}

function actionReferencesQuest(action: GameAction, questId: string) {
	return (
		(action.type === "activate_quest" ||
			action.type === "complete_quest" ||
			action.type === "fail_quest") &&
		action.questId === questId
	);
}

export function QuestsEditor() {
	const project = useProjectStore((state) => state.project);
	const updateProject = useProjectStore((state) => state.updateProject);
	const [selectedQuestId, setSelectedQuestId] = useState(
		project.quests[0]?.id ?? "",
	);
	const selectedQuest = project.quests.find(
		(quest) => quest.id === selectedQuestId,
	);
	const flagNames = Object.keys(project.gameState.flags);
	const variableNames = Object.keys(project.gameState.variables);

	useEffect(() => {
		if (!selectedQuest) {
			setSelectedQuestId(project.quests[0]?.id ?? "");
		}
	}, [project.quests, selectedQuest]);

	function updateQuest(patch: Partial<Quest>) {
		if (!selectedQuest) {
			return;
		}

		updateProject((draft) => {
			draft.quests = draft.quests.map((quest) =>
				quest.id === selectedQuest.id ? { ...quest, ...patch } : quest,
			);
		});
	}

	function addQuest() {
		const id = makeId("quest");
		updateProject((draft) => {
			draft.quests.push({
				id,
				name: `Quest ${draft.quests.length + 1}`,
				status: "active",
				objectives: [],
				rewards: [],
			});
		});
		setSelectedQuestId(id);
	}

	function deleteQuest() {
		if (!selectedQuest) {
			return;
		}

		const isReferenced = project.rules.some((rule) =>
			[...rule.actions, ...(rule.elseActions ?? [])].some((action) =>
				actionReferencesQuest(action, selectedQuest.id),
			),
		);
		const confirmation = isReferenced
			? `Delete quest "${selectedQuest.name}"? Rules referencing it will remain and appear as validation warnings.`
			: `Delete quest "${selectedQuest.name}"?`;
		if (!window.confirm(confirmation)) {
			return;
		}

		updateProject((draft) => {
			draft.quests = draft.quests.filter(
				(quest) => quest.id !== selectedQuest.id,
			);
			if (draft.trackedQuestId === selectedQuest.id) {
				draft.trackedQuestId = undefined;
			}
		});
	}

	function makeCondition(type: ObjectiveCondition["type"]): ObjectiveCondition {
		if (type === "flag") {
			return { type, flag: flagNames[0] ?? "flag_1", value: true };
		}

		if (type === "has_item") {
			return { type, itemId: project.items[0]?.id ?? "", quantity: 1 };
		}

		if (type === "enter_area") {
			return { type, areaId: project.areas[0]?.id ?? "" };
		}

		const variable = variableNames[0] ?? "";
		return {
			type,
			variable,
			operator: ">=",
			value: project.gameState.variables[variable] ?? 0,
		};
	}

	function addObjective() {
		if (!selectedQuest) {
			return;
		}

		updateQuest({
			objectives: [
				...selectedQuest.objectives,
				{
					id: makeId("objective"),
					description: "New objective",
					condition: makeCondition("flag"),
				},
			],
		});
	}

	function updateObjective(id: string, patch: Partial<Objective>) {
		if (!selectedQuest) {
			return;
		}

		updateQuest({
			objectives: selectedQuest.objectives.map((objective) =>
				objective.id === id ? { ...objective, ...patch } : objective,
			),
		});
	}

	function deleteObjective(id: string) {
		if (!selectedQuest) {
			return;
		}

		updateQuest({
			objectives: selectedQuest.objectives.filter(
				(objective) => objective.id !== id,
			),
		});
	}

	function makeReward(type: QuestReward["type"]): QuestReward {
		if (type === "item") {
			return { type, itemId: project.items[0]?.id ?? "", quantity: 1 };
		}

		if (type === "flag") {
			return { type, flag: flagNames[0] ?? "", value: true };
		}

		return { type, variable: variableNames[0] ?? "", amount: 1 };
	}

	function addReward() {
		if (!selectedQuest) {
			return;
		}

		updateQuest({
			rewards: [...(selectedQuest.rewards ?? []), makeReward("item")],
		});
	}

	function updateReward(index: number, reward: QuestReward) {
		if (!selectedQuest) {
			return;
		}

		const rewards = [...(selectedQuest.rewards ?? [])];
		rewards[index] = reward;
		updateQuest({ rewards });
	}

	function deleteReward(index: number) {
		updateQuest({
			rewards: (selectedQuest?.rewards ?? []).filter(
				(_, rewardIndex) => rewardIndex !== index,
			),
		});
	}

	function getObjectiveReferenceWarning(condition: ObjectiveCondition) {
		if (
			condition.type === "flag" &&
			!(condition.flag in project.gameState.flags)
		) {
			return `Unknown flag: ${condition.flag}`;
		}
		if (
			condition.type === "variable_compare" &&
			!(condition.variable in project.gameState.variables)
		) {
			return `Unknown variable: ${condition.variable}`;
		}
		if (
			condition.type === "has_item" &&
			!project.items.some((item) => item.id === condition.itemId)
		) {
			return `Unknown item: ${condition.itemId}`;
		}
		if (
			condition.type === "enter_area" &&
			!project.areas.some((area) => area.id === condition.areaId)
		) {
			return `Unknown area: ${condition.areaId}`;
		}
		return "";
	}

	function renderCondition(objective: Objective) {
		const condition = objective.condition;
		const warning = getObjectiveReferenceWarning(condition);
		return (
			<>
				<div className="quest-condition-row">
					<select
						aria-label="Objective condition type"
						onChange={(event) =>
							updateObjective(objective.id, {
								condition: makeCondition(
									event.target.value as ObjectiveCondition["type"],
								),
							})
						}
						value={condition.type}
					>
						<option value="flag">Flag is</option>
						<option value="has_item">Player has item</option>
						<option value="variable_compare">Variable comparison</option>
						<option value="enter_area">Player enters area</option>
					</select>
					{condition.type === "flag" ? (
						<>
							<select
								aria-label="Objective flag ID"
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: { ...condition, flag: event.target.value },
									})
								}
								value={condition.flag}
							>
								{!flagNames.includes(condition.flag) ? (
									<option value={condition.flag}>{condition.flag}</option>
								) : null}
								{flagNames.map((flag) => (
									<option key={flag} value={flag}>
										{flag}
									</option>
								))}
							</select>
							<select
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: {
											...condition,
											value: event.target.value === "true",
										},
									})
								}
								value={String(condition.value)}
							>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						</>
					) : null}
					{condition.type === "has_item" ? (
						<>
							<select
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: { ...condition, itemId: event.target.value },
									})
								}
								value={condition.itemId}
							>
								{!project.items.some((item) => item.id === condition.itemId) ? (
									<option value={condition.itemId}>{condition.itemId}</option>
								) : null}
								{project.items.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name} ({item.id})
									</option>
								))}
							</select>
							<input
								min={1}
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: {
											...condition,
											quantity: Math.max(1, Number(event.target.value)),
										},
									})
								}
								type="number"
								value={condition.quantity ?? 1}
							/>
						</>
					) : null}
					{condition.type === "variable_compare" ? (
						<>
							<select
								onChange={(event) => {
									const variable = event.target.value;
									updateObjective(objective.id, {
										condition: {
											...condition,
											variable,
											value: project.gameState.variables[variable] ?? 0,
										},
									});
								}}
								value={condition.variable}
							>
								{!variableNames.includes(condition.variable) ? (
									<option value={condition.variable}>
										{condition.variable}
									</option>
								) : null}
								{variableNames.map((variable) => (
									<option key={variable} value={variable}>
										{variable}
									</option>
								))}
							</select>
							<select
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: {
											...condition,
											operator: event.target
												.value as VariableComparisonOperator,
										},
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
								onChange={(event) =>
									updateObjective(objective.id, {
										condition: {
											...condition,
											value: readValue(event.target.value, condition.value),
										},
									})
								}
								type={typeof condition.value === "number" ? "number" : "text"}
								value={condition.value}
							/>
						</>
					) : null}
					{condition.type === "enter_area" ? (
						<select
							onChange={(event) =>
								updateObjective(objective.id, {
									condition: { ...condition, areaId: event.target.value },
								})
							}
							value={condition.areaId}
						>
							{!project.areas.some((area) => area.id === condition.areaId) ? (
								<option value={condition.areaId}>{condition.areaId}</option>
							) : null}
							{project.areas.map((area) => (
								<option key={area.id} value={area.id}>
									{area.name} ({area.id})
								</option>
							))}
						</select>
					) : null}
				</div>
				{warning ? <div className="validation-message">{warning}</div> : null}
			</>
		);
	}

	function renderReward(reward: QuestReward, index: number) {
		return (
			<div className="quest-reward-row" key={`${selectedQuest?.id}_${index}`}>
				<select
					onChange={(event) =>
						updateReward(
							index,
							makeReward(event.target.value as QuestReward["type"]),
						)
					}
					value={reward.type}
				>
					<option value="item">Give item</option>
					<option value="flag">Set flag</option>
					<option value="variable">Change variable</option>
				</select>
				{reward.type === "item" ? (
					<>
						<select
							onChange={(event) =>
								updateReward(index, { ...reward, itemId: event.target.value })
							}
							value={reward.itemId}
						>
							{project.items.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<input
							min={1}
							onChange={(event) =>
								updateReward(index, {
									...reward,
									quantity: Math.max(1, Number(event.target.value)),
								})
							}
							type="number"
							value={reward.quantity}
						/>
					</>
				) : null}
				{reward.type === "flag" ? (
					<>
						<select
							onChange={(event) =>
								updateReward(index, { ...reward, flag: event.target.value })
							}
							value={reward.flag}
						>
							{flagNames.map((flag) => (
								<option key={flag} value={flag}>
									{flag}
								</option>
							))}
						</select>
						<select
							onChange={(event) =>
								updateReward(index, {
									...reward,
									value: event.target.value === "true",
								})
							}
							value={String(reward.value)}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					</>
				) : null}
				{reward.type === "variable" ? (
					<>
						<select
							onChange={(event) =>
								updateReward(index, { ...reward, variable: event.target.value })
							}
							value={reward.variable}
						>
							{variableNames.map((variable) => (
								<option key={variable} value={variable}>
									{variable}
								</option>
							))}
						</select>
						<input
							onChange={(event) =>
								updateReward(index, {
									...reward,
									amount: Number(event.target.value),
								})
							}
							type="number"
							value={reward.amount}
						/>
					</>
				) : null}
				<button
					className="danger-button compact"
					onClick={() => deleteReward(index)}
					type="button"
				>
					Delete
				</button>
			</div>
		);
	}

	return (
		<section className="editor-panel quests-editor">
			<aside className="tool-panel">
				<div className="panel-title">Quests</div>
				<p className="helper-text">
					Active quests can progress during play. Tracked quests are shown on
					the HUD. Completed quests move to the completed section.
				</p>
				<button
					className="primary-button full-width"
					onClick={addQuest}
					type="button"
				>
					Add quest
				</button>
				<div className="list-stack quest-list">
					{project.quests.map((quest) => (
						<button
							className={`list-item ${quest.id === selectedQuestId ? "selected" : ""}`}
							key={quest.id}
							onClick={() => setSelectedQuestId(quest.id)}
							type="button"
						>
							<span>
								<strong>{quest.name}</strong>
								<small>{quest.status}</small>
							</span>
						</button>
					))}
					{project.quests.length === 0 ? (
						<p className="empty-state compact">No quests defined.</p>
					) : null}
				</div>
				<label>
					Tracked Quest HUD
					<select
						onChange={(event) =>
							updateProject((draft) => {
								draft.trackedQuestId = event.target.value || undefined;
							})
						}
						value={project.trackedQuestId ?? ""}
					>
						<option value="">None</option>
						{project.quests.map((quest) => (
							<option key={quest.id} value={quest.id}>
								{quest.name}
							</option>
						))}
					</select>
				</label>
				<p className="helper-text">
					Choose which active quest appears during play. With none selected, the
					first active quest appears automatically.
				</p>
			</aside>

			<div className="content-panel quest-editor">
				{selectedQuest ? (
					<>
						<div className="panel-title">Quest</div>
						<div className="form-grid">
							<label>
								Name
								<input
									onChange={(event) =>
										updateQuest({ name: event.target.value })
									}
									value={selectedQuest.name}
								/>
							</label>
							<label>
								Default status
								<select
									onChange={(event) =>
										updateQuest({
											status: event.target.value as Quest["status"],
										})
									}
									value={selectedQuest.status}
								>
									<option value="active">
										Active - can progress during play
									</option>
									<option value="inactive">
										Inactive - waits for a rule to activate it
									</option>
									<option value="completed">
										Completed - completed at play start
									</option>
									<option value="failed">Failed - failed at play start</option>
								</select>
							</label>
						</div>
						{selectedQuest.status === "inactive" ? (
							<div className="validation-message">
								Inactive quests do not progress until activated by a rule.
							</div>
						) : null}
						<label>
							Description
							<textarea
								onChange={(event) =>
									updateQuest({ description: event.target.value })
								}
								rows={3}
								value={selectedQuest.description ?? ""}
							/>
						</label>
						<section className="quest-section">
							<div className="quest-section-heading">
								<strong>Objectives</strong>
								<button onClick={addObjective} type="button">
									Add objective
								</button>
							</div>
							{selectedQuest.objectives.map((objective) => (
								<div className="quest-objective" key={objective.id}>
									<input
										onChange={(event) =>
											updateObjective(objective.id, {
												description: event.target.value,
											})
										}
										value={objective.description}
									/>
									{renderCondition(objective)}
									<button
										className="danger-button compact"
										onClick={() => deleteObjective(objective.id)}
										type="button"
									>
										Delete objective
									</button>
								</div>
							))}
							{selectedQuest.objectives.length === 0 ? (
								<p className="empty-state compact">No objectives yet.</p>
							) : null}
						</section>
						<section className="quest-section">
							<div className="quest-section-heading">
								<strong>Rewards</strong>
								<button onClick={addReward} type="button">
									Add reward
								</button>
							</div>
							{(selectedQuest.rewards ?? []).map(renderReward)}
							{(selectedQuest.rewards ?? []).length === 0 ? (
								<p className="empty-state compact">No rewards configured.</p>
							) : null}
						</section>
						<button
							className="danger-button"
							onClick={deleteQuest}
							type="button"
						>
							Delete quest
						</button>
					</>
				) : (
					<p className="empty-state">
						Add a quest to define player-facing objectives.
					</p>
				)}
			</div>
		</section>
	);
}
