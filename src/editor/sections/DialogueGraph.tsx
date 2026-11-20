import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogueDefinition, GameProject } from "../../types/game";
import { DialogueEntityDrop } from "./DialogueEntityControls";
import {
	actionSummary,
	conditionSummary,
	type DialogueEntityRef,
} from "./dialogueEntities";
import {
	autoLayoutDialogue,
	connectDialogue,
	type DialogueLink,
	dialogueLinks,
	GRAPH_WIDTH,
	graphNodeHeight,
	nodeTitle,
} from "./dialogueGraphModel";

type Point = { x: number; y: number };
type Props = {
	dialogue: DialogueDefinition;
	project: GameProject;
	selectedId: string;
	onSelect: (id: string) => void;
	onChange: (dialogue: DialogueDefinition) => void;
	onDelete: () => void;
	onUseEntity: (
		ref: DialogueEntityRef,
		nodeId: string,
		choiceId?: string,
	) => void;
};

/** Pointer gestures stay local; one project mutation at drag end. No runtime imports. */
export function DialogueGraph({
	dialogue,
	project,
	selectedId,
	onSelect,
	onChange,
	onDelete,
	onUseEntity,
}: Props) {
	const surface = useRef<HTMLDivElement>(null);
	const [initial] = useState(() => autoLayoutDialogue(dialogue).nodes);
	const [view, setView] = useState({ x: 25, y: 25, zoom: 0.85 });
	const [dragPoint, setDragPoint] = useState<{ id: string; point: Point }>();
	const [connecting, setConnecting] = useState<{
		source: string;
		responseId?: string;
	}>();
	const [edge, setEdge] = useState<DialogueLink>();
	const gesture = useRef<
		{ id?: string; start: Point; origin: Point; point: Point } | undefined
	>(undefined);
	const frame = useRef<number | undefined>(undefined);
	const positions = Object.fromEntries(
		dialogue.nodes.map((node, index) => [
			node.id,
			dragPoint?.id === node.id
				? dragPoint.point
				: (dialogue.editorLayout?.nodes[node.id] ??
					initial[node.id] ?? {
						x: 40 + (index % 3) * 410,
						y: 40 + Math.floor(index / 3) * 650,
					}),
		]),
	);
	const links = dialogueLinks(dialogue);
	const zoom = useCallback((factor: number, anchor?: Point) => {
		setView((previous) => {
			const next = Math.max(0.03, Math.min(2, previous.zoom * factor));
			const center = anchor ?? {
				x: (surface.current?.clientWidth ?? 700) / 2,
				y: 250,
			};
			return {
				x: center.x - ((center.x - previous.x) * next) / previous.zoom,
				y: center.y - ((center.y - previous.y) * next) / previous.zoom,
				zoom: next,
			};
		});
	}, []);
	useEffect(() => {
		const element = surface.current;
		if (!element) return;
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = element.getBoundingClientRect();
			zoom(Math.exp(-event.deltaY * 0.0015), {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			});
		};
		element.addEventListener("wheel", wheel, { passive: false });
		return () => {
			element.removeEventListener("wheel", wheel);
			if (frame.current) cancelAnimationFrame(frame.current);
		};
	}, [zoom]);
	function fit(layout = positions) {
		if (!dialogue.nodes.length) return;
		const minX = Math.min(...Object.values(layout).map((p) => p.x)) - 60;
		const minY = Math.min(...Object.values(layout).map((p) => p.y)) - 60;
		const maxX =
			Math.max(...Object.values(layout).map((p) => p.x)) + GRAPH_WIDTH + 60;
		const maxY =
			Math.max(
				...dialogue.nodes.map(
					(node) => layout[node.id].y + graphNodeHeight(node),
				),
			) + 60;
		const width = surface.current?.clientWidth ?? 700,
			height = surface.current?.clientHeight ?? 560;
		const scale = Math.max(
			0.03,
			Math.min(1, width / (maxX - minX), height / (maxY - minY)),
		);
		setView({
			x: (width - (maxX - minX) * scale) / 2 - minX * scale,
			y: (height - (maxY - minY) * scale) / 2 - minY * scale,
			zoom: scale,
		});
	}
	function focus() {
		const point = positions[selectedId];
		if (point)
			setView({
				x:
					(surface.current?.clientWidth ?? 700) / 2 - point.x - GRAPH_WIDTH / 2,
				y: 80 - point.y,
				zoom: 1,
			});
	}
	function finish(cancel = false) {
		if (frame.current) cancelAnimationFrame(frame.current);
		const current = gesture.current;
		gesture.current = undefined;
		if (
			!cancel &&
			current?.id &&
			(current.point.x !== current.origin.x ||
				current.point.y !== current.origin.y)
		) {
			onChange({
				...dialogue,
				editorLayout: { nodes: { ...positions, [current.id]: current.point } },
			});
		}
		setDragPoint(undefined);
	}
	return (
		<div className="dialogue-graph">
			<div className="dialogue-toolbar" role="toolbar" aria-label="Graph tools">
				<button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in">
					+
				</button>
				<span>{Math.round(view.zoom * 100)}%</span>
				<button
					type="button"
					onClick={() => zoom(1 / 1.2)}
					aria-label="Zoom out"
				>
					−
				</button>
				<button type="button" onClick={() => fit()}>
					Fit graph
				</button>
				<button type="button" disabled={!selectedId} onClick={focus}>
					Focus selected
				</button>
				<button
					type="button"
					onClick={() => {
						const layout = autoLayoutDialogue(dialogue);
						onChange({ ...dialogue, editorLayout: layout });
						fit(layout.nodes);
					}}
				>
					Auto layout
				</button>
				{edge && (
					<button
						type="button"
						onClick={() => {
							onChange(
								connectDialogue(dialogue, edge.source, "", edge.responseId),
							);
							setEdge(undefined);
						}}
					>
						Delete connection
					</button>
				)}
				{connecting && (
					<button type="button" onClick={() => setConnecting(undefined)}>
						Cancel connection
					</button>
				)}
			</div>
			<p className="help-text" role="status">
				{connecting
					? "Choose a node’s Connect here button. Escape cancels."
					: "Drag headers to move nodes; drag background to pan; scroll to zoom. Connect an output, then choose a destination."}
			</p>
			<section
				className="dialogue-graph-surface"
				ref={surface}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: The graph surface receives keyboard shortcuts.
				tabIndex={0}
				aria-label="Dialogue graph"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						setConnecting(undefined);
						setEdge(undefined);
						onSelect("");
					}
					if (event.key === "Delete" || event.key === "Backspace") {
						event.preventDefault();
						if (edge) {
							onChange(
								connectDialogue(dialogue, edge.source, "", edge.responseId),
							);
							setEdge(undefined);
						} else if (selectedId) onDelete();
					}
				}}
				onPointerDown={(event) => {
					if (
						event.button !== 0 ||
						(event.target as HTMLElement).closest(
							"button, .dialogue-card, .dialogue-edge",
						)
					)
						return;
					setEdge(undefined);
					event.currentTarget.focus();
					gesture.current = {
						start: { x: event.clientX, y: event.clientY },
						origin: { x: view.x, y: view.y },
						point: { x: view.x, y: view.y },
					};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					const current = gesture.current;
					if (!current) return;
					const divisor = current.id ? view.zoom : 1;
					current.point = {
						x: current.origin.x + (event.clientX - current.start.x) / divisor,
						y: current.origin.y + (event.clientY - current.start.y) / divisor,
					};
					if (frame.current) cancelAnimationFrame(frame.current);
					frame.current = requestAnimationFrame(() => {
						if (current.id)
							setDragPoint({ id: current.id, point: current.point });
						else setView((previous) => ({ ...previous, ...current.point }));
					});
				}}
				onPointerUp={() => finish()}
				onPointerCancel={() => finish(true)}
			>
				<div
					className="dialogue-graph-world"
					style={{
						transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
					}}
				>
					<svg className="dialogue-edges" aria-label="Dialogue connections">
						<defs>
							<marker
								id="dialogue-arrow"
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="7"
								markerHeight="7"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
							</marker>
						</defs>
						{links
							.filter((link) => positions[link.target])
							.map((link) => {
								const source = dialogue.nodes.find(
									(node) => node.id === link.source,
								)!;
								const choiceIndex =
									source.type === "choice"
										? source.choices.findIndex((c) => c.id === link.responseId)
										: -1;
								const from = {
									x: positions[link.source].x + GRAPH_WIDTH,
									y:
										positions[link.source].y +
										(choiceIndex < 0 ? 150 : 190 + choiceIndex * 68 + 34),
								};
								const to = {
									x: positions[link.target].x,
									y: positions[link.target].y + 56,
								};
								const backwards = to.x <= from.x;
								const loopY =
									Math.min(positions[link.source].y, positions[link.target].y) -
									35 -
									(choiceIndex + 1) * 20;
								const path = backwards
									? `M ${from.x} ${from.y} C ${from.x + 70} ${from.y}, ${from.x + 70} ${loopY}, ${from.x} ${loopY} L ${to.x} ${loopY} C ${to.x - 60} ${loopY}, ${to.x - 60} ${to.y}, ${to.x} ${to.y}`
									: `M ${from.x} ${from.y} C ${from.x + 70} ${from.y}, ${to.x - 70} ${to.y}, ${to.x} ${to.y}`;
								const selected =
									edge?.source === link.source &&
									edge?.responseId === link.responseId;
								return (
									// biome-ignore lint/a11y/useSemanticElements: SVG connections cannot contain HTML buttons.
									<g
										className={`dialogue-edge ${selected ? "selected" : ""}`}
										key={`${link.source}:${link.responseId ?? "next"}`}
										role="button"
										tabIndex={0}
										aria-label={`Connection ${link.label} to ${nodeTitle(dialogue.nodes.find((n) => n.id === link.target)!)}`}
										onClick={() => setEdge(link)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												setEdge(link);
											}
										}}
									>
										<path className="edge-hit" d={path} />
										<path
											className="edge-line"
											d={path}
											markerEnd="url(#dialogue-arrow)"
										/>
										<text
											x={backwards ? (from.x + to.x) / 2 : from.x + 12}
											y={backwards ? loopY - 7 : from.y - 10}
										>
											{link.label.slice(0, 22)}
											{backwards ? " ↶" : ""}
										</text>
									</g>
								);
							})}
					</svg>
					{dialogue.nodes.map((node, index) => {
						const actions = (node.actions ?? []).map(
							(a, i) => `${i + 1}. ${actionSummary(a, project)}`,
						);
						return (
							<div
								key={node.id}
								className={`dialogue-card ${node.type} ${selectedId === node.id ? "selected" : ""}`}
								style={{
									left: positions[node.id].x,
									top: positions[node.id].y,
									width: GRAPH_WIDTH,
									height: graphNodeHeight(node),
								}}
							>
								<button
									type="button"
									className="dialogue-card-header"
									aria-label={`Select ${nodeTitle(node)}`}
									onClick={() => {
										onSelect(node.id);
										setEdge(undefined);
									}}
									onPointerDown={(event) => {
										if (event.button !== 0) return;
										event.stopPropagation();
										onSelect(node.id);
										setEdge(undefined);
										gesture.current = {
											id: node.id,
											start: { x: event.clientX, y: event.clientY },
											origin: positions[node.id],
											point: positions[node.id],
										};
										event.currentTarget.setPointerCapture(event.pointerId);
									}}
								>
									{node.id === dialogue.startNodeId && (
										<b className="dialogue-start">START · </b>
									)}
									{node.type.toUpperCase()} · {node.speaker || "No speaker"}
								</button>
								<button
									className="dialogue-input"
									type="button"
									disabled={!connecting}
									aria-label={`Connect here: ${nodeTitle(node)}`}
									title="Connect incoming branch here"
									onClick={() => {
										if (connecting)
											onChange(
												connectDialogue(
													dialogue,
													connecting.source,
													node.id,
													connecting.responseId,
												),
											);
										setConnecting(undefined);
									}}
								>
									●
								</button>
								<p className="dialogue-preview" title={node.text}>
									{node.text || "(No text)"}
								</p>
								<DialogueEntityDrop
									slot="action"
									label={`Entry effects: ${nodeTitle(node)}`}
									onUse={(ref) => onUseEntity(ref, node.id)}
								>
									<div
										className="dialogue-action-summary"
										title={actions.join("\n")}
									>
										{actions.length
											? `On enter: ${actions.join(" → ")}`
											: "Drop entity for an entry effect"}
									</div>
								</DialogueEntityDrop>
								{node.type === "end" && (
									<div className="dialogue-terminal">■ Conversation ends</div>
								)}
								{node.type === "text" && (
									<button
										type="button"
										className="dialogue-output text-output"
										aria-label={`Connect next: ${nodeTitle(node)}`}
										onClick={() => setConnecting({ source: node.id })}
									>
										{positions[node.nextNodeId ?? ""]
											? "Next →"
											: "⚠ Connect next →"}
									</button>
								)}
								{node.type === "choice" &&
									node.choices.map((choice, i) => (
										<div
											className="dialogue-response"
											key={choice.id}
											style={{ top: 190 + i * 68 }}
										>
											<button
												type="button"
												className="dialogue-output"
												aria-label={`Connect response: ${choice.text}`}
												onClick={() =>
													setConnecting({
														source: node.id,
														responseId: choice.id,
													})
												}
											>
												{i + 1}. {choice.text || "(Empty response)"}{" "}
												{positions[choice.targetNodeId] ? "→" : "⚠"}
											</button>
											<DialogueEntityDrop
												slot="condition"
												label={`Conditions: ${choice.text}`}
												onUse={(ref) => onUseEntity(ref, node.id, choice.id)}
											>
												<small
													title={(choice.conditions ?? [])
														.map((c) => conditionSummary(c, project))
														.join(" AND ")}
												>
													{choice.conditions?.length
														? choice.conditions
																.map((c) => conditionSummary(c, project))
																.join(" AND ")
														: "Always available"}
												</small>
											</DialogueEntityDrop>
										</div>
									))}
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
