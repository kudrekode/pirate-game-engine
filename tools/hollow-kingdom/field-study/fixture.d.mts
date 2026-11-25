import type { GameProject } from "../../../src/types/game";

type LandscapeScale =
	| "small"
	| "medium"
	| "large"
	| "stress"
	| "upland"
	| "frontier"
	| "reach";
type Population = { width: number; height: number; npcs: number };

export const landscapeScales: Record<LandscapeScale, Population>;
export function createLandscapeFixture(
	scale: LandscapeScale | "merewatch",
): Promise<{
	project: GameProject;
	areaId: string;
	spawn: { x: number; y: number };
	counts: Population & {
		tiles: number;
		raised: number;
		objects: number;
		actors: number;
	};
}>;
