import type { GameAction, GameProject } from "../../types/game";
import { dialogueEntities } from "./dialogueEntities";

export function makeDialogueAction(
	type: GameAction["type"],
	project: GameProject,
	previous?: GameAction,
): GameAction {
	if (previous?.type === type) return previous;
	if (
		(type === "give_item" || type === "remove_item") &&
		previous &&
		"itemId" in previous
	)
		return { type, itemId: previous.itemId, quantity: previous.quantity };
	if (
		(type === "activate_quest" ||
			type === "complete_quest" ||
			type === "fail_quest") &&
		previous &&
		"questId" in previous
	)
		return { type, questId: previous.questId };
	if (
		(type === "set_variable" || type === "change_variable") &&
		previous &&
		"variable" in previous
	)
		return type === "set_variable"
			? { type, variable: previous.variable, value: 1 }
			: { type, variable: previous.variable, amount: 1 };
	if (
		(type === "set_npc_alignment" || type === "set_npc_health") &&
		previous &&
		"npcId" in previous
	)
		return type === "set_npc_alignment"
			? { type, npcId: previous.npcId, alignment: "friendly" }
			: { type, npcId: previous.npcId, value: 100 };
	const variable = Object.keys(project.gameState.variables)[0] ?? "variable_1";
	switch (type) {
		case "set_flag":
			return {
				type,
				flag: Object.keys(project.gameState.flags)[0] ?? "flag_1",
				value: true,
			};
		case "set_variable":
			return { type, variable, value: 1 };
		case "change_variable":
			return { type, variable, amount: 1 };
		case "give_item":
		case "remove_item":
			return { type, itemId: project.items[0]?.id ?? "", quantity: 1 };
		case "activate_quest":
		case "complete_quest":
		case "fail_quest":
			return { type, questId: project.quests[0]?.id ?? "" };
		case "open_shop":
			return { type, shopId: project.shops[0]?.id ?? "" };
		case "play_cutscene":
			return { type, cutsceneId: project.cutscenes[0]?.id ?? "" };
		case "teleport": {
			const area = project.areas.find((a) => a.eventBlocks.length);
			return {
				type,
				areaId: area?.id ?? "",
				eventBlockId: area?.eventBlocks[0]?.id ?? "",
			};
		}
		case "change_movement_mode":
			return { type, mode: "walk" };
		case "set_npc_alignment":
			return {
				type,
				npcId: project.areas.flatMap((a) => a.npcs)[0]?.id ?? "",
				alignment: "friendly",
			};
		case "set_npc_health":
			return {
				type,
				npcId: project.areas.flatMap((a) => a.npcs)[0]?.id ?? "",
				value: 100,
			};
		case "end_game":
			return { type };
	}
}

const actionTypes: GameAction["type"][] = [
	"set_flag",
	"set_variable",
	"change_variable",
	"give_item",
	"remove_item",
	"activate_quest",
	"complete_quest",
	"fail_quest",
	"play_cutscene",
	"teleport",
	"open_shop",
	"change_movement_mode",
	"set_npc_alignment",
	"set_npc_health",
	"end_game",
];

/** String literals stay strings, including "001"; numeric literals stay numbers. */
export function DialogueValueField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | number;
	onChange: (value: string | number) => void;
}) {
	return (
		<>
			<select
				aria-label={`${label} kind`}
				value={typeof value}
				onChange={(e) =>
					onChange(
						e.target.value === "number" ? Number(value) || 0 : String(value),
					)
				}
			>
				<option value="number">Number</option>
				<option value="string">Text</option>
			</select>
			<input
				aria-label={label}
				type={typeof value === "number" ? "number" : "text"}
				value={value}
				onChange={(e) =>
					onChange(
						typeof value === "number" ? Number(e.target.value) : e.target.value,
					)
				}
			/>
		</>
	);
}

export function DialogueActionFields({
	action: a,
	index = 0,
	prefix: customPrefix,
	project: p,
	onChange,
}: {
	action: GameAction;
	index?: number;
	prefix?: string;
	project: GameProject;
	onChange: (action: GameAction) => void;
}) {
	const prefix = customPrefix ?? `Action ${index + 1}`;
	const select = (
		label: string,
		value: string,
		options: { id: string; name: string }[],
		change: (value: string) => void,
	) => (
		<select
			aria-label={`${prefix} ${label}`}
			value={value}
			onChange={(e) => change(e.target.value)}
		>
			{!options.some((o) => o.id === value) && (
				<option value={value}>
					{value ? `Missing: ${value}` : `Select ${label}`}
				</option>
			)}
			{options.map((o) => (
				<option key={o.id} value={o.id}>
					{o.name}
				</option>
			))}
		</select>
	);
	const numeric = (
		label: string,
		value: number,
		min: number | undefined,
		change: (value: number) => void,
	) => (
		<input
			aria-label={`${prefix} ${label}`}
			type="number"
			min={min}
			value={value}
			onChange={(e) =>
				change(Math.max(min ?? -Infinity, Number(e.target.value)))
			}
		/>
	);
	const namedKeys = (keys: string[]) => keys.map((id) => ({ id, name: id }));
	return (
		<>
			<select
				aria-label={`${prefix} type`}
				value={a.type}
				onChange={(e) =>
					onChange(
						makeDialogueAction(e.target.value as GameAction["type"], p, a),
					)
				}
			>
				{actionTypes.map((type) => (
					<option
						key={type}
						value={type}
						disabled={
							type === "teleport" &&
							!p.areas.some((area) => area.eventBlocks.length)
						}
					>
						{type === "activate_quest"
							? "Start quest"
							: type === "set_flag"
								? "Remember story state"
								: type.replace(/_/g, " ")}
					</option>
				))}
			</select>
			{a.type === "set_flag" && (
				<>
					<input
						aria-label={`${prefix} flag`}
						list="dialogue-flags"
						value={a.flag}
						onChange={(e) => onChange({ ...a, flag: e.target.value })}
					/>
					<select
						aria-label={`${prefix} flag value`}
						value={String(a.value)}
						onChange={(e) =>
							onChange({ ...a, value: e.target.value === "true" })
						}
					>
						<option value="true">Yes</option>
						<option value="false">No</option>
					</select>
				</>
			)}
			{(a.type === "set_variable" || a.type === "change_variable") && (
				<input
					list="dialogue-variables"
					aria-label={`${prefix} variable`}
					value={a.variable}
					onChange={(e) => onChange({ ...a, variable: e.target.value })}
				/>
			)}
			{a.type === "set_variable" && (
				<DialogueValueField
					label={`${prefix} value`}
					value={a.value}
					onChange={(value) => onChange({ ...a, value })}
				/>
			)}
			{a.type === "change_variable" &&
				numeric("amount", a.amount, undefined, (amount) =>
					onChange({ ...a, amount }),
				)}
			{(a.type === "give_item" || a.type === "remove_item") && (
				<>
					{select("item", a.itemId, p.items, (itemId) =>
						onChange({ ...a, itemId }),
					)}
					{numeric("quantity", a.quantity, 1, (quantity) =>
						onChange({ ...a, quantity: Math.round(quantity) }),
					)}
				</>
			)}
			{(a.type === "activate_quest" ||
				a.type === "complete_quest" ||
				a.type === "fail_quest") &&
				select("quest", a.questId, p.quests, (questId) =>
					onChange({ ...a, questId }),
				)}
			{a.type === "play_cutscene" &&
				select("cutscene", a.cutsceneId, p.cutscenes, (cutsceneId) =>
					onChange({ ...a, cutsceneId }),
				)}
			{a.type === "open_shop" &&
				select("shop", a.shopId, p.shops, (shopId) =>
					onChange({ ...a, shopId }),
				)}
			{a.type === "teleport" && (
				<>
					{select(
						"area",
						a.areaId,
						p.areas.filter((area) => area.eventBlocks.length),
						(areaId) =>
							onChange({
								...a,
								areaId,
								eventBlockId: p.areas.find((area) => area.id === areaId)!
									.eventBlocks[0].id,
							}),
					)}
					{select(
						"destination",
						a.eventBlockId,
						(
							p.areas.find((area) => area.id === a.areaId)?.eventBlocks ?? []
						).map((event) => ({ id: event.id, name: event.name || event.id })),
						(eventBlockId) => onChange({ ...a, eventBlockId }),
					)}
				</>
			)}
			{a.type === "change_movement_mode" &&
				select(
					"movement mode",
					a.mode,
					namedKeys(["walk", "sail", "ride", "drive"]),
					(mode) => onChange({ ...a, mode: mode as typeof a.mode }),
				)}
			{(a.type === "set_npc_alignment" || a.type === "set_npc_health") &&
				select(
					"NPC",
					a.npcId,
					dialogueEntities(p)
						.filter((e) => e.ref.kind === "npc")
						.map((e) => ({ id: e.ref.id, name: e.label })),
					(npcId) => onChange({ ...a, npcId }),
				)}
			{a.type === "set_npc_alignment" &&
				select(
					"alignment",
					a.alignment,
					namedKeys(["friendly", "neutral", "hostile"]),
					(alignment) =>
						onChange({ ...a, alignment: alignment as typeof a.alignment }),
				)}
			{a.type === "set_npc_health" &&
				numeric("health", a.value, 0, (value) => onChange({ ...a, value }))}
		</>
	);
}
