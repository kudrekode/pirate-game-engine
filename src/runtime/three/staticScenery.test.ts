import {
	BoxGeometry,
	DepthTexture,
	DirectionalLight,
	Group,
	Mesh,
	PCFShadowMap,
	Scene,
	type WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { expect, it, vi } from "vitest";
import { cacheSceneryShadows } from "./staticScenery";

it("stores only the fixed casters' depth, restores it ahead of moving casters and releases it with the scene", () => {
	const scene = new Scene();
	const sun = new DirectionalLight();
	const target = new WebGLRenderTarget(8, 8, {
		depthTexture: new DepthTexture(8, 8),
	});
	sun.shadow.map = target;
	const moving = new Mesh();
	moving.castShadow = true;
	scene.add(moving, sun);
	const roots = Array.from({ length: 3 }, () => {
		const root = new Group();
		const geometry = new BoxGeometry();
		for (let i = 0; i < 34; i++) {
			const caster = new Mesh(geometry);
			caster.castShadow = true;
			root.add(caster);
		}
		scene.add(root);
		return root;
	});
	const init = vi.fn<(target: WebGLRenderTarget) => void>();
	const copy = vi.fn();
	const restore = vi.fn();
	const canvas = new EventTarget();
	const renderer = {
		shadowMap: { type: PCFShadowMap },
		domElement: canvas,
		initRenderTarget: init,
		copyTextureToTexture: copy,
		setRenderTarget: restore,
	} as unknown as WebGLRenderer;
	const release = cacheSceneryShadows(scene, roots, sun, renderer);
	const boundary = scene.getObjectByName("Static scenery shadow cache") as Mesh;
	expect(scene.children.slice(0, 4)).toEqual([...roots, boundary]);
	const renderBoundary = () =>
		boundary.onBeforeShadow(
			renderer,
			scene,
			sun.shadow.camera,
			sun.shadow.camera,
			boundary.geometry,
			boundary.material as import("three").Material,
			roots[0],
		);
	renderBoundary();
	const cache = init.mock.calls[0][0];
	expect(copy).toHaveBeenLastCalledWith(
		target.depthTexture,
		cache.depthTexture,
	);
	expect(roots.every((root) => !root.children[0].castShadow)).toBe(true);
	expect(moving.castShadow).toBe(true);
	renderBoundary();
	expect(copy).toHaveBeenLastCalledWith(
		cache.depthTexture,
		target.depthTexture,
	);
	expect(restore).toHaveBeenLastCalledWith(target);
	const disposed = vi.fn();
	cache.addEventListener("dispose", disposed);
	canvas.dispatchEvent(new Event("webglcontextrestored"));
	expect(disposed).toHaveBeenCalledOnce();
	expect(roots.every((root) => root.children[0].castShadow)).toBe(true);
	renderBoundary();
	expect(init).toHaveBeenCalledTimes(2);
	release?.();
	expect(boundary.parent).toBeNull();
	expect(roots.every((root) => root.children[0].castShadow)).toBe(true);
});
