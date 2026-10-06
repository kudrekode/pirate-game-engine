import {
	GOLDEN_REFERENCE_HUMANOID_ASSET,
	PROCEDURAL_MANNEQUIN_V0_ASSET,
	type ThreeVisualAssetDefinition,
} from "@adventure-game-builder/three-asset-preview";

export const GOLDEN_REFERENCE_FIXTURE_ID = "golden-reference-humanoid-v0";
export const PROCEDURAL_MANNEQUIN_FIXTURE_ID = "procedural-mannequin-v0";
export const AUTHORED_HUMAN_FIXTURE_ID = "authored-human-canonical-v1";
export const MANNEQUIN_ARTIFACT_ROOT =
	"/assets/derived/procedural-humanoids/mannequin-v0";
export type PreviewSource = {
	authoredHuman?: boolean;
	artifactUrl: string;
	definition: ThreeVisualAssetDefinition;
	description: string;
	displayName: string;
	fixtureId: string;
	kindLabel: string;
	manifestUrl?: string;
	mannequin: boolean;
	revision: string;
	transient?: boolean;
};
export const PREVIEW_SOURCES = {
	[AUTHORED_HUMAN_FIXTURE_ID]: {
		artifactUrl: "/assets/derived/authored-humans/everyday-v1/mannequin.glb",
		definition: {
			...PROCEDURAL_MANNEQUIN_V0_ASSET,
			id: AUTHORED_HUMAN_FIXTURE_ID,
			name: "Authored Human",
			url: "/assets/derived/authored-humans/everyday-v1/mannequin.glb",
		},
		description: "Experimental canonical authored human",
		displayName: "Authored Human",
		fixtureId: AUTHORED_HUMAN_FIXTURE_ID,
		kindLabel: "Experimental human",
		mannequin: true,
		authoredHuman: true,
		manifestUrl: "/assets/derived/authored-humans/everyday-v1/manifest.json",
		revision: "everyday-v1",
	},
	[GOLDEN_REFERENCE_FIXTURE_ID]: {
		artifactUrl: GOLDEN_REFERENCE_HUMANOID_ASSET.url,
		definition: GOLDEN_REFERENCE_HUMANOID_ASSET,
		description: "Externally authored engineering reference fixture",
		displayName: "Golden Reference Humanoid",
		fixtureId: GOLDEN_REFERENCE_FIXTURE_ID,
		kindLabel: "Reference fixture",
		mannequin: false,
		revision: "golden-reference",
	},
	[PROCEDURAL_MANNEQUIN_FIXTURE_ID]: {
		artifactUrl: `${MANNEQUIN_ARTIFACT_ROOT}/mannequin.glb`,
		definition: PROCEDURAL_MANNEQUIN_V0_ASSET,
		description: "Compiler-generated engineering geometry",
		displayName: "Procedural Mannequin V0",
		fixtureId: PROCEDURAL_MANNEQUIN_FIXTURE_ID,
		kindLabel: "Compiled artifact",
		manifestUrl: `${MANNEQUIN_ARTIFACT_ROOT}/manifest.json`,
		mannequin: true,
		revision: "checked-in",
	},
} as const satisfies Record<string, PreviewSource>;
export type PreviewSourceId = keyof typeof PREVIEW_SOURCES;
