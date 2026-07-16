import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	compileProceduralMannequin,
	PROCEDURAL_MANNEQUIN_PATHS,
} from "../../../tools/blender-character/procedural-mannequin-compiler.mjs";
import {
	canonicalizeProceduralMannequinRecipe,
	hashProceduralMannequinRecipe,
	PROCEDURAL_MANNEQUIN_LIMITS,
	PROCEDURAL_MANNEQUIN_PARAMETER_KEYS,
	validateProceduralMannequinAnatomy,
	validateProceduralMannequinRecipe,
} from "../../../tools/blender-character/procedural-mannequin-contract.mjs";

export const PROCEDURAL_MANNEQUIN_COMPILE_ENDPOINT =
	"/__asset-studio/procedural-mannequin/compile";
export const PROCEDURAL_MANNEQUIN_ASSET_ENDPOINT =
	"/__asset-studio/procedural-mannequin/assets";
export const PROCEDURAL_MANNEQUIN_COMPILE_REQUEST_VERSION = 2;

const MAX_REQUEST_BYTES = 64 * 1024;
const WORKSPACE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);
const SAFE_ASSET_FILES = new Map([
	["mannequin.glb", "model/gltf-binary"],
	["manifest.json", "application/json; charset=utf-8"],
	["diagnostics.json", "application/json; charset=utf-8"],
	["recipe.snapshot.json", "application/json; charset=utf-8"],
	["build.log", "text/plain; charset=utf-8"],
]);

function jsonResponse(response, statusCode, payload) {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.setHeader("Cache-Control", "no-store");
	response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_REQUEST_BYTES) {
			throw new Error("Compile request exceeds 64 KiB.");
		}
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new Error("Compile request must contain valid JSON.");
	}
}

export function validateCreatorCompileRequest(value) {
	const issues = [];
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {
			issues: [{ message: "Expected a compile request object.", path: "$" }],
			ok: false,
		};
	}
	if (value.version !== PROCEDURAL_MANNEQUIN_COMPILE_REQUEST_VERSION) {
		issues.push({ message: "Unsupported request version.", path: "$.version" });
	}
	if (
		typeof value.proportions !== "object" ||
		value.proportions === null ||
		Array.isArray(value.proportions)
	) {
		issues.push({
			message: "Expected body proportions.",
			path: "$.proportions",
		});
	} else {
		for (const key of PROCEDURAL_MANNEQUIN_PARAMETER_KEYS) {
			const parameter = value.proportions[key];
			const limits = PROCEDURAL_MANNEQUIN_LIMITS[key];
			if (
				typeof parameter !== "number" ||
				!Number.isFinite(parameter) ||
				parameter < limits.min ||
				parameter > limits.max
			) {
				issues.push({
					message: `Expected a finite number between ${limits.min} and ${limits.max} ${limits.units}.`,
					path: `$.proportions.${key}`,
				});
			}
		}
		if (issues.length === 0) {
			const anatomy = validateProceduralMannequinAnatomy(value.proportions);
			if (!anatomy.ok) issues.push(...anatomy.issues);
		}
	}
	return issues.length > 0
		? { issues, ok: false }
		: {
				issues: [],
				ok: true,
				value: {
					proportions: Object.fromEntries(
						PROCEDURAL_MANNEQUIN_PARAMETER_KEYS.map((key) => [
							key,
							value.proportions[key],
						]),
					),
					version: PROCEDURAL_MANNEQUIN_COMPILE_REQUEST_VERSION,
				},
			};
}

export async function createRecipeForProportions({
	baseRecipePath = path.resolve(
		WORKSPACE_ROOT,
		PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe,
	),
	proportions,
} = {}) {
	const baseRecipe = JSON.parse(await readFile(baseRecipePath, "utf8"));
	const candidate = {
		...baseRecipe,
		proportions: {
			...baseRecipe.proportions,
			...proportions,
		},
	};
	const parsed = validateProceduralMannequinRecipe(candidate);
	if (!parsed.ok) {
		const error = new Error(
			`Recipe validation failed: ${parsed.issues
				.map((entry) => `${entry.path} ${entry.message}`)
				.join("; ")}`,
		);
		error.validationIssues = parsed.issues;
		throw error;
	}
	return parsed.value;
}

export async function compileCreatorMannequin({
	baseRecipePath = path.resolve(
		WORKSPACE_ROOT,
		PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe,
	),
	compileImpl = compileProceduralMannequin,
	generatedRoot = path.resolve(
		WORKSPACE_ROOT,
		"test-results/asset-studio-creator/procedural-mannequin",
	),
	proportions,
	now = () => new Date(),
	requestId = randomUUID(),
} = {}) {
	const recipe = await createRecipeForProportions({
		baseRecipePath,
		proportions,
	});
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const stagingDirectory = path.join(generatedRoot, `.staging-${requestId}`);
	const publishedDirectory = path.join(generatedRoot, requestId);
	const recipePath = path.join(stagingDirectory, "request.recipe.json");
	const outputDirectory = path.join(stagingDirectory, "output");
	await mkdir(stagingDirectory, { recursive: true });
	await writeFile(
		recipePath,
		canonicalizeProceduralMannequinRecipe(recipe),
		"utf8",
	);
	const startedAt = performance.now();
	try {
		const result = await compileImpl({
			clean: true,
			outputDirectory,
			recipePath,
			staging: true,
			templatePath: path.resolve(
				WORKSPACE_ROOT,
				PROCEDURAL_MANNEQUIN_PATHS.template,
			),
			workspaceRoot: WORKSPACE_ROOT,
		});
		const completionDurationMs = Math.round(performance.now() - startedAt);
		if (
			result?.manifest?.recipeHash !== recipeHash ||
			!PROCEDURAL_MANNEQUIN_PARAMETER_KEYS.every(
				(key) =>
					result?.manifest?.proportions?.[key] === recipe.proportions[key],
			) ||
			result?.manifest?.outputHash?.length !== 64 ||
			result?.manifest?.deterministicBuild !== true
		) {
			throw new Error("Compiler returned an invalid or mismatched manifest.");
		}
		await rename(stagingDirectory, publishedDirectory);
		const assetRoot = `${PROCEDURAL_MANNEQUIN_ASSET_ENDPOINT}/${requestId}/output`;
		return {
			assetUrl: `${assetRoot}/mannequin.glb`,
			compilationDurationMs: completionDurationMs,
			generatedAt: now().toISOString(),
			manifest: result.manifest,
			manifestUrl: `${assetRoot}/manifest.json`,
			requestId,
			status: "succeeded",
			validation: {
				passed: true,
				version: result.manifest.validationVersion,
			},
		};
	} catch (error) {
		await rm(stagingDirectory, { force: true, recursive: true });
		throw error;
	}
}

function resolveAssetRequest(generatedRoot, pathname) {
	const suffix = pathname.slice(
		`${PROCEDURAL_MANNEQUIN_ASSET_ENDPOINT}/`.length,
	);
	const [requestId, outputSegment, fileName, ...extra] = suffix.split("/");
	if (
		!/^[0-9a-f-]{36}$/iu.test(requestId ?? "") ||
		outputSegment !== "output" ||
		extra.length > 0 ||
		!SAFE_ASSET_FILES.has(fileName)
	) {
		return undefined;
	}
	const resolvedRoot = path.resolve(generatedRoot);
	const filePath = path.resolve(resolvedRoot, requestId, "output", fileName);
	if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) return undefined;
	return { fileName, filePath };
}

export function createProceduralMannequinCompileMiddleware({
	compileJob = compileCreatorMannequin,
	generatedRoot = path.resolve(
		WORKSPACE_ROOT,
		"test-results/asset-studio-creator/procedural-mannequin",
	),
} = {}) {
	let compileActive = false;
	return async function proceduralMannequinCompileMiddleware(
		request,
		response,
		next,
	) {
		const requestUrl = new URL(request.url ?? "/", "http://asset-studio.local");
		if (
			request.method === "GET" &&
			requestUrl.pathname.startsWith(`${PROCEDURAL_MANNEQUIN_ASSET_ENDPOINT}/`)
		) {
			const asset = resolveAssetRequest(generatedRoot, requestUrl.pathname);
			if (!asset) {
				jsonResponse(response, 404, { error: "Generated asset not found." });
				return;
			}
			response.statusCode = 200;
			response.setHeader("Content-Type", SAFE_ASSET_FILES.get(asset.fileName));
			response.setHeader("Cache-Control", "no-store");
			const stream = createReadStream(asset.filePath);
			stream.on("error", () => {
				if (!response.headersSent) {
					jsonResponse(response, 404, { error: "Generated asset not found." });
				} else {
					response.destroy();
				}
			});
			stream.pipe(response);
			return;
		}
		if (requestUrl.pathname !== PROCEDURAL_MANNEQUIN_COMPILE_ENDPOINT) {
			next();
			return;
		}
		if (request.method !== "POST") {
			jsonResponse(response, 405, { error: "Use POST for compile requests." });
			return;
		}
		if (compileActive) {
			jsonResponse(response, 409, {
				error: "A procedural mannequin compilation is already running.",
			});
			return;
		}
		try {
			const parsed = validateCreatorCompileRequest(await readJsonBody(request));
			if (!parsed.ok) {
				jsonResponse(response, 400, {
					error: "Compile request validation failed.",
					issues: parsed.issues,
					status: "failed",
				});
				return;
			}
			compileActive = true;
			const result = await compileJob({
				generatedRoot,
				proportions: parsed.value.proportions,
			});
			jsonResponse(response, 200, result);
		} catch (error) {
			jsonResponse(response, 500, {
				error: error instanceof Error ? error.message : String(error),
				issues: error?.validationIssues ?? [],
				status: "failed",
			});
		} finally {
			compileActive = false;
		}
	};
}

export function proceduralMannequinCompilePlugin(options = {}) {
	return {
		configureServer(server) {
			server.middlewares.use(
				createProceduralMannequinCompileMiddleware(options),
			);
		},
		name: "asset-studio-procedural-mannequin-compile",
	};
}
