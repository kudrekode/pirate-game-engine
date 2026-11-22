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

export function useCreatorThumbnails(assets: ThreeVisualAssetDefinition[]) {
	const renderer = useRef<THREE.WebGLRenderer | undefined>(undefined);
	const cache = useRef<Record<string, string>>({});
	const failed = useRef(false);
	const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
	const [revision, setRevision] = useState(0);
	useEffect(
		() => () => {
			renderer.current?.dispose();
			renderer.current?.forceContextLoss();
			renderer.current = undefined;
		},
		[],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry thumbnails when a GLB cache entry finishes loading
	useEffect(() => {
		if (failed.current || typeof WebGLRenderingContext === "undefined") return;
		let live = true;
		let changed = false;
		const refresh = () => {
			if (live) setRevision((value) => value + 1);
		};
		for (const asset of assets) {
			if (asset.thumbnailUrl || cache.current[asset.url]) continue;
			const request = requestThreeVisualAsset(asset, {
				onStateChange: refresh,
			});
			if (request.status !== "loaded") continue;
			try {
				renderer.current ??= new THREE.WebGLRenderer({ antialias: true });
				cache.current[asset.url] = renderAssetThumbnail(
					renderer.current,
					request.object,
					156,
					106,
				);
				changed = true;
			} catch {
				failed.current = true;
				break;
			} finally {
				request.object.traverse((node) => {
					const mesh = node as THREE.SkinnedMesh;
					if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
				});
			}
		}
		if (changed) setThumbnails({ ...cache.current });
		return () => {
			live = false;
		};
	}, [assets, /* Cache-completion notification */ revision]);
	return thumbnails;
}
