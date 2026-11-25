import {
	BoxGeometry,
	DepthTexture,
	DirectionalLight,
	Group,
	type InstancedMesh,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	PCFShadowMap,
	Scene,
	Vector3,
	type WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { expect, it, vi } from "vitest";
import { batchStaticScenery } from "./sceneryBatches";
import { cacheSceneryShadows } from "./staticScenery";

function setupTree(x: number, withProxy: boolean) {
	const scene = new Scene();
	const tree = new Group(),
		sourceRoot = new Group();
	tree.scale.setScalar(1.25);
	tree.rotation.y = 0.3;
	tree.position.x = x;
	sourceRoot.position.y = 0.7;
	const detailed = new Mesh(
		new BoxGeometry(1, 3, 1),
		new MeshStandardMaterial(),
	);
	detailed.position.y = 2;
	detailed.castShadow = detailed.receiveShadow = true;
	sourceRoot.add(detailed);
	tree.add(sourceRoot);
	scene.add(tree);
	const proxy = new Mesh(
		new BoxGeometry(1, 3, 1),
		new MeshStandardMaterial({ alphaTest: 0.5 }),
	);
	proxy.position.z = 0.3;
	proxy.updateMatrixWorld();
	const expected = sourceRoot.matrixWorld.clone();
	tree.updateWorldMatrix(true, true);
	expected.multiplyMatrices(sourceRoot.matrixWorld, proxy.matrixWorld);
	const batches = batchStaticScenery(
		scene,
		[{ id: "tree", group: tree, farModelId: "tree-far" }],
		withProxy ? new Map([["tree-far", proxy]]) : undefined,
	);
	const sun = new DirectionalLight();
	sun.position.set(0, 20, 0.1);
	batches.setShadowLight(sun);
	return { batches, expected, tree, scene, sun };
}

it("switches complete tree geometry beyond a cell's bounds with hysteresis, retaining authored normalization", () => {
	const { batches, expected } = setupTree(80, true);
	expect(batches.stats.lodTrees).toBe(1);
	const [near, far] = batches.roots[0].children as InstancedMesh[];
	expect(far.userData.sceneryMarkerIds).toEqual(["tree"]);
	expect(far.userData.sceneryLod).toBe("far");
	const actual = new Matrix4();
	far.getMatrixAt(0, actual);
	for (const [index, value] of actual.elements.entries())
		expect(value).toBe(Math.fround(expected.elements[index]));
	expect(far.receiveShadow).toBe(true);
	expect(far.castShadow).toBe(false);
	const camera = (offset: number) => new Vector3(80 + offset, 3, 0);
	batches.updateLod(camera(42));
	expect(near.visible).toBe(true);
	batches.updateLod(camera(54));
	expect(far.visible).toBe(true);
	expect(near.visible).toBe(false);
	batches.updateLod(camera(44));
	expect(far.visible).toBe(true);
	batches.updateLod(camera(34));
	expect(far.visible).toBe(false);
	expect(near.visible).toBe(true);
});

it("recaptures detailed native shadows after a context restore while the far proxy is visible", () => {
	const { batches, scene, sun } = setupTree(0, true);
	const [near, far] = batches.roots[0].children as InstancedMesh[];
	const camera = new Vector3(100, 0, 0);
	const extras = [new Group(), new Group()];
	for (const root of extras) {
		for (let i = 0; i < 50; i++) {
			const mesh = new Mesh(near.geometry, near.material);
			mesh.castShadow = true;
			root.add(mesh);
		}
		scene.add(root);
	}
	sun.shadow.map = new WebGLRenderTarget(8, 8, {
		depthTexture: new DepthTexture(8, 8),
	});
	const canvas = new EventTarget();
	const renderer = {
		shadowMap: { type: PCFShadowMap },
		domElement: canvas,
		initRenderTarget: vi.fn(),
		copyTextureToTexture: vi.fn(),
		setRenderTarget: vi.fn(),
	} as unknown as WebGLRenderer;
	const release = cacheSceneryShadows(
		scene,
		[...batches.roots, ...extras],
		sun,
		renderer,
	);
	const boundary = scene.getObjectByName("Static scenery shadow cache") as Mesh;
	const capture = () =>
		boundary.onBeforeShadow(
			renderer,
			scene,
			sun.shadow.camera,
			sun.shadow.camera,
			boundary.geometry,
			near.material as MeshStandardMaterial,
			batches.roots[0],
		);
	batches.updateLod(camera);
	expect(near.visible && near.castShadow).toBe(true);
	capture();
	batches.updateLod(camera);
	expect(far.visible).toBe(true);
	expect(near.visible || near.castShadow).toBe(false);
	canvas.dispatchEvent(new Event("webglcontextrestored"));
	batches.updateLod(camera);
	expect(near.visible && near.castShadow).toBe(true);
	expect(far.visible).toBe(false);
	capture();
	expect(renderer.initRenderTarget).toHaveBeenCalledTimes(2);
	release?.();
});

it("keeps the source model when the distant asset has not loaded", () => {
	const { batches, tree, scene } = setupTree(80, false);
	expect(batches.stats.lodTrees).toBe(0);
	expect(tree.parent).toBe(scene);
});
