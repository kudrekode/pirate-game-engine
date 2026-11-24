import { requestThreeVisualAssetAnalysis } from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

/** Share in-flight models with marker creation. Only rebuild once the current
 * area's distinct model sources have settled, including failures. */
export function watchSceneAssetLoads(
	definitions: (ThreeVisualAssetDefinition | undefined)[],
	onProgress: (message: string) => void,
	onSettled: () => void,
) {
	const unique = new Map(
		definitions.flatMap((def) =>
			def ? [[def.id || def.url, def] as const] : [],
		),
	);
	let live = true;
	let pending = 0;
	const report = () =>
		onProgress(
			pending
				? `Loading scene models (${unique.size - pending}/${unique.size})…`
				: "",
		);
	function completed() {
		if (!live) return;
		pending--;
		report();
		if (!pending) onSettled();
	}
	for (const definition of unique.values()) {
		if (
			requestThreeVisualAssetAnalysis(definition, completed).status ===
			"loading"
		)
			pending++;
	}
	report();
	return {
		pending,
		cancel: () => {
			live = false;
		},
	};
}
