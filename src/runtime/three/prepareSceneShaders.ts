import type { Camera, Scene, WebGLRenderer } from "three";

const reflectedPrograms = new WeakSet<WebGLProgram>();

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
	const sync = "fenceSync" in gl ? gl : undefined;
	let timer: ReturnType<typeof setTimeout>;
	let fence: WebGLSync | null = null;
	function releaseFence() {
		if (fence) sync?.deleteSync(fence);
		fence = null;
	}
	progress("Preparing scene shaders.");
	const deadline = performance.now() + 60_000;
	function fail(error: unknown) {
		releaseFence();
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
			const programs = (renderer.info.programs ?? []).filter(
				(entry) => !reflectedPrograms.has(entry.program as WebGLProgram),
			);
			const linking = new Set(programs);
			const total = programs.length;
			if (total && sync)
				fence = sync.fenceSync(sync.SYNC_GPU_COMMANDS_COMPLETE, 0);
			gl.flush();
			function check() {
				try {
					if (gl.isContextLost())
						throw new Error("The 3D graphics context was lost.");
					if (performance.now() >= deadline)
						throw new Error("Scene shader preparation timed out.");
					if (fence && sync) {
						const status = sync.clientWaitSync(fence, 0, 0);
						if (status === sync.TIMEOUT_EXPIRED) {
							timer = setTimeout(check, 16);
							return;
						}
						if (status === sync.WAIT_FAILED)
							throw new Error("Could not complete scene shader preparation.");
						releaseFence();
					}
					for (const entry of linking) {
						if (
							gl.getProgramParameter(
								entry.program as WebGLProgram,
								COMPLETION_STATUS_KHR,
							)
						)
							linking.delete(entry);
					}
					// A linked program's synchronous reflection can still wait on
					// other programs queued behind it in the same driver submission.
					if (linking.size) {
						progress(
							`Linking scene shaders (${total - linking.size}/${total}).`,
						);
						timer = setTimeout(check, 16);
						return;
					}
					const sliceEnd = performance.now() + 5;
					while (programs.length) {
						const entry = programs[programs.length - 1];
						const program = entry.program as WebGLProgram;
						if (!gl.getProgramParameter(program, gl.LINK_STATUS))
							throw new Error(
								gl.getProgramInfoLog(program) ||
									"A scene shader failed to link.",
							);
						// LINK_STATUS was checked above. Reading the driver logs again
						// for a successful link can block even with KHR reporting ready.
						// Scope this to reflection; ordinary draws retain Three's checks.
						const checkShaderErrors = renderer.debug.checkShaderErrors;
						try {
							renderer.debug.checkShaderErrors = false;
							entry.getUniforms();
						} finally {
							renderer.debug.checkShaderErrors = checkShaderErrors;
						}
						reflectedPrograms.add(program);
						programs.pop();
						if (performance.now() >= sliceEnd) break;
					}
					if (!programs.length) {
						progress("");
						render();
						return;
					}
					progress(
						`Preparing scene shaders (${total - programs.length}/${total}).`,
					);
					timer = setTimeout(check, 16);
				} catch (error) {
					fail(error);
				}
			}
			timer = setTimeout(check, 0);
		} catch (error) {
			fail(error);
		}
	}, 0);
	return () => {
		clearTimeout(timer);
		releaseFence();
	};
}
