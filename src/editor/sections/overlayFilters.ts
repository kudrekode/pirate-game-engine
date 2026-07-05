export type MapOverlayFilterKey =
	| "npcs"
	| "npcPaths"
	| "objects"
	| "pickups"
	| "eventBlocks"
	| "spawnPoints"
	| "collision"
	| "questMarkers"
	| "structures";

export type MapOverlayFilters = Record<MapOverlayFilterKey, boolean>;

export const OVERLAY_FILTER_OPTIONS: {
	key: MapOverlayFilterKey;
	label: string;
}[] = [
	{ key: "npcs", label: "NPCs" },
	{ key: "npcPaths", label: "NPC Paths" },
	{ key: "objects", label: "Objects" },
	{ key: "pickups", label: "Pickups" },
	{ key: "eventBlocks", label: "Event Blocks" },
	{ key: "spawnPoints", label: "Spawn Points" },
	{ key: "collision", label: "Collision" },
	{ key: "questMarkers", label: "Quest Markers" },
	{ key: "structures", label: "Structures" },
];

export const SHOW_ALL_OVERLAY_FILTERS: MapOverlayFilters = {
	collision: true,
	eventBlocks: true,
	npcPaths: true,
	npcs: true,
	objects: true,
	pickups: true,
	questMarkers: true,
	spawnPoints: true,
	structures: true,
};

export const HIDE_ALL_OVERLAY_FILTERS: MapOverlayFilters = {
	collision: false,
	eventBlocks: false,
	npcPaths: false,
	npcs: false,
	objects: false,
	pickups: false,
	questMarkers: false,
	spawnPoints: false,
	structures: false,
};

export const GAMEPLAY_OVERLAY_FILTERS: MapOverlayFilters = {
	collision: false,
	eventBlocks: false,
	npcPaths: false,
	npcs: true,
	objects: true,
	pickups: true,
	questMarkers: true,
	spawnPoints: true,
	structures: true,
};

const MAP_OVERLAY_FILTER_STORAGE_KEY = "map-editor-overlay-filters-v1";

export function readStoredMapOverlayFilters(): MapOverlayFilters {
	if (typeof window === "undefined") {
		return GAMEPLAY_OVERLAY_FILTERS;
	}
	try {
		const storedValue = window.sessionStorage.getItem(
			MAP_OVERLAY_FILTER_STORAGE_KEY,
		);
		if (!storedValue) {
			return GAMEPLAY_OVERLAY_FILTERS;
		}
		const parsed = JSON.parse(storedValue) as Partial<MapOverlayFilters>;
		const filters = { ...GAMEPLAY_OVERLAY_FILTERS };
		for (const { key } of OVERLAY_FILTER_OPTIONS) {
			if (typeof parsed[key] === "boolean") {
				filters[key] = parsed[key];
			}
		}
		return filters;
	} catch {
		return GAMEPLAY_OVERLAY_FILTERS;
	}
}

export function writeStoredMapOverlayFilters(filters: MapOverlayFilters) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.sessionStorage.setItem(
			MAP_OVERLAY_FILTER_STORAGE_KEY,
			JSON.stringify(filters),
		);
	} catch {
		// Session persistence is best-effort editor UI state.
	}
}

export function toggleMapOverlayFilter(
	filters: MapOverlayFilters,
	key: MapOverlayFilterKey,
): MapOverlayFilters {
	return {
		...filters,
		[key]: !filters[key],
	};
}
