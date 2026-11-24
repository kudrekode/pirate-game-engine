import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { requestThreeVisualAsset } from "../../runtime/three/threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type { AssetCreatorCategory, GameProject } from "../../types/game";
import { renderAssetThumbnail } from "../sections/assetThumbnail";

export function creatorCategory(
	asset: ThreeVisualAssetDefinition,
): AssetCreatorCategory {
	if (asset.variant) return asset.variant.category;
	if (asset.category === "character") return "Humans";
	if (asset.gaitSpeeds) return "Animals";
	if (asset.browserCategory === "Buildings") return "Buildings";
	if (asset.browserCategory === "Nature") return "Foliage";
	return "Props";
}

export function assetDisplayName(
	asset: ThreeVisualAssetDefinition,
	project: GameProject,
) {
	if (asset.variant) return asset.name;
	return (
		project.npcs.find((npc) => npc.threeVisual?.assetId === asset.id)?.name ??
		asset.name
	);
}

export function useCreatorThumbnails(
	assets: ThreeVisualAssetDefinition[],
	cache: Map<string, string>,
) {
	const renderer = useRef<THREE.WebGLRenderer | undefined>(undefined);
	const [thumbnails, setThumbnails] = useState<Record<string, string>>(() =>
		Object.fromEntries(cache),
	);
	useEffect(
		() => () => {
			renderer.current?.dispose();
			renderer.current?.forceContextLoss();
			renderer.current = undefined;
		},
		[],
	);
	useEffect(() => {
		if (typeof WebGLRenderingContext === "undefined") return;
		let live = true;
		let index = 0;
		let frame = 0;
		const batch = assets.filter((asset) => !asset.thumbnailUrl);
		setThumbnails(Object.fromEntries(cache));
		function next() {
			if (!live) return;
			while (index < batch.length && cache.has(batch[index].url)) index++;
			const asset = batch[index];
			if (!asset) return;
			const request = requestThreeVisualAsset(asset, { onStateChange: next });
			if (request.status === "loading") return;
			index++;
			if (request.status === "loaded") {
				try {
					renderer.current ??= new THREE.WebGLRenderer({ antialias: true });
					const url = renderAssetThumbnail(
						renderer.current,
						request.object,
						156,
						106,
					);
					cache.set(asset.url, url);
					if (cache.size > 64)
						cache.delete(cache.keys().next().value as string);
					setThumbnails((current) => ({ ...current, [asset.url]: url }));
				} catch {
					return;
				} finally {
					request.object.traverse((node) => {
						const mesh = node as THREE.SkinnedMesh;
						if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
					});
				}
			}
			frame = requestAnimationFrame(next);
		}
		frame = requestAnimationFrame(next);
		return () => {
			live = false;
			cancelAnimationFrame(frame);
		};
	}, [assets, cache]);
	return thumbnails;
}
