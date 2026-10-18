import {
	getOverlayPreset,
	getStructurePreset,
	getTerrainPreset,
	structurePresets,
} from "../../data/mapVisuals";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	EventBlock,
	GameArea,
	GameProject,
	Interaction,
	InteractionActivationMode,
	MovementRule,
	NPCInstance,
	ObjectBehaviour,
	ObjectInstance,
	PickupObject,
} from "../../types/game";
import {
	makeDefaultObjectBehaviour,
	ObjectBehaviourEditor,
} from "../ObjectBehaviourEditor";
import { EntityInteractionEditor } from "./EntityInteractionEditor";
import { MapNpcInspector } from "./MapNpcInspector";
import type { MapInspectorSelection } from "./mapEditorSelection";
import { cloneCurrentProject } from "./useMapEditHistory";

const interactionTypes = [
	"none",
	"show_message",
	"object_behaviour",
	"collect_item",
	"area_link",
	"teleport",
	"play_cutscene",
	"start_dialogue",
	"open_shop",
	"set_flag",
	"change_movement_mode",
] as const;

type InteractionTypeOption = (typeof interactionTypes)[number];
const activationModes: InteractionActivationMode[] = [
	"on_touch",
	"on_interact",
	"both",
	"disabled",
];

type MapInspectorProps = {
	project: GameProject;
	activeArea: GameArea;
	selected: MapInspectorSelection;
	selectedTerrainId: string;
	selectedOverlayId: string;
	recordMapEdit: (before: GameProject) => void;
};

// Inspector edits use the same store mutations as the workspace. Only deletions
// join the existing map-history transactions; ordinary field edits are unchanged.
export function MapInspector({
	project,
	activeArea,
	selected,
	selectedTerrainId,
	selectedOverlayId,
	recordMapEdit,
}: MapInspectorProps) {
	const {
		selectedEventBlock,
		selectedMapStructure,
		selectedObject,
		selectedPickup,
		selectedNpc,
		selectedResolvedNpc,
		selectedOverlayTile,
		selectedTerrainTile,
	} = selected;
	const setTiles = useProjectStore((state) => state.setTiles);
	const setTerrainHeights = useProjectStore((state) => state.setTerrainHeights);
	const setOverlayTiles = useProjectStore((state) => state.setOverlayTiles);
	const eraseOverlayTiles = useProjectStore((state) => state.eraseOverlayTiles);
	const updateStructure = useProjectStore((state) => state.updateStructure);
	const deleteStructure = useProjectStore((state) => state.deleteStructure);
	const updateObject = useProjectStore((state) => state.updateObject);
	const deleteObject = useProjectStore((state) => state.deleteObject);
	const updatePickup = useProjectStore((state) => state.updatePickup);
	const deletePickup = useProjectStore((state) => state.deletePickup);
	const updateNpc = useProjectStore((state) => state.updateNpc);
	const addNpc = useProjectStore((state) => state.addNpc);
	const deleteNpc = useProjectStore((state) => state.deleteNpc);
	const updateEventBlock = useProjectStore((state) => state.updateEventBlock);
	const deleteEventBlock = useProjectStore((state) => state.deleteEventBlock);
	const updateProject = useProjectStore((state) => state.updateProject);
	const setSelection = useProjectStore((state) => state.setEditorSelection);
	const linkTargetArea = selectedEventBlock?.link?.targetAreaId
		? project.areas.find(
				(area) => area.id === selectedEventBlock.link?.targetAreaId,
			)
		: undefined;
	const defaultLinkTargetArea =
		linkTargetArea ??
		project.areas.find((area) => area.id !== activeArea.id) ??
		project.areas[0];
	const linkTargetEventBlocks = defaultLinkTargetArea?.eventBlocks ?? [];
	const selectedLinkTargetEventBlockId =
		selectedEventBlock?.link?.targetEventBlockId ??
		linkTargetEventBlocks[0]?.id ??
		"";

	function updateSelectedEventBlock(patch: Partial<EventBlock>) {
		if (selectedEventBlock) {
			updateEventBlock(selectedEventBlock.id, patch);
		}
	}

	function updateSelectedStructure(
		patch: Parameters<typeof updateStructure>[1],
	) {
		if (selectedMapStructure) {
			updateStructure(selectedMapStructure.id, patch);
		}
	}

	function updateSelectedPickup(patch: Partial<PickupObject>) {
		if (selectedPickup) {
			updatePickup(selectedPickup.id, patch);
		}
	}

	function updateSelectedObject(patch: Partial<ObjectInstance>) {
		if (selectedObject) {
			updateObject(selectedObject.id, patch);
		}
	}

	function updateSelectedNpc(patch: Partial<NPCInstance>) {
		if (selectedNpc) {
			updateNpc(selectedNpc.id, patch);
		}
	}

	function makeDefaultAreaLink(targetAreaId = defaultLinkTargetArea?.id ?? "") {
		const targetArea =
			project.areas.find((area) => area.id === targetAreaId) ??
			defaultLinkTargetArea;
		return {
			targetAreaId: targetArea?.id ?? "",
			targetEventBlockId: targetArea?.eventBlocks[0]?.id ?? "",
		};
	}

	function updateSelectedEventKind(kind: EventBlock["kind"]) {
		if (kind === "area_link") {
			const link = makeDefaultAreaLink();
			updateSelectedEventBlock({
				kind,
				link,
				interaction: {
					type: "area_link",
					activationMode: "on_touch",
					...link,
				},
			});
			return;
		}

		updateSelectedEventBlock({
			kind,
			link: undefined,
			...(selectedEventBlock?.interaction?.type === "area_link"
				? { interaction: undefined }
				: {}),
		});
	}

	function updateSelectedAreaLink(
		link: ReturnType<typeof makeDefaultAreaLink>,
	) {
		updateSelectedEventBlock({
			link,
			interaction:
				selectedEventBlock?.interaction?.type === "area_link"
					? {
							...selectedEventBlock.interaction,
							targetAreaId: link.targetAreaId,
							targetEventBlockId: link.targetEventBlockId,
						}
					: {
							type: "area_link",
							activationMode: "on_touch",
							targetAreaId: link.targetAreaId,
							targetEventBlockId: link.targetEventBlockId,
						},
		});
	}

	function updateSelectedAreaLinkTargetArea(targetAreaId: string) {
		updateSelectedAreaLink(makeDefaultAreaLink(targetAreaId));
	}

	function updateSelectedAreaLinkTargetEvent(targetEventBlockId: string) {
		if (!defaultLinkTargetArea) {
			return;
		}

		updateSelectedAreaLink({
			targetAreaId: defaultLinkTargetArea.id,
			targetEventBlockId,
		});
	}

	function getInteractionTargetArea(interaction?: Interaction) {
		if (interaction?.type !== "area_link" && interaction?.type !== "teleport") {
			return (
				project.areas.find((area) => area.id !== activeArea.id) ??
				project.areas[0]
			);
		}

		return (
			project.areas.find((area) => area.id === interaction.targetAreaId) ??
			project.areas[0]
		);
	}

	function getDefaultActivationMode(
		type: Exclude<InteractionTypeOption, "none">,
	): InteractionActivationMode {
		if (selectedMapStructure || selectedObject) {
			return "on_interact";
		}

		if (!selectedEventBlock) {
			return "on_interact";
		}

		if (
			selectedEventBlock.kind === "trigger" ||
			selectedEventBlock.kind === "area_link"
		) {
			return "on_touch";
		}

		return type === "area_link" || type === "teleport"
			? "on_touch"
			: "on_interact";
	}

	function getDefaultPrompt(
		type: Exclude<InteractionTypeOption, "none">,
		mode: Interaction["mode"] = "walk",
	) {
		if (type === "area_link" || type === "teleport") {
			return "Press E to enter";
		}

		if (type === "change_movement_mode") {
			return mode === "sail" ? "Press E to board" : "Press E to ride";
		}

		if (type === "start_dialogue") {
			return "Press E to talk";
		}

		if (type === "open_shop") {
			return "Press E to shop";
		}

		return "Press E to inspect";
	}

	function makeDefaultInteraction(
		type: Exclude<InteractionTypeOption, "none">,
	): Interaction {
		if (type === "collect_item")
			return { type, activationMode: "on_interact", quantity: 1 };
		if (type === "show_message" || type === "object_behaviour")
			return { type, activationMode: "on_interact", lines: [""] };
		const activationMode = getDefaultActivationMode(type);

		if (type === "play_cutscene") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				cutsceneId: project.cutscenes[0]?.id ?? "",
			};
		}

		if (type === "set_flag") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				flag: "flag_1",
				value: true,
			};
		}

		if (type === "start_dialogue") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				dialogueId: project.dialogues[0]?.id ?? "",
			};
		}

		if (type === "open_shop") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				shopId: project.shops[0]?.id ?? "",
			};
		}

		if (type === "change_movement_mode") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type, "walk"),
				mode: "walk",
			};
		}

		const targetArea =
			project.areas.find((area) => area.id !== activeArea.id) ??
			project.areas[0];
		return {
			type,
			activationMode,
			prompt: getDefaultPrompt(type),
			targetAreaId: targetArea?.id ?? "",
			targetEventBlockId: targetArea?.eventBlocks[0]?.id ?? "",
		};
	}

	function updateSelectedInteraction(interaction?: Interaction) {
		if (selectedMapStructure) {
			updateSelectedStructure({ interaction });
			return;
		}

		if (selectedObject) {
			updateSelectedObject({ interaction });
			return;
		}

		if (selectedNpc) {
			updateSelectedNpc({ interaction, interactionOverride: interaction });
			return;
		}

		if (selectedEventBlock) {
			updateSelectedEventBlock({
				interaction,
				...(selectedEventBlock.kind === "area_link"
					? interaction?.type === "area_link" &&
						interaction.targetAreaId &&
						interaction.targetEventBlockId
						? {
								link: {
									targetAreaId: interaction.targetAreaId,
									targetEventBlockId: interaction.targetEventBlockId,
								},
							}
						: { link: undefined }
					: {}),
			});
		}
	}

	function countRulesTargeting(targetId?: string) {
		if (!targetId) {
			return 0;
		}

		return project.rules.filter(
			(rule) =>
				(rule.trigger.type === "on_interact" ||
					rule.trigger.type === "on_touch") &&
				rule.trigger.targetId === targetId,
		).length;
	}

	function renderInteractionEditor(
		interaction?: Interaction,
		targetId?: string,
	) {
		const interactionType = interaction?.type ?? "none";
		const targetArea = getInteractionTargetArea(interaction);
		const targetEventBlocks = targetArea?.eventBlocks ?? [];
		const targetingRuleCount = countRulesTargeting(targetId);
		const hasDirectInteraction =
			Boolean(interaction) && interaction?.activationMode !== "disabled";

		return (
			<div className="interaction-editor">
				<EntityInteractionEditor
					key={targetId}
					project={project}
					kind={
						selectedObject
							? "object"
							: selectedNpc
								? "npc"
								: selectedEventBlock
									? "event"
									: "structure"
					}
					name={
						selectedObject
							? (selectedObject.nameOverride ??
								project.objects.find(
									(d) => d.id === selectedObject.objectDefinitionId,
								)?.name ??
								"Object")
							: (selectedResolvedNpc?.name ??
								selectedEventBlock?.name ??
								"Object")
					}
					interaction={interaction}
					behaviour={
						selectedObject
							? (selectedObject.behaviourOverride ??
								project.objects.find(
									(d) => d.id === selectedObject.objectDefinitionId,
								)?.defaultBehaviour)
							: undefined
					}
					onChange={(next, behaviour) =>
						selectedObject
							? updateSelectedObject({
									interaction: next,
									...(behaviour ? { behaviourOverride: behaviour } : {}),
								})
							: selectedNpc &&
									next.type === "show_message" &&
									next.activationMode !== "disabled"
								? updateSelectedNpc({
										interaction: next,
										interactionOverride: next,
										attributesOverride: {
											...selectedNpc.attributesOverride,
											canInteract: true,
										},
									})
								: updateSelectedInteraction(next)
					}
					onCreateItem={(name) => {
						const id = `item_${crypto.randomUUID()}`;
						updateProject((draft) => {
							draft.items.push({ id, name, category: "misc", stackable: true });
						});
						return id;
					}}
				/>
				<details>
					<summary>Advanced interaction</summary>
					{hasDirectInteraction && targetingRuleCount > 0 ? (
						<div className="validation-message">
							This target has a direct interaction and rule-based logic. Both
							may run.
						</div>
					) : null}
					<label>
						Type
						<select
							onChange={(event) => {
								const nextType = event.target.value as InteractionTypeOption;
								updateSelectedInteraction(
									nextType === "none"
										? undefined
										: makeDefaultInteraction(nextType),
								);
							}}
							value={interactionType}
						>
							<option value="none">None</option>
							<option value="area_link">Area link</option>
							<option value="teleport">Teleport</option>
							<option value="play_cutscene">Play cutscene</option>
							<option value="show_message">Inline message / dialogue</option>
							<option value="object_behaviour">Object behaviour</option>
							<option value="collect_item">Pickup</option>
							<option value="start_dialogue">Start dialogue</option>
							<option value="open_shop">Open shop</option>
							<option value="set_flag">Set flag</option>
							<option value="change_movement_mode">Change movement mode</option>
						</select>
					</label>

					{interaction ? (
						<>
							<label>
								Activation
								<select
									onChange={(event) =>
										updateSelectedInteraction({
											...interaction,
											activationMode: event.target
												.value as InteractionActivationMode,
										})
									}
									value={interaction.activationMode}
								>
									{activationModes.map((mode) => (
										<option key={mode} value={mode}>
											{mode === "on_touch"
												? "On touch"
												: mode === "on_interact"
													? "On interact"
													: mode === "both"
														? "Both"
														: "Disabled"}
										</option>
									))}
								</select>
							</label>
							<label>
								Prompt
								<input
									onChange={(event) =>
										updateSelectedInteraction({
											...interaction,
											prompt: event.target.value,
										})
									}
									placeholder={getDefaultPrompt(
										interaction.type,
										interaction.mode,
									)}
									value={interaction.prompt ?? ""}
								/>
							</label>
						</>
					) : null}

					{interaction?.type === "area_link" ||
					interaction?.type === "teleport" ? (
						<>
							<label>
								Target area
								<select
									onChange={(event) => {
										const nextArea = project.areas.find(
											(area) => area.id === event.target.value,
										);
										updateSelectedInteraction({
											...interaction,
											targetAreaId: event.target.value,
											targetEventBlockId: nextArea?.eventBlocks[0]?.id ?? "",
										});
									}}
									value={targetArea?.id ?? ""}
								>
									{project.areas.map((area) => (
										<option key={area.id} value={area.id}>
											{area.name}
										</option>
									))}
								</select>
							</label>
							<label>
								Target spawn/event
								<select
									onChange={(event) =>
										updateSelectedInteraction({
											...interaction,
											targetAreaId:
												targetArea?.id ?? interaction.targetAreaId ?? "",
											targetEventBlockId: event.target.value,
										})
									}
									value={interaction.targetEventBlockId ?? ""}
								>
									{targetEventBlocks.map((eventBlock) => (
										<option key={eventBlock.id} value={eventBlock.id}>
											{eventBlock.name} ({eventBlock.kind})
										</option>
									))}
								</select>
							</label>
						</>
					) : null}

					{interaction?.type === "play_cutscene" ? (
						<label>
							Cutscene
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										cutsceneId: event.target.value,
									})
								}
								value={interaction.cutsceneId ?? ""}
							>
								{project.cutscenes.map((cutscene) => (
									<option key={cutscene.id} value={cutscene.id}>
										{cutscene.name}
									</option>
								))}
							</select>
						</label>
					) : null}

					{interaction?.type === "start_dialogue" ? (
						<label>
							Dialogue
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										dialogueId: event.target.value,
									})
								}
								value={interaction.dialogueId ?? ""}
							>
								<option value="">Select dialogue</option>
								{project.dialogues.map((dialogue) => (
									<option key={dialogue.id} value={dialogue.id}>
										{dialogue.name}
									</option>
								))}
							</select>
						</label>
					) : null}

					{interaction?.type === "open_shop" ? (
						<label>
							Shop
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										shopId: event.target.value,
									})
								}
								value={interaction.shopId ?? ""}
							>
								<option value="">Select shop</option>
								{project.shops.map((shop) => (
									<option key={shop.id} value={shop.id}>
										{shop.name}
									</option>
								))}
							</select>
						</label>
					) : null}

					{interaction?.type === "set_flag" ? (
						<>
							<label>
								Flag
								<input
									onChange={(event) =>
										updateSelectedInteraction({
											...interaction,
											flag: event.target.value,
										})
									}
									value={interaction.flag ?? ""}
								/>
							</label>
							{interaction.flag &&
							!(interaction.flag in project.gameState.flags) ? (
								<div className="validation-message">
									Missing flag "{interaction.flag}".
									<button
										onClick={() =>
											updateProject((draft) => {
												if (interaction.flag) {
													draft.gameState.flags[interaction.flag] = false;
												}
											})
										}
										type="button"
									>
										Create flag
									</button>
								</div>
							) : null}
							<label>
								Set flag to:
								<select
									onChange={(event) =>
										updateSelectedInteraction({
											...interaction,
											value: event.target.value === "true",
										})
									}
									value={String(interaction.value ?? true)}
								>
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							</label>
						</>
					) : null}

					{interaction?.type === "change_movement_mode" ? (
						<label>
							Mode
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										mode: event.target.value as NonNullable<
											Interaction["mode"]
										>,
									})
								}
								value={interaction.mode ?? "walk"}
							>
								<option value="walk">Walk</option>
								<option value="sail">Sail</option>
								<option value="ride">Ride</option>
							</select>
						</label>
					) : null}
				</details>
			</div>
		);
	}

	function deleteSelectedEventBlock() {
		if (!selectedEventBlock) {
			return;
		}

		const before = cloneCurrentProject();
		deleteEventBlock(selectedEventBlock.id);
		setSelection({ type: "area", areaId: activeArea.id });
		recordMapEdit(before);
	}

	function movementRuleSummary(
		rule?: MovementRule,
		fallback = "No explicit rule",
	) {
		if (!rule || Object.keys(rule).length === 0) {
			return fallback;
		}

		const walkable =
			rule.walkable === undefined
				? "inherits walkability"
				: rule.walkable
					? "walkable"
					: "blocked";
		const mode = rule.movementMode
			? `mode ${rule.movementMode}`
			: "default mode";
		const speed = rule.speedMultiplier
			? `speed x${rule.speedMultiplier}`
			: "speed x1";
		return `${walkable}, ${mode}, ${speed}`;
	}

	function deleteSelectedStructure() {
		if (!selectedMapStructure) {
			return;
		}

		const before = cloneCurrentProject();
		deleteStructure(selectedMapStructure.id);
		setSelection({ type: "area", areaId: activeArea.id });
		recordMapEdit(before);
	}

	function deleteSelectedObject() {
		if (!selectedObject) {
			return;
		}

		const before = cloneCurrentProject();
		deleteObject(selectedObject.id);
		setSelection({ type: "area", areaId: activeArea.id });
		recordMapEdit(before);
	}

	function deleteSelectedPickup() {
		if (!selectedPickup) {
			return;
		}

		const before = cloneCurrentProject();
		deletePickup(selectedPickup.id);
		setSelection({ type: "area", areaId: activeArea.id });
		recordMapEdit(before);
	}

	function deleteSelectedNpc() {
		if (!selectedNpc) {
			return;
		}

		const before = cloneCurrentProject();
		deleteNpc(selectedNpc.id);
		setSelection({ type: "area", areaId: activeArea.id });
		recordMapEdit(before);
	}

	function duplicateSelectedNpc() {
		if (!selectedNpc) return;
		const before = cloneCurrentProject();
		const id = addNpc(
			selectedNpc.x,
			selectedNpc.y,
			selectedNpc.npcDefinitionId,
		);
		const { id: _id, ...copy } = structuredClone(selectedNpc);
		updateNpc(id, copy);
		setSelection({ type: "npc", areaId: activeArea.id, id });
		recordMapEdit(before);
	}

	function renderAreaInspector() {
		return (
			<>
				<div className="panel-title">Area Summary</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{activeArea.name} ({activeArea.kind})
					</div>
					<div className="coordinate-readout">
						{activeArea.width} x {activeArea.height} tiles,{" "}
						{activeArea.tileSize}px tiles
					</div>
					<div className="coordinate-readout">
						{activeArea.terrainTiles.length} terrain tiles,{" "}
						{activeArea.overlayTiles.length} overlays,{" "}
						{activeArea.structures.length} structures,{" "}
						{activeArea.objects.length} objects, {activeArea.pickups.length}{" "}
						pickups, {activeArea.npcs.length} NPCs,{" "}
						{activeArea.eventBlocks.length} events
					</div>
					<button
						className="full-width"
						onClick={() =>
							setSelection({ type: "area", areaId: activeArea.id })
						}
						type="button"
					>
						Select area
					</button>
				</div>
			</>
		);
	}

	function renderTerrainInspector() {
		if (!selectedTerrainTile) {
			return renderAreaInspector();
		}

		const terrain = getTerrainPreset(selectedTerrainTile.tileId);

		return (
			<>
				<div className="panel-title">Terrain</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{terrain.label} ({selectedTerrainTile.tileId}) at x{" "}
						{selectedTerrainTile.x}, y {selectedTerrainTile.y}
					</div>
					<div className="coordinate-readout">
						{movementRuleSummary(terrain.movementRule)}
					</div>
					<label>
						Height
						<input
							max="8"
							min="-2"
							onChange={(event) =>
								setTerrainHeights([
									{
										height: Number(event.target.value),
										x: selectedTerrainTile.x,
										y: selectedTerrainTile.y,
									},
								])
							}
							type="number"
							value={selectedTerrainTile.height}
						/>
					</label>
					<button
						onClick={() =>
							setTiles([
								{
									x: selectedTerrainTile.x,
									y: selectedTerrainTile.y,
									tileId: selectedTerrainId,
								},
							])
						}
						type="button"
					>
						Replace with selected terrain
					</button>
					<button
						onClick={() =>
							setTiles([
								{
									x: selectedTerrainTile.x,
									y: selectedTerrainTile.y,
									tileId: "grass",
								},
							])
						}
						type="button"
					>
						Reset to grass
					</button>
				</div>
			</>
		);
	}

	function renderOverlayInspector() {
		if (!selectedOverlayTile?.overlayId) {
			return renderTerrainInspector();
		}

		const overlay = getOverlayPreset(selectedOverlayTile.overlayId);

		return (
			<>
				<div className="panel-title">Overlay</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{overlay.label} ({selectedOverlayTile.overlayId}) at x{" "}
						{selectedOverlayTile.x}, y {selectedOverlayTile.y}
					</div>
					<div className="coordinate-readout">
						{movementRuleSummary(overlay.movementRule, "Uses terrain movement")}
					</div>
					<button
						onClick={() =>
							setOverlayTiles([
								{
									x: selectedOverlayTile.x,
									y: selectedOverlayTile.y,
									overlayId: selectedOverlayId,
								},
							])
						}
						type="button"
					>
						Replace with selected overlay
					</button>
					<button
						className="danger-button"
						onClick={() => {
							eraseOverlayTiles([
								{ x: selectedOverlayTile.x, y: selectedOverlayTile.y },
							]);
							setSelection({
								type: "terrain",
								areaId: activeArea.id,
								x: selectedOverlayTile.x,
								y: selectedOverlayTile.y,
							});
						}}
						type="button"
					>
						Delete overlay
					</button>
				</div>
			</>
		);
	}

	function renderStructureInspector() {
		if (!selectedMapStructure) {
			return renderAreaInspector();
		}

		const preset = getStructurePreset(selectedMapStructure.structureId);

		return (
			<>
				<div className="panel-title">Structure</div>
				<div className="form-stack">
					<label>
						Name
						<input
							onChange={(event) =>
								updateSelectedStructure({ name: event.target.value })
							}
							value={selectedMapStructure.name}
						/>
					</label>
					<label>
						Type
						<select
							onChange={(event) => {
								const nextPreset = getStructurePreset(event.target.value);
								updateSelectedStructure({
									structureId: nextPreset.id,
									widthTiles: nextPreset.widthTiles,
									heightTiles: nextPreset.heightTiles,
									blocksMovement: nextPreset.blocksMovement,
								});
							}}
							value={selectedMapStructure.structureId}
						>
							{structurePresets.map((structure) => (
								<option key={structure.id} value={structure.id}>
									{structure.label}
								</option>
							))}
						</select>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedStructure({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedMapStructure.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedStructure({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedMapStructure.y}
							/>
						</label>
						<label>
							Width
							<input
								min={1}
								onChange={(event) =>
									updateSelectedStructure({
										widthTiles: Math.max(1, Number(event.target.value)),
									})
								}
								type="number"
								value={selectedMapStructure.widthTiles}
							/>
						</label>
						<label>
							Height
							<input
								min={1}
								onChange={(event) =>
									updateSelectedStructure({
										heightTiles: Math.max(1, Number(event.target.value)),
									})
								}
								type="number"
								value={selectedMapStructure.heightTiles}
							/>
						</label>
					</div>
					<label className="checkbox-row standalone">
						<input
							checked={selectedMapStructure.blocksMovement}
							onChange={(event) =>
								updateSelectedStructure({
									blocksMovement: event.target.checked,
								})
							}
							type="checkbox"
						/>
						Blocks movement
					</label>
					<div className="coordinate-readout">
						Preset movement:{" "}
						{movementRuleSummary(
							selectedMapStructure.movementRule ?? preset.movementRule,
						)}
					</div>
					{renderInteractionEditor(
						selectedMapStructure.interaction,
						selectedMapStructure.id,
					)}
					<button
						className="danger-button"
						onClick={deleteSelectedStructure}
						type="button"
					>
						Delete structure
					</button>
				</div>
			</>
		);
	}

	function renderPickupInspector() {
		if (!selectedPickup) {
			return renderAreaInspector();
		}

		return (
			<>
				<div className="panel-title">Pickup</div>
				<div className="form-stack">
					<label>
						Item
						<select
							onChange={(event) =>
								updateSelectedPickup({ itemId: event.target.value })
							}
							value={selectedPickup.itemId}
						>
							{project.items.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Quantity
						<input
							min={1}
							onChange={(event) =>
								updateSelectedPickup({
									quantity: Math.max(1, Number(event.target.value)),
								})
							}
							type="number"
							value={selectedPickup.quantity}
						/>
					</label>
					<label>
						Pickup mode
						<select
							onChange={(event) =>
								updateSelectedPickup({
									pickupMode: event.target.value as PickupObject["pickupMode"],
								})
							}
							value={selectedPickup.pickupMode}
						>
							<option value="on_touch">On touch</option>
							<option value="on_interact">On interact</option>
						</select>
					</label>
					<label className="checkbox-row standalone">
						<input
							checked={selectedPickup.once}
							onChange={(event) =>
								updateSelectedPickup({ once: event.target.checked })
							}
							type="checkbox"
						/>
						Collect once per play session
					</label>
					<div className="coordinate-readout">
						x {selectedPickup.x}, y {selectedPickup.y}
					</div>
					<button
						className="danger-button"
						onClick={deleteSelectedPickup}
						type="button"
					>
						Delete pickup
					</button>
				</div>
			</>
		);
	}

	function parseObjectStateValue(rawValue: string): boolean | number | string {
		if (rawValue === "true") {
			return true;
		}

		if (rawValue === "false") {
			return false;
		}

		const numberValue = Number(rawValue);
		return rawValue.trim() !== "" && Number.isFinite(numberValue)
			? numberValue
			: rawValue;
	}

	function renderObjectInspector() {
		if (!selectedObject) {
			return renderAreaInspector();
		}

		const definition = project.objects.find(
			(object) => object.id === selectedObject.objectDefinitionId,
		);
		const blocksMovement =
			selectedObject.blocksMovement ?? definition?.blocksMovement ?? false;
		const objectState = selectedObject.state ?? {};
		const resolvedBehaviour =
			selectedObject.behaviourOverride ??
			definition?.defaultBehaviour ??
			makeDefaultObjectBehaviour("none");
		const useDefaultBehaviour = !selectedObject.behaviourOverride;

		return (
			<>
				<div className="panel-title">Object Instance</div>
				<div className="form-stack">
					<label>
						Definition
						<select
							onChange={(event) => {
								const nextDefinition = project.objects.find(
									(object) => object.id === event.target.value,
								);
								updateSelectedObject({
									objectDefinitionId: event.target.value,
									widthTiles: nextDefinition?.widthTiles ?? 1,
									heightTiles: nextDefinition?.heightTiles ?? 1,
									blocksMovement: nextDefinition?.blocksMovement ?? false,
									interaction: nextDefinition?.defaultInteraction,
								});
							}}
							value={selectedObject.objectDefinitionId}
						>
							{project.objects.map((object) => (
								<option key={object.id} value={object.id}>
									{object.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Name override
						<input
							onChange={(event) =>
								updateSelectedObject({
									nameOverride: event.target.value || undefined,
								})
							}
							value={selectedObject.nameOverride ?? ""}
						/>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedObject({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedObject.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedObject({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedObject.y}
							/>
						</label>
					</div>
					<label className="checkbox-row standalone">
						<input
							checked={blocksMovement}
							onChange={(event) =>
								updateSelectedObject({ blocksMovement: event.target.checked })
							}
							type="checkbox"
						/>
						Blocks movement
					</label>
					<div className="coordinate-readout">
						Footprint:{" "}
						{selectedObject.widthTiles ?? definition?.widthTiles ?? 1} x{" "}
						{selectedObject.heightTiles ?? definition?.heightTiles ?? 1} tiles
					</div>
					{renderInteractionEditor(
						selectedObject.interaction ?? definition?.defaultInteraction,
						selectedObject.id,
					)}
					<details>
						<summary>Advanced object behaviour</summary>
						<div className="coordinate-readout">
							Resolved behaviour: {resolvedBehaviour.type}
						</div>
						<label className="checkbox-row standalone">
							<input
								checked={useDefaultBehaviour}
								onChange={(event) =>
									updateSelectedObject({
										behaviourOverride: event.target.checked
											? undefined
											: resolvedBehaviour,
									})
								}
								type="checkbox"
							/>
							Use definition default behaviour
						</label>
						{!useDefaultBehaviour ? (
							<ObjectBehaviourEditor
								behaviour={
									selectedObject.behaviourOverride ??
									makeDefaultObjectBehaviour("none")
								}
								onChange={(behaviour: ObjectBehaviour) =>
									updateSelectedObject({ behaviourOverride: behaviour })
								}
								project={project}
							/>
						) : null}
					</details>
					<div className="panel-title secondary">State</div>
					{Object.entries(objectState).map(([key, value]) => (
						<div className="state-row variable" key={key}>
							<input
								aria-label={`Object state ${key} key`}
								onChange={(event) => {
									const nextKey = event.target.value.trim();
									const nextState = { ...objectState };
									delete nextState[key];
									if (nextKey) {
										nextState[nextKey] = value;
									}
									updateSelectedObject({ state: nextState });
								}}
								value={key}
							/>
							<input
								aria-label={`Object state ${key} value`}
								onChange={(event) =>
									updateSelectedObject({
										state: {
											...objectState,
											[key]: parseObjectStateValue(event.target.value),
										},
									})
								}
								value={String(value)}
							/>
							<button
								className="danger-button compact"
								onClick={() => {
									const nextState = { ...objectState };
									delete nextState[key];
									updateSelectedObject({ state: nextState });
								}}
								type="button"
							>
								Delete
							</button>
						</div>
					))}
					<button
						onClick={() =>
							updateSelectedObject({
								state: {
									...objectState,
									[`state_${Object.keys(objectState).length + 1}`]: false,
								},
							})
						}
						type="button"
					>
						Add state
					</button>
					<button
						className="danger-button"
						onClick={deleteSelectedObject}
						type="button"
					>
						Delete object instance
					</button>
				</div>
			</>
		);
	}

	function renderEventInspector() {
		if (!selectedEventBlock) {
			return renderAreaInspector();
		}

		return (
			<>
				<div className="panel-title">Event Block</div>
				<div className="form-stack">
					<label>
						Name
						<input
							onChange={(event) =>
								updateSelectedEventBlock({ name: event.target.value })
							}
							value={selectedEventBlock.name}
						/>
					</label>
					<label>
						Tag
						<input
							onChange={(event) =>
								updateSelectedEventBlock({ tag: event.target.value })
							}
							value={selectedEventBlock.tag}
						/>
					</label>
					<label>
						Kind
						<select
							onChange={(event) =>
								updateSelectedEventKind(
									event.target.value as EventBlock["kind"],
								)
							}
							value={selectedEventBlock.kind}
						>
							<option value="spawn">Spawn</option>
							<option value="trigger">Trigger</option>
							<option value="area_link">Area Link</option>
						</select>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedEventBlock({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedEventBlock.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedEventBlock({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedEventBlock.y}
							/>
						</label>
					</div>
					{selectedEventBlock.kind === "area_link" ? (
						<>
							<label>
								Target area
								<select
									onChange={(event) =>
										updateSelectedAreaLinkTargetArea(event.target.value)
									}
									value={defaultLinkTargetArea?.id ?? ""}
								>
									{project.areas.map((area) => (
										<option key={area.id} value={area.id}>
											{area.name}
										</option>
									))}
								</select>
							</label>
							<label>
								Target spawn/event
								<select
									onChange={(event) =>
										updateSelectedAreaLinkTargetEvent(event.target.value)
									}
									value={selectedLinkTargetEventBlockId}
								>
									{linkTargetEventBlocks.map((eventBlock) => (
										<option key={eventBlock.id} value={eventBlock.id}>
											{eventBlock.name} ({eventBlock.kind})
										</option>
									))}
								</select>
							</label>
						</>
					) : null}
					<div className="coordinate-readout">
						{selectedEventBlock.kind === "spawn"
							? "Spawn"
							: selectedEventBlock.kind === "area_link"
								? "Link"
								: "Trigger"}{" "}
						at x {selectedEventBlock.x}, y {selectedEventBlock.y}
					</div>
					{renderInteractionEditor(
						selectedEventBlock.interaction,
						selectedEventBlock.id,
					)}
					<button
						className="danger-button"
						onClick={deleteSelectedEventBlock}
						type="button"
					>
						Delete event block
					</button>
				</div>
			</>
		);
	}

	function renderInspector() {
		if (selectedEventBlock) {
			return renderEventInspector();
		}

		if (selectedMapStructure) {
			return renderStructureInspector();
		}

		if (selectedObject) {
			return renderObjectInspector();
		}

		if (selectedPickup) {
			return renderPickupInspector();
		}

		if (selectedNpc) {
			return (
				<MapNpcInspector
					project={project}
					selectedNpc={selectedNpc}
					updateSelectedNpc={updateSelectedNpc}
					deleteSelectedNpc={deleteSelectedNpc}
					duplicateSelectedNpc={duplicateSelectedNpc}
					interactionEditor={renderInteractionEditor(
						selectedResolvedNpc?.interaction,
						selectedNpc.id,
					)}
				/>
			);
		}

		if (selectedOverlayTile?.overlayId) {
			return renderOverlayInspector();
		}

		if (selectedTerrainTile) {
			return renderTerrainInspector();
		}

		return renderAreaInspector();
	}

	return renderInspector();
}
