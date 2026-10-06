import type { CharacterGeometry } from "./authoredHuman";
import registry from "./character-component-registry.json";

export const CLOTHING_SLOTS = ["top", "bottoms", "footwear"] as const;
export type ClothingSlot = (typeof CLOTHING_SLOTS)[number];
export type ClothingSelection =
	| "none"
	| { componentId: string; revision: string; color: string };
export type CharacterClothing = Record<ClothingSlot, ClothingSelection>;
export const CLOTHING_SWATCHES = {
	top: [
		{ name: "Grey", color: "#56616b" },
		{ name: "White", color: "#dddcd5" },
		{ name: "Black", color: "#25272b" },
		{ name: "Navy", color: "#283950" },
	],
	bottoms: [
		{ name: "Dark Blue", color: "#303948" },
		{ name: "Black", color: "#27282c" },
		{ name: "Grey", color: "#626267" },
		{ name: "Khaki", color: "#827c61" },
	],
	footwear: [
		{ name: "Brown", color: "#322b27" },
		{ name: "Black", color: "#252527" },
		{ name: "White", color: "#c5c3ba" },
	],
} as const;
export function noClothing(): CharacterClothing {
	return { top: "none", bottoms: "none", footwear: "none" };
}
export function everydayClothing(): CharacterClothing {
	return Object.fromEntries(
		CLOTHING_SLOTS.map((slot) => [
			slot,
			{
				componentId: `everyday-${slot}`,
				revision: "1",
				color: CLOTHING_SWATCHES[slot][0].color,
			},
		]),
	) as CharacterClothing;
}
export const CLOTHING_COMPONENTS = registry.clothingComponents;
export function clothingIssues(
	value: unknown,
	geometry?: CharacterGeometry,
): string[] {
	if (value === undefined) return [];
	if (geometry?.family !== "authored-human")
		return ["Clothing requires the authored human family."];
	if (!value || typeof value !== "object" || Array.isArray(value))
		return ["Expected clothing selections."];
	if (!geometry.values) return ["Clothing requires a valid authored identity."];
	const selections = value as Record<string, unknown>;
	if (Object.keys(selections).length !== 3)
		return ["Expected top, bottoms and footwear selections."];
	for (const slot of CLOTHING_SLOTS) {
		const chosen = selections[slot];
		if (chosen === "none") continue;
		if (!chosen || typeof chosen !== "object" || Array.isArray(chosen))
			return ["Invalid clothing selection."];
		const c = chosen as Record<string, unknown>;
		if (
			Object.keys(c).length !== 3 ||
			!CLOTHING_COMPONENTS.some(
				(entry) =>
					entry.slot === slot &&
					entry.id === c.componentId &&
					entry.revision === c.revision,
			) ||
			typeof c.color !== "string" ||
			!/^#[0-9a-f]{6}$/.test(c.color)
		)
			return ["Unsupported clothing component, revision or colour."];
	}
	if (
		CLOTHING_SLOTS.some((slot) => selections[slot] !== "none") &&
		geometry.values &&
		geometry.values.mass +
			geometry.values.athletic +
			geometry.values.broadFrame >
			1.65 + 1e-8
	)
		return [
			"This combination exceeds the outfit's supported fit. Reduce Build, Muscle or Frame, or choose a body preset.",
		];
	return [];
}
export function sameClothing(
	a?: CharacterClothing,
	b?: CharacterClothing,
): boolean {
	return CLOTHING_SLOTS.every((slot) => {
		const x = a?.[slot] ?? "none",
			y = b?.[slot] ?? "none";
		return x === "none" || y === "none"
			? x === y
			: x.componentId === y.componentId &&
					x.revision === y.revision &&
					x.color === y.color;
	});
}
