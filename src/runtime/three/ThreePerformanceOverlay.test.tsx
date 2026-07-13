import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreePerformanceOverlay } from "./ThreePerformanceOverlay";
import { createThreePerformanceDiagnostics } from "./threePerformanceDiagnostics";

describe("ThreePerformanceOverlay", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stays collapsed until toggled and copies a snapshot on demand", async () => {
		let now = 0;
		const diagnostics = createThreePerformanceDiagnostics({
			label: "Overlay Test",
			now: () => now,
		});
		diagnostics.recordFrame(16);
		now = 300;
		diagnostics.recordFrame(17);
		diagnostics.recordSceneBuild("overlay test rebuild", 5);
		diagnostics.recordTerrainRebuild({
			durationMs: 2,
			meshCount: 3,
			mode: "blocky",
			tileCount: 4,
		});

		const writtenText: string[] = [];
		const writeText = vi.fn(async (text: string) => {
			writtenText.push(text);
		});
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		try {
			render(
				<ThreePerformanceOverlay
					diagnostics={diagnostics}
					title="Overlay Perf"
				/>,
			);

			expect(screen.getByRole("button", { name: "Perf" })).toHaveAttribute(
				"aria-expanded",
				"false",
			);
			expect(screen.queryByText("Overlay Perf")).not.toBeInTheDocument();

			fireEvent.click(screen.getByRole("button", { name: "Perf" }));

			expect(screen.getByRole("button", { name: "Perf" })).toHaveAttribute(
				"aria-expanded",
				"true",
			);
			expect(screen.getByText("Overlay Perf")).toBeInTheDocument();
			expect(screen.getByText("overlay test rebuild")).toBeInTheDocument();
			expect(screen.getByText("blocky, 4 tiles, 3 meshes")).toBeInTheDocument();

			fireEvent.click(screen.getByRole("button", { name: "Copy" }));

			await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
			expect(writtenText[0]).toContain("Overlay Test performance snapshot");
			await screen.findByText("Copied");
		} finally {
			diagnostics.dispose();
		}
	});
});
