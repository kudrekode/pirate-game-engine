import type { CharacterGameAsset, GameProject } from "../types/game";

export function characterAssetProblem(
	asset: CharacterGameAsset,
): string | undefined {
	if (
		asset.rigProfile !== "golden-humanoid-v0" ||
		asset.animationSet !== "golden-idle-walk-v1"
	)
		return "Unsupported character rig or animation set. Reimport a supported finalised character.";
	const root = `/assets/project-characters/${asset.id}/`;
	if (
		!/^character-[a-f0-9]{64}$/.test(asset.id) ||
		![asset.artifactHash, asset.recipeHash].every((hash) =>
			/^[a-f0-9]{64}$/.test(hash),
		) ||
		asset.glbUrl !== `${root}character.glb` ||
		asset.manifestUrl !== `${root}manifest.json` ||
		asset.recipeUrl !== `${root}character.recipe.json` ||
		asset.state !== "finalised"
	)
		return "Character asset references are invalid. Reimport the finalised character; saved assignments are preserved.";
	return undefined;
}

// Keep damaged/unsupported records addressable so migration never changes a
// saved character to another visual. The resolver reports them as unavailable.
export function migrateCharacterAssets(value: unknown): CharacterGameAsset[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!item || typeof item !== "object" || typeof item.id !== "string")
			return [];
		const read = (key: string) =>
			typeof item[key] === "string" ? item[key] : "";
		return [
			{
				id: item.id,
				name: read("name") || "Character",
				kind: "character" as const,
				state: read("state") as "finalised",
				geometryFamily: read("geometryFamily"),
				glbUrl: read("glbUrl"),
				artifactHash: read("artifactHash"),
				recipeHash: read("recipeHash"),
				manifestUrl: read("manifestUrl"),
				recipeUrl: read("recipeUrl"),
				rigProfile: read("rigProfile"),
				animationSet: read("animationSet"),
			},
		];
	});
}

export function registerCharacterAsset(
	project: GameProject,
	asset: CharacterGameAsset,
): void {
	const problem = characterAssetProblem(asset);
	if (problem) throw new Error(problem);
	const existing = project.characterAssets?.find(
		(entry) => entry.id === asset.id,
	);
	if (existing) {
		if (
			existing.artifactHash !== asset.artifactHash ||
			existing.recipeHash !== asset.recipeHash
		)
			throw new Error(
				"This character identity already belongs to another revision.",
			);
		return;
	}
	project.characterAssets = [...(project.characterAssets ?? []), asset];
}

export function characterNpcDefinitionId(asset: CharacterGameAsset): string {
	return `npc-${asset.id}`;
}

export function addCharacterNpcDefinition(
	project: GameProject,
	asset: CharacterGameAsset,
): string {
	const id = characterNpcDefinitionId(asset);
	if (!project.npcs.some((entry) => entry.id === id))
		project.npcs.push({
			id,
			name: asset.name,
			mapAvatarId: "scout",
			threeVisual: { mode: "asset", assetId: asset.id },
			defaultMovement: { movementMode: "stationary", movementSpeed: 1 },
		});
	return id;
}
