import { subscribeThreeAssetPreviewDiagnosticsEvents } from "@adventure-game-builder/three-asset-preview";
import { emitThreePerformanceDiagnosticsEvent } from "./threePerformanceDiagnostics";

export * from "@adventure-game-builder/three-asset-preview";

subscribeThreeAssetPreviewDiagnosticsEvents((event) =>
	emitThreePerformanceDiagnosticsEvent(event),
);
