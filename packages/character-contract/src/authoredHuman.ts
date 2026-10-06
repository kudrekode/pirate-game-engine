/** Bounded identity controls for the canonical authored source, not legacy proportions. */
export const AUTHORED_HUMAN_REVISION = "authored-human-canonical-v1" as const;
export const AUTHORED_HUMAN_CONTROLS = {
	mass: { label: "Build", min: 0, max: 1, section: "Body" },
	athletic: { label: "Muscle", min: 0, max: 1, section: "Body" },
	broadFrame: {
		label: "Frame",
		min: 0,
		max: 1,
		section: "Body",
	},
	headWidth: { label: "Head Width", min: -1, max: 1, section: "Face" },
	jaw: { label: "Jaw / Chin", min: 0, max: 1, section: "Face" },
	nose: { label: "Nose", min: 0, max: 1, section: "Face" },
} as const;
export type AuthoredHumanValues = Record<
	keyof typeof AUTHORED_HUMAN_CONTROLS,
	number
>;
export type CharacterGeometry =
	| { family: "legacy-procedural" }
	| {
			family: "authored-human";
			baseRevision: typeof AUTHORED_HUMAN_REVISION;
			rigProfile: "golden-humanoid-v0";
			values: AuthoredHumanValues;
	  };
export function defaultAuthoredHumanGeometry(): CharacterGeometry {
	return {
		family: "authored-human",
		baseRevision: AUTHORED_HUMAN_REVISION,
		rigProfile: "golden-humanoid-v0",
		values: {
			mass: 0,
			athletic: 0,
			broadFrame: 0,
			headWidth: 0,
			jaw: 0,
			nose: 0,
		},
	};
}
export function validateCharacterGeometry(
	value: unknown,
): value is CharacterGeometry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const source = value as Record<string, unknown>;
	if (source.family === "legacy-procedural")
		return Object.keys(source).length === 1;
	if (
		source.family !== "authored-human" ||
		source.baseRevision !== AUTHORED_HUMAN_REVISION ||
		source.rigProfile !== "golden-humanoid-v0" ||
		!source.values ||
		typeof source.values !== "object"
	)
		return false;
	const values = source.values as Record<string, unknown>;
	return (
		Object.keys(values).length === 6 &&
		Object.entries(AUTHORED_HUMAN_CONTROLS).every(
			([key, range]) =>
				typeof values[key] === "number" &&
				Number.isFinite(values[key]) &&
				values[key] >= range.min &&
				values[key] <= range.max,
		)
	);
}

export function sameCharacterGeometry(
	a?: CharacterGeometry,
	b?: CharacterGeometry,
): boolean {
	if ((a?.family ?? "legacy-procedural") !== (b?.family ?? "legacy-procedural"))
		return false;
	if (a?.family !== "authored-human" || b?.family !== "authored-human")
		return true;
	return (
		a.baseRevision === b.baseRevision &&
		a.rigProfile === b.rigProfile &&
		(
			Object.keys(AUTHORED_HUMAN_CONTROLS) as Array<keyof AuthoredHumanValues>
		).every((key) => a.values[key] === b.values[key])
	);
}
