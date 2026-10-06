import registry from "../../packages/character-contract/src/character-component-registry.json" with {
	type: "json",
};
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
export const CLOTHING_SLOTS = ["top", "bottoms", "footwear"];
export const NO_CLOTHING = { top: "none", bottoms: "none", footwear: "none" };
export function validateClothing(value, geometry) {
	if (value === undefined) return [];
	const fail = (message) => [{ path: "$.clothing", message }];
	if (geometry?.family !== "authored-human")
		return fail("Clothing requires the authored human family.");
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).length !== 3
	)
		return fail("Expected top, bottoms and footwear selections.");
	if (!geometry.values)
		return fail("Clothing requires a valid authored identity.");
	for (const slot of CLOTHING_SLOTS) {
		const c = value[slot];
		if (c === "none") continue;
		if (
			!c ||
			typeof c !== "object" ||
			Array.isArray(c) ||
			Object.keys(c).length !== 3 ||
			!registry.clothingComponents.some(
				(entry) =>
					entry.slot === slot &&
					entry.id === c.componentId &&
					entry.revision === c.revision,
			) ||
			typeof c.color !== "string" ||
			!/^#[0-9a-f]{6}$/.test(c.color)
		)
			return fail("Unsupported clothing component, revision or colour.");
	}
	if (
		CLOTHING_SLOTS.some((slot) => value[slot] !== "none") &&
		geometry.values &&
		geometry.values.mass +
			geometry.values.athletic +
			geometry.values.broadFrame >
			1.65 + 1e-8
	)
		return fail(
			"This combination exceeds the outfit's supported fit. Reduce Build, Muscle or Frame, or choose a body preset.",
		);
	return [];
}
export function clothingSourcePaths() {
	return [
		...new Set(
			registry.clothingComponents.flatMap((c) =>
				[...c.sourceFiles, c.provenance, c.license].map((f) => f.path),
			),
		),
	];
}
export async function validateClothingSources(
	workspaceRoot = process.cwd(),
	components = registry.clothingComponents,
) {
	if (!Array.isArray(components) || components.length !== 3)
		throw Error("Incomplete clothing registry.");
	const hashes = {};
	const ids = new Set();
	for (const c of components) {
		if (
			ids.has(c.id) ||
			c.id !== `everyday-${c.slot}` ||
			!CLOTHING_SLOTS.includes(c.slot) ||
			c.revision !== "1" ||
			c.compatibilityFamily !== "authored-human-canonical-v1" ||
			c.rigProfile !== "golden-humanoid-v0" ||
			!c.sourceMeshName
		)
			throw Error("Invalid clothing registry metadata.");
		ids.add(c.id);
		for (const f of [...c.sourceFiles, c.provenance, c.license]) {
			const actual = createHash("sha256")
				.update(await readFile(path.resolve(workspaceRoot, f.path)))
				.digest("hex");
			if (actual !== f.sha256)
				throw Error(`Clothing source hash mismatch: ${f.path}`);
			hashes[f.path] = actual;
		}
	}
	return hashes;
}

export function clothingProvenance(selections) {
	return registry.clothingComponents
		.filter((c) => selections?.[c.slot] && selections[c.slot] !== "none")
		.map((c) => structuredClone(c));
}
