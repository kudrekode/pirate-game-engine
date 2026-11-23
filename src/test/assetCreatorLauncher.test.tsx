import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetCreatorLauncher } from "../editor/AssetCreatorLauncher";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("Asset Creator entry point", () => {
	it("opens the configured Studio and reports its health", async () => {
		vi.stubEnv(
			"VITE_ASSET_STUDIO_URL",
			`http://localhost:6190/?returnTo=${encodeURIComponent(window.location.href)}`,
		);
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ app: "asset-studio" }),
		});
		vi.stubGlobal("fetch", fetch);
		render(<AssetCreatorLauncher />);
		fireEvent.click(screen.getByRole("button", { name: "Asset Creator" }));
		expect(screen.getByRole("dialog", { name: "Asset Creator" })).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Open Asset Creator" }),
		).toHaveAttribute(
			"href",
			`http://localhost:6190/?returnTo=${encodeURIComponent(window.location.href)}`,
		);
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent("ready to open"),
		);
		expect(String(fetch.mock.calls[0][0])).toBe(
			"http://localhost:6190/__asset-studio/health",
		);
	});
	it("keeps connection guidance and a retryable link when Studio is stopped", async () => {
		vi.stubEnv("VITE_ASSET_STUDIO_URL", "");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		render(<AssetCreatorLauncher />);
		fireEvent.click(screen.getByRole("button", { name: "Asset Creator" }));
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"could not be reached",
			),
		);
		expect(screen.getByText("npm run dev:asset-studio")).toBeInTheDocument();
		const link = screen.getByRole<HTMLAnchorElement>("link");
		expect(new URL(link.href).port).toBe("5174");
	});
	it("rejects unsafe address schemes without making a request", () => {
		vi.stubEnv("VITE_ASSET_STUDIO_URL", "javascript:alert(1)");
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		render(<AssetCreatorLauncher />);
		fireEvent.click(screen.getByRole("button", { name: "Asset Creator" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Invalid Asset Studio address",
		);
		expect(screen.queryByRole("link")).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
