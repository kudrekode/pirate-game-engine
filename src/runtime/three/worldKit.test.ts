// @ts-expect-error Root browser tsconfig has no Node ambient types; root-node owns this test.
import { createHash } from "node:crypto";
// @ts-expect-error File checks run only in the isolated root-node Vitest project.
import { readFileSync } from "node:fs";
import { Box3, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../public/assets/world-kit/manifest.json";
import { migrateProject } from "../../data/migrateProject";
import { createProjectFromPreset } from "../../data/projectPresets";
import { WORLD_ASSET_TRAVERSAL } from "../../data/worldAssetTraversal";
import {
	duplicateSceneSelection,
	placeSceneAsset,
	sceneAssets,
} from "../../editor/sections/sceneEditing";
import { useProjectStore } from "../../store/useProjectStore";
import { cloneThreeVisualAssetRoot } from "./threeVisualAssetLoader";
import { getThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

afterEach(() => {
	vi.unstubAllGlobals();
	useProjectStore.getState().setProject(createProjectFromPreset("blank"));
});

describe("Harbour world kit", () => {
	it("ships correctly identified, grounded metre-scale GLBs with normals, UVs, thumbnails and provenance", async () => {
		vi.stubGlobal(
			"ProgressEvent",
			class {
				constructor(public type: string) {}
			},
		);
		expect(new Set(manifest.assets.map((asset) => asset.id)).size).toBe(23);
		for (const asset of manifest.assets) {
			const definition = getThreeVisualAssetDefinition(asset.id);
			expect(definition).toMatchObject({
				url: asset.url,
				name: asset.name,
				defaultScale: 1,
				browserCategory: asset.category,
				thumbnailUrl: asset.thumbnailUrl,
			});
			const bytes = readFileSync(`public${asset.url}`);
			expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
			expect(bytes.readUInt32LE(4)).toBe(2);
			expect(bytes.readUInt32LE(8)).toBe(bytes.length);
			expect(createHash("sha256").update(bytes).digest("hex")).toBe(
				asset.sha256,
			);
			expect(
				createHash("sha256").update(readFileSync(asset.source)).digest("hex"),
			).toBe(asset.sourceSha256);
			const png = readFileSync(`public${asset.thumbnailUrl}`);
			expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
			expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 192]);
			const jsonLength = bytes.readUInt32LE(12);
			const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
			expect(
				doc.nodes.some(
					(node: { extras?: { assetId?: string } }) =>
						node.extras?.assetId === asset.id,
				),
			).toBe(true);
			expect(doc.skins).toBeUndefined();
			expect(doc.animations).toBeUndefined();
			let triangles = 0;
			for (const mesh of doc.meshes)
				for (const primitive of mesh.primitives) {
					expect(primitive.attributes.NORMAL).toBeDefined();
					expect(primitive.attributes.TEXCOORD_0).toBeDefined();
					triangles += doc.accessors[primitive.indices].count / 3;
					// Node validates real exported geometry. The browser also loads all
					// embedded images/materials, which require a real image decoder.
					delete primitive.material;
				}
			expect(triangles).toBe(asset.triangles);
			expect(triangles).toBeLessThan(20000);
			for (const image of doc.images ?? [])
				expect(image.bufferView).toBeDefined();
			delete doc.materials;
			delete doc.images;
			delete doc.textures;
			doc.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString("base64")}`;
			const loaded = await new GLTFLoader().parseAsync(JSON.stringify(doc), "");
			const bounds = new Box3().setFromObject(loaded.scene);
			if (["world-dock", "world-floor", "world-stairs"].includes(asset.id)) {
				const profile = WORLD_ASSET_TRAVERSAL[asset.id];
				expect(definition?.traversal).toBe(profile);
				for (const floor of profile.surfaces ?? []) {
					const z = (floor.z[0] + floor.z[1]) / 2;
					const hit = new Raycaster(
						new Vector3(0, 5, z),
						new Vector3(0, -1, 0),
					).intersectObject(loaded.scene, true)[0];
					expect(hit?.point.y, `${asset.id} tread/deck height`).toBeCloseTo(
						(floor.y[0] + floor.y[1]) / 2,
						4,
					);
				}
			}
			expect(bounds.min.y, asset.name).toBeCloseTo(0, 4);
			const size = bounds.getSize(new Vector3()).toArray();
			size.forEach((value, index) => {
				expect(value, asset.name).toBeCloseTo(asset.dimensions[index], 3);
			});
			if (asset.pivot === "bottom-centre") {
				expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 4);
				expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0, 4);
			}
			const copy = cloneThreeVisualAssetRoot(loaded.scene);
			copy.position.x = 10;
			expect(copy).not.toBe(loaded.scene);
			expect(loaded.scene.position.x).toBe(0);
		}
	});

	it("keeps categories and search tags after placement, duplication and project reload without populating defaults", () => {
		const store = useProjectStore.getState();
		store.setProject(createProjectFromPreset("blank"));
		expect(store.project.areas[0].objects).toHaveLength(0);
		for (const asset of manifest.assets) {
			const card = sceneAssets(useProjectStore.getState().project).find(
				(entry) => entry.id === asset.id,
			);
			expect(card?.category).toBe(asset.category);
			if (!card) throw new Error(asset.name);
			const selection = placeSceneAsset(card, { x: 3, y: 3 });
			duplicateSceneSelection(selection);
			const reloaded = migrateProject(
				JSON.parse(JSON.stringify(useProjectStore.getState().project)),
			);
			store.setProject(reloaded);
			const placedCard = sceneAssets(reloaded).find(
				(entry) => entry.visual?.assetId === asset.id,
			);
			expect(placedCard?.category).toBe(asset.category);
			expect(placedCard?.tags).toEqual(expect.arrayContaining(asset.tags));
		}
		expect(useProjectStore.getState().project.areas[0].objects).toHaveLength(
			46,
		);
		expect(
			sceneAssets(useProjectStore.getState().project).some(
				(entry) => entry.id === "demo-box",
			),
		).toBe(false);
		// Legacy identities still resolve for existing projects and explicit assignments.
		expect(getThreeVisualAssetDefinition("pirate-crate")?.url).toBe(
			"/assets/pirate-demo/crate.glb",
		);
	});
});
