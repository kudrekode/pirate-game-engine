import { useEffect, useRef, useState } from "react";

export function AssetCreatorLauncher() {
	const dialog = useRef<HTMLDialogElement>(null);
	const [checking, setChecking] = useState(false);
	const [status, setStatus] = useState("");
	const configured = import.meta.env.VITE_ASSET_STUDIO_URL?.trim();
	const fallback = new URL(window.location.href);
	fallback.port = "5174";
	fallback.pathname = "/";
	fallback.search = "";
	fallback.hash = "";
	let url: string | undefined;
	try {
		const target = new URL(configured || fallback.href);
		target.searchParams.set("returnTo", window.location.href);
		if (["http:", "https:"].includes(target.protocol)) url = target.href;
	} catch {
		/* Invalid configuration is explained in the dialog. */
	}
	useEffect(() => {
		if (!checking || !url) return;
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 2500);
		let active = true;
		fetch(new URL("/__asset-studio/health", url), {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (response) => {
				if (!response.ok || (await response.json()).app !== "asset-studio")
					throw new Error("Unavailable");
				if (active) setStatus("Asset Creator is ready to open.");
			})
			.catch(() => {
				if (active)
					setStatus(
						"Asset Studio could not be reached. Start it locally, then try again. If it is hosted elsewhere, check the configured address.",
					);
			})
			.finally(() => {
				if (active) setChecking(false);
			});
		return () => {
			active = false;
			window.clearTimeout(timeout);
			controller.abort();
		};
	}, [checking, url]);
	return (
		<>
			<button
				type="button"
				onClick={() => {
					dialog.current?.showModal();
					setStatus("Checking Asset Studio…");
					setChecking(true);
				}}
			>
				Asset Creator
			</button>
			<dialog
				ref={dialog}
				className="preset-chooser asset-creator-dialog"
				aria-label="Asset Creator"
				onClose={() => setChecking(false)}
			>
				<h2>Asset Creator</h2>
				<p>Create and preview humanoid characters in Asset Studio.</p>
				{url ? (
					<>
						<p role="status">{status}</p>
						<p>
							<a href={url} target="_blank" rel="noopener noreferrer">
								Open Asset Creator
							</a>
						</p>
					</>
				) : (
					<p role="alert">
						Invalid Asset Studio address. Use an http or https URL.
					</p>
				)}
				<details>
					<summary>Local setup and connection help</summary>
					<p>
						From the project folder, run <code>npm run dev:asset-studio</code>.
					</p>
					<p>
						Address: {url || configured}. For a different address, set{" "}
						<code>VITE_ASSET_STUDIO_URL</code> in the editor’s{" "}
						<code>.env.local</code> and restart it.
					</p>
				</details>
				<form method="dialog">
					<button type="submit">Close</button>
				</form>
			</dialog>
		</>
	);
}
