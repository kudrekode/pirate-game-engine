import type {
	GameArea,
	GameProject,
	ProgressionAction,
} from "../../types/game";

type StartupProject = Pick<GameProject, "areas" | "progression">;

function resolveStartupTransition(project: StartupProject) {
	let lastTransition:
		| {
				index: number;
				action: Extract<
					ProgressionAction,
					{ type: "spawn_player" | "teleport_player" }
				>;
		  }
		| undefined;
	let boundary = project.progression.length;
	for (const [index, { action }] of project.progression.entries()) {
		if (action.type === "wait_for_trigger" || action.type === "end_game") {
			boundary = index;
			break;
		}
		if (action.type === "spawn_player" || action.type === "teleport_player") {
			const area = project.areas.find(
				(candidate) => candidate.id === action.areaId,
			);
			if (area?.eventBlocks.some((event) => event.id === action.eventBlockId)) {
				lastTransition = { index, action };
			}
		}
	}
	return { boundary, lastTransition };
}

export function resolveMapSpawn(project: StartupProject, area: GameArea) {
	const { lastTransition } = resolveStartupTransition(project);
	const start = lastTransition?.action;
	const startingMarker =
		start?.areaId === area.id
			? area.eventBlocks.find((event) => event.id === start.eventBlockId)
			: undefined;
	return {
		marker:
			startingMarker ??
			area.eventBlocks.find((event) => event.kind === "spawn"),
		isProjectStart: Boolean(startingMarker),
	};
}

export function setMapSpawnAsProjectStart(
	project: GameProject,
	areaId: string,
	eventBlockId: string,
) {
	const area = project.areas.find((candidate) => candidate.id === areaId);
	if (!area?.eventBlocks.some((event) => event.id === eventBlockId)) return;

	const { boundary, lastTransition } = resolveStartupTransition(project);
	if (
		lastTransition?.action.areaId === areaId &&
		lastTransition.action.eventBlockId === eventBlockId
	) {
		return;
	}
	const action = { type: "spawn_player", areaId, eventBlockId } as const;
	if (lastTransition?.action.type === "spawn_player") {
		project.progression[lastTransition.index].action = action;
		return;
	}

	const ids = new Set(project.progression.map((step) => step.id));
	const prefix = `map-spawn-${areaId}-${eventBlockId}`;
	let id = prefix;
	for (let suffix = 2; ids.has(id); suffix += 1) id = `${prefix}-${suffix}`;
	project.progression.splice(boundary, 0, {
		id,
		action,
		label: "Player start",
	});
}
