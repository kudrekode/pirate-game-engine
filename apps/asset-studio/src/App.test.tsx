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
		expect(screen.getByText(/Golden Reference Humanoid/)).toBeInTheDocument();
		expect(
			screen.getByLabelText("Golden Reference Humanoid diagnostics"),
		).toHaveTextContent("golden-reference-quaternius-superhero-male");
		expect(
			screen.getByRole("button", { name: "Reset view" }),
		).toBeInTheDocument();
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

	it("keeps compile/export state truthful while the compiler is absent", () => {
		render(<App />);

		expect(
			screen.getByRole("button", { name: "Compile GLB unavailable" }),
		).toBeDisabled();
		expect(
			screen.getByText("Asset Studio V0 has no character compiler."),
		).toBeInTheDocument();
	});

	it("does not expose a live Blender compile action", () => {
		render(<App />);

		expect(screen.queryByText(/Blender/i)).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Compile GLB unavailable" }),
		).toBeDisabled();
	});
});
