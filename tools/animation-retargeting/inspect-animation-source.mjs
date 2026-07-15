import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectAnimationSource } from "./animation-source-inspection.mjs";

function usage() {
	return [
		"Usage:",
		"  node tools/animation-retargeting/inspect-animation-source.mjs [--output-dir <directory>] <source.fbx|source.glb|source.gltf> [...]",
		"",
		"The command never modifies source files. It prints one JSON report per input",
		"and optionally stores reports in a separate diagnostic directory.",
	].join("\n");
}

function parseArguments(args) {
	const files = [];
	let outputDirectory;
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--output-dir") {
			outputDirectory = args[index + 1];
			if (!outputDirectory)
				throw new Error("--output-dir requires a directory.");
			index += 1;
		} else {
			files.push(args[index]);
		}
	}
	return { files, outputDirectory };
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
	console.log(usage());
	process.exit(args.length === 0 ? 1 : 0);
}

let failed = false;
try {
	const { files, outputDirectory } = parseArguments(args);
	if (files.length === 0)
		throw new Error("At least one source file is required.");
	if (outputDirectory)
		await mkdir(path.resolve(outputDirectory), { recursive: true });
	for (const filePath of files) {
		try {
			const report = await inspectAnimationSource(filePath);
			const json = `${JSON.stringify(report, null, 2)}\n`;
			console.log(json.trimEnd());
			if (outputDirectory) {
				const reportName = `${path.basename(filePath, path.extname(filePath)).toLowerCase()}-source.json`;
				await writeFile(
					path.resolve(outputDirectory, reportName),
					json,
					"utf8",
				);
			}
		} catch (error) {
			failed = true;
			console.error(
				JSON.stringify(
					{
						error: error instanceof Error ? error.message : String(error),
						file: path.resolve(filePath),
					},
					null,
					2,
				),
			);
		}
	}
} catch (error) {
	failed = true;
	console.error(error instanceof Error ? error.message : String(error));
}

process.exitCode = failed ? 1 : 0;
