import type { AuthoredHumanValues } from "./authoredHuman";

// Presets are starting points. Recipes persist their resolved values, never an ID.
export const AUTHORED_BODY_PRESETS = [
	{
		id: "athletic",
		name: "Athletic",
		description: "Defined, balanced frame",
		values: { mass: 0, athletic: 0, broadFrame: 0 },
	},
	{
		id: "broad",
		name: "Broad",
		description: "Wider shoulders and chest",
		values: { mass: 0, athletic: 0.25, broadFrame: 1 },
	},
	{
		id: "fuller",
		name: "Fuller",
		description: "More volume through the torso",
		values: { mass: 1, athletic: 0, broadFrame: 0.15 },
	},
] as const;

export const AUTHORED_FACE_PRESETS = [
	{
		id: "balanced",
		name: "Balanced",
		description: "Original proportions",
		values: { headWidth: 0, jaw: 0, nose: 0 },
	},
	{
		id: "narrow",
		name: "Narrow",
		description: "Slender head, subtle jaw",
		values: { headWidth: -1, jaw: 0.15, nose: 0 },
	},
	{
		id: "square",
		name: "Square",
		description: "Wide head, stronger jaw",
		values: { headWidth: 1, jaw: 1, nose: 0 },
	},
	{
		id: "angular",
		name: "Angular",
		description: "Narrow head, pronounced features",
		values: { headWidth: -0.65, jaw: 1, nose: 1 },
	},
	{
		id: "strong",
		name: "Strong",
		description: "Broad face, prominent nose",
		values: { headWidth: 0.6, jaw: 0.4, nose: 1 },
	},
] as const;

export function matchingAuthoredPreset<
	T extends { name: string; values: Partial<AuthoredHumanValues> },
>(values: AuthoredHumanValues, presets: readonly T[]): T | undefined {
	return presets.find((preset) =>
		Object.entries(preset.values).every(
			([key, value]) => values[key as keyof AuthoredHumanValues] === value,
		),
	);
}
