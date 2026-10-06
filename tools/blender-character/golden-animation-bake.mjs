import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { assertSourceProvenance } from "../animation-retargeting/source-provenance.mjs";
import {
	buildHeadlessBlenderArguments,
	discoverBlender,
	readBlenderVersion,
} from "./blender-discovery.mjs";

const execFileAsync = promisify(execFile);
const PROFILE_PATH =
	"tools/blender-character/profiles/mixamo-to-quaternius-v2.json";
const SCRIPT_PATH = "tools/blender-character/retarget_golden_reference.py";
const TARGET_PATH =
	"public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf";
const OUTPUT_ROOT =
	"public/assets/derived/humanoid-animations/golden-reference-v0";
const SOURCE_PATHS = {
	idle: "public/assets/source/humanoid-animations/retarget-spike/idle/source.fbx",
	walk: "public/assets/source/humanoid-animations/retarget-spike/walk/source.fbx",
};
const OUTPUT_NAMES = { idle: "idle.glb", walk: "walk-in-place.glb" };

const sha256 = (input) => createHash("sha256").update(input).digest("hex");

export async function loadRetargetProfile(profilePath = PROFILE_PATH) {
	const profile = JSON.parse(await readFile(profilePath, "utf8"));
	if (profile.version !== "mixamo-to-quaternius-v2")
		throw new Error(`Unsupported retarget profile: ${profile.version}`);
	if (Object.keys(profile.boneMap ?? {}).length !== 22)
		throw new Error("The offline retarget profile must map exactly 22 bones.");
	if (
		!profile.sourceSkeleton?.jointCount ||
		!profile.targetSkeleton?.jointCount ||
		!profile.rootMotionPolicy
	)
		throw new Error("The offline retarget profile is incomplete.");
	return profile;
}

export function buildBakeScriptArguments({
	clip,
	diagnosticsPath,
	metadataPath,
	outputPath,
	profile,
	profilePath = PROFILE_PATH,
	sourcePath = SOURCE_PATHS[clip],
	targetPath = TARGET_PATH,
}) {
	return [
		"--source",
		path.resolve(sourcePath),
		"--target",
		path.resolve(targetPath),
		"--clip",
		clip,
		"--output",
		path.resolve(outputPath),
		"--profile",
		path.resolve(profilePath),
		"--profile-version",
		profile.version,
		"--frame-rate",
		"30",
		"--root-motion-policy",
		profile.rootMotionPolicy,
		"--metadata",
		path.resolve(metadataPath),
		"--diagnostics",
		path.resolve(diagnosticsPath),
	];
}

async function runPass({ blender, clip, directory, profile, profilePath }) {
	const outputPath = path.join(directory, OUTPUT_NAMES[clip]);
	const metadataPath = path.join(directory, `${clip}.bake-metadata.json`);
	const diagnosticsPath = path.join(directory, `${clip}.bake-diagnostics.json`);
	const scriptArguments = buildBakeScriptArguments({
		clip,
		diagnosticsPath,
		metadataPath,
		outputPath,
		profile,
		profilePath,
	});
	const blenderArguments = buildHeadlessBlenderArguments(
		path.resolve(SCRIPT_PATH),
		scriptArguments,
	);
	const { stderr, stdout } = await execFileAsync(blender, blenderArguments, {
		cwd: process.cwd(),
		maxBuffer: 32 * 1024 * 1024,
		timeout: 10 * 60 * 1000,
		windowsHide: true,
	});
	const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
	const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8"));
	const output = await readFile(outputPath);
	return {
		blenderArguments,
		diagnostics,
		diagnosticsPath,
		metadata,
		metadataPath,
		outputHash: sha256(output),
		outputPath,
		stderr,
		stdout,
	};
}

function normalizedMetadata(metadata) {
	const clone = structuredClone(metadata);
	delete clone.outputPath;
	return clone;
}

export async function bakeGoldenAnimation({
	blender: requestedBlender,
	clip,
	diagnosticsPath = path.join(OUTPUT_ROOT, `${clip}.bake-diagnostics.json`),
	metadataPath = path.join(OUTPUT_ROOT, `${clip}.bake-metadata.json`),
	outputPath = path.join(OUTPUT_ROOT, OUTPUT_NAMES[clip]),
	profilePath = PROFILE_PATH,
} = {}) {
	if (!(clip in SOURCE_PATHS)) throw new Error(`Unknown clip: ${clip}`);
	await assertSourceProvenance();
	const profile = await loadRetargetProfile(profilePath);
	const blender = requestedBlender ?? (await discoverBlender());
	const blenderVersion = await readBlenderVersion(blender);
	const sourcePath = SOURCE_PATHS[clip];
	const sourceBefore = sha256(await readFile(sourcePath));
	const stagingRoot = await mkdtemp(
		path.join(os.tmpdir(), `golden-animation-${clip}-`),
	);
	try {
		const firstDirectory = path.join(stagingRoot, "first");
		const secondDirectory = path.join(stagingRoot, "second");
		await Promise.all([
			mkdir(firstDirectory, { recursive: true }),
			mkdir(secondDirectory, { recursive: true }),
		]);
		const first = await runPass({
			blender,
			clip,
			directory: firstDirectory,
			profile,
			profilePath,
		});
		const second = await runPass({
			blender,
			clip,
			directory: secondDirectory,
			profile,
			profilePath,
		});
		const normalizedAnimationDeterministic =
			first.metadata.normalizedAnimationHash ===
				second.metadata.normalizedAnimationHash &&
			first.diagnostics.normalizedActionHash ===
				second.diagnostics.normalizedActionHash;
		if (!normalizedAnimationDeterministic)
			throw new Error(
				"Repeated Blender bakes produced different animation data.",
			);
		const sourceAfter = sha256(await readFile(sourcePath));
		if (sourceAfter !== sourceBefore)
			throw new Error(`Vendor source was modified during bake: ${sourcePath}`);
		const binaryDeterministic = first.outputHash === second.outputHash;
		const metadataSemanticallyDeterministic =
			JSON.stringify(normalizedMetadata(first.metadata)) ===
			JSON.stringify(normalizedMetadata(second.metadata));
		await Promise.all([
			mkdir(path.dirname(outputPath), { recursive: true }),
			mkdir(path.dirname(metadataPath), { recursive: true }),
			mkdir(path.dirname(diagnosticsPath), { recursive: true }),
		]);
		await copyFile(first.outputPath, outputPath);
		await copyFile(first.diagnosticsPath, diagnosticsPath);
		const metadata = {
			...first.metadata,
			artifactStatus: "offline-baked-validated",
			blenderExecutable: blenderVersion.executable,
			compilerCommand: [
				blender,
				"--background",
				"--factory-startup",
				"--python-exit-code",
				"1",
				"--python",
				SCRIPT_PATH,
				"--",
				"--source",
				SOURCE_PATHS[clip],
				"--target",
				TARGET_PATH,
				"--clip",
				clip,
				"--output",
				outputPath.replaceAll(path.sep, "/"),
				"--profile",
				profilePath.replaceAll(path.sep, "/"),
				"--profile-version",
				profile.version,
				"--frame-rate",
				"30",
				"--root-motion-policy",
				profile.rootMotionPolicy,
				"--metadata",
				metadataPath.replaceAll(path.sep, "/"),
				"--diagnostics",
				diagnosticsPath.replaceAll(path.sep, "/"),
			],
			determinism: {
				binaryDeterministic,
				firstOutputHash: first.outputHash,
				metadataSemanticallyDeterministic,
				normalizedAnimationDeterministic,
				secondOutputHash: second.outputHash,
			},
			outputHash: sha256(await readFile(outputPath)),
			outputPath: outputPath.replaceAll(path.sep, "/"),
			provenanceValidated: true,
			source: { ...first.metadata.source, path: SOURCE_PATHS[clip] },
			sourceImmutable: sourceBefore === sourceAfter,
			target: { ...first.metadata.target, path: TARGET_PATH },
		};
		await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
		return {
			blender: blenderVersion,
			diagnosticsPath,
			metadata,
			metadataPath,
			outputPath,
		};
	} finally {
		await rm(stagingRoot, { force: true, recursive: true });
	}
}

export function parseCliArguments(argv) {
	const result = {};
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith("--")) {
			positional.push(argument);
			continue;
		}
		result[argument.slice(2)] = argv[index + 1];
		index += 1;
	}
	result.clip ??= positional[0];
	result.blender ??= positional[1];
	return result;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const options = parseCliArguments(process.argv.slice(2));
	const result = await bakeGoldenAnimation({
		blender: options.blender,
		clip: options.clip,
		diagnosticsPath: options.diagnostics,
		metadataPath: options.metadata,
		outputPath: options.output,
		profilePath: options.profile,
	});
	console.log(JSON.stringify(result, null, 2));
}
