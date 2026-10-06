// @vitest-environment jsdom
import "./testSetup";
import {
	createAuthoredHumanRecipe,
	createDefaultCharacterRecipe,
} from "@adventure-game-builder/character-contract";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function successfulCompile(
	heightMetres = 1.9,
	hair: "none" | "quaternius-hair-v0" = "none",
) {
	return {
		assetUrl:
			"/__asset-studio/procedural-mannequin/assets/job/output/mannequin.glb",
		compilationDurationMs: 1234,
		generatedAt: "2026-07-16T12:00:00.000Z",
		manifest: {
			validationLevel: "preview",
			appearance: {
				hair: {
					authoredColor: "#3b2a1f",
					authoredColorSpace: "srgb",
					materialSchemaVersion: "procedural-hair-material-v1",
					materialCount: hair === "none" ? 0 : 1,
					exportedLinearColor:
						hair === "none" ? null : [0.0437, 0.0232, 0.0137],
					exportedRoughness: hair === "none" ? null : 0.72,
					exportedMetallic: hair === "none" ? null : 0,
				},
				face: {
					authoredEyeColor: "#4b5d67",
					authoredEyeColorSpace: "srgb",
					canonicalLinearColor: [0.07, 0.109, 0.135],
					exportedLinearColor: [0.07, 0.109, 0.135],
					exportedMetallic: 0,
					exportedRoughness: 0.48,
					materialCount: 1,
					materialName: "ProceduralEyeMaterial",
					materialSchemaVersion: "procedural-eye-material-v1",
				},
				skin: {
					authoredColor: "#c98f65",
					authoredColorSpace: "srgb",
					authoredRoughness: 0.72,
					canonicalLinearColor: [0.584, 0.275, 0.13],
					exportedLinearColor: [0.584, 0.275, 0.13],
					exportedMetallic: 0,
					exportedRoughness: 0.72,
					materialCount: 1,
					materialName: "ProceduralSkinMaterial",
					materialSchemaVersion: "procedural-skin-material-v1",
				},
			},
			anatomy: {
				armLengthMultiplier: 1,
				armToLegRatio: 1,
				armToTorsoRatio: 1,
				heightScale: heightMetres / 1.82,
				hipWidthMultiplier: 1,
				legLengthMultiplier: 1,
				legToTorsoRatio: 1,
				shoulderToHipRatio: 1,
				shoulderWidthMultiplier: 1,
				torsoLengthMultiplier: 1,
			},
			animationSet: "golden-reference-v0",
			assetId: "procedural-mannequin-v0",
			bounds: {
				dimensions: { x: 1.69, y: heightMetres, z: 0.34 },
				maxY: heightMetres,
				minY: 0,
			},
			compilerVersion: "procedural-mannequin-blender-v8",
			face: {
				eyeColor: "#4b5d67",
				eyeMeshCount: 2,
				materialCount: 3,
				mouthCentre: [0, 0.17, 1.52],
				noseCentre: [0, 0.18, 1.57],
				noseProjectionMetres: 0.026,
				triangleCount: 148,
				validation: { passed: true, warnings: [] },
				version: "procedural-face-readability-v0",
				vertexCount: 110,
			},
			faceGeometrySemanticHash: "1".repeat(64),
			head: {
				version: "procedural-head-contract-v3",
				bounds: {
					centre: [0, 0.0264, 1.5881],
					dimensions: [0.346707, 0.288124, 0.276179],
					maximum: [0.173, 0.1704, 1.726],
					minimum: [-0.173, -0.1177, 1.45],
				},
				headCentre: [0, 0.0264, 1.5881],
				headDepth: 0.288124,
				headHeight: 0.276179,
				headWidth: 0.346707,
				neckTop: [0, 0, 1.45],
				scalpTop: [0, 0, 1.726],
				symmetryErrorMetres: 0,
				topologyVersion: "procedural-humanoid-v4",
			},
			components: {
				hair: {
					attachmentBone: hair === "none" ? null : "Head",
					componentId: hair,
					fittingProfile:
						hair === "none"
							? undefined
							: {
									id: "quaternius-buzzed-fit-v3",
									scalpOffsetMetres: 0.012,
									version: 3,
								},
					materialCount: hair === "none" ? 0 : 1,
					meshCount: hair === "none" ? 0 : 1,
					packName: hair === "none" ? undefined : "Hairstyles",
					provider: hair === "none" ? undefined : "Quaternius",
					sourceAsset: hair === "none" ? undefined : "Hair_Buzzed.gltf",
					textureCount: hair === "none" ? 0 : 1,
					triangleCount: hair === "none" ? 0 : 830,
					vertexCount: hair === "none" ? 0 : 466,
				},
			},
			deterministicBuild: false,
			generationDurationMs: 1200,
			geometryAndSkinningSemanticHash: "e".repeat(64),
			heightMetres,
			proportions: {
				height: heightMetres,
				shoulderWidth: 0.5,
				torsoLength: 0.5,
				armLength: 0.5,
				legLength: 0.5,
				hipWidth: 0.5,
			},
			influenceStatistics: {
				maximumInfluences: 4,
				maximumWeightSumError: 0,
				strategy: "analytic-sided-segments-v2",
				unweightedVertexCount: 0,
			},
			jointCount: 65,
			knownLimitations: [],
			materialCount: 3,
			materialSemanticHash: "f".repeat(64),
			meshCount: 5,
			normalizedSemanticHash: "c".repeat(64),
			outputHash: "a".repeat(64),
			recipeHash: "b".repeat(64),
			recipeId: "procedural-mannequin-v0",
			recipeVersion: 6,
			skeletonContract: "golden-humanoid-v0",
			skeletonSignature: "d".repeat(64),
			topology: {
				boundaryEdgeCount: 0,
				connectedComponentCount: 1,
				degenerateFaceCount: 0,
				edgeCount: 8292,
				eulerCharacteristic: 2,
				faceCount: 5528,
				genus: 0,
				manifold: true,
				nonManifoldEdgeCount: 0,
				unreferencedVertexCount: 0,
			},
			topologyVersion: "procedural-humanoid-v4",
			triangleCount: 5676,
			validationVersion: "procedural-mannequin-roundtrip-v9",
			vertexCount: 2876,
		},
		manifestUrl:
			"/__asset-studio/procedural-mannequin/assets/job/output/manifest.json",
		requestId: "11111111-1111-4111-8111-111111111111",
		status: "succeeded",
		validation: {
			passed: true,
			version: "procedural-mannequin-roundtrip-v9",
		},
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});
beforeEach(() => {
	window.history.replaceState({}, "", "/?family=legacy");
});

describe("Asset Studio app", { timeout: 15_000 }, () => {
	it("loads each recipe family with visible feedback and rejects an invalid identity without losing the draft", async () => {
		window.history.replaceState({}, "", "/");
		const { container } = render(<App />);
		const input = container.querySelector('input[type="file"]');
		if (!input)
			throw new Error("Expected the recipe file input to be rendered.");
		const load = (recipe: unknown) =>
			fireEvent.change(input, {
				target: {
					files: [
						{ name: "saved.json", text: async () => JSON.stringify(recipe) },
					],
				},
			});
		const legacy = createDefaultCharacterRecipe();
		legacy.body.parameters.shoulderWidth = 0.8;
		load(legacy);
		await waitFor(() =>
			expect(screen.getByLabelText("Character type")).toHaveValue("legacy"),
		);
		expect(
			container.querySelector(
				'[data-preview-source="procedural-mannequin-v0"]',
			),
		).toBeInTheDocument();
		expect(screen.getByText(/Loaded saved.json/)).toBeVisible();
		const authored = createAuthoredHumanRecipe();
		if (authored.geometry?.family !== "authored-human") throw Error("family");
		authored.geometry.values.mass = 0.7;
		load(authored);
		await waitFor(() =>
			expect(screen.getByText(/Loaded saved.json/)).toBeVisible(),
		);
		fireEvent.click(screen.getByRole("button", { name: "Body" }));
		expect(screen.getByLabelText("Build")).toHaveValue("0.7");
		expect(
			container.querySelector(
				'[data-preview-source="authored-human-canonical-v1"]',
			),
		).toBeInTheDocument();
		expect(screen.getByTestId("recipe-json")).not.toBeVisible();
		authored.geometry.values.mass = 9;
		load(authored);
		await waitFor(() =>
			expect(screen.getByText(/Recipe rejected/)).toBeVisible(),
		);
		expect(screen.getByLabelText("Build")).toHaveValue("0.7");
	});

	it("offers section presets, preserves unrelated choices, and resets without compiling", () => {
		window.history.replaceState({}, "", "/");
		render(<App />);
		const section = (name: string) =>
			fireEvent.click(
				screen
					.getByRole("navigation", { name: "Character categories" })
					.querySelectorAll("button")[
					["Character", "Body", "Face", "Hair", "Appearance"].indexOf(name)
				],
			);
		section("Body");
		for (const name of ["Build", "Muscle", "Frame", "Height"])
			expect(screen.getByLabelText(name)).toBeVisible();
		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.7" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Broad body preset" }));
		expect(screen.getByText(/Changes not previewed/)).toBeVisible();
		expect(screen.getByLabelText("Height")).toHaveValue("1.7");
		expect(screen.getByLabelText("Frame")).toHaveValue("1");
		expect(
			screen.getByRole("button", { name: "Broad body preset" }),
		).toHaveAttribute("aria-pressed", "true");
		fireEvent.change(screen.getByLabelText("Build"), {
			target: { value: "0.7" },
		});
		expect(screen.getByText("Custom")).toBeVisible();
		section("Face");
		fireEvent.click(
			screen.getByRole("button", { name: "Angular face preset" }),
		);
		expect(screen.getByLabelText("Head Width")).toHaveValue("-0.65");
		section("Hair");
		fireEvent.click(screen.getByRole("button", { name: "Auburn hair" }));
		section("Face");
		fireEvent.click(screen.getByRole("button", { name: "Reset face" }));
		expect(screen.getByLabelText("Head Width")).toHaveValue("0");
		section("Body");
		expect(screen.getByLabelText("Build")).toHaveValue("0.7");
		section("Hair");
		expect(screen.getByLabelText("Hair color")).toHaveValue("#8b3f27");
		section("Character");
		fireEvent.click(screen.getByRole("button", { name: "Reset character" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Undo character reset" }),
		);
		section("Body");
		expect(screen.getByLabelText("Build")).toHaveValue("0.7");
		fireEvent.click(screen.getByRole("button", { name: "Recipe details" }));
		fireEvent.change(screen.getByLabelText("Character type"), {
			target: { value: "legacy" },
		});
		expect(screen.getByLabelText("Shoulders")).toBeVisible();
	});

	it("renders the Character screen as the active V0 workflow", () => {
		render(<App />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Character" }),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText("Golden Reference Humanoid preview"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Golden Reference Humanoid · Reference fixture"),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText("Golden Reference Humanoid diagnostics"),
		).toHaveTextContent("golden-reference-quaternius-superhero-male");
		expect(
			screen.getByRole("button", { name: "Reset view" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Front" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Close front" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Side" })).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Three-quarter" }),
		).toBeDisabled();
		expect(
			screen.getByRole("group", {
				name: "Golden Reference Humanoid animation controls",
			}),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Rest" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Idle" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Walk" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
		expect(screen.getByLabelText("Animation sample time")).toBeDisabled();
		expect(screen.getByText("Your recipe stays editable.")).toBeInTheDocument();
	});

	it("updates recipe state from controls and reflects it in JSON", () => {
		render(<App />);

		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.9" },
		});
		fireEvent.change(screen.getByLabelText("Hair component"), {
			target: { value: "quaternius-hair-v0" },
		});

		const json = screen.getByTestId("recipe-json");
		expect(json).toHaveTextContent('"height": 1.9');
		expect(json).toHaveTextContent('"hair": "quaternius-hair-v0"');
	});

	it("offers no hair and all five registered Quaternius hairstyles", () => {
		render(<App />);
		const hair = screen.getByLabelText("Hair component");
		expect(hair).toHaveTextContent("No hair");
		expect(hair).toHaveTextContent("Quaternius Buzzed");
		expect(hair).toHaveTextContent("Quaternius Short Crop");
		expect(hair).toHaveTextContent("Quaternius Simple Parted");
		expect(hair).toHaveTextContent("Quaternius Long");
		expect(hair).toHaveTextContent("Quaternius Buns");
		expect(hair.querySelectorAll("option")).toHaveLength(6);
	});

	it("resets the authored height to the procedural default", () => {
		render(<App />);

		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.9" },
		});
		expect(screen.getByLabelText("Current height")).toHaveTextContent("1.90 m");
		fireEvent.click(screen.getByRole("button", { name: "Reset height" }));

		expect(screen.getByLabelText("Current height")).toHaveTextContent("1.82 m");
	});

	it("edits and resets draft skin appearance without recoloring or compiling", () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		const canvas = document.querySelector("canvas");
		fireEvent.change(screen.getByLabelText("Skin color"), {
			target: { value: "#503126" },
		});
		fireEvent.change(screen.getByLabelText("Skin roughness"), {
			target: { value: "0.41" },
		});
		expect(screen.getByLabelText("Current skin color")).toHaveTextContent(
			"#503126",
		);
		expect(screen.getByLabelText("Current skin roughness")).toHaveTextContent(
			"0.41",
		);
		expect(screen.getByTestId("recipe-json")).toHaveTextContent(
			'"roughness": 0.41',
		);
		expect(document.querySelector("canvas")).toBe(canvas);
		expect(fetch).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Reset skin color" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Reset skin roughness" }),
		);
		expect(screen.getByLabelText("Current skin color")).toHaveTextContent(
			"#c98f65",
		);
		expect(screen.getByLabelText("Current skin roughness")).toHaveTextContent(
			"0.72",
		);
	});

	it("edits, presets, and resets authored eye colour without compiling", () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Eye color"), {
			target: { value: "#405c72" },
		});
		expect(screen.getByLabelText("Current eye color")).toHaveTextContent(
			"#405c72",
		);
		expect(screen.getByTestId("recipe-json")).toHaveTextContent(
			'"eyeColor": "#405c72"',
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Use Earth eye color" }),
		);
		expect(screen.getByLabelText("Current eye color")).toHaveTextContent(
			"#5c4634",
		);
		fireEvent.click(screen.getByRole("button", { name: "Reset eye color" }));
		expect(screen.getByLabelText("Current eye color")).toHaveTextContent(
			"#4b5d67",
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("edits and resets hair colour in the saved recipe without compiling", () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Hair color"), {
			target: { value: "#a6a6ab" },
		});
		expect(screen.getByLabelText("Current hair color")).toHaveTextContent(
			"#a6a6ab",
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Use Blond hair color" }),
		);
		expect(screen.getByTestId("recipe-json")).toHaveTextContent(
			'"hair": "#bd955b"',
		);
		fireEvent.click(screen.getByRole("button", { name: "Reset hair color" }));
		expect(screen.getByLabelText("Current hair color")).toHaveTextContent(
			"#3b2a1f",
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("exposes exactly the six genuine compiled body parameters", () => {
		render(<App />);

		for (const label of [
			"Height",
			"Shoulders",
			"Torso",
			"Arms",
			"Legs",
			"Hips",
		]) {
			expect(screen.getByLabelText(label)).toHaveAttribute("type", "range");
		}
		expect(screen.getByLabelText("Current height")).toHaveTextContent("1.82 m");
		expect(screen.getByRole("button", { name: "Reset arms" })).toBeEnabled();
		expect(
			screen.getByRole("button", { name: "Generate Preview" }),
		).toBeEnabled();
		expect(screen.queryByLabelText("Build")).not.toBeInTheDocument();
	});

	it("reproduces Randomise for the displayed seed without compiling", () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Random seed"), {
			target: { value: "body-test-7" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Randomise" }));
		const first = screen.getByTestId("recipe-json").textContent;
		fireEvent.change(screen.getByLabelText("Arms"), {
			target: { value: "0.5" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Randomise" }));
		expect(screen.getByTestId("recipe-json").textContent).toBe(first);
		expect(screen.getByLabelText("Random seed")).toHaveValue("body-test-7");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("compiles the current height and replaces the preview only after success", async () => {
		const fetch = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify(successfulCompile(1.9, "quaternius-hair-v0")),
					{ status: 200 },
				),
		);
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.9" },
		});
		fireEvent.change(screen.getByLabelText("Hair component"), {
			target: { value: "quaternius-hair-v0" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));

		await waitFor(() =>
			expect(screen.getByText(/Preview ready/u)).toBeInTheDocument(),
		);
		expect(
			screen.getByLabelText("Procedural Mannequin V1 preview"),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText("Creator compilation diagnostics"),
		).toHaveTextContent("b".repeat(64));
		expect(
			screen.getByLabelText("Creator compilation diagnostics"),
		).toHaveTextContent("a".repeat(64));
		expect(
			screen.getByLabelText("Creator compilation diagnostics"),
		).toHaveTextContent("2026-07-16T12:00:00.000Z");
		expect(document.querySelectorAll("canvas")).toHaveLength(1);
		expect(screen.getByLabelText("Recent Compilations")).toHaveTextContent(
			"1.90 m",
		);
		expect(screen.getByLabelText("Hair")).toHaveTextContent(
			"Compiled · Quaternius Buzzed",
		);
		expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
			appearance: { eyeColor: "#4b5d67" },
			components: { hair: "quaternius-hair-v0" },
			version: 6,
		});
	});

	it("keeps the previous preview active when compilation fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: "synthetic validation failure",
							status: "failed",
						}),
						{ status: 500 },
					),
			),
		);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Hair component"), {
			target: { value: "quaternius-hair-v0" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));

		await waitFor(() =>
			expect(
				screen.getByText(/synthetic validation failure/u),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByLabelText("Golden Reference Humanoid preview"),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Hair component")).toHaveValue(
			"quaternius-hair-v0",
		);
		expect(document.querySelectorAll("canvas")).toHaveLength(1);
	});

	it("switches between the Golden fixture and procedural artifact without duplicate canvases", () => {
		render(<App />);

		fireEvent.change(screen.getByLabelText("Preview source"), {
			target: { value: "procedural-mannequin-v0" },
		});

		expect(
			screen.getByLabelText("Procedural Mannequin V0 preview"),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText("Procedural Mannequin V0 diagnostics"),
		).toHaveTextContent("procedural-mannequin-v0");
		expect(
			screen.queryByLabelText("Golden Reference Humanoid preview"),
		).not.toBeInTheDocument();
		expect(document.querySelectorAll("canvas")).toHaveLength(1);
	});
	it("selects library styles and shows their own provenance without compiling", () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<App />);
		for (const [id, label, fit] of [
			[
				"quaternius-hair-short-crop-v1",
				"Quaternius Short Crop",
				"quaternius-short-crop-fit-v3",
			],
			[
				"quaternius-hair-simple-parted-v1",
				"Quaternius Simple Parted",
				"quaternius-simple-parted-fit-v3",
			],
			["quaternius-hair-long-v1", "Quaternius Long", "quaternius-long-fit-v3"],
			["quaternius-hair-buns-v1", "Quaternius Buns", "quaternius-buns-fit-v3"],
		]) {
			fireEvent.change(screen.getByLabelText("Hair component"), {
				target: { value: id },
			});
			expect(screen.getByLabelText("Hair")).toHaveTextContent(
				`Draft \u00b7 ${label}`,
			);
			expect(screen.getByLabelText("Hair source status")).toHaveTextContent(
				fit,
			);
			expect(screen.getByLabelText("Hair component")).toHaveValue(id);
		}
		expect(fetch).not.toHaveBeenCalled();
	});
});

it("keeps distinct request snapshots and restores recent results without compiling again", async () => {
	const requests: Record<string, unknown>[] = [];
	const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
		const request = JSON.parse(String(init?.body));
		requests.push(request);
		const result = successfulCompile(request.proportions.height);
		result.requestId = `11111111-1111-4111-8111-${String(requests.length).padStart(12, "0")}`;
		result.manifest.proportions = request.proportions;
		result.manifest.recipeHash = String(requests.length).repeat(64);
		result.manifest.outputHash = String(requests.length + 3).repeat(64);
		return new Response(JSON.stringify(result), { status: 200 });
	});
	vi.stubGlobal("fetch", fetch);
	render(<App />);
	const snapshots: string[] = [];
	const randomise = screen.getByRole("button", { name: "Randomise" });
	const generate = screen.getByRole("button", { name: "Generate Preview" });
	for (const seed of ["body-e2e-11", "body-e2e-22", "body-e2e-33"]) {
		fireEvent.change(screen.getByLabelText("Random seed"), {
			target: { value: seed },
		});
		fireEvent.click(randomise);
		snapshots.push(screen.getByTestId("recipe-json").textContent ?? "");
		fireEvent.click(generate);
		await waitFor(() =>
			expect(screen.getByText(/Preview ready/u)).toBeInTheDocument(),
		);
		expect(
			screen.getByLabelText("Creator compilation diagnostics"),
		).toHaveTextContent(String(requests.length).repeat(64));
	}
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(
		new Set(requests.map((request) => JSON.stringify(request.proportions)))
			.size,
	).toBe(3);
	for (const [index, seed] of [
		"body-e2e-11",
		"body-e2e-22",
		"body-e2e-33",
	].entries()) {
		fireEvent.click(
			within(screen.getByLabelText("Recent Compilations")).getByRole("button", {
				name: new RegExp(seed),
			}),
		);
		expect(screen.getByTestId("recipe-json").textContent).toBe(
			snapshots[index],
		);
		expect(
			screen.getByLabelText("Creator compilation diagnostics"),
		).toHaveTextContent(String(index + 1).repeat(64));
		expect(requests[index]).toMatchObject({
			version: 6,
			proportions: JSON.parse(snapshots[index]).body.parameters,
		});
	}
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(document.querySelectorAll("canvas")).toHaveLength(1);
	fetch.mockImplementationOnce(
		async () =>
			new Response(
				JSON.stringify({
					status: "failed",
					error: "synthetic compile failure",
				}),
				{ status: 500 },
			),
	);
	fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
	await waitFor(() =>
		expect(screen.getByText(/synthetic compile failure/u)).toBeInTheDocument(),
	);
	expect(
		screen.getByLabelText("Creator compilation diagnostics"),
	).toHaveTextContent("3".repeat(64));
	expect(
		screen.getByLabelText("Recent Compilations").querySelectorAll("button"),
	).toHaveLength(3);
});

it("separates preview assurance from finalisation and preserves the captured draft", async () => {
	let finish: (value: Response) => void = () => {};
	const fetch = vi.fn(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	vi.stubGlobal("fetch", fetch);
	render(<App />);
	fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
	expect(screen.getByText("Generating preview…")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Finalise Character" }),
	).toBeDisabled();
	finish(new Response(JSON.stringify(successfulCompile(1.82))));
	await screen.findByText("Preview ready");
	expect(fetch.mock.calls[0]).toEqual(
		expect.arrayContaining(["/__asset-studio/procedural-mannequin/preview"]),
	);
	expect(
		screen.queryByRole("link", { name: "Download character GLB" }),
	).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Finalise Character" }));
	expect(screen.getByText("Finalising…")).toBeInTheDocument();
	const result = successfulCompile(1.82);
	result.manifest.validationLevel = "full";
	result.manifest.deterministicBuild = true;
	finish(new Response(JSON.stringify(result)));
	await screen.findByText("Character finalised");
	expect(fetch.mock.calls[1]).toEqual(
		expect.arrayContaining(["/__asset-studio/procedural-mannequin/compile"]),
	);
	expect(
		screen.getByRole("link", { name: "Download character GLB" }),
	).toHaveAttribute("download");
	fireEvent.change(screen.getByLabelText("Height"), {
		target: { value: "1.9" },
	});
	expect(screen.getByText(/Changes not previewed/)).toBeInTheDocument();
	expect(
		screen.queryByRole("link", { name: "Download character GLB" }),
	).toBeNull();
});
