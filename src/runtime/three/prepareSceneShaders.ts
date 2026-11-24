import type { Camera, Scene, WebGLRenderer } from "three";

/** Submit the scene's material programs before the first draw. Poll the native
 * completion flag so changing area or closing a viewport also cancels the wait. */
export function prepareSceneShaders(
	renderer: WebGLRenderer,
	scene: Scene,
	camera: Camera,
	progress: (message: string) => void,
	render: () => void,
	onError: (message: string) => void,
) {
	const gl = renderer.getContext?.();
	const extension = gl?.getExtension?.("KHR_parallel_shader_compile");
	if (!extension || !renderer.compile) {
		progress("");
		render();
		return () => {};
	}
	const { COMPLETION_STATUS_KHR } = extension;
	let timer: ReturnType<typeof setTimeout>;
	progress("Preparing scene shaders.");
	const deadline = performance.now() + 60_000;
	function fail(error: unknown) {
		progress("");
		onError(
			error instanceof Error
				? error.message
				: "Could not prepare scene shaders.",
		);
	}
	timer = setTimeout(() => {
		try {
			renderer.compile(scene, camera);
			const pending = new Set(renderer.info.programs ?? []);
			const total = pending.size;
			gl.flush();
			function check() {
				try {
					if (gl.isContextLost())
						throw new Error("The 3D graphics context was lost.");
					const sliceEnd = performance.now() + 5;
					for (const entry of pending) {
						const program = entry.program as WebGLProgram;
						if (gl.getProgramParameter(program, COMPLETION_STATUS_KHR)) {
							if (!gl.getProgramParameter(program, gl.LINK_STATUS))
								throw new Error(
									gl.getProgramInfoLog(program) ||
										"A scene shader failed to link.",
								);
							// Three reflects uniforms and attributes and checks driver logs on
							// first use. Do this before submitting a scene full of draw calls.
							entry.getUniforms();
							pending.delete(entry);
							if (performance.now() >= sliceEnd) break;
						}
					}
					if (!pending.size) {
						progress("");
						render();
						return;
					}
					if (performance.now() >= deadline)
						throw new Error("Scene shader preparation timed out.");
					progress(
						`Preparing scene shaders (${total - pending.size}/${total}).`,
					);
					timer = setTimeout(check, 16);
				} catch (error) {
					fail(error);
				}
			}
			check();
		} catch (error) {
			fail(error);
		}
	}, 0);
	return () => clearTimeout(timer);
}
