export function gameEngineUrl(href: string, configured?: string) {
	const current = new URL(href);
	const fallback = new URL(current.origin);
	fallback.port = "5173";
	const candidate =
		configured?.trim() || current.searchParams.get("returnTo") || fallback.href;
	try {
		const target = new URL(candidate);
		return ["http:", "https:"].includes(target.protocol) &&
			!target.username &&
			!target.password
			? target.href
			: undefined;
	} catch {
		return undefined;
	}
}

export function GameEngineNavigation() {
	const url = gameEngineUrl(
		window.location.href,
		import.meta.env.VITE_GAME_ENGINE_URL,
	);
	return (
		<nav aria-label="Game Engine navigation" className="game-engine-navigation">
			{url ? (
				<a href={url}>← Back to Game Engine</a>
			) : (
				<span>Game Engine address is invalid.</span>
			)}
			<details>
				<summary>Connection help</summary>
				<p>
					If Game Engine is unavailable, start it from the project folder with{" "}
					<code>npm run dev</code>, then use the link again.
				</p>
				<p>
					For another address, set <code>VITE_GAME_ENGINE_URL</code> in Asset
					Studio’s <code>.env.local</code> and restart it.
				</p>
			</details>
		</nav>
	);
}
