import type { Camera, Scene, WebGLRenderer } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { prepareSceneShaders } from "./prepareSceneShaders";

afterEach(() => vi.useRealTimers());

function prepare() {
	vi.useFakeTimers();
	const extension = { COMPLETION_STATUS_KHR: 1 };
	const gl = {
		LINK_STATUS: 2,
		getExtension: () => extension,
		getProgramParameter: vi.fn(
			(_program: unknown, parameter: number) => parameter === 2,
		),
		getProgramInfoLog: () => "Shader link failed",
		isContextLost: () => false,
		flush: vi.fn(),
	};
	const renderer = {
		getContext: () => gl,
		compile: vi.fn(),
		info: { programs: [{ program: {}, getUniforms: vi.fn() }] },
	};
	const progress = vi.fn(),
		render = vi.fn(),
		error = vi.fn();
	const cancel = prepareSceneShaders(
		renderer as unknown as WebGLRenderer,
		{} as Scene,
		{} as Camera,
		progress,
		render,
		error,
	);
	return { gl, renderer, cancel, progress, render, error };
}

it("yields until the driver finishes linking, then starts a single render loop", () => {
	const { gl, renderer, progress, render } = prepare();
	vi.advanceTimersByTime(1);
	expect(renderer.compile).toHaveBeenCalledOnce();
	expect(progress).toHaveBeenLastCalledWith("Preparing scene shaders (0/1).");
	expect(render).not.toHaveBeenCalled();
	gl.getProgramParameter.mockReturnValue(true);
	vi.runAllTimers();
	expect(renderer.info.programs[0].getUniforms).toHaveBeenCalledOnce();
	expect(progress).toHaveBeenLastCalledWith("");
	expect(render).toHaveBeenCalledOnce();
});

it("does not touch the disposed renderer when the workspace closes during compilation", () => {
	const { gl, cancel, render } = prepare();
	vi.advanceTimersByTime(1);
	gl.getProgramParameter.mockClear();
	cancel();
	vi.runAllTimers();
	expect(gl.getProgramParameter).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});

it("exposes a failed linker message through the viewport error state", () => {
	const { gl, error, render } = prepare();
	gl.getProgramParameter.mockImplementation(
		(_program, parameter) => parameter === 1,
	);
	vi.runAllTimers();
	expect(error).toHaveBeenCalledWith("Shader link failed");
	expect(render).not.toHaveBeenCalled();
});
