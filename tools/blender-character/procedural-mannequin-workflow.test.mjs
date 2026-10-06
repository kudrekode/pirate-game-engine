import assert from "node:assert/strict";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";

// Exercise the actual orchestration and GLB validator with an installed export.
// Only Blender execution is substituted; cheap CI never launches Blender.
for (const mode of ["preview", "full"]) {
	test(`${mode} performs the required build count and reports assurance honestly`, async (t) => {
		const root = await mkdtemp(path.join(os.tmpdir(), "creator-workflow-"));
		t.after(() => rm(root, { recursive: true, force: true }));
		let passes = 0;
		const fixture = "public/assets/derived/procedural-humanoids/mannequin-v0";
		const result = await compileProceduralMannequin({
			mode,
			blender: "test-blender",
			outputDirectory: root,
			execFileImpl: async (_executable, args) => {
				if (args.includes("--version"))
					return { stdout: "Blender 5.2.0\nbuild hash: test", stderr: "" };
				passes++;
				const report = JSON.parse(
					await readFile(`${fixture}/diagnostics.json`, "utf8"),
				).blenderReport;
				await copyFile(
					`${fixture}/mannequin.glb`,
					args[args.indexOf("--output") + 1],
				);
				await writeFile(
					args[args.indexOf("--report") + 1],
					JSON.stringify(report),
				);
				return { stdout: "test export", stderr: "" };
			},
		});
		assert.equal(passes, mode === "preview" ? 1 : 2);
		assert.equal(result.manifest.validationLevel, mode);
		assert.equal(result.manifest.deterministicBuild, mode === "full");
		assert.equal(result.diagnostics.roundTrip.passed, true);
		assert.equal(
			result.diagnostics.secondRoundTrip === null,
			mode === "preview",
		);
		assert.equal(result.manifest.determinism === null, mode === "preview");
	});
}

test("preview rejects a corrupt GLB without publishing it", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "creator-corrupt-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const output = path.join(root, "output");
	await assert.rejects(
		compileProceduralMannequin({
			mode: "preview",
			blender: "test-blender",
			outputDirectory: output,
			execFileImpl: async (_executable, args) => {
				if (args.includes("--version"))
					return { stdout: "Blender 5.2.0", stderr: "" };
				await writeFile(args[args.indexOf("--output") + 1], "corrupt");
				await writeFile(args[args.indexOf("--report") + 1], "{}");
				return { stdout: "", stderr: "" };
			},
		}),
	);
	await assert.rejects(readFile(path.join(output, "manifest.json")), {
		code: "ENOENT",
	});
});
