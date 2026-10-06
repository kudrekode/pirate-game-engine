import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createRecipeForProportions,
	validateCreatorCompileRequest,
} from "../../apps/asset-studio/dev/procedural-mannequin-compile-api.mjs";
import { hashProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const workspaceRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digestPattern = /^[a-f0-9]{64}$/;

// Promote a validated full result out of the disposable compiler output. Never
// accept a caller-supplied filesystem path or fetch a caller-supplied URL.
export async function importFinalisedCharacter(
	input,
	{
		generatedRoot = path.join(
			workspaceRoot,
			"test-results/asset-studio-creator/procedural-mannequin",
		),
		assetRoot = path.join(workspaceRoot, "public/assets/project-characters"),
	} = {},
) {
	if (!/^[a-f0-9-]{36}$/i.test(input?.requestId ?? ""))
		throw new Error(
			"Finalised character reference is invalid. Finalise again in Asset Creator.",
		);
	const source = path.join(generatedRoot, input.requestId, "output");
	let manifest, compilerRecipe, glb;
	try {
		[manifest, compilerRecipe, glb] = await Promise.all([
			readFile(path.join(source, "manifest.json"), "utf8").then(JSON.parse),
			readFile(path.join(source, "recipe.snapshot.json"), "utf8").then(
				JSON.parse,
			),
			readFile(path.join(source, "mannequin.glb")),
		]);
	} catch {
		throw new Error(
			"Finalised character files are missing or corrupt. Finalise again in the Asset Creator connected to this engine.",
		);
	}
	if (
		manifest.validationLevel !== "full" ||
		manifest.deterministicBuild !== true
	)
		throw new Error(
			"Generate Preview cannot be used in a game. Finalise Character first.",
		);
	if (
		manifest.skeletonContract !== "golden-humanoid-v0" ||
		(manifest.geometrySource &&
			manifest.geometrySource.rigProfile !== "golden-humanoid-v0")
	)
		throw new Error(
			"This character rig is not supported. Use a Golden-compatible character.",
		);
	if (
		!digestPattern.test(manifest.outputHash) ||
		!digestPattern.test(manifest.recipeHash) ||
		manifest.outputHash !== input.artifactHash ||
		hash(glb) !== manifest.outputHash ||
		hashProceduralMannequinRecipe(compilerRecipe) !== manifest.recipeHash ||
		glb.readUInt32LE(0) !== 0x46546c67 ||
		glb.readUInt32LE(4) !== 2 ||
		glb.readUInt32LE(8) !== glb.length
	)
		throw new Error(
			"Finalised character integrity check failed. Finalise again before importing.",
		);
	const recipe = input.recipe;
	const parsed = validateCreatorCompileRequest({
		version: 6,
		geometrySource: recipe?.geometry,
		clothing: recipe?.clothing,
		proportions: recipe?.body?.parameters,
		components: { hair: recipe?.components?.hair },
		appearance: {
			eyeColor: recipe?.appearance?.face?.eyeColor,
			hairColor: recipe?.palette?.hair,
			skinColor: recipe?.palette?.skin,
			skinRoughness: recipe?.appearance?.skin?.roughness,
		},
	});
	if (!parsed.ok)
		throw new Error(
			"Editable character recipe is invalid. Reopen and finalise the character again.",
		);
	const expectedRecipe = await createRecipeForProportions({
		...parsed.value,
		hairComponentId: parsed.value.components.hair,
	});
	if (hashProceduralMannequinRecipe(expectedRecipe) !== manifest.recipeHash)
		throw new Error(
			"Character has changed since finalisation. Finalise the current character first.",
		);
	const id = `character-${hash(`${manifest.outputHash}:${manifest.recipeHash}`)}`;
	const url = `/assets/project-characters/${id}`;
	const asset = {
		id,
		name:
			typeof recipe.name === "string" && recipe.name.trim()
				? recipe.name.trim().slice(0, 100)
				: "Character",
		kind: "character",
		state: "finalised",
		geometryFamily: manifest.geometrySource?.family ?? "procedural-mannequin",
		glbUrl: `${url}/character.glb`,
		artifactHash: manifest.outputHash,
		recipeHash: manifest.recipeHash,
		manifestUrl: `${url}/manifest.json`,
		recipeUrl: `${url}/character.recipe.json`,
		rigProfile: "golden-humanoid-v0",
		animationSet: "golden-idle-walk-v1",
	};
	const destination = path.join(assetRoot, id);
	const files = {
		"character.glb": glb,
		"manifest.json": Buffer.from(JSON.stringify(manifest, null, 2)),
		"recipe.snapshot.json": Buffer.from(
			JSON.stringify(compilerRecipe, null, 2),
		),
		"character.recipe.json": Buffer.from(JSON.stringify(recipe, null, 2)),
	};
	async function verifyExisting() {
		const existing = JSON.parse(
			await readFile(path.join(destination, "asset.json"), "utf8"),
		);
		for (const file of ["character.glb", "recipe.snapshot.json"])
			if (
				hash(await readFile(path.join(destination, file))) !== hash(files[file])
			)
				throw new Error(
					"An imported character artifact is damaged. Restore its project asset folder; existing revisions are never overwritten.",
				);
		const existingManifest = JSON.parse(
			await readFile(path.join(destination, "manifest.json"), "utf8"),
		);
		if (
			existing.id !== id ||
			existing.artifactHash !== manifest.outputHash ||
			existing.recipeHash !== manifest.recipeHash ||
			existingManifest.outputHash !== manifest.outputHash ||
			existingManifest.recipeHash !== manifest.recipeHash ||
			existingManifest.validationLevel !== "full"
		)
			throw new Error(
				"An imported character manifest is damaged. Restore its project asset folder.",
			);
		await readFile(
			path.join(destination, "character.recipe.json"),
			"utf8",
		).then(JSON.parse);
		return existing;
	}
	let exists = false;
	try {
		await stat(destination);
		exists = true;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	if (exists) {
		try {
			return await verifyExisting();
		} catch {
			throw new Error(
				"An imported character artifact is missing or damaged. Restore its project asset folder; existing revisions are never overwritten.",
			);
		}
	}
	await mkdir(assetRoot, { recursive: true });
	const staging = path.join(assetRoot, `.import-${randomUUID()}`);
	await mkdir(staging);
	try {
		for (const [name, data] of Object.entries(files))
			await writeFile(path.join(staging, name), data);
		await writeFile(
			path.join(staging, "asset.json"),
			JSON.stringify(asset, null, 2),
		);
		try {
			await rename(staging, destination);
		} catch (error) {
			if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
			return await verifyExisting();
		}
		return asset;
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

export function gameCharacterImportPlugin(options = {}) {
	return {
		name: "game-character-import",
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const assetPath = new URL(
					request.url ?? "/",
					"http://localhost",
				).pathname.match(
					/^\/assets\/project-characters\/(character-[a-f0-9]{64})\/(character\.glb|asset\.json|manifest\.json|recipe\.snapshot\.json|character\.recipe\.json)$/,
				);
				if (assetPath && ["GET", "HEAD"].includes(request.method)) {
					// Vite snapshots public filenames. Serve new immutable imports directly
					// while ignoring watcher reloads that would interrupt the live handoff.
					try {
						const bytes = await readFile(
							path.join(
								options.assetRoot ??
									path.join(workspaceRoot, "public/assets/project-characters"),
								assetPath[1],
								assetPath[2],
							),
						);
						response.setHeader(
							"Content-Type",
							assetPath[2].endsWith(".glb")
								? "model/gltf-binary"
								: "application/json",
						);
						response.setHeader("Content-Length", bytes.length);
						response.setHeader(
							"Cache-Control",
							"public, max-age=31536000, immutable",
						);
						response.end(request.method === "HEAD" ? undefined : bytes);
					} catch {
						response.statusCode = 404;
						response.end(
							"Project character file is missing. Restore its asset folder or reimport the character.",
						);
					}
					return;
				}
				if (request.url !== "/__game/characters/import") return next();
				response.setHeader("Content-Type", "application/json");
				response.setHeader("Cache-Control", "no-store");
				try {
					// Same-origin JSON only: no permissive CORS on a filesystem writer.
					if (
						request.method !== "POST" ||
						!request.headers["content-type"]?.startsWith("application/json") ||
						(request.headers.origin &&
							new URL(request.headers.origin).host !== request.headers.host)
					)
						throw new Error(
							"Use a same-origin JSON import request from Game Engine.",
						);
					let size = 0;
					const chunks = [];
					for await (const chunk of request) {
						size += chunk.length;
						if (size > 64 * 1024)
							throw new Error("Character import request is too large.");
						chunks.push(chunk);
					}
					const asset = await importFinalisedCharacter(
						JSON.parse(Buffer.concat(chunks).toString("utf8")),
						options,
					);
					response.end(JSON.stringify({ asset }));
				} catch (error) {
					response.statusCode = 400;
					response.end(JSON.stringify({ error: error.message }));
				}
			});
		},
	};
}
