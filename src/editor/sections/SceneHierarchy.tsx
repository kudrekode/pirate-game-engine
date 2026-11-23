import { useState } from "react";
import { Button, Input } from "@/components/ui/control";
import type { EditorSelection, GameArea, GameProject } from "../../types/game";
import { sceneEntityIcons } from "./mapIcons";
import { sceneEntries } from "./sceneEditing";

export function SceneHierarchy({
	project,
	area,
	selection,
	onSelect,
}: {
	project: GameProject;
	area: GameArea;
	selection: EditorSelection;
	onSelect: (selection: EditorSelection) => void;
}) {
	const [query, setQuery] = useState("");
	const entries = sceneEntries(project, area);
	return (
		<section className="scene-hierarchy" aria-label="Scene hierarchy">
			<div className="panel-title">
				Scene <span>{entries.length}</span>
			</div>
			<Input
				aria-label="Search scene"
				placeholder="Find in scene…"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<div className="scene-tree" role="listbox" aria-label="Scene entities">
				{entries
					.filter((entry) =>
						entry.name.toLowerCase().includes(query.toLowerCase()),
					)
					.map((entry) => {
						const Icon = sceneEntityIcons[entry.type];
						return (
							<Button
								variant="ghost"
								type="button"
								role="option"
								aria-label={`${entry.name} ${entry.type === "npc" ? "Character" : entry.type === "eventBlock" ? "Event" : entry.type}`}
								aria-selected={
									selection?.type === entry.type &&
									"id" in selection &&
									selection.id === entry.id
								}
								key={`${entry.type}:${entry.id}`}
								onClick={() =>
									onSelect({ type: entry.type, id: entry.id, areaId: area.id })
								}
							>
								<Icon aria-hidden="true" />
								<span>{entry.name}</span>
								<small>
									{entry.type === "npc"
										? "Character"
										: entry.type === "eventBlock"
											? "Event"
											: entry.type}
								</small>
							</Button>
						);
					})}
			</div>
			{!entries.length && (
				<p className="empty-state">
					Drag an asset into the scene to get started.
				</p>
			)}
		</section>
	);
}
