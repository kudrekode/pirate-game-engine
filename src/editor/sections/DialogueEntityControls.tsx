import { type ReactNode, useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	DialogueCondition,
	GameAction,
	GameProject,
} from "../../types/game";
import { DialogueValueField } from "./DialogueActionFields";
import {
	acceptsEntity,
	actionSummary,
	conditionSummary,
	DIALOGUE_ENTITY_MIME,
	type DialogueEntityRef,
	dialogueEntities,
	dialogueLegacyFallback,
	type EntityOperation,
	type EntitySlot,
	entityKey,
	type NewDialogueEntity,
	readDialogueEntity,
	resolveDialogueEntity,
	storyKey,
	wiringReference,
} from "./dialogueEntities";
import { openEntitySource } from "./editorSource";

const kindLabels = {
	object: "World objects",
	event: "Arrival points",
	area: "Areas",
	pickup: "Pickups",
	cutscene: "Story moments",
	shop: "Shops",
	dialogue: "Conversations",
	rule: "Logic rules",
	structure: "Structures",
	npc: "Characters",
	item: "Items",
	quest: "Quests",
	flag: "Story state",
	variable: "Story values",
};

export function StoryDialog({
	label,
	onClose,
	children,
}: {
	label: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		if (dialog.current?.showModal) dialog.current.showModal();
		else dialog.current?.setAttribute("open", "");
	}, []);
	return (
		<dialog
			ref={dialog}
			className="story-dialog"
			aria-label={label}
			onCancel={onClose}
		>
			<h3>{label}</h3>
			{children}
			<button type="button" onClick={onClose}>
				Cancel
			</button>
		</dialog>
	);
}

export function EntityOperationMenu({
	name,
	operations,
	onChoose,
	onCancel,
}: {
	name: string;
	operations: EntityOperation[];
	onChoose: (operation: string) => void;
	onCancel: () => void;
}) {
	return (
		<StoryDialog label={`Use ${name}`} onClose={onCancel}>
			<p>Choose how to use this entity.</p>
			<div className="story-operation-list">
				{operations.map((operation) => (
					<div key={operation.id}>
						<button
							type="button"
							disabled={operation.disabled}
							onClick={() => onChoose(operation.id)}
						>
							{operation.label}
						</button>
						{operation.warning && <p role="status">{operation.warning}</p>}
					</div>
				))}
			</div>
			{operations.length === 0 && (
				<p role="alert">This entity has no supported operation here.</p>
			)}
		</StoryDialog>
	);
}

export function DialogueEntityPicker({
	project,
	selected,
	slot,
	onSelect,
	onCreate,
	scope = "dialogue",
}: {
	project: GameProject;
	selected?: DialogueEntityRef;
	slot?: EntitySlot;
	onSelect: (ref: DialogueEntityRef) => void;
	onCreate: (draft: NewDialogueEntity) => void;
	scope?: "dialogue" | "story";
}) {
	const [search, setSearch] = useState("");
	const [kind, setKind] = useState("all");
	const [creating, setCreating] = useState(false);
	const [draft, setDraft] = useState<NewDialogueEntity>({
		kind: "item",
		name: "",
		category: "misc",
		value: false,
		description: "",
	});
	const entities = dialogueEntities(project).filter(
		(e) =>
			(scope === "story" ||
				["npc", "item", "quest", "flag"].includes(e.ref.kind)) &&
			(!slot || acceptsEntity(slot, e.ref)) &&
			(kind === "all" || e.ref.kind === kind) &&
			`${e.label} ${e.detail} ${e.ref.id}`
				.toLowerCase()
				.includes(search.toLowerCase()),
	);
	return (
		<div className="dialogue-entity-picker">
			{!creating && (
				<>
					<label>
						Search entities
						<input
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Name, area or story state"
						/>
					</label>
					<label>
						Entity category
						<select value={kind} onChange={(e) => setKind(e.target.value)}>
							<option value="all">All entities</option>
							{Object.entries(kindLabels)
								.filter(
									([key]) =>
										(scope === "story" ||
											["npc", "item", "quest", "flag"].includes(key)) &&
										(!slot ||
											acceptsEntity(slot, {
												kind: key,
												id: "",
												areaId: "",
											} as DialogueEntityRef)),
								)
								.map(([key, label]) => (
									<option key={key} value={key}>
										{label}
									</option>
								))}
						</select>
					</label>
					<section className="dialogue-entity-list" aria-label="Entities">
						{entities.map((entity) => (
							<button
								type="button"
								key={entityKey(entity.ref)}
								className="dialogue-entity"
								draggable
								aria-label={`${entity.label} · ${kindLabels[entity.ref.kind]}`}
								aria-pressed={
									selected
										? entityKey(selected) === entityKey(entity.ref)
										: false
								}
								onDragStart={(e) => {
									e.dataTransfer.setData(
										DIALOGUE_ENTITY_MIME,
										JSON.stringify(entity.ref),
									);
									e.dataTransfer.effectAllowed = "copy";
								}}
								onClick={() => onSelect(entity.ref)}
								title={`${entity.detail}\nID: ${entity.ref.id}`}
							>
								<span aria-hidden="true">{entity.icon}</span>
								<span>
									{entity.label}
									<small>{entity.detail}</small>
								</span>
							</button>
						))}
						{!entities.length && (
							<p className="help-text">
								No matching entities. Characters must already be placed on a
								map.
							</p>
						)}
					</section>
				</>
			)}
			{slot !== "speaker" && slot !== "assignment" && slot !== "trigger" && (
				<>
					{!creating ? (
						<button type="button" onClick={() => setCreating(true)}>
							Create entity here
						</button>
					) : (
						<fieldset
							className="dialogue-create-entity"
							aria-label="Create entity"
						>
							<label>
								Create
								<select
									aria-label="Create"
									value={draft.kind}
									onChange={(e) =>
										setDraft({
											...draft,
											kind: e.target.value as NewDialogueEntity["kind"],
											value: e.target.value === "flag" ? false : 0,
										})
									}
								>
									<option value="item">Item</option>
									{slot !== "objective" && slot !== "logic-condition" && (
										<option value="quest">Quest</option>
									)}
									<option value="flag">Story state (Yes/No)</option>
									{scope === "story" && slot !== "objective" && (
										<option value="variable">Story value (Number/Text)</option>
									)}
									{scope === "story" && (!slot || slot === "logic-action") && (
										<option value="cutscene">Story moment</option>
									)}
								</select>
							</label>
							<label>
								Entity name
								<input
									value={draft.name}
									onChange={(e) => setDraft({ ...draft, name: e.target.value })}
								/>
							</label>
							{draft.kind === "item" && (
								<label>
									Item category
									<select
										aria-label="Item category"
										value={draft.category}
										onChange={(e) =>
											setDraft({
												...draft,
												category: e.target
													.value as NewDialogueEntity["category"],
											})
										}
									>
										<option value="misc">General</option>
										<option value="key">Key</option>
										<option value="quest">Quest item</option>
										<option value="currency">Currency</option>
										<option value="consumable">Consumable</option>
										<option value="weapon">Weapon</option>
									</select>
								</label>
							)}
							{(draft.kind === "quest" ||
								draft.kind === "item" ||
								draft.kind === "cutscene") && (
								<label>
									Description
									<textarea
										value={draft.description}
										onChange={(e) =>
											setDraft({ ...draft, description: e.target.value })
										}
									/>
								</label>
							)}
							{draft.kind === "quest" && (
								<p className="help-text">
									Creates an inactive quest with no objectives. Use Open quest
									to add objectives before Play.
								</p>
							)}
							{draft.kind === "flag" && (
								<label>
									Initial state
									<select
										value={String(draft.value)}
										onChange={(e) =>
											setDraft({ ...draft, value: e.target.value === "true" })
										}
									>
										<option value="false">No</option>
										<option value="true">Yes</option>
									</select>
								</label>
							)}
							{draft.kind === "variable" && (
								<div>
									Initial value
									<DialogueValueField
										label="Initial story value"
										value={typeof draft.value === "boolean" ? 0 : draft.value}
										onChange={(value) => setDraft({ ...draft, value })}
									/>
								</div>
							)}
							{(draft.kind === "flag" || draft.kind === "variable") && (
								<small>
									Stable key: {storyKey(draft.name, project)}. Names are
									displayed from this key.
								</small>
							)}
							<div className="dialogue-toolbar">
								<button
									type="button"
									disabled={
										!draft.name.trim() ||
										(typeof draft.value === "number" &&
											!Number.isFinite(draft.value))
									}
									onClick={() => {
										onCreate(draft);
										setCreating(false);
										setDraft({ ...draft, name: "", description: "" });
									}}
								>
									{slot ? "Create and insert" : "Create and select"}
								</button>
								<button
									type="button"
									onClick={() => {
										setCreating(false);
										setDraft({ ...draft, name: "", description: "" });
									}}
								>
									Cancel creation
								</button>
							</div>
						</fieldset>
					)}
				</>
			)}
		</div>
	);
}

export function DialogueEntityDrop({
	slot,
	label,
	onUse,
	children,
}: {
	slot: EntitySlot;
	label: string;
	onUse: (ref: DialogueEntityRef) => void;
	children: ReactNode;
}) {
	const [hover, setHover] = useState(false);
	const [error, setError] = useState("");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Drop target complements the accessible entity picker.
		<section
			className={`dialogue-entity-drop ${hover ? "drag-over" : ""}`}
			aria-label={label}
			onDragOver={(e) => {
				if (Array.from(e.dataTransfer.types).includes(DIALOGUE_ENTITY_MIME)) {
					e.preventDefault();
					e.stopPropagation();
					e.dataTransfer.dropEffect = "copy";
					setHover(true);
				}
			}}
			onDragLeave={() => setHover(false)}
			onDrop={(e) => {
				e.preventDefault();
				e.stopPropagation();
				setHover(false);
				const ref = readDialogueEntity(
					e.dataTransfer.getData(DIALOGUE_ENTITY_MIME),
				);
				if (!ref || !acceptsEntity(slot, ref)) {
					setError(
						slot === "logic-condition" && ref?.kind === "quest"
							? "Quest status checks are not supported in Logic yet."
							: slot === "condition"
								? "Use an item, quest or story state for a response condition."
								: "This entity cannot be used here.",
					);
					return;
				}
				if (!resolveDialogueEntity(useProjectStore.getState().project, ref)) {
					setError("This entity no longer exists. Select another entity.");
					return;
				}
				setError("");
				onUse(ref);
			}}
		>
			{children}
			{error && <small role="alert">{error}</small>}
		</section>
	);
}

export function DialogueEntitySlot({
	project,
	selected,
	slot,
	label,
	onUse,
	onCreate,
}: {
	project: GameProject;
	selected?: DialogueEntityRef;
	slot: EntitySlot;
	label: string;
	onUse: (ref: DialogueEntityRef) => void;
	onCreate?: (draft: NewDialogueEntity) => void;
}) {
	const [open, setOpen] = useState(false);
	const entity =
		selected && acceptsEntity(slot, selected)
			? resolveDialogueEntity(project, selected)
			: undefined;
	return (
		<DialogueEntityDrop slot={slot} label={label} onUse={onUse}>
			<div className="dialogue-toolbar">
				<button
					type="button"
					disabled={!entity}
					onClick={() => entity && onUse(entity.ref)}
				>
					{entity ? `${label}: ${entity.label}` : label}
				</button>
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
				>
					{open
						? "Close picker"
						: slot === "speaker" || slot === "assignment"
							? "Choose character…"
							: "Choose or create…"}
				</button>
			</div>
			<small>
				{slot === "condition"
					? "Drop an item, quest or story state · All conditions must pass"
					: slot === "action" || slot === "logic-action"
						? slot === "action"
							? "Drop an entity · Runs when this node is entered"
							: "Drop an entity · Effects run in order"
						: slot === "objective"
							? "Drop a character, item, world target or story state"
							: slot === "logic-condition"
								? "Drop an item, story state, story value or character"
								: slot === "trigger"
									? "Drop a world target, area or story moment"
									: "Drop a placed character"}
			</small>
			{open && (
				<DialogueEntityPicker
					project={project}
					scope={
						[
							"objective",
							"logic-condition",
							"logic-action",
							"trigger",
						].includes(slot)
							? "story"
							: "dialogue"
					}
					slot={slot}
					onSelect={(ref) => {
						onUse(ref);
						setOpen(false);
					}}
					onCreate={(draft) => {
						onCreate?.(draft);
						setOpen(false);
					}}
				/>
			)}
		</DialogueEntityDrop>
	);
}

function ContextFields({
	value,
	condition,
	onChange,
}: {
	value: DialogueCondition | GameAction;
	condition: boolean;
	onChange: (value: DialogueCondition | GameAction) => void;
}) {
	if (value.type === "flag_is" || value.type === "set_flag")
		return (
			<label>
				Story state
				<select
					value={String(value.value)}
					onChange={(e) =>
						onChange({ ...value, value: e.target.value === "true" })
					}
				>
					<option value="true">Yes</option>
					<option value="false">No</option>
				</select>
			</label>
		);
	if (
		value.type === "has_item" ||
		value.type === "not_has_item" ||
		value.type === "give_item" ||
		value.type === "remove_item"
	)
		return (
			<>
				<label>
					{condition ? "Item check" : "Item effect"}
					<select
						value={value.type}
						onChange={(e) =>
							onChange({
								...value,
								quantity: value.quantity ?? 1,
								type: e.target.value as
									| "has_item"
									| "not_has_item"
									| "give_item"
									| "remove_item",
							})
						}
					>
						{condition ? (
							<>
								<option value="has_item">Have</option>
								<option value="not_has_item">Do not have</option>
							</>
						) : (
							<>
								<option value="give_item">Give</option>
								<option value="remove_item">Remove</option>
							</>
						)}
					</select>
				</label>
				<label>
					Quantity
					<input
						type="number"
						min={1}
						step={1}
						value={value.quantity ?? 1}
						onChange={(e) =>
							onChange({
								...value,
								quantity: Math.max(1, Math.round(Number(e.target.value))),
							})
						}
					/>
				</label>
			</>
		);
	if (value.type === "quest_status")
		return (
			<label>
				Quest state
				<select
					value={value.status}
					onChange={(e) =>
						onChange({
							...value,
							status: e.target.value as typeof value.status,
						})
					}
				>
					{["inactive", "active", "completed", "failed"].map((status) => (
						<option key={status} value={status}>
							{status}
						</option>
					))}
				</select>
			</label>
		);
	if (
		value.type === "activate_quest" ||
		value.type === "complete_quest" ||
		value.type === "fail_quest"
	)
		return (
			<label>
				Quest effect
				<select
					value={value.type}
					onChange={(e) =>
						onChange({ ...value, type: e.target.value as typeof value.type })
					}
				>
					<option value="activate_quest">Start</option>
					<option value="complete_quest">Complete</option>
					<option value="fail_quest">Fail</option>
				</select>
			</label>
		);
	if (value.type === "variable_compare")
		return (
			<>
				<label>
					Compare
					<select
						value={value.operator}
						onChange={(e) =>
							onChange({
								...value,
								operator: e.target.value as typeof value.operator,
							})
						}
					>
						{["==", "!=", ">", "<", ">=", "<="].map((op) => (
							<option key={op}>{op}</option>
						))}
					</select>
				</label>
				<DialogueValueField
					label="Story comparison value"
					value={value.value}
					onChange={(next) => onChange({ ...value, value: next })}
				/>
			</>
		);
	if (value.type === "set_variable")
		return (
			<DialogueValueField
				label="Set story value"
				value={value.value}
				onChange={(next) => onChange({ ...value, value: next })}
			/>
		);
	if (value.type === "change_variable")
		return (
			<label>
				Change by
				<input
					type="number"
					value={value.amount}
					onChange={(e) =>
						onChange({ ...value, amount: Number(e.target.value) })
					}
				/>
			</label>
		);
	if (value.type === "set_npc_alignment")
		return (
			<label>
				Alignment
				<select
					value={value.alignment}
					onChange={(e) =>
						onChange({
							...value,
							alignment: e.target.value as typeof value.alignment,
						})
					}
				>
					{["friendly", "neutral", "hostile"].map((alignment) => (
						<option key={alignment}>{alignment}</option>
					))}
				</select>
			</label>
		);
	if (value.type === "set_npc_health")
		return (
			<label>
				Health
				<input
					type="number"
					min={0}
					value={value.value}
					onChange={(e) =>
						onChange({ ...value, value: Math.max(0, Number(e.target.value)) })
					}
				/>
			</label>
		);
	return null;
}

export function DialogueWiringChip({
	value,
	project,
	condition = false,
	children,
	controls,
	onChange,
	sourceField,
}: {
	value: DialogueCondition | GameAction;
	project: GameProject;
	condition?: boolean;
	children: ReactNode;
	controls?: ReactNode;
	onChange: (value: DialogueCondition | GameAction) => void;
	sourceField?: string;
}) {
	const [replacing, setReplacing] = useState(false);
	const ref = wiringReference(value, project);
	const entity = ref && resolveDialogueEntity(project, ref);
	const fallback =
		!condition && dialogueLegacyFallback(value as GameAction, project);
	const missing = ref && !entity && !fallback;
	const unfinished =
		ref?.kind === "quest" &&
		project.quests.find((q) => q.id === ref.id)?.objectives.length === 0;
	return (
		<div className="dialogue-wiring-chip" data-story-field={sourceField}>
			<details>
				<summary
					className={missing ? "missing" : ""}
					title={ref ? `ID: ${ref.id}` : undefined}
				>
					{entity && <span aria-hidden="true">{entity.icon} </span>}
					{condition
						? conditionSummary(value as DialogueCondition, project)
						: actionSummary(value as GameAction, project)}{" "}
					<small>· Edit</small>
				</summary>
				<div className="dialogue-context-fields">
					{ref && (
						<>
							<button type="button" onClick={() => setReplacing(!replacing)}>
								Replace reference
							</button>
							<button
								type="button"
								disabled={!entity}
								onClick={() => openEntitySource(ref)}
							>
								Open source
							</button>
						</>
					)}
					<ContextFields
						value={value}
						condition={condition}
						onChange={onChange}
					/>
				</div>
				{replacing && ref && (
					<section
						className="story-operation-list"
						aria-label="Replace reference"
					>
						{dialogueEntities(project)
							.filter((e) => e.ref.kind === ref.kind)
							.map((e) => (
								<button
									key={entityKey(e.ref)}
									type="button"
									onClick={() => {
										const id = e.ref.id;
										onChange(
											"itemId" in value
												? { ...value, itemId: id }
												: "questId" in value
													? { ...value, questId: id }
													: "flag" in value
														? { ...value, flag: id }
														: "variable" in value
															? { ...value, variable: id }
															: "npcId" in value
																? { ...value, npcId: id }
																: "cutsceneId" in value
																	? { ...value, cutsceneId: id }
																	: "shopId" in value
																		? { ...value, shopId: id }
																		: value.type === "teleport" &&
																				"areaId" in e.ref
																			? {
																					...value,
																					areaId: e.ref.areaId,
																					eventBlockId: id,
																				}
																			: value,
										);
										setReplacing(false);
									}}
								>
									{e.label}
								</button>
							))}
					</section>
				)}
				<details className="dialogue-advanced-fields">
					<summary>Advanced fields</summary>
					{children}
					{ref && <small>Reference: {ref.id}</small>}
				</details>
			</details>
			{controls && (
				<div className="dialogue-toolbar dialogue-chip-controls">
					{controls}
				</div>
			)}
			{missing && (
				<small role="status">
					Missing reference. Expand this chip to choose a replacement; its ID is
					preserved.
				</small>
			)}
			{fallback && (
				<small role="status">
					Legacy fallback: {fallback}. Choose an explicit reference in Advanced
					fields.
				</small>
			)}
			{unfinished && (
				<small role="status">
					Unfinished quest: add objectives before Play.
				</small>
			)}
		</div>
	);
}
