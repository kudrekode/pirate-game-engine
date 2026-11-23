import { ArrowUpRight, Copy, MapPin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, NativeSelect } from "@/components/ui/control";
import {
	resolveStoryMapPosition,
	type StoryField,
	storyFieldOptions,
	storyMapPositions,
	storyNodeCatalogue,
	storyOutputLabel,
} from "../../story/storyCatalogue";
import type {
	EditorSelection,
	GameProject,
	StoryEdge,
	StoryGraph,
	StoryNode,
} from "../../types/game";
import { openEntity } from "../project/navigation";
import type { StoryDebugEntry } from "./StoryCanvas";

export type StoryNavigationTarget =
	| { workspace: "map"; areaId: string; selection?: EditorSelection }
	| { workspace: "assets"; assetId: string }
	| { workspace: "cinematics"; cinematicId: string };

const graphKinds = {
	opening: "Opening sequence",
	quest: "Quest",
	event: "Gameplay event",
} as const;

export const storyGraphKinds = Object.entries(graphKinds) as [
	StoryGraph["kind"],
	string,
][];

export function StoryTextField({
	label,
	value,
	onCommit,
	placeholder,
	numeric,
}: {
	label: string;
	value: string | number;
	onCommit: (value: string) => void;
	placeholder?: string;
	numeric?: { min?: number; max?: number; step?: number };
}) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => setDraft(String(value)), [value]);
	return (
		<label className="story-graph-field">
			<span>{label}</span>
			<Input
				type={numeric ? "number" : "text"}
				min={numeric?.min}
				max={numeric?.max}
				step={numeric?.step ?? (numeric ? "any" : undefined)}
				value={draft}
				placeholder={placeholder}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (!numeric || (draft.trim() && Number.isFinite(Number(draft))))
						onCommit(draft);
					else setDraft(String(value));
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
		</label>
	);
}

function readField(node: StoryNode, key: string) {
	return (node.data as Record<string, unknown>)[key];
}

function hasPosition(node: StoryNode) {
	return (
		node.type === "spawn" ||
		node.type === "teleport" ||
		node.type === "waitLocation"
	);
}

export function describeStoryNode(project: GameProject, node: StoryNode) {
	if (hasPosition(node)) {
		const area = project.areas.find(({ id }) => id === node.data.areaId);
		const marker = storyMapPositions(project, node).find(
			({ entityId, entityType }) =>
				entityId === node.data.target?.id &&
				entityType === node.data.target.type,
		);
		if (marker) return `${area?.name ?? "Map"} · ${marker.label}`;
		if (area) return `${area.name} · ${node.data.x}, ${node.data.y}`;
	}
	const definition = storyNodeCatalogue[node.type];
	for (const field of [...definition.fields].reverse()) {
		const value = readField(node, field.key);
		const option = storyFieldOptions(project, node, field).find(
			(option) => option.value === value,
		);
		if (option) return option.label;
		if (field.kind === "text" && typeof value === "string" && value)
			return value;
		if (field.kind === "number" && node.type === "delay")
			return `${node.data.seconds}s`;
	}
	return definition.description;
}

type NodeProps = {
	project: GameProject;
	node: StoryNode;
	graph: StoryGraph;
	onNavigate: (target: StoryNavigationTarget) => void;
	onPatchData: (patch: Record<string, unknown>) => void;
	onRename: (title: string) => void;
	onDuplicate: () => void;
	onDelete: () => void;
	debug?: StoryDebugEntry;
};

function ReferenceLinks({
	field,
	option,
	onNavigate,
}: {
	field: StoryField;
	option?: ReturnType<typeof storyFieldOptions>[number];
	onNavigate: NodeProps["onNavigate"];
}) {
	if (!option) return null;
	const { value, areaId, assetId } = option;
	if (
		areaId &&
		(field.kind === "area" || field.kind === "npc" || field.kind === "event")
	) {
		const selection: EditorSelection =
			field.kind === "area"
				? { type: "area", areaId }
				: {
						type: field.kind === "npc" ? "npc" : "eventBlock",
						areaId,
						id: value,
					};
		return (
			<div className="story-graph-reference-links">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onNavigate({ workspace: "map", areaId, selection })}
				>
					<MapPin aria-hidden="true" />
					{field.kind === "area" ? "Open Map" : "Find in Map"}
				</Button>
				{assetId && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onNavigate({ workspace: "assets", assetId })}
					>
						Edit Asset
						<ArrowUpRight aria-hidden="true" />
					</Button>
				)}
			</div>
		);
	}
	if (field.kind === "cinematic") {
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() =>
					onNavigate({ workspace: "cinematics", cinematicId: value })
				}
			>
				Open Cinematic
				<ArrowUpRight aria-hidden="true" />
			</Button>
		);
	}
	const section = (
		{
			quest: "quests",
			item: "items",
			flag: "game-state",
			variable: "game-state",
			dialogue: "dialogues",
		} as const
	)[field.kind as "quest" | "item" | "flag" | "variable" | "dialogue"];
	if (!section) return null;
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() =>
				openEntity({
					section,
					id: value,
					field: section === "game-state" ? `state:${value}` : undefined,
				})
			}
		>
			Open {field.label}
		</Button>
	);
}

function StoryNodeField({
	project,
	node,
	field,
	onNavigate,
	onPatchData,
}: Pick<NodeProps, "project" | "node" | "onNavigate" | "onPatchData"> & {
	field: StoryField;
}) {
	const value = readField(node, field.key);
	const variableId = readField(node, "variableId");
	const variable =
		typeof variableId === "string"
			? project.gameState.variables[variableId]
			: undefined;
	function update(next: unknown) {
		const patch: Record<string, unknown> = { [field.key]: next };
		if (field.key === "areaId" && value !== next) {
			if ("npcId" in node.data) patch.npcId = "";
			if ("eventBlockId" in node.data) patch.eventBlockId = "";
			if (hasPosition(node)) patch.target = undefined;
		}
		if (field.key === "questId" && "objectiveId" in node.data && value !== next)
			patch.objectiveId = "";
		if (
			field.key === "dialogueId" &&
			"choiceId" in node.data &&
			value !== next
		) {
			patch.nodeId = "";
			patch.choiceId = "";
		}
		if (field.key === "nodeId" && "choiceId" in node.data && value !== next)
			patch.choiceId = "";
		if (
			field.key === "variableId" &&
			typeof next === "string" &&
			value !== next
		) {
			const initial = project.gameState.variables[next];
			if (typeof initial !== typeof readField(node, "value"))
				patch.value = initial ?? 0;
			if (
				typeof initial === "string" &&
				node.type === "compareVariable" &&
				!["==", "!="].includes(node.data.operator)
			)
				patch.operator = "==";
		}
		onPatchData(patch);
	}
	const numeric =
		field.kind === "coordinate" ||
		field.kind === "number" ||
		(field.kind === "value" && typeof variable !== "string");
	if (numeric || field.kind === "text" || field.kind === "value") {
		const area =
			field.kind === "coordinate" && hasPosition(node)
				? project.areas.find(({ id }) => id === node.data.areaId)
				: undefined;
		const max = area
			? (field.key === "x" ? area.width : area.height) - 1
			: field.max;
		return (
			<StoryTextField
				label={field.label}
				value={
					typeof value === "number" || typeof value === "string" ? value : ""
				}
				numeric={
					numeric ? { min: field.min, max, step: field.step } : undefined
				}
				onCommit={(next) => update(numeric ? Number(next) : next)}
			/>
		);
	}
	if (field.kind === "boolean") {
		return (
			<label className="story-graph-field">
				<span>{field.label}</span>
				<NativeSelect
					value={String(value)}
					onChange={(event) => update(event.target.value === "true")}
				>
					<option value="true">True</option>
					<option value="false">False</option>
				</NativeSelect>
			</label>
		);
	}
	const options = storyFieldOptions(project, node, field);
	const selected = options.find((option) => option.value === value);
	const current = typeof value === "string" ? value : "";
	return (
		<div className="story-graph-field-group">
			<label className="story-graph-field">
				<span>{field.label}</span>
				<NativeSelect
					value={current}
					onChange={(event) => update(event.target.value)}
				>
					<option value="">
						{options.length
							? `Choose ${field.label.toLowerCase()}`
							: "No matching references"}
					</option>
					{current && !selected && (
						<option value={current}>Missing reference · {current}</option>
					)}
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</NativeSelect>
			</label>
			<ReferenceLinks field={field} option={selected} onNavigate={onNavigate} />
		</div>
	);
}

function StoryMarkerField({
	node,
	project,
	onNavigate,
	onPatchData,
}: Pick<NodeProps, "project" | "node" | "onNavigate" | "onPatchData">) {
	if (!hasPosition(node) || !node.data.areaId) return null;
	const { data } = node;
	const positions = storyMapPositions(project, node);
	const current = data.target
		? JSON.stringify([data.target.type, data.target.id])
		: "";
	const selected = positions.find((position) => position.value === current);
	const tile = resolveStoryMapPosition(project, data);
	return (
		<div className="story-graph-field-group">
			<label className="story-graph-field">
				<span>Map marker or object</span>
				<NativeSelect
					value={current}
					onChange={(event) => {
						const next = positions.find(
							(position) => position.value === event.target.value,
						);
						onPatchData(
							next
								? {
										target: { type: next.entityType, id: next.entityId },
										x: next.x,
										y: next.y,
									}
								: {
										target: undefined,
										x: tile?.x ?? data.x,
										y: tile?.y ?? data.y,
									},
						);
					}}
				>
					<option value="">Manual tile coordinates</option>
					{current && !selected && (
						<option value={current}>Missing marker · {data.target?.id}</option>
					)}
					{positions.map((position) => (
						<option key={position.value} value={position.value}>
							{position.label}
						</option>
					))}
				</NativeSelect>
			</label>
			{tile && (
				<div className="story-graph-reference-links">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							onNavigate({
								workspace: "map",
								areaId: data.areaId,
								selection: selected
									? {
											type: selected.entityType,
											areaId: selected.areaId,
											id: selected.entityId,
										}
									: { type: "terrain", areaId: data.areaId, ...tile },
							})
						}
					>
						<MapPin aria-hidden="true" />
						Find in Map
					</Button>
					{selected?.assetId && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								onNavigate({
									workspace: "assets",
									assetId: selected.assetId as string,
								})
							}
						>
							Edit Asset
							<ArrowUpRight aria-hidden="true" />
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

export function StoryNodeInspector(props: NodeProps) {
	const { graph, node, debug, onRename, onDelete, onDuplicate } = props;
	const definition = storyNodeCatalogue[node.type];
	const linkedPosition = hasPosition(node) && Boolean(node.data.target);
	return (
		<>
			<header className="story-graph-sidehead">
				<p className="story-graph-eyebrow">Node inspector</p>
				<h2>{node.title || definition.label}</h2>
				<span className="story-graph-tag" data-category={definition.category}>
					{definition.category}
				</span>
			</header>
			<div className="story-graph-section story-graph-inspector-fields">
				<StoryTextField
					label="Node label"
					value={node.title ?? ""}
					placeholder={definition.label}
					onCommit={onRename}
				/>
				{definition.fields.map((field) => (
					<div className="story-graph-field-group" key={field.key}>
						{!(linkedPosition && field.kind === "coordinate") && (
							<StoryNodeField {...props} field={field} />
						)}
						{field.kind === "area" && hasPosition(node) && (
							<StoryMarkerField {...props} />
						)}
					</div>
				))}
				<p className="story-graph-note">{definition.description}</p>
			</div>
			<div className="story-graph-section">
				<h3>Connections</h3>
				<p>
					Inbound {graph.edges.filter(({ to }) => to === node.id).length} ·
					Outbound {graph.edges.filter(({ from }) => from === node.id).length}
				</p>
				{definition.outputs.length === 2 && (
					<p>Choose a destination for each True and False output.</p>
				)}
				{debug && (
					<p role="status">
						{debug.status}
						{debug.detail ? ` · ${debug.detail}` : ""}
					</p>
				)}
			</div>
			<div className="story-graph-section story-graph-reference-links">
				<Button type="button" variant="outline" size="sm" onClick={onDuplicate}>
					<Copy aria-hidden="true" />
					Duplicate node
				</Button>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={onDelete}
				>
					<Trash2 aria-hidden="true" />
					Delete node
				</Button>
			</div>
		</>
	);
}

export function StoryEdgeInspector({
	graph,
	edge,
	onRedirect,
	onDelete,
}: {
	graph: StoryGraph;
	edge: StoryEdge;
	onRedirect: (to: string) => void;
	onDelete: () => void;
}) {
	const from = graph.nodes.find((node) => node.id === edge.from);
	const destinations = graph.nodes.filter(
		(node) => storyNodeCatalogue[node.type].input,
	);
	const label = (node: StoryNode) =>
		node.title || storyNodeCatalogue[node.type].label;
	return (
		<>
			<header className="story-graph-sidehead">
				<p className="story-graph-eyebrow">Connection inspector</p>
				<h2>{storyOutputLabel(edge.port)} connection</h2>
			</header>
			<div className="story-graph-section story-graph-inspector-fields">
				<p>From {from ? label(from) : edge.from}</p>
				<label className="story-graph-field">
					<span>Destination</span>
					<NativeSelect
						value={edge.to}
						onChange={(event) => onRedirect(event.target.value)}
					>
						{!destinations.some(({ id }) => id === edge.to) && (
							<option value={edge.to}>Missing input · {edge.to}</option>
						)}
						{destinations.map((node) => (
							<option key={node.id} value={node.id}>
								{label(node)}
							</option>
						))}
					</NativeSelect>
				</label>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					className="justify-self-start"
					onClick={onDelete}
				>
					<Trash2 aria-hidden="true" />
					Delete connection
				</Button>
			</div>
		</>
	);
}

export function StoryGraphInspector({
	graph,
	onRename,
	onKind,
}: {
	graph: StoryGraph;
	onRename: (name: string) => void;
	onKind: (kind: StoryGraph["kind"]) => void;
}) {
	return (
		<>
			<header className="story-graph-sidehead">
				<p className="story-graph-eyebrow">Graph inspector</p>
				<h2>{graph.name || "Untitled graph"}</h2>
			</header>
			<div className="story-graph-section story-graph-inspector-fields">
				<StoryTextField
					label="Graph name"
					value={graph.name}
					onCommit={onRename}
				/>
				<label className="story-graph-field">
					<span>Graph type</span>
					<NativeSelect
						value={graph.kind}
						onChange={(event) =>
							onKind(event.target.value as StoryGraph["kind"])
						}
					>
						{storyGraphKinds.map(([kind, title]) => (
							<option key={kind} value={kind}>
								{title}
							</option>
						))}
					</NativeSelect>
				</label>
			</div>
		</>
	);
}
