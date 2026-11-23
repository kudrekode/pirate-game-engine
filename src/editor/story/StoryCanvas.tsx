import {
	CircleCheck,
	Link2,
	Minus,
	MousePointer2,
	Play,
	Plus,
	Redo2,
	Trash2,
	Undo2,
} from "lucide-react";
import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/control";
import type { StoryDebugSnapshot } from "../../runtime/storyRuntime";
import {
	storyNodeCatalogue,
	storyOutputLabel,
} from "../../story/storyCatalogue";
import type { StoryEdge, StoryGraph, StoryNode } from "../../types/game";

export type StorySelection = { kind: "node" | "edge"; id: string } | null;
export type StoryView = { x: number; y: number; zoom: number };
export type StoryDebugEntry = StoryDebugSnapshot[number];
export type StoryConnection = Pick<StoryEdge, "from" | "port">;

const width = 192;
const height = 100;
const defaultView = { x: 45, y: 100, zoom: 1 };
const inputY = 50;
const categoryLabels = {
	"Entries and triggers": "Entry",
	"Wait for Events": "Event",
	Actions: "Action",
	Conditions: "Condition",
	"Flow control": "Flow control",
} as const;

function outputY(port: StoryEdge["port"]) {
	return port === "false" ? 78 : port === "true" ? 42 : inputY;
}

function clampZoom(zoom: number) {
	return Math.max(0.2, Math.min(1.75, zoom));
}

function edgePath(from: StoryNode, to: StoryNode, port: StoryEdge["port"]) {
	const x1 = from.x + width;
	const y1 = from.y + outputY(port);
	const x2 = to.x;
	const y2 = to.y + inputY;
	const bend = Math.max(40, Math.abs(x2 - x1) * 0.4);
	if (x2 <= x1 && Math.abs(y2 - y1) < 65) {
		const below = Math.max(from.y, to.y) + height + 24;
		return `M ${x1} ${y1} C ${x1 + 85} ${y1}, ${x1 + 85} ${below}, ${x1 + 30} ${below} L ${x2 - 30} ${below} C ${x2 - 85} ${below}, ${x2 - 85} ${y2}, ${x2} ${y2}`;
	}
	return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

type Point = { x: number; y: number };
type Gesture =
	| { kind: "pan"; pointer: number; start: Point; initial: StoryView }
	| {
			kind: "node";
			pointer: number;
			start: Point;
			node: StoryNode;
			last: Point;
	  };

type Props = {
	graph: StoryGraph;
	selection: StorySelection;
	onSelect: (selection: StorySelection) => void;
	initialView?: StoryView;
	onViewChange: (view: StoryView) => void;
	onMoveNode: (id: string, point: Point) => void;
	connection: StoryConnection | null;
	connecting: boolean;
	onOutput: (connection: StoryConnection) => void;
	onConnect: (id: string) => void;
	problemNodes: ReadonlySet<string>;
	describeNode: (node: StoryNode) => string;
	debug: ReadonlyMap<string, StoryDebugEntry>;
	message?: string;
	controls: {
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onDelete: () => void;
		onCancel: () => void;
		onConnectMode: () => void;
		onPlay: () => void;
		canPlay: boolean;
		showValidation: boolean;
		issueCount: number;
		onToggleValidation: () => void;
	};
};

export function StoryCanvas({
	graph,
	selection,
	onSelect,
	initialView,
	onViewChange,
	onMoveNode,
	connection,
	connecting,
	onOutput,
	onConnect,
	problemNodes,
	describeNode,
	debug,
	message,
	controls,
}: Props) {
	const viewport = useRef<HTMLFieldSetElement>(null);
	const [view, setView] = useState(initialView ?? defaultView);
	const [drag, setDrag] = useState<{ id: string; point: Point }>();
	const [cursor, setCursor] = useState<Point>();
	const [panning, setPanning] = useState(false);
	const activeGesture = useRef<Gesture | undefined>(undefined);
	const outputGesture = useRef<
		| {
				pointer: number;
				start: Point;
		  }
		| undefined
	>(undefined);
	const suppressPortClick = useRef(false);

	function updateView(next: StoryView) {
		setView(next);
		onViewChange(next);
	}

	function fitGraph() {
		const bounds = viewport.current?.getBoundingClientRect();
		if (!bounds?.width || !bounds.height || !graph.nodes.length) return;
		const left = Math.min(...graph.nodes.map((node) => node.x));
		const right = Math.max(...graph.nodes.map((node) => node.x)) + width;
		const top = Math.min(...graph.nodes.map((node) => node.y));
		const bottom = Math.max(...graph.nodes.map((node) => node.y)) + height;
		const zoom = clampZoom(
			Math.min(
				1,
				(bounds.width - 84) / (right - left),
				(bounds.height - 155) / (bottom - top),
			),
		);
		updateView({
			x: (bounds.width - (right - left) * zoom) / 2 - left * zoom,
			y: (bounds.height - (bottom - top) * zoom) / 2 - top * zoom,
			zoom,
		});
	}

	const initializedView = useRef(Boolean(initialView));
	const selectedNodeId = selection?.kind === "node" ? selection.id : undefined;
	const hasNodes = graph.nodes.length > 0;
	const revealRef = useRef(() => {});
	revealRef.current = () => {
		const bounds = viewport.current?.getBoundingClientRect();
		if (!bounds?.width || !bounds.height || !hasNodes) return;
		if (!initializedView.current) {
			initializedView.current = true;
			fitGraph();
			return;
		}
		const node = graph.nodes.find(
			(candidate) => candidate.id === selectedNodeId,
		);
		if (!node) return;
		const left = node.x * view.zoom + view.x;
		const top = node.y * view.zoom + view.y;
		if (
			left < 10 ||
			left + width * view.zoom > bounds.width - 10 ||
			top < 10 ||
			top + height * view.zoom > bounds.height - 10
		) {
			updateView({
				...view,
				x: bounds.width / 2 - (node.x + width / 2) * view.zoom,
				y: bounds.height / 2 - (node.y + height / 2) * view.zoom,
			});
		}
	};
	// Selection changes can come from the inspector, validation, or the Map workspace.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Zoom and drag must preserve their own view.
	useLayoutEffect(() => {
		revealRef.current();
	}, [hasNodes, selectedNodeId]);

	function scaleAt(amount: number, point?: Point) {
		const bounds = viewport.current?.getBoundingClientRect();
		if (!bounds) return;
		const anchor = point ?? { x: bounds.width / 2, y: bounds.height / 2 };
		const zoom = clampZoom(view.zoom * amount);
		const ratio = zoom / view.zoom;
		updateView({
			x: anchor.x - (anchor.x - view.x) * ratio,
			y: anchor.y - (anchor.y - view.y) * ratio,
			zoom,
		});
	}

	const scaleRef = useRef(scaleAt);
	scaleRef.current = scaleAt;
	useEffect(() => {
		const element = viewport.current;
		if (!element) return;
		const zoomOnWheel = (event: WheelEvent) => {
			event.preventDefault();
			const box = element.getBoundingClientRect();
			scaleRef.current(event.deltaY < 0 ? 1.12 : 1 / 1.12, {
				x: event.clientX - box.left,
				y: event.clientY - box.top,
			});
		};
		element.addEventListener("wheel", zoomOnWheel, { passive: false });
		return () => element.removeEventListener("wheel", zoomOnWheel);
	}, []);

	function graphPoint(event: PointerEvent): Point {
		const rect = viewport.current?.getBoundingClientRect();
		return {
			x: (event.clientX - (rect?.left ?? 0) - view.x) / view.zoom,
			y: (event.clientY - (rect?.top ?? 0) - view.y) / view.zoom,
		};
	}

	function beginGesture(event: PointerEvent, node?: StoryNode) {
		if (event.button !== 0 && event.button !== 1) return;
		if (node) {
			event.stopPropagation();
			onSelect({ kind: "node", id: node.id });
		} else {
			if ((event.target as Element).closest("[data-story-interactive]")) return;
			viewport.current?.focus({ preventScroll: true });
			onSelect(null);
		}
		const pointer = event.pointerId;
		const start = { x: event.clientX, y: event.clientY };
		activeGesture.current = node
			? { kind: "node", pointer, start, node, last: node }
			: { kind: "pan", pointer, start, initial: view };
		viewport.current?.setPointerCapture?.(pointer);
		if (!node) setPanning(true);
	}

	function moveGesture(event: PointerEvent) {
		if (connection || outputGesture.current) setCursor(graphPoint(event));
		const gesture = activeGesture.current;
		if (!gesture || gesture.pointer !== event.pointerId) return;
		const dx = event.clientX - gesture.start.x;
		const dy = event.clientY - gesture.start.y;
		if (gesture.kind === "pan") {
			const initial = gesture.initial;
			updateView({ ...initial, x: initial.x + dx, y: initial.y + dy });
			return;
		}
		if (Math.hypot(dx, dy) < 3 && gesture.last === gesture.node) return;
		gesture.last = {
			x: Math.round(gesture.node.x + dx / view.zoom),
			y: Math.round(gesture.node.y + dy / view.zoom),
		};
		setDrag({ id: gesture.node.id, point: gesture.last });
	}

	function endGesture(event: PointerEvent, cancelled = false) {
		const output = outputGesture.current;
		if (output?.pointer === event.pointerId) {
			outputGesture.current = undefined;
			if (
				!cancelled &&
				Math.hypot(
					event.clientX - output.start.x,
					event.clientY - output.start.y,
				) > 5
			) {
				const target = document
					.elementFromPoint?.(event.clientX, event.clientY)
					?.closest<HTMLElement>("[data-story-input]")?.dataset.storyInput;
				if (target) {
					suppressPortClick.current = true;
					onConnect(target);
					window.setTimeout(() => {
						suppressPortClick.current = false;
					}, 0);
				}
			}
		}
		const gesture = activeGesture.current;
		if (!gesture || gesture.pointer !== event.pointerId) return;
		activeGesture.current = undefined;
		if (
			!cancelled &&
			gesture.kind === "node" &&
			gesture.last !== gesture.node
		) {
			onMoveNode(gesture.node.id, gesture.last);
		}
		setDrag(undefined);
		setPanning(false);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
			event.preventDefault();
			fitGraph();
		}
	}

	const nodes = graph.nodes.map((node) =>
		drag?.id === node.id ? { ...node, ...drag.point } : node,
	);
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const source = connection && nodeById.get(connection.from);
	return (
		<section className="story-graph-middle" aria-label="Graph canvas">
			<div className="story-graph-toolbar editor-toolbar">
				<div className="editor-tab-group">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={!connecting}
						title="Select (Esc)"
						onClick={controls.onCancel}
					>
						<MousePointer2 aria-hidden="true" />
						Select
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={connecting}
						disabled={
							!graph.nodes.some(
								(node) => storyNodeCatalogue[node.type].outputs.length,
							)
						}
						onClick={controls.onConnectMode}
					>
						<Link2 aria-hidden="true" />
						Connect
					</Button>
				</div>
				<div className="story-graph-controls story-graph-edit-controls">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Delete"
						title="Delete selected node or connection"
						disabled={!selection}
						onClick={controls.onDelete}
					>
						<Trash2 aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Undo"
						title="Undo"
						disabled={!controls.canUndo}
						onClick={controls.onUndo}
					>
						<Undo2 aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Redo"
						title="Redo"
						disabled={!controls.canRedo}
						onClick={controls.onRedo}
					>
						<Redo2 aria-hidden="true" />
					</Button>
				</div>
				<div className="story-graph-controls">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Zoom out"
						title="Zoom out"
						onClick={() => scaleAt(1 / 1.2)}
					>
						<Minus aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="story-graph-zoom"
						aria-label="Fit graph"
						title="Fit graph (F)"
						onClick={fitGraph}
					>
						{Math.round(view.zoom * 100)}%
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Zoom in"
						title="Zoom in"
						onClick={() => scaleAt(1.2)}
					>
						<Plus aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-pressed={controls.showValidation}
						onClick={controls.onToggleValidation}
					>
						<CircleCheck aria-hidden="true" />
						Validate{controls.issueCount ? ` (${controls.issueCount})` : ""}
					</Button>
					<Button
						type="button"
						variant="default"
						size="sm"
						disabled={!controls.canPlay}
						onClick={controls.onPlay}
					>
						<Play aria-hidden="true" />
						Test Flow
					</Button>
				</div>
			</div>
			<fieldset
				ref={viewport}
				className="story-graph-canvas"
				data-panning={panning}
				data-connecting={connecting}
				style={{
					backgroundPosition: `${view.x}px ${view.y}px`,
					backgroundSize: `${23 * view.zoom}px ${23 * view.zoom}px`,
				}}
				onPointerDown={(event) => beginGesture(event)}
				onPointerMove={moveGesture}
				onPointerUp={(event) => endGesture(event)}
				onPointerCancel={(event) => endGesture(event, true)}
				onKeyDown={onKeyDown}
				aria-label="Story nodes and connections"
				tabIndex={-1}
			>
				<div className="story-graph-title">
					<strong>{graph.name || "Untitled graph"}</strong>
					<small>
						{nodes.length
							? "Click nodes to inspect · drag to move"
							: "Add an entry node to start this graph"}
					</small>
				</div>
				<div
					className="story-graph-surface"
					style={{
						transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
					}}
				>
					<svg className="story-graph-edges" width={1} height={1}>
						<title>Story connections</title>
						{graph.edges.map((edge) => {
							const from = nodeById.get(edge.from);
							const to = nodeById.get(edge.to);
							if (!from || !to) return null;
							const path = edgePath(from, to, edge.port);
							const select = () => onSelect({ kind: "edge", id: edge.id });
							return (
								// biome-ignore lint/a11y/useSemanticElements: The selectable geometry is an SVG path.
								<g
									key={edge.id}
									data-port={edge.port}
									data-selected={
										selection?.kind === "edge" && selection.id === edge.id
									}
									role="button"
									tabIndex={0}
									aria-label={`${from.title || storyNodeCatalogue[from.type].label} ${storyOutputLabel(edge.port)} to ${to.title || storyNodeCatalogue[to.type].label}`}
									data-story-interactive="true"
									onClick={select}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											select();
										}
									}}
								>
									<path d={path} className="story-graph-edge-line" />
									<path d={path} className="story-graph-edge-control" />
								</g>
							);
						})}
						{source && cursor && connection && (
							<path
								className="story-graph-edge-preview"
								d={`M ${source.x + width} ${source.y + outputY(connection.port)} Q ${source.x + width + 60} ${source.y + outputY(connection.port)}, ${cursor.x} ${cursor.y}`}
							/>
						)}
					</svg>
					{nodes.map((node) => {
						const definition = storyNodeCatalogue[node.type];
						const label = node.title || definition.label;
						const selected =
							selection?.kind === "node" && selection.id === node.id;
						const status = debug.get(node.id)?.status;
						const summary = describeNode(node);
						const flow =
							definition.outputs.length > 1
								? "True / False"
								: definition.suspends
									? "Wait"
									: definition.once
										? "Once"
										: definition.outputs.length
											? "Flow"
											: "End";
						return (
							<div
								key={node.id}
								className="story-graph-node"
								data-story-interactive="true"
								data-node-id={node.id}
								data-category={definition.category}
								data-selected={selected}
								data-debug={status}
								data-problem={problemNodes.has(node.id)}
								style={{ left: node.x, top: node.y, width, height }}
							>
								<button
									type="button"
									className="story-graph-node-body"
									aria-pressed={selected}
									aria-label={`Select ${label}`}
									onClick={() => onSelect({ kind: "node", id: node.id })}
									onPointerDown={(event) => beginGesture(event, node)}
								>
									<span className="story-graph-node-header">
										<span>{categoryLabels[definition.category]}</span>
										<span>
											{status ?? (problemNodes.has(node.id) ? "Check" : flow)}
										</span>
									</span>
									<strong title={label}>{label}</strong>
									<small title={summary}>{summary}</small>
								</button>
								{definition.input && (
									<button
										type="button"
										className="story-graph-port story-graph-port-in"
										aria-label={`${label} input`}
										data-story-input={node.id}
										style={{ top: inputY }}
										onClick={() => {
											if (connection && !suppressPortClick.current)
												onConnect(node.id);
										}}
									/>
								)}
								{definition.outputs.map((port) => (
									<button
										type="button"
										key={port}
										className="story-graph-port story-graph-port-out"
										data-port={port}
										style={{ top: outputY(port) }}
										aria-label={`${label} ${storyOutputLabel(port)} output`}
										aria-pressed={
											connection?.from === node.id && connection.port === port
										}
										onPointerDown={(event) => {
											if (event.button !== 0) return;
											const selectedOutput = { from: node.id, port };
											outputGesture.current = {
												pointer: event.pointerId,
												start: { x: event.clientX, y: event.clientY },
											};
											setCursor(graphPoint(event));
											onOutput(selectedOutput);
										}}
										onClick={(event) => {
											if (event.detail === 0 && !suppressPortClick.current)
												onOutput({ from: node.id, port });
										}}
									>
										{port !== "next" && <span>{storyOutputLabel(port)}</span>}
									</button>
								))}
							</div>
						);
					})}
				</div>
				<p className="story-graph-hint" role="status">
					{message ??
						(connection
							? "Select an input to connect · Esc cancels"
							: connecting
								? "Choose an output socket to begin"
								: "Connect output to input · drag empty space to pan")}
				</p>
				<p className="story-graph-shortcuts">Scroll to zoom · F to fit</p>
			</fieldset>
		</section>
	);
}
