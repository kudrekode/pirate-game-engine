// Mirrors the renderer-independent authored contract. Cross-checked in tests.
export const AUTHORED_HUMAN_REVISION = "authored-human-canonical-v1";
export const AUTHORED_HUMAN_SOURCE =
	"tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend";
export function validateAuthoredGeometry(source, proportions, hair) {
	if (source === undefined) return [];
	if (
		source?.family === "legacy-procedural" &&
		Object.keys(source).length === 1
	)
		return [];
	const issues = [];
	if (
		source?.family !== "authored-human" ||
		source.baseRevision !== AUTHORED_HUMAN_REVISION ||
		source.rigProfile !== "golden-humanoid-v0"
	) {
		return [
			{
				path: "$.geometrySource",
				message:
					"Unsupported geometry family, canonical revision or rig profile.",
			},
		];
	}
	const values = source.values;
	if (
		!values ||
		Object.keys(values).length !== 6 ||
		!["mass", "athletic", "broadFrame", "headWidth", "jaw", "nose"].every(
			(key) =>
				typeof values[key] === "number" &&
				Number.isFinite(values[key]) &&
				values[key] >= (key === "headWidth" ? -1 : 0) &&
				values[key] <= 1,
		)
	) {
		issues.push({
			path: "$.geometrySource.values",
			message: "Invalid authored identity values.",
		});
	}
	if (!["none", "quaternius-hair-v0"].includes(hair))
		issues.push({
			path: "$.components.hair",
			message: "Authored humans support Short hair or No hair.",
		});
	if (
		Object.entries(proportions ?? {}).some(
			([k, v]) => k !== "height" && v !== 0.5,
		)
	)
		issues.push({
			path: "$.proportions",
			message: "Legacy proportions must remain neutral for authored humans.",
		});
	return issues;
}
