import { ArrowUpRight, Plus, Redo2, Undo2, Workflow } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Button, Input } from "@/components/ui/control";
import type { StoryDebugSnapshot } from "../../runtime/storyRuntime";
import {
	createStoryNode,
	storyNodeCatalogue,
	storyNodeCategories,
	storyOutputLabel,
	validateStoryGraph,
} from "../../story/storyCatalogue";
import type { GameProject, StoryGraph, StoryNode } from "../../types/game";
import { openEntity } from "../project/navigation";
import {
	StoryCanvas,
	type StoryConnection,
	type StoryDebugEntry,
	type StorySelection,
	type StoryView,
} from "./StoryCanvas";
import {
	describeStoryNode,
	StoryEdgeInspector,
	StoryGraphInspector,
	type StoryNavigationTarget,
	StoryNodeInspector,
	storyGraphKinds,
} from "./StoryInspector";
import "./storyEditor.css";

type Focus = { graphId?: string; selection: StorySelection };
type Revision = { graphs: StoryGraph[]; focus: Focus };
type EditorMemory = {
	projectContextId: string;
	focus: Focus;
	views: Map<string, StoryView>;
	undo: Revision[];
	redo: Revision[];
};
let previousEditor: EditorMemory | undefined;
const maxHistory = 50;
const noGraphs: StoryGraph[] = [];
const catalogue = Object.entries(storyNodeCatalogue) as [
	StoryNode["type"],
	(typeof storyNodeCatalogue)[StoryNode["type"]],
][];
const graphKindLabels = Object.fromEntries(storyGraphKinds);

function editorMemory(projectContextId: string): EditorMemory {
	if (previousEditor?.projectContextId === projectContextId)
		return previousEditor;
	previousEditor = {
		projectContextId,
		focus: { selection: null },
		views: new Map(),
		undo: [],
		redo: [],
	};
	return previousEditor;
}

function idFor(prefix: string) {
	return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

type Props = {
	project: GameProject;
	projectContextId: string;
	onChange: (graphs: StoryGraph[]) => void;
	onNavigate: (target: StoryNavigationTarget) => void;
	onPlay: () => void;
	onLegacy: () => void;
	debug?: StoryDebugSnapshot;
	focusNode?: { graphId: string; nodeId: string };
};

export function StoryEditor(props: Props) {
	return <StoryWorkspace key={props.projectContextId} {...props} />;
}

function StoryWorkspace({
	project,
	projectContextId,
	onChange,
	onNavigate,
	onPlay,
	onLegacy,
	debug,
	focusNode,
}: Props) {
	const graphs = project.storyGraphs ?? noGraphs;
	const [memory] = useState(() => editorMemory(projectContextId));
	const [focus, setFocus] = useState(memory.focus);
	const [search, setSearch] = useState("");
	const [connection, setConnection] = useState<StoryConnection | null>(null);
	const [connectMode, setConnectMode] = useState(false);
	const [showValidation, setShowValidation] = useState(false);
	const [message, setMessage] = useState<string>();
	const graph = graphs.find(({ id }) => id === focus.graphId) ?? graphs[0];
	const selectedNode =
		focus.selection?.kind === "node"
			? graph?.nodes.find(({ id }) => id === focus.selection?.id)
			: undefined;
	const selectedEdge =
		focus.selection?.kind === "edge"
			? graph?.edges.find(({ id }) => id === focus.selection?.id)
			: undefined;
	const graphRuns = debug?.filter(({ graphId }) => graphId === graph?.id) ?? [];
	const graphDebug =
		graphRuns.find(({ status }) => status !== "completed") ?? graphRuns[0];
	const nodeDebug = new Map<string, StoryDebugEntry>();
	for (const run of graphRuns) if (run.nodeId) nodeDebug.set(run.nodeId, run);
	const descriptions = useMemo(
		() =>
			new Map(
				graph?.nodes.map((node) => [node.id, describeStoryNode(project, node)]),
			),
		[graph, project],
	);
	const diagnostics = useMemo(
		() => (graph ? validateStoryGraph(project, graph) : []),
		[project, graph],
	);
	const problemNodes = useMemo(
		() =>
			new Set(diagnostics.flatMap(({ nodeId }) => (nodeId ? [nodeId] : []))),
		[diagnostics],
	);
	const canPlay =
		Boolean(graph?.nodes.length) &&
		diagnostics.every(({ severity }) => severity !== "error");
	const query = search.trim().toLocaleLowerCase();
	const shownCatalogue = catalogue.filter(
		([, node]) =>
			!query ||
			`${node.label} ${node.description}`.toLocaleLowerCase().includes(query),
	);
	useEffect(() => {
		if (!focusNode) return;
		const next = {
			graphId: focusNode.graphId,
			selection: { kind: "node", id: focusNode.nodeId },
		} as const;
		memory.focus = next;
		setFocus(next);
		setConnection(null);
		setConnectMode(false);
	}, [focusNode, memory]);

	function choose(next: Focus) {
		memory.focus = next;
		setFocus(next);
	}

	function select(selection: StorySelection) {
		choose({ graphId: graph?.id, selection });
	}

	function cancel() {
		setConnection(null);
		setConnectMode(false);
		setMessage(undefined);
	}

	function commit(next: StoryGraph[], nextFocus: Focus = focus) {
		if (JSON.stringify(next) === JSON.stringify(graphs)) return;
		memory.undo = [...memory.undo, { graphs, focus }].slice(-maxHistory);
		memory.redo = [];
		choose(nextFocus);
		onChange(next);
	}

	function edit(
		editGraph: (draft: StoryGraph) => void,
		selection = focus.selection,
	) {
		if (!graph) return;
		const draft = structuredClone(graph);
		editGraph(draft);
		commit(
			graphs.map((candidate) =>
				candidate.id === graph.id ? draft : candidate,
			),
			{ graphId: graph.id, selection },
		);
	}

	function editNode(id: string, update: (node: StoryNode) => void) {
		edit((draft) => {
			const node = draft.nodes.find((candidate) => candidate.id === id);
			if (node) update(node);
		});
	}

	function createGraph() {
		const id = idFor("story");
		cancel();
		commit(
			[
				...graphs,
				{ id, name: "Untitled graph", kind: "event", nodes: [], edges: [] },
			],
			{ graphId: id, selection: null },
		);
	}

	function addNode(type: StoryNode["type"]) {
		if (!graph) return;
		const id = idFor("node");
		const anchor = selectedNode ?? graph.nodes[graph.nodes.length - 1];
		const x = anchor ? anchor.x + 46 : 0;
		let y = anchor ? anchor.y + 112 : 0;
		while (
			graph.nodes.some(
				(node) => Math.abs(node.x - x) < 208 && Math.abs(node.y - y) < 102,
			)
		)
			y += 112;
		const definition = storyNodeCatalogue[type];
		edit(
			(draft) => {
				draft.nodes.push(createStoryNode(type, id, x, y));
				if (connection && definition.input) {
					const edge = draft.edges.find(
						({ from, port }) =>
							from === connection.from && port === connection.port,
					);
					if (edge) edge.to = id;
					else draft.edges.push({ ...connection, id: idFor("link"), to: id });
				}
			},
			{ kind: "node", id },
		);
		cancel();
	}

	function startConnection(output: StoryConnection) {
		setConnectMode(true);
		setConnection(output);
		setMessage(undefined);
	}

	function connectTo(id: string) {
		if (!connection || !graph) return;
		const from = graph.nodes.find((node) => node.id === connection.from);
		const to = graph.nodes.find((node) => node.id === id);
		if (
			!from ||
			!to ||
			!storyNodeCatalogue[from.type].outputs.includes(connection.port) ||
			!storyNodeCatalogue[to.type].input
		) {
			setMessage("Connect an available output to a compatible input.");
			return;
		}
		const current = graph.edges.find(
			(edge) => edge.from === from.id && edge.port === connection.port,
		);
		const edgeId = current?.id ?? idFor("link");
		edit(
			(draft) => {
				if (current) {
					const edge = draft.edges.find((edge) => edge.id === current.id);
					if (edge) edge.to = id;
				} else draft.edges.push({ id: edgeId, ...connection, to: id });
			},
			{ kind: "edge", id: edgeId },
		);
		cancel();
		select({ kind: "edge", id: edgeId });
		setMessage(
			`${storyOutputLabel(connection.port)} connected to ${to.title || storyNodeCatalogue[to.type].label}.`,
		);
	}

	function duplicate() {
		if (!selectedNode) return;
		const id = idFor("node");
		edit(
			(draft) => {
				draft.nodes.push({
					...structuredClone(selectedNode),
					id,
					y: selectedNode.y + 114,
					x: selectedNode.x + 42,
					title: `${selectedNode.title || storyNodeCatalogue[selectedNode.type].label} copy`,
				});
			},
			{ kind: "node", id },
		);
	}

	function remove() {
		if (selectedNode) {
			edit((draft) => {
				draft.nodes = draft.nodes.filter(({ id }) => id !== selectedNode.id);
				draft.edges = draft.edges.filter(
					({ from, to }) => from !== selectedNode.id && to !== selectedNode.id,
				);
			}, null);
		} else if (selectedEdge) {
			edit((draft) => {
				draft.edges = draft.edges.filter(({ id }) => id !== selectedEdge.id);
			}, null);
		}
		cancel();
	}

	function restore(direction: "undo" | "redo") {
		const revision = memory[direction].pop();
		if (!revision) return;
		const opposite = direction === "undo" ? "redo" : "undo";
		memory[opposite] = [...memory[opposite], { graphs, focus }].slice(
			-maxHistory,
		);
		cancel();
		choose(revision.focus);
		onChange(revision.graphs);
	}

	function keyboard(event: KeyboardEvent) {
		if (
			(event.target as HTMLElement).closest(
				"input, textarea, select, [contenteditable=true]",
			)
		)
			return;
		if (event.key === "Escape") {
			cancel();
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			remove();
			return;
		}
		if (!event.ctrlKey && !event.metaKey) return;
		const key = event.key.toLowerCase();
		if (key === "z" || key === "y") {
			event.preventDefault();
			restore(key === "y" || event.shiftKey ? "redo" : "undo");
		}
		if (key === "d" && selectedNode) {
			event.preventDefault();
			duplicate();
		}
	}

	return (
		<section
			className="story-graph-editor"
			aria-label="Story and State Editor"
			onKeyDown={keyboard}
		>
			<aside
				className="story-graph-library"
				aria-label="Story graph library and node catalogue"
			>
				<header className="story-graph-sidehead">
					<h2>Story &amp; State</h2>
				</header>
				<div className="story-graph-section">
					<h3 className="story-graph-eyebrow">Graphs</h3>
					<div className="story-graph-list">
						{graphs.map((candidate) => (
							<Button
								key={candidate.id}
								type="button"
								variant="ghost"
								size="sm"
								className="story-graph-library-item"
								aria-current={candidate.id === graph?.id ? "true" : undefined}
								aria-label={candidate.name || "Untitled graph"}
								onClick={() => {
									cancel();
									choose({ graphId: candidate.id, selection: null });
								}}
							>
								<Workflow aria-hidden="true" />
								<span>
									<strong>{candidate.name || "Untitled graph"}</strong>
									<small>
										{graphKindLabels[candidate.kind]} · {candidate.nodes.length}{" "}
										nodes · {candidate.edges.length} links
									</small>
								</span>
							</Button>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="story-graph-new"
							onClick={createGraph}
						>
							<Plus aria-hidden="true" />
							New Graph
						</Button>
					</div>
				</div>
				<div className="story-graph-section story-graph-palette">
					<h3 className="story-graph-eyebrow">Add node</h3>
					<Input
						type="search"
						aria-label="Search nodes"
						placeholder="Search nodes"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					{!shownCatalogue.length && <p>No matching nodes.</p>}
					{storyNodeCategories.map((category) => {
						const options = shownCatalogue.filter(
							([, node]) => node.category === category,
						);
						return (
							options.length > 0 && (
								<div key={category} className="story-graph-palette-group">
									<h4>{category}</h4>
									{options.map(([type, node]) => (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											key={type}
											data-category={category}
											title={node.description}
											aria-label={`Add ${node.label}`}
											disabled={!graph}
											onClick={() => addNode(type)}
										>
											<span>{node.label}</span>
											<Plus aria-hidden="true" />
										</Button>
									))}
								</div>
							)
						);
					})}
				</div>
				<div className="story-graph-section story-graph-legacy">
					<h3 className="story-graph-eyebrow">Specialised editors</h3>
					<Button type="button" variant="outline" size="sm" onClick={onLegacy}>
						Story relationships
						<ArrowUpRight aria-hidden="true" />
					</Button>
					<div className="story-graph-reference-links">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => openEntity({ section: "dialogues", id: "" })}
						>
							Dialogue
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => openEntity({ section: "quests", id: "" })}
						>
							Quests
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => openEntity({ section: "progression", id: "" })}
						>
							Rules
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => openEntity({ section: "game-state", id: "" })}
						>
							Game state
						</Button>
					</div>
				</div>
			</aside>
			{graph ? (
				<StoryCanvas
					key={graph.id}
					graph={graph}
					selection={
						selectedNode
							? { kind: "node", id: selectedNode.id }
							: selectedEdge
								? { kind: "edge", id: selectedEdge.id }
								: null
					}
					onSelect={select}
					initialView={memory.views.get(graph.id)}
					onViewChange={(view) => memory.views.set(graph.id, view)}
					onMoveNode={(id, position) =>
						editNode(id, (node) => {
							Object.assign(node, position);
						})
					}
					connection={connection}
					connecting={connectMode}
					onOutput={startConnection}
					onConnect={connectTo}
					problemNodes={problemNodes}
					describeNode={(node) => descriptions.get(node.id) ?? ""}
					debug={nodeDebug}
					message={message}
					controls={{
						canUndo: memory.undo.length > 0,
						canRedo: memory.redo.length > 0,
						onUndo: () => restore("undo"),
						onRedo: () => restore("redo"),
						onDelete: remove,
						onCancel: cancel,
						onConnectMode: () => {
							if (connectMode) cancel();
							else {
								setMessage(undefined);
								setConnectMode(true);
								if (
									selectedNode &&
									storyNodeCatalogue[selectedNode.type].outputs.length === 1
								)
									startConnection({ from: selectedNode.id, port: "next" });
							}
						},
						onPlay,
						canPlay,
						showValidation,
						issueCount: diagnostics.length,
						onToggleValidation: () => setShowValidation((value) => !value),
					}}
				/>
			) : (
				<section className="story-graph-empty" aria-label="Graph canvas">
					<h2>No story graphs</h2>
					<p>Create an opening sequence, quest or gameplay event.</p>
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={createGraph}
					>
						<Plus aria-hidden="true" />
						Create a graph
					</Button>
					{memory.undo.length > 0 && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => restore("undo")}
						>
							<Undo2 aria-hidden="true" />
							Undo
						</Button>
					)}
					{memory.redo.length > 0 && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => restore("redo")}
						>
							<Redo2 aria-hidden="true" />
							Redo
						</Button>
					)}
				</section>
			)}
			<aside
				className="story-graph-inspector"
				aria-label="Story graph inspector"
			>
				{graph && selectedNode ? (
					<StoryNodeInspector
						key={selectedNode.id}
						project={project}
						graph={graph}
						node={selectedNode}
						onNavigate={onNavigate}
						onPatchData={(patch) =>
							editNode(selectedNode.id, (node) => {
								Object.assign(node.data, patch);
							})
						}
						onRename={(title) =>
							editNode(selectedNode.id, (node) => {
								node.title = title.trim() || undefined;
							})
						}
						onDuplicate={duplicate}
						onDelete={remove}
						debug={nodeDebug.get(selectedNode.id)}
					/>
				) : graph && selectedEdge ? (
					<StoryEdgeInspector
						graph={graph}
						edge={selectedEdge}
						onDelete={remove}
						onRedirect={(to) =>
							edit((draft) => {
								const edge = draft.edges.find(
									({ id }) => id === selectedEdge.id,
								);
								if (edge) edge.to = to;
							})
						}
					/>
				) : graph ? (
					<StoryGraphInspector
						graph={graph}
						onRename={(name) =>
							edit((draft) => {
								draft.name = name.trim() || "Untitled graph";
							})
						}
						onKind={(kind) =>
							edit((draft) => {
								draft.kind = kind;
							})
						}
					/>
				) : (
					<header className="story-graph-sidehead">
						<p className="story-graph-eyebrow">Graph inspector</p>
						<h2>No graph selected</h2>
					</header>
				)}
				{graphDebug && (
					<div className="story-graph-section">
						<h3>Last play session</h3>
						<p role="status">
							{graphDebug.status}
							{graphDebug.detail ? ` · ${graphDebug.detail}` : ""}
						</p>
						{graphDebug.nodeId && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									select({ kind: "node", id: graphDebug.nodeId as string })
								}
							>
								Select active node
							</Button>
						)}
					</div>
				)}
				{graph &&
					(showValidation ||
						diagnostics.some(({ severity }) => severity === "error")) && (
						<div className="story-graph-section story-graph-validation">
							<h3>Validation</h3>
							{diagnostics.length ? (
								<ul>
									{diagnostics.map(
										({ severity, message: issue, nodeId, edgeId }) => {
											const target = nodeId
												? ({ kind: "node", id: nodeId } as const)
												: edgeId
													? ({ kind: "edge", id: edgeId } as const)
													: null;
											return (
												<li
													key={`${severity}-${edgeId ?? nodeId ?? "graph"}-${issue}`}
													data-severity={severity}
												>
													<strong>
														{severity === "error" ? "Error" : "Warning"}
													</strong>
													{target ? (
														<Button
															type="button"
															variant="ghost"
															size="sm"
															className="story-graph-issue"
															onClick={() => select(target)}
														>
															{issue}
														</Button>
													) : (
														<p>{issue}</p>
													)}
												</li>
											);
										},
									)}
								</ul>
							) : (
								<p>No graph issues.</p>
							)}
						</div>
					)}
			</aside>
		</section>
	);
}
