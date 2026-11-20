import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { requestThreeVisualAsset } from "../../runtime/three/threeVisualAssetLoader";
import { getThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type { GameProject } from "../../types/game";
import { renderAssetThumbnail } from "./assetThumbnail";
import { SCENE_ASSET_MIME, type SceneAsset, sceneAssets } from "./sceneEditing";

export function AssetBrowser({
	project,
	onAdd,
}: {
	project: GameProject;
	onAdd: (asset: SceneAsset) => void;
}) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("All");
	const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
	const rendererRef = useRef<THREE.WebGLRenderer | undefined>(undefined);
	const assets = useMemo(() => sceneAssets(project), [project]);
	useEffect(
		() => () => {
			rendererRef.current?.dispose();
		},
		[],
	);
	useEffect(() => {
		if (typeof WebGLRenderingContext === "undefined") return;
		let active = true;
		const next: Record<string, string> = {};
		for (const asset of assets) {
			const assetId = asset.visual?.assetId;
			if (!assetId || thumbnails[assetId]) continue;
			const definition = getThreeVisualAssetDefinition(
				assetId,
				project.characterAssets,
			);
			if (!definition || definition.thumbnailUrl) continue;
			const loaded = requestThreeVisualAsset(definition, {
				onStateChange: () => {
					if (active) setThumbnails((current) => ({ ...current }));
				},
			});
			if (loaded.status !== "loaded") continue;
			try {
				let renderer = rendererRef.current;
				if (!renderer) {
					renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
					rendererRef.current = renderer;
				}
				next[assetId] = renderAssetThumbnail(renderer, loaded.object);
			} catch {
				/* Asset names and type icons remain usable without WebGL. */
			}
		}
		if (Object.keys(next).length)
			setThumbnails((current) => ({ ...current, ...next }));
		return () => {
			active = false;
		};
	}, [assets, project.characterAssets, thumbnails]);
	const categories = ["All", ...new Set(assets.map((asset) => asset.category))];
	const visible = assets.filter(
		(asset) =>
			(category === "All" || category === asset.category) &&
			`${asset.name} ${asset.category} ${asset.tags.join(" ")}`
				.toLowerCase()
				.includes(query.toLowerCase()),
	);
	return (
		<section className="scene-asset-browser" aria-label="Asset Browser">
			<div className="panel-title">
				Asset Browser <span>{assets.length}</span>
			</div>
			<label className="asset-search">
				<span className="sr-only">Search assets</span>
				<input
					placeholder="Search assets…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			<fieldset className="asset-categories">
				<legend className="sr-only">Asset categories</legend>
				{categories.map((name) => (
					<button
						type="button"
						key={name}
						aria-pressed={category === name}
						onClick={() => setCategory(name)}
					>
						{name}
					</button>
				))}
			</fieldset>
			<p className="scene-hint">Drag into the world, or use Add.</p>
			<div className="asset-card-grid">
				{visible.map((asset) => {
					const thumbnail =
						getThreeVisualAssetDefinition(
							asset.visual?.assetId,
							project.characterAssets,
						)?.thumbnailUrl ?? thumbnails[asset.visual?.assetId ?? ""];
					return (
						<article
							className="asset-card"
							key={`${asset.kind}:${asset.id}`}
							aria-label={asset.name}
							draggable
							onDragStart={(event) => {
								event.dataTransfer.setData(
									SCENE_ASSET_MIME,
									JSON.stringify({ id: asset.id, kind: asset.kind }),
								);
								event.dataTransfer.effectAllowed = "copy";
							}}
						>
							<div className="asset-card-preview">
								{thumbnail ? (
									<img draggable={false} src={thumbnail} alt={asset.name} />
								) : (
									<span aria-hidden="true">
										{asset.category === "Characters"
											? "♟"
											: asset.category === "Buildings"
												? "⌂"
												: asset.category === "Nature"
													? "♧"
													: "◇"}
									</span>
								)}
							</div>
							<strong title={asset.name}>{asset.name}</strong>
							<small>{asset.category}</small>
							<button
								type="button"
								aria-label={`Add ${asset.name}`}
								onClick={() => onAdd(asset)}
							>
								+ Add
							</button>
						</article>
					);
				})}
			</div>
			{!visible.length && (
				<p className="empty-state">No matching assets. Try another search.</p>
			)}
		</section>
	);
}
