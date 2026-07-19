import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function exists(path, accessImpl = access) {
	try {
		await accessImpl(path);
		return true;
	} catch {
		return false;
	}
}

export async function collectBlenderCandidates({
	env = process.env,
	platform = process.platform,
	readdirImpl = readdir,
} = {}) {
	const executable = platform === "win32" ? "blender.exe" : "blender";
	const candidates = [];
	if (env.BLENDER_PATH) candidates.push(env.BLENDER_PATH);
	for (const entry of (env.PATH ?? "").split(delimiter).filter(Boolean))
		candidates.push(join(entry, executable));
	if (platform === "win32") {
		for (const root of [
			"C:\\Program Files\\Blender Foundation",
			"C:\\Program Files (x86)\\Blender Foundation",
			env.LOCALAPPDATA
				? join(env.LOCALAPPDATA, "Programs", "Blender Foundation")
				: undefined,
		].filter(Boolean)) {
			try {
				const entries = await readdirImpl(root, { withFileTypes: true });
				for (const entry of entries
					.filter((candidate) => candidate.isDirectory())
					.sort((left, right) =>
						right.name.localeCompare(left.name, undefined, { numeric: true }),
					))
					candidates.push(join(root, entry.name, executable));
			} catch {
				// A conventional install root is optional.
			}
		}
	}
	return [...new Set(candidates)];
}

export async function discoverBlender(options = {}) {
	const candidates =
		options.candidates ?? (await collectBlenderCandidates(options));
	for (const candidate of candidates) {
		if (await exists(candidate, options.accessImpl)) return candidate;
	}
	throw new Error(
		`Blender executable was not found. Checked:\n${candidates.map((candidate) => `- ${candidate}`).join("\n")}`,
	);
}

export async function readBlenderVersion(
	executable,
	{ execFileImpl = execFileAsync } = {},
) {
	const { stdout } = await execFileImpl(executable, ["--version"], {
		windowsHide: true,
	});
	const version = /^Blender\s+(.+)$/mu.exec(stdout)?.[1]?.trim();
	const buildHash = /^\s*build hash:\s*(.+)$/imu.exec(stdout)?.[1]?.trim();
	if (!version)
		throw new Error(`Could not parse Blender version from ${executable}.`);
	return { buildHash: buildHash ?? null, executable, version };
}

export function buildHeadlessBlenderArguments(scriptPath, scriptArguments) {
	return [
		"--background",
		"--factory-startup",
		"--python-exit-code",
		"1",
		"--python",
		scriptPath,
		"--",
		...scriptArguments,
	];
}
