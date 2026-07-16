import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

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

	it("shows validation errors when controls create invalid recipe data", () => {
		render(<App />);

		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "0.5" },
		});

		expect(screen.getByText("$.body.parameters.height")).toBeInTheDocument();
	});

	it("keeps browser compile state truthful while the offline compiler is available", () => {
		render(<App />);

		expect(
			screen.getByRole("button", { name: "Compile in browser unavailable" }),
		).toBeDisabled();
		expect(
			screen.getByText(/Repository compilation is available/u),
		).toBeInTheDocument();
	});

	it("does not expose a live Blender compile action", () => {
		render(<App />);

		expect(screen.getByText(/headless Blender command/u)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Compile in browser unavailable" }),
		).toBeDisabled();
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
