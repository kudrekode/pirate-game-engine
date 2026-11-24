import {
	BufferGeometry,
	type DirectionalLight,
	Float32BufferAttribute,
	type Group,
	Mesh,
	MeshBasicMaterial,
	PCFShadowMap,
	type Scene,
	type WebGLRenderer,
	WebGLRenderTarget,
} from "three";

export const staticShadowAssetIds = new Set([
	"mere-spruce",
	"mere-verge",
	"mere-crag",
]);

// The moonlight and these unanimated props stay fixed until the scene is torn
// down. Preserve Three's native PCF depth (including cutout needles) before
// adding the moving casters on every normal shadow update.
export function cacheSceneryShadows(
	scene: Scene,
	roots: Group[],
	sun: DirectionalLight,
	renderer: WebGLRenderer,
) {
	if (roots.length < 3 || renderer.shadowMap.type !== PCFShadowMap) return;
	const casters: Mesh[] = [];
	for (const root of roots)
		root.traverseVisible((node) => {
			if (node instanceof Mesh && node.castShadow) casters.push(node);
		});
	// A full depth copy is only worthwhile for a dense set of casters.
	if (casters.length < 100) return;
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute([], 3));
	const material = new MeshBasicMaterial({
		colorWrite: false,
		depthWrite: false,
	});
	const boundary = new Mesh(geometry, material);
	boundary.name = "Static scenery shadow cache";
	boundary.frustumCulled = false;
	boundary.castShadow = true;
	scene.add(boundary);
	// Shadow traversal follows child order. Keep every marker's scene parent
	// and world matrix intact for interactions and teardown.
	const fixed = new Set(roots);
	const order = (o: (typeof scene.children)[number]) =>
		o === boundary ? 1 : fixed.has(o as Group) ? 0 : 2;
	scene.children.sort((a, b) => order(a) - order(b));
	let cache: WebGLRenderTarget | undefined;
	boundary.onBeforeShadow = (renderer, _scene, _camera, shadowCamera) => {
		const target = sun.shadow.map;
		if (
			shadowCamera !== sun.shadow.camera ||
			!(target instanceof WebGLRenderTarget) ||
			!target.depthTexture
		)
			return;
		if (!cache?.depthTexture) {
			cache = target.clone();
			if (!cache.depthTexture) return;
			renderer.initRenderTarget(cache);
			renderer.copyTextureToTexture(target.depthTexture, cache.depthTexture);
			for (const caster of casters) caster.castShadow = false;
		} else {
			renderer.copyTextureToTexture(cache.depthTexture, target.depthTexture);
		}
		// The depth blit unbinds the read and draw framebuffers.
		renderer.setRenderTarget(target);
	};
	const invalidate = () => {
		for (const caster of casters) caster.castShadow = true;
		cache?.dispose();
		cache = undefined;
	};
	for (const root of roots) root.addEventListener("removed", invalidate);
	renderer.domElement.addEventListener("webglcontextrestored", invalidate);
	return () => {
		for (const root of roots) root.removeEventListener("removed", invalidate);
		renderer.domElement.removeEventListener("webglcontextrestored", invalidate);
		invalidate();
		boundary.removeFromParent();
		geometry.dispose();
		material.dispose();
	};
}
