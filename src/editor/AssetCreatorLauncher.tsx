import { useEffect, useRef, useState } from "react";
import { registerCharacterAsset } from "../data/characterAssets";
import { useProjectStore } from "../store/useProjectStore";

export function AssetCreatorLauncher({
	onImported,
}: {
	onImported?: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const launch = useRef<
		| { child: Window; token: string; origin: string; context: string }
		| undefined
	>(undefined);
	const importing = useRef(false);
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
		async function receive(event: MessageEvent) {
			const active = launch.current;
			if (
				!active ||
				event.source !== active.child ||
				event.origin !== active.origin ||
				event.data?.type !== "game-character-import" ||
				event.data.token !== active.token ||
				importing.current
			)
				return;
			importing.current = true;
			let error: string | undefined;
			try {
				if (useProjectStore.getState().projectContextId !== active.context)
					throw new Error(
						"The active game project changed. Open Asset Creator from the intended project again.",
					);
				const response = await fetch("/__game/characters/import", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(event.data.character),
				});
				if (!response.headers.get("content-type")?.includes("application/json"))
					throw new Error(
						"Character import is available in the local Game Engine development server. Start it and reopen Asset Creator.",
					);
				const result = await response.json();
				if (!response.ok)
					throw new Error(result.error || "Character import failed.");
				const store = useProjectStore.getState();
				if (store.projectContextId !== active.context)
					throw new Error(
						"The project changed during import. Open Asset Creator from the intended project again.",
					);
				store.updateProject((project) =>
					registerCharacterAsset(project, result.asset),
				);
				dialog.current?.close();
				onImported?.();
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
			active.child.postMessage(
				{ type: "game-character-import-result", token: active.token, error },
				active.origin,
			);
			importing.current = false;
		}
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [onImported]);
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
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(event) => {
									const target = new URL(url);
									const localHosts = ["localhost", "127.0.0.1", "[::1]"];
									// Remote launchers remain preview-only, without access to the project tab.
									if (
										!localHosts.includes(target.hostname) ||
										!localHosts.includes(window.location.hostname)
									)
										return;
									event.preventDefault();
									const token = crypto.randomUUID();
									target.searchParams.set("gameContext", token);
									const child = window.open(target.href, "_blank");
									if (child)
										launch.current = {
											child,
											token,
											origin: target.origin,
											context: useProjectStore.getState().projectContextId,
										};
									else
										setStatus(
											"Allow the Asset Creator tab to open, then try again.",
										);
								}}
							>
								Open Asset Creator
							</a>
						</p>
						<p>
							Keep this project tab open to receive finalised characters. Game
							import connects the local apps in this workspace.
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
