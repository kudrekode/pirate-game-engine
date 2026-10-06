import assert from "node:assert/strict";
import test from "node:test";
import {
	buildHeadlessBlenderArguments,
	discoverBlender,
	readBlenderVersion,
} from "./blender-discovery.mjs";

test("discovers the first available Blender candidate", async () => {
	const executable = await discoverBlender({
		accessImpl: async (candidate) => {
			if (candidate !== "available-blender") throw new Error("missing");
		},
		candidates: ["missing-blender", "available-blender"],
	});
	assert.equal(executable, "available-blender");
});

test("reports checked candidates when Blender is missing", async () => {
	await assert.rejects(
		discoverBlender({
			accessImpl: async () => {
				throw new Error("missing");
			},
			candidates: ["one", "two"],
		}),
		/one[\s\S]*two/u,
	);
});

test("parses Blender version metadata and builds a headless invocation", async () => {
	const version = await readBlenderVersion("blender", {
		execFileImpl: async () => ({
			stdout: "Blender 5.2.0 LTS\n  build hash: fbe6228777e7\n",
		}),
	});
	assert.deepEqual(version, {
		buildHash: "fbe6228777e7",
		executable: "blender",
		version: "5.2.0 LTS",
	});
	assert.deepEqual(
		buildHeadlessBlenderArguments("bake.py", ["--clip", "idle"]),
		[
			"--background",
			"--factory-startup",
			"--python-exit-code",
			"1",
			"--python",
			"bake.py",
			"--",
			"--clip",
			"idle",
		],
	);
});
