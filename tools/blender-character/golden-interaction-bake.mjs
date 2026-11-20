import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	readFile,
	writeFile,
	copyFile,
	mkdtemp,
	rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
	discoverBlender,
	buildHeadlessBlenderArguments,
	readBlenderVersion,
} from "./blender-discovery.mjs";
import {
	validateGoldenInteraction,
	INTERACTION_CLIPS,
} from "./golden-interaction-roundtrip.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const REFERENCES = {
	"tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend":
		"7773ca3ee38eeb5ff168783d8753b7adb49c79499f273b050cd105f75763a63d",
};
export async function bakeGoldenInteraction(outputDir) {
	const revision = "v1";
	const SOURCE = `tools/blender-character/animations/golden-interaction-${revision}`;
	const clips = INTERACTION_CLIPS;
	outputDir ??= `public/assets/derived/humanoid-animations/golden-interaction-${revision}`;
	const temporaryPrefix = `golden-interaction-${revision}-`;
	const inputs = [
		...Object.keys(REFERENCES),
		`${SOURCE}/actions.blend`,
		`${SOURCE}/author.py`,
		"tools/blender-character/animations/golden-movement-v1/author.py",
		`${SOURCE}/export.py`,
		"public/assets/derived/authored-humans/everyday-v1/mannequin.glb",
		"public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb",
		"public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb",
	];
	const hashes = Object.fromEntries(
		await Promise.all(inputs.map(async (p) => [p, hash(await readFile(p))])),
	);
	for (const [p, expected] of Object.entries(REFERENCES))
		assert.equal(hashes[p], expected, "Canonical source unchanged");
	const blender = await discoverBlender(),
		version = await readBlenderVersion(blender);
	const staging = await mkdtemp(path.join(os.tmpdir(), temporaryPrefix));
	try {
		const outputs = [];
		for (const pass of ["first", "second"]) {
			const output = path.join(staging, `${pass}.glb`);
			const { stdout, stderr } = await promisify(execFile)(
				blender,
				buildHeadlessBlenderArguments(path.resolve(`${SOURCE}/export.py`), [
					path.resolve(`${SOURCE}/actions.blend`),
					output,
				]),
				{ windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
			);
			outputs.push({
				output,
				bytes: await readFile(output),
				log: stdout + stderr,
			});
		}
		assert.equal(
			hash(outputs[0].bytes),
			hash(outputs[1].bytes),
			"Two isolated exports must be byte-identical",
		);
		const report = await validateGoldenInteraction(
			outputs[0].output,
			undefined,
			clips,
		);
		for (const p of inputs)
			assert.equal(hash(await readFile(p)), hashes[p], `Read-only input: ${p}`);
		const destination = path.join(outputDir, "actions.glb");
		let existing;
		try {
			existing = await readFile(destination);
		} catch (e) {
			if (e.code !== "ENOENT") throw e;
		}
		if (existing && hash(existing) !== hash(outputs[0].bytes))
			throw Error(
				"Immutable action library already exists; use a new revision/output directory",
			);
		await mkdir(outputDir, { recursive: true });
		await copyFile(outputs[0].output, destination);
		report.artifactPath = destination.replaceAll("\\", "/");
		await writeFile(
			path.join(outputDir, "roundtrip.json"),
			JSON.stringify(report, null, 2) + "\n",
		);
		const metadata = {
			version: `golden-interaction-${revision}`,
			rigProfile: "golden-humanoid-v0",
			blender: version.version,
			clips,
			packaging: "one mesh-free armature and two named clips",
			bytes: outputs[0].bytes.length,
			sha256: hash(outputs[0].bytes),
			binaryDeterministic: true,
			sourceHashes: hashes,
			rootPolicy:
				"No root tracks; vertical-only pelvis, gameplay owns movement",
			provenance: `${SOURCE}/README.md`,
		};
		await writeFile(
			path.join(outputDir, "metadata.json"),
			JSON.stringify(metadata, null, 2) + "\n",
		);
		await writeFile(
			path.join(outputDir, "build.log"),
			outputs.map((o) => o.log).join("\n"),
		);
		return metadata;
	} finally {
		const cleanupPath = path.resolve(staging);
		assert.equal(
			path.dirname(cleanupPath),
			path.resolve(os.tmpdir()),
			"Owned temporary export directory",
		);
		assert(path.basename(cleanupPath).startsWith(temporaryPrefix));
		await rm(cleanupPath, { recursive: true, force: true });
	}
}
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const args = process.argv.slice(2);
	if (args[0] === "--list")
		console.log(
			"golden-interaction-v1: Interact, Pickup; two isolated exports; no character builds. " +
				JSON.stringify(INTERACTION_CLIPS),
		);
	else {
		assert(
			args.length === 0 || (args.length === 2 && args[0] === "--output-dir"),
			"Use --list or --output-dir PATH",
		);
		console.log(JSON.stringify(await bakeGoldenInteraction(args[1]), null, 2));
	}
}
