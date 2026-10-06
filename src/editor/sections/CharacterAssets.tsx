import { useEffect, useState } from "react";
import {
	addCharacterNpcDefinition,
	characterAssetProblem,
} from "../../data/characterAssets";
import { useProjectStore } from "../../store/useProjectStore";
import type { CharacterGameAsset } from "../../types/game";

function CharacterAssetCard({ asset }: { asset: CharacterGameAsset }) {
	const [problem, setProblem] = useState(characterAssetProblem(asset));
	const [message, setMessage] = useState("");
	const updatePlayer = useProjectStore((state) => state.updatePlayer);
	const updateProject = useProjectStore((state) => state.updateProject);
	const setPalette = useProjectStore((state) => state.setMapPaletteSelection);
	useEffect(() => {
		const issue = characterAssetProblem(asset);
		setProblem(issue);
		if (issue) return;
		const controller = new AbortController();
		Promise.all([
			fetch(asset.glbUrl, { method: "HEAD", signal: controller.signal }),
			fetch(asset.manifestUrl, { signal: controller.signal }).then(
				async (response) => {
					if (!response.ok) throw new Error("Missing manifest");
					const manifest = await response.json();
					if (
						manifest.outputHash !== asset.artifactHash ||
						manifest.recipeHash !== asset.recipeHash ||
						manifest.validationLevel !== "full"
					)
						throw new Error("Invalid manifest");
				},
			),
		])
			.then(([response]) => {
				if (
					!response.ok ||
					!response.headers.get("content-type")?.includes("model/gltf-binary")
				)
					throw new Error("Missing character");
			})
			.catch(() => {
				if (!controller.signal.aborted)
					setProblem(
						"Character files are missing or damaged. Restore the project asset folder or finalise and import again. Your assignments are preserved.",
					);
			});
		return () => controller.abort();
	}, [asset]);
	return (
		<article className="character-asset-card" aria-label={asset.name}>
			<strong>{asset.name}</strong>
			<p>
				Character ·{" "}
				{asset.geometryFamily === "authored-human" ? "Authored" : "Procedural"}{" "}
				· Finalised
			</p>
			{problem && <p role="alert">{problem}</p>}
			<button
				type="button"
				disabled={Boolean(problem)}
				onClick={() => {
					updatePlayer({ threeVisual: { mode: "asset", assetId: asset.id } });
					setMessage("Player character assigned. Use 3D Play to see it.");
				}}
			>
				Set as Player Character
			</button>
			<button
				type="button"
				disabled={Boolean(problem)}
				onClick={() => {
					let id = "";
					updateProject((project) => {
						id = addCharacterNpcDefinition(project, asset);
					});
					setPalette({ type: "npc", npcDefinitionId: id });
					setMessage(
						"Selected in the NPC palette. Open Map and click a tile to place it; repeat for more instances.",
					);
				}}
			>
				Add to NPC palette
			</button>
			{message && <p role="status">{message}</p>}
			{!characterAssetProblem(asset) && (
				<a href={asset.recipeUrl} download="character.recipe.json">
					Save editable character
				</a>
			)}
			<details>
				<summary>Technical details</summary>
				<p>Rig: {asset.rigProfile}</p>
				<p>Artifact: {asset.artifactHash}</p>
			</details>
		</article>
	);
}

export function CharacterAssets() {
	const assets = useProjectStore((state) => state.project.characterAssets);
	if (!assets?.length) return null;
	return (
		<section aria-label="Project characters">
			<div className="panel-title">Project characters</div>
			{assets.map((asset) => (
				<CharacterAssetCard key={asset.id} asset={asset} />
			))}
		</section>
	);
}
