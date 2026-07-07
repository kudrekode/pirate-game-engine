import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	setThreeVisualAssetRegistryForTests,
	type ThreeVisualAssetDefinition,
} from "../../runtime/three/threeVisualAssetRegistry";
import type { ThreeVisualConfig } from "../../types/game";
import { ThreeVisualControls } from "./ThreeVisualControls";

const demoBoxAsset: ThreeVisualAssetDefinition = {
	category: "object",
	id: "demo-box",
	kind: "glb",
	name: "Demo Box",
	url: "/assets/demo/Box.glb",
};

const restoreRegistryFns: (() => void)[] = [];

function setAssets(assets: ThreeVisualAssetDefinition[]) {
	restoreRegistryFns.push(setThreeVisualAssetRegistryForTests(assets));
}

function renderControls(value?: ThreeVisualConfig) {
	const onChange = vi.fn();
	render(
		<ThreeVisualControls
			inferredPlaceholderType="npc"
			onChange={onChange}
			value={value}
		/>,
	);
	return onChange;
}

afterEach(() => {
	while (restoreRegistryFns.length > 0) {
		restoreRegistryFns.pop()?.();
	}
	vi.restoreAllMocks();
});

describe("ThreeVisualControls", () => {
	it("renders visual source and existing placeholder config", () => {
		renderControls({
			heightOffset: 0.25,
			mode: "placeholder",
			placeholderType: "hostileNpc",
			rotationOffset: 90,
			scale: 1.4,
		});

		expect(screen.getByLabelText("Visual source")).toHaveValue("placeholder");
		expect(screen.getByLabelText("Placeholder type")).toHaveValue("hostileNpc");
		expect(screen.getByLabelText("Scale")).toHaveValue(1.4);
		expect(screen.getByLabelText("Height offset")).toHaveValue(0.25);
		expect(screen.getByLabelText("Rotation offset")).toHaveValue(90);
		expect(screen.queryByLabelText("Asset")).not.toBeInTheDocument();
	});

	it("renders existing asset config with registry options by asset name", () => {
		setAssets([demoBoxAsset]);

		renderControls({
			assetId: "demo-box",
			mode: "asset",
			placeholderType: "chest",
		});

		expect(screen.getByLabelText("Visual source")).toHaveValue("asset");
		expect(screen.getByLabelText("Asset")).toHaveValue("demo-box");
		expect(screen.getByRole("option", { name: "Demo Box" })).toHaveValue(
			"demo-box",
		);
		expect(screen.queryByLabelText("Placeholder type")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Scale")).toBeInTheDocument();
		expect(screen.getByLabelText("Height offset")).toBeInTheDocument();
		expect(screen.getByLabelText("Rotation offset")).toBeInTheDocument();
	});

	it("stores the selected registry asset id", () => {
		setAssets([demoBoxAsset]);
		const onChange = renderControls({ mode: "asset" });

		fireEvent.change(screen.getByLabelText("Asset"), {
			target: { value: "demo-box" },
		});

		expect(onChange).toHaveBeenLastCalledWith({
			assetId: "demo-box",
			mode: "asset",
		});
	});

	it("updates source mode and preserves transform settings", () => {
		setAssets([demoBoxAsset]);
		const transformConfig: ThreeVisualConfig = {
			heightOffset: 0.6,
			mode: "placeholder",
			placeholderType: "npc",
			rotationOffset: 35,
			scale: 1.7,
		};
		const { rerender } = render(
			<ThreeVisualControls
				inferredPlaceholderType="npc"
				onChange={vi.fn()}
				value={transformConfig}
			/>,
		);
		const assetOnChange = vi.fn();

		rerender(
			<ThreeVisualControls
				inferredPlaceholderType="npc"
				onChange={assetOnChange}
				value={transformConfig}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "asset" },
		});
		expect(assetOnChange).toHaveBeenLastCalledWith({
			...transformConfig,
			assetId: "demo-box",
			mode: "asset",
		});

		const placeholderOnChange = vi.fn();
		rerender(
			<ThreeVisualControls
				inferredPlaceholderType="npc"
				onChange={placeholderOnChange}
				value={{
					...transformConfig,
					assetId: "demo-box",
					mode: "asset",
				}}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Visual source"), {
			target: { value: "placeholder" },
		});
		expect(placeholderOnChange).toHaveBeenLastCalledWith({
			...transformConfig,
			assetId: "demo-box",
			mode: "placeholder",
		});
	});

	it("keeps placeholder controls active in placeholder mode", () => {
		const onChange = renderControls({ mode: "placeholder" });

		fireEvent.change(screen.getByLabelText("Placeholder type"), {
			target: { value: "rock" },
		});

		expect(onChange).toHaveBeenLastCalledWith({
			mode: "placeholder",
			placeholderType: "rock",
		});
	});

	it("communicates unknown asset ids without removing them", () => {
		setAssets([demoBoxAsset]);
		const onChange = renderControls({
			assetId: "old-pack-crate",
			mode: "asset",
			placeholderType: "genericObject",
		});

		expect(screen.getByLabelText("Asset")).toHaveValue("old-pack-crate");
		expect(
			screen.getByRole("option", { name: "Missing asset: old-pack-crate" }),
		).toHaveValue("old-pack-crate");
		expect(
			screen.getByText(/Asset "old-pack-crate" is not registered/),
		).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("handles an empty registry without assigning an invalid asset id", () => {
		setAssets([]);
		const onChange = renderControls({ mode: "asset" });

		expect(screen.getByLabelText("Asset")).toBeDisabled();
		expect(
			screen.getByText("No built-in 3D assets are registered."),
		).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});
});
