import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function successfulCompile(heightMetres = 1.9) {
	return {
		assetUrl:
			"/__asset-studio/procedural-mannequin/assets/job/output/mannequin.glb",
		compilationDurationMs: 1234,
		generatedAt: "2026-07-16T12:00:00.000Z",
		manifest: {
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
			compilerVersion: "procedural-mannequin-blender-v2",
			deterministicBuild: true,
			generationDurationMs: 1200,
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
			materialCount: 1,
			meshCount: 1,
			normalizedSemanticHash: "c".repeat(64),
			outputHash: "a".repeat(64),
			recipeHash: "b".repeat(64),
			recipeId: "procedural-mannequin-v0",
			recipeVersion: 2,
			skeletonContract: "golden-humanoid-v0",
			skeletonSignature: "d".repeat(64),
			topology: {
				boundaryEdgeCount: 0,
				connectedComponentCount: 1,
				degenerateFaceCount: 0,
				edgeCount: 8166,
				eulerCharacteristic: 2,
				faceCount: 5444,
				genus: 0,
				manifold: true,
				nonManifoldEdgeCount: 0,
				unreferencedVertexCount: 0,
			},
			topologyVersion: "procedural-humanoid-v1",
			triangleCount: 5444,
			validationVersion: "procedural-mannequin-roundtrip-v3",
			vertexCount: 2724,
		},
		manifestUrl:
			"/__asset-studio/procedural-mannequin/assets/job/output/manifest.json",
		requestId: "11111111-1111-4111-8111-111111111111",
		status: "succeeded",
		validation: {
			passed: true,
			version: "procedural-mannequin-roundtrip-v3",
		},
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Asset Studio app", () => {
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
		expect(
			screen.getByText("CharacterRecipeV1 is editable source data."),
		).toBeInTheDocument();
	});

	it("updates recipe state from controls and reflects it in JSON", () => {
		render(<App />);

		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.9" },
		});
		fireEvent.change(screen.getByLabelText("Hair component"), {
			target: { value: "tied-back" },
		});

		const json = screen.getByTestId("recipe-json");
		expect(json).toHaveTextContent('"height": 1.9');
		expect(json).toHaveTextContent('"hair": "tied-back"');
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
		expect(screen.getByRole("button", { name: "Compile" })).toBeEnabled();
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
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify(successfulCompile()), { status: 200 }),
			),
		);
		render(<App />);
		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "1.9" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Compile" }));

		await waitFor(() =>
			expect(
				screen.getByText(/Compilation and validation succeeded/u),
			).toBeInTheDocument(),
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
		fireEvent.click(screen.getByRole("button", { name: "Compile" }));

		await waitFor(() =>
			expect(
				screen.getByText(/synthetic validation failure/u),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByLabelText("Golden Reference Humanoid preview"),
		).toBeInTheDocument();
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
});
