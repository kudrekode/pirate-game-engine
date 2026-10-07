import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { requestThreeVisualAsset } from "../../runtime/three/threeVisualAssetLoader";
import { getThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type { GameProject } from "../../types/game";
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
			if (!definition) continue;
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
				renderer.setSize(128, 96);
				const scene = new THREE.Scene();
				scene.add(new THREE.HemisphereLight(0xffffff, 0x687585, 2.5));
				const light = new THREE.DirectionalLight(0xffffff, 3);
				light.position.set(3, 5, 4);
				scene.add(light);
				const model = loaded.object;
				const box = new THREE.Box3().setFromObject(model);
				const center = box.getCenter(new THREE.Vector3());
				const size = box.getSize(new THREE.Vector3());
				model.position.sub(center);
				scene.add(model);
				const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.001, 10000);
				const distance = Math.max(size.x, size.y, size.z, 0.01) * 2.1;
				camera.position.set(distance * 0.65, distance * 0.4, distance);
				camera.lookAt(0, 0, 0);
				renderer.render(scene, camera);
				next[assetId] = renderer.domElement.toDataURL();
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
				{visible.map((asset) => (
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
							{asset.visual?.assetId && thumbnails[asset.visual.assetId] ? (
								<img
									draggable={false}
									src={thumbnails[asset.visual.assetId]}
									alt={asset.name}
								/>
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
				))}
			</div>
			{!visible.length && (
				<p className="empty-state">No matching assets. Try another search.</p>
			)}
		</section>
	);
}
