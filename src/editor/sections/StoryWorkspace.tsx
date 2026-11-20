import { useMemo, useState } from "react";
import { resolveObjectBehaviour } from "../../runtime/interactionDiscovery";
import { useProjectStore } from "../../store/useProjectStore";
import type { ConditionExpression } from "../../types/game";
import { DialogueEntityPicker } from "./DialogueEntityControls";
import {
	actionSummary,
	createDialogueEntity,
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { openEntitySource, useEditorSource } from "./editorSource";
import { logicConditionLabel, triggerLabel } from "./logicBlocksModel";
import { objectiveSummary } from "./questSequenceModel";
import { StoryContextActions } from "./StoryContextActions";
import {
	type StoryRelationship,
	storyReferenceIndex,
} from "./storyReferenceIndex";
import { useMapEditHistory } from "./useMapEditHistory";

export function StoryWorkspace() {
	const project = useProjectStore((s) => s.project),
		focusKey = useProjectStore((s) => s.storyFocusKey);
	const setFocus = useProjectStore((s) => s.setStoryFocusKey);
	const entities = dialogueEntities(project);
	const selected =
		entities.find((e) => entityKey(e.ref) === focusKey) ??
		(!focusKey
			? (entities.find((e) => e.ref.kind === "npc") ?? entities[0])
			: undefined);
	const index = useMemo(() => storyReferenceIndex(project), [project]);
	const [brokenOnly, setBrokenOnly] = useState(false);
	const history = useMapEditHistory(project.activeAreaId, true);
	useEditorSource("story", (source) => setFocus(source.id));
	const key = selected ? entityKey(selected.ref) : focusKey;
	const outgoing = index.outgoing.get(key) ?? [],
		incoming = (index.incoming.get(key) ?? []).filter(
			(e) => entityKey(e.from) !== key,
		);
	const broken = index.relationships.filter((e) => e.missing);
	const choose = (ref: DialogueEntityRef) => {
		setFocus(entityKey(ref));
		setBrokenOnly(false);
	};
	const title = (ref: DialogueEntityRef) =>
		resolveDialogueEntity(project, ref)?.label ??
		`Missing ${ref.kind}: ${ref.id || "(unset)"}`;
	function renderEdge(edge: StoryRelationship) {
		return (
			<li
				key={edge.id}
				className={`story-relationship story-relationship-${edge.kind} ${edge.missing ? "missing" : ""}`}
				data-relationship-type={edge.kind}
			>
				<div className="story-relationship-kind">
					{edge.kind === "flow"
						? "Dialogue flow →"
						: edge.kind === "reference"
							? "Authored reference ↗"
							: "Derived dependency · read only"}
				</div>
				<div className="story-relationship-ends">
					<button type="button" onClick={() => choose(edge.from)}>
						{edge.fromLabel ?? title(edge.from)}
					</button>
					<span>{edge.label}</span>
					<button
						type="button"
						disabled={edge.missing}
						onClick={() => choose(edge.to)}
					>
						{edge.toLabel ?? title(edge.to)}
					</button>
				</div>
				<button
					type="button"
					className="story-open-source"
					onClick={() =>
						useProjectStore.getState().openEditorSource(edge.source)
					}
				>
					Open owning field
				</button>
				{edge.missing && (
					<p role="status">
						Broken reference. Its original ID is preserved at the source.
					</p>
				)}
				{edge.warning && <small>{edge.warning}</small>}
			</li>
		);
	}
	function conditionText(expression?: ConditionExpression): string {
		if (!expression) return "Always";
		return expression.type === "group"
			? `${expression.operator === "AND" ? "ALL" : "ANY"} (${expression.conditions.map(conditionText).join("; ") || "empty, passes"})`
			: logicConditionLabel(project, expression);
	}
	const quest =
		selected?.ref.kind === "quest"
			? project.quests.find((q) => q.id === selected.ref.id)
			: undefined;
	const rule =
		selected?.ref.kind === "rule"
			? project.rules.find((r) => r.id === selected.ref.id)
			: undefined;
	const dialogue =
		selected?.ref.kind === "dialogue"
			? project.dialogues.find((d) => d.id === selected.ref.id)
			: undefined;
	const object =
		selected?.ref.kind === "object"
			? project.areas
					.find((a) => "areaId" in selected.ref && a.id === selected.ref.areaId)
					?.objects.find((o) => o.id === selected.ref.id)
			: undefined;
	return (
		<section className="editor-panel story-workspace">
			<aside className="tool-panel">
				<div className="panel-title">Story</div>
				<p>Follow the people, things and story state in your game.</p>
				<div className="dialogue-toolbar">
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
				</div>
				<DialogueEntityPicker
					scope="story"
					project={project}
					selected={selected?.ref}
					onSelect={choose}
					onCreate={(draft) => {
						let ref: DialogueEntityRef | undefined;
						useProjectStore.getState().updateProject((p) => {
							ref = createDialogueEntity(p, draft);
						});
						if (ref) choose(ref);
					}}
				/>
				<button
					type="button"
					aria-pressed={brokenOnly}
					onClick={() => setBrokenOnly(!brokenOnly)}
				>
					Broken references ({broken.length})
				</button>
			</aside>
			<main className="content-panel story-neighborhood">
				<div className="panel-title">
					{brokenOnly
						? "Broken relationships"
						: selected
							? `${selected.name} · Story relationships`
							: "Choose an entity"}
				</div>
				<p className="story-legend">
					<span>→ Dialogue flow</span>
					<span>↗ Authored reference</span>
					<span>┄ Derived dependency</span>
				</p>
				<p className="help-text">
					Only dialogue flow means “continue to this node”. References describe
					existing fields. Dependencies help you navigate.
				</p>
				{brokenOnly ? (
					<ul className="story-relationships">{broken.map(renderEdge)}</ul>
				) : (
					<>
						<h3>References from here</h3>
						{outgoing.length ? (
							<ul className="story-relationships">
								{outgoing.map(renderEdge)}
							</ul>
						) : (
							<p>No outgoing story references.</p>
						)}
						<h3>Used by</h3>
						{incoming.length ? (
							<ul className="story-relationships" aria-label="Used by">
								{incoming.map(renderEdge)}
							</ul>
						) : (
							<p>No recorded uses yet.</p>
						)}
					</>
				)}
			</main>
			<aside
				className="inspector-panel story-inspector"
				aria-label="Story inspector"
			>
				{selected ? (
					<>
						<h2>{selected.label}</h2>
						<p>{selected.detail}</p>
						<button
							type="button"
							onClick={() => openEntitySource(selected.ref)}
						>
							{"areaId" in selected.ref || selected.ref.kind === "area"
								? "Show on map"
								: selected.ref.kind === "dialogue"
									? "Open Dialogue Graph"
									: selected.ref.kind === "quest"
										? "Open Quest Sequence"
										: selected.ref.kind === "rule"
											? "Open Logic Blocks"
											: "Open source editor"}
						</button>
						{selected.ref.kind === "flag" && (
							<>
								<p>
									Default:{" "}
									{project.gameState.flags[selected.ref.id] ? "Yes" : "No"}
								</p>
								<p>
									Read by{" "}
									{
										incoming.filter(
											(e) => e.access === "read" || e.access === "observe",
										).length
									}{" "}
									· Written by{" "}
									{incoming.filter((e) => e.access === "write").length}
								</p>
							</>
						)}
						{quest && (
							<>
								<p>
									Starts:{" "}
									{quest.status === "active"
										? "At Play"
										: quest.status === "inactive"
											? "From interaction / action"
											: quest.status}
								</p>
								<p>
									{quest.objectiveMode === "sequence"
										? "In order"
										: "Any order — all required"}
								</p>
								<ol>
									{quest.objectives.map((o) => (
										<li key={o.id}>{objectiveSummary(project, o.condition)}</li>
									))}
								</ol>
								{quest.objectives.length === 0 && (
									<p role="status">Unfinished quest: no objectives yet.</p>
								)}
								<p>
									Completion:{" "}
									{quest.completionActions
										?.map((a) => actionSummary(a, project))
										.join(" → ") || "No effects"}
								</p>
							</>
						)}
						{dialogue && (
							<>
								<p>
									{dialogue.nodes.length} nodes ·{" "}
									{incoming.filter((e) => e.access === "assign").length}{" "}
									assigned placements
								</p>
								<p>
									Response conditions control visible choices; they do not
									choose the opening greeting.
								</p>
							</>
						)}
						{rule && (
							<>
								<p>WHEN {triggerLabel(project, rule.trigger)}</p>
								<p>IF {conditionText(rule.conditionTree)}</p>
								<p>
									THEN{" "}
									{rule.actions
										.map((a) => actionSummary(a, project))
										.join(" → ") || "No effects"}
								</p>
								<p>
									ELSE{" "}
									{rule.elseActions
										?.map((a) => actionSummary(a, project))
										.join(" → ") || "No effects"}
								</p>
								<p>
									{rule.enabled ? "Enabled" : "Disabled"} ·{" "}
									{rule.runPolicy === "once"
										? "Once per playthrough"
										: "Every time"}
								</p>
							</>
						)}
						{object && (
							<>
								<p>
									Effective behavior:{" "}
									{resolveObjectBehaviour(project, object).type}
								</p>
								{resolveObjectBehaviour(project, object).type === "none" && (
									<p>
										This prop has no native Door or Container behavior. A rule
										does not produce those native quest facts.
									</p>
								)}
							</>
						)}
						<details>
							<summary>Advanced identity</summary>
							<code>{selected.ref.id}</code>
							{"areaId" in selected.ref && <p>Area: {selected.ref.areaId}</p>}
						</details>
						<StoryContextActions
							key={key}
							project={project}
							selected={selected.ref}
						/>
					</>
				) : (
					<p>
						The selected entity is missing. Its relationships remain available
						for repair.
					</p>
				)}
			</aside>
		</section>
	);
}
