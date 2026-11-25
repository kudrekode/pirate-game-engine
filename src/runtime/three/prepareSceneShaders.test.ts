import type { Camera, Scene, WebGLRenderer } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { prepareSceneShaders } from "./prepareSceneShaders";

afterEach(() => vi.useRealTimers());

function prepare() {
	vi.useFakeTimers();
	const extension = { COMPLETION_STATUS_KHR: 1 };
	const gl = {
		LINK_STATUS: 2,
		SYNC_GPU_COMMANDS_COMPLETE: 3,
		ALREADY_SIGNALED: 4,
		TIMEOUT_EXPIRED: 5,
		WAIT_FAILED: 6,
		fenceSync: vi.fn(() => ({})),
		deleteSync: vi.fn(),
		clientWaitSync: vi.fn(() => 4),
		getExtension: () => extension,
		getProgramParameter: vi.fn(
			(_program: unknown, parameter: number) => parameter === 2,
		),
		getProgramInfoLog: vi.fn(() => "Shader link failed"),
		isContextLost: () => false,
		flush: vi.fn(),
	};
	const renderer = {
		debug: { checkShaderErrors: true },
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
	expect(progress).toHaveBeenLastCalledWith("Linking scene shaders (0/1).");
	expect(render).not.toHaveBeenCalled();
	gl.getProgramParameter.mockReturnValue(true);
	renderer.info.programs[0].getUniforms.mockImplementation(() => {
		expect(renderer.debug.checkShaderErrors).toBe(false);
	});
	vi.runAllTimers();
	expect(renderer.info.programs[0].getUniforms).toHaveBeenCalledOnce();
	expect(renderer.debug.checkShaderErrors).toBe(true);
	expect(gl.getProgramInfoLog).not.toHaveBeenCalled();
	expect(progress).toHaveBeenLastCalledWith("");
	expect(render).toHaveBeenCalledOnce();
});

it("does not touch the disposed renderer when the workspace closes during compilation", () => {
	const { gl, cancel, render } = prepare();
	gl.clientWaitSync.mockReturnValue(gl.TIMEOUT_EXPIRED);
	vi.advanceTimersByTime(1);
	expect(gl.clientWaitSync).toHaveBeenCalledWith(expect.anything(), 0, 0);
	expect(gl.getProgramParameter).not.toHaveBeenCalled();
	cancel();
	expect(gl.deleteSync).toHaveBeenCalledOnce();
	vi.runAllTimers();
	expect(gl.getProgramParameter).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});

it("waits for every program in the submission before making synchronous reflection queries", () => {
	const { gl, renderer, render } = prepare();
	const first = renderer.info.programs[0];
	const second = { program: {}, getUniforms: vi.fn() };
	renderer.info.programs.push(second);
	gl.getProgramParameter.mockImplementation(
		(program, parameter) =>
			program === first.program || parameter === gl.LINK_STATUS,
	);
	vi.advanceTimersByTime(1);
	expect(gl.getProgramParameter).not.toHaveBeenCalledWith(
		first.program,
		gl.LINK_STATUS,
	);
	expect(first.getUniforms).not.toHaveBeenCalled();
	gl.getProgramParameter.mockReturnValue(true);
	vi.runAllTimers();
	expect(first.getUniforms).toHaveBeenCalledOnce();
	expect(second.getUniforms).toHaveBeenCalledOnce();
	expect(render).toHaveBeenCalledOnce();
	gl.getProgramParameter.mockClear();
	prepareSceneShaders(
		renderer as unknown as WebGLRenderer,
		{} as Scene,
		{} as Camera,
		vi.fn(),
		render,
		vi.fn(),
	);
	vi.runAllTimers();
	expect(gl.getProgramParameter).not.toHaveBeenCalled();
	expect(gl.fenceSync).toHaveBeenCalledOnce();
	expect(render).toHaveBeenCalledTimes(2);
});

it("exposes a failed linker message through the viewport error state", () => {
	const { gl, renderer, error, render } = prepare();
	gl.getProgramParameter.mockImplementation(
		(_program, parameter) => parameter === 1,
	);
	vi.runAllTimers();
	expect(error).toHaveBeenCalledWith("Shader link failed");
	expect(gl.getProgramInfoLog).toHaveBeenCalledOnce();
	expect(renderer.info.programs[0].getUniforms).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});

it("restores shader diagnostics if uniform reflection fails", () => {
	const { gl, renderer, error, render } = prepare();
	gl.getProgramParameter.mockReturnValue(true);
	renderer.info.programs[0].getUniforms.mockImplementation(() => {
		throw new Error("Uniform reflection failed");
	});
	vi.runAllTimers();
	expect(renderer.debug.checkShaderErrors).toBe(true);
	expect(error).toHaveBeenCalledWith("Uniform reflection failed");
	expect(render).not.toHaveBeenCalled();
});
