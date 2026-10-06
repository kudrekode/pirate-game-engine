import type { CharacterRecipeV1 } from "@adventure-game-builder/character-contract";
import { useState } from "react";
import type { ProceduralMannequinCompileResult } from "./proceduralMannequinCreator";

export function getGameImportContext(href: string, hasOpener: boolean) {
	const current = new URL(href);
	const token = current.searchParams.get("gameContext");
	const returnTo = current.searchParams.get("returnTo");
	if (!hasOpener || !token || !returnTo) return undefined;
	try {
		const target = new URL(returnTo);
		const localHosts = ["localhost", "127.0.0.1", "[::1]"];
		if (
			!["http:", "https:"].includes(target.protocol) ||
			target.username ||
			target.password ||
			!localHosts.includes(target.hostname) ||
			!localHosts.includes(current.hostname)
		)
			return undefined;
		return { token, origin: target.origin };
	} catch {
		return undefined;
	}
}

export function UseInGame({
	recipe,
	result,
}: {
	recipe: CharacterRecipeV1;
	result: ProceduralMannequinCompileResult;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const context = getGameImportContext(
		window.location.href,
		Boolean(window.opener && !window.opener.closed),
	);
	async function useInGame() {
		if (!context || busy) return;
		setBusy(true);
		setError("");
		try {
			await new Promise<void>((resolve, reject) => {
				const timer = window.setTimeout(() => {
					window.removeEventListener("message", receive);
					reject(
						new Error(
							"The game project did not respond. Keep its tab open and reopen Asset Creator from that project.",
						),
					);
				}, 30_000);
				function receive(event: MessageEvent) {
					if (
						event.source !== window.opener ||
						event.origin !== context?.origin ||
						event.data?.type !== "game-character-import-result" ||
						event.data.token !== context?.token
					)
						return;
					window.clearTimeout(timer);
					window.removeEventListener("message", receive);
					if (event.data.error) reject(new Error(event.data.error));
					else resolve();
				}
				window.addEventListener("message", receive);
				window.opener.postMessage(
					{
						type: "game-character-import",
						token: context.token,
						character: {
							requestId: result.requestId,
							artifactHash: result.manifest.outputHash,
							recipe,
						},
					},
					context.origin,
				);
			});
			window.opener.focus();
			window.close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div>
			<button
				type="button"
				className="primary"
				disabled={!context || busy}
				onClick={useInGame}
			>
				{busy ? "Adding character…" : "Use in Game"}
			</button>
			<p>
				{context
					? "Adds a finalised character to the project that opened this tab. Changed characters import as separate assets; existing assignments stay unchanged."
					: "Open Asset Creator from a local Game Engine project to use this character in a game."}
			</p>
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
