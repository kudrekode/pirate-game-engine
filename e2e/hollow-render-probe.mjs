// Installed only in the isolated benchmark browser. Three exposes each renderer
// through its DevTools observation event, including optimized builds.
export function installRenderProbe(verifyShadows) {
	const events = new EventTarget();
	window.__THREE_DEVTOOLS__ = events;
	events.addEventListener("observe", ({ detail: renderer }) => {
		if (!renderer.isWebGLRenderer) return;
		const gl = renderer.getContext();
		const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
		const draw = renderer.render.bind(renderer);
		const shadow = renderer.shadowMap.render.bind(renderer.shadowMap);
		let pending;
		let measured;
		let shadowCalls = 0;
		let frame = 0;
		let eligible;
		renderer.shadowMap.render = (...args) => {
			if (
				verifyShadows &&
				!eligible &&
				args[1]?.getObjectByName("Static scenery shadow cache")
			) {
				const scene = args[1];
				eligible = [];
				for (const root of scene.children) {
					if (root.name === "Static scenery shadow cache") break;
					root.traverseVisible((node) => {
						if (node.isMesh && node.castShadow) eligible.push(node);
					});
				}
			}
			const start = renderer.info.render.calls;
			shadow(...args);
			shadowCalls += renderer.info.render.calls - start;
		};
		renderer.render = (scene, camera) => {
			if (window.hollowScene?.deref() !== scene) {
				window.hollowScene = new WeakRef(scene);
				window.hollowCamera = new WeakRef(camera);
			}
			const windowData = window.hollowBenchmarkFrames;
			if (window.hollowWalking && windowData?.active) {
				const pose = JSON.parse(
					renderer.domElement.parentElement.dataset.traversal,
				);
				windowData.motion ??= [];
				windowData.motion.push([
					performance.now(),
					pose.x,
					pose.y,
					pose.reason,
				]);
			}
			if (pending && gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) {
				if (measured === windowData && !gl.getParameter(ext.GPU_DISJOINT_EXT)) {
					measured.gpu.push(
						gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6,
					);
				}
				gl.deleteQuery(pending);
				pending = undefined;
			}
			const sample =
				windowData?.active && (frame++ % 12 === 0 || !windowData.view);
			const query = sample && ext && !pending && gl.createQuery();
			if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
			shadowCalls = 0;
			draw(scene, camera);
			if (window.compareShadows) {
				const boundary = scene.getObjectByName("Static scenery shadow cache");
				const lights = scene.children.filter(
					(node) => node.isDirectionalLight && node.castShadow,
				);
				const compare = window.compareShadows;
				delete window.compareShadows;
				if (!boundary || !eligible?.length || !lights.length)
					compare({ missing: true });
				else {
					const read = () => {
						for (const light of lights) light.shadow.needsUpdate = true;
						renderer.shadowMap.needsUpdate = true;
						draw(scene, camera);
						const pixels = new Uint8Array(
							gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
						);
						gl.readPixels(
							0,
							0,
							gl.drawingBufferWidth,
							gl.drawingBufferHeight,
							gl.RGBA,
							gl.UNSIGNED_BYTE,
							pixels,
						);
						return pixels;
					};
					const cached = read();
					boundary.visible = false;
					for (const caster of eligible) caster.castShadow = true;
					const ref = read();
					let count = 0,
						max = 0;
					for (let i = 0; i < ref.length; i++)
						if (ref[i] !== cached[i]) {
							count++;
							max = Math.max(max, Math.abs(ref[i] - cached[i]));
						}
					for (const caster of eligible) caster.castShadow = false;
					boundary.visible = true;
					compare({
						casters: eligible.length,
						channels: ref.length,
						count,
						max,
						error: gl.getError(),
					});
				}
			}
			if (query) {
				gl.endQuery(ext.TIME_ELAPSED_EXT);
				pending = query;
				measured = windowData;
			}
			if (!windowData?.active) return;
			windowData.renderFrames++;
			windowData.shadowFrames += Number(shadowCalls > 0);
			windowData.shadowDraws += shadowCalls;
			if (!sample) return;
			const list = renderer.renderLists.get(scene, 0);
			const actors = new Set();
			const meshes = {};
			for (const { object } of [
				...list.opaque,
				...list.transmissive,
				...list.transparent,
			]) {
				if (object.isSkinnedMesh) {
					let root = object;
					while (root.parent && root.parent !== scene) root = root.parent;
					actors.add(root);
				}
				const name = object.geometry.name || object.name || object.type;
				meshes[name] = (meshes[name] ?? 0) + 1;
			}
			windowData.view = {
				visibleSkinnedRoots: actors.size,
				minVisible: Math.min(
					windowData.view?.minVisible ?? Infinity,
					actors.size,
				),
				maxVisible: Math.max(windowData.view?.maxVisible ?? 0, actors.size),
				draws: renderer.info.render.calls,
				triangles: renderer.info.render.triangles,
				topMeshes: Object.entries(meshes)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 8),
				gpuTimerSupported: !!ext,
			};
		};
	});
}
