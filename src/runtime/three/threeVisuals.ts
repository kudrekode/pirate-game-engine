import {
	type Interaction,
	type NPCAttributes,
	type ObjectBehaviour,
	type ObjectDefinition,
	THREE_PLACEHOLDER_VISUAL_TYPES,
	type ThreePlaceholderVisualType,
	type ThreeVisualConfig,
} from "../../types/game";
import type { ThreeVisualAssetAnalysis } from "./threeVisualAssetAnalysis";
import {
	getThreeVisualAssetDefinition,
	type ThreeVisualAssetDefinition,
} from "./threeVisualAssetRegistry";

export type PlaceholderVisualEntity =
	| {
			kind: "player";
			name?: string;
			threeVisual?: ThreeVisualConfig;
	  }
	| {
			kind: "object";
			name?: string;
			category?: ObjectDefinition["category"];
			behaviour?: ObjectBehaviour;
			interaction?: Interaction;
			threeVisual?: ThreeVisualConfig;
	  }
	| {
			kind: "structure";
			name?: string;
			structureId?: string;
	  }
	| {
			kind: "npc";
			name?: string;
			attributes?: Pick<NPCAttributes, "alignment">;
			enemyEnabled?: boolean;
			threeVisual?: ThreeVisualConfig;
	  }
	| { kind: "pickup"; name?: string }
	| { kind: "event"; name?: string };

export type ThreeCharacterVisualEntity = Extract<
	PlaceholderVisualEntity,
	{ kind: "player" | "npc" }
>;

type ResolvedThreeVisualBase = {
	requestedMode: ThreeVisualConfig["mode"];
	placeholderType: ThreePlaceholderVisualType;
	scale: number;
	heightOffset: number;
	rotationOffset: number;
	source: "authored" | "inferred";
};

export type ResolvedThreeVisual =
	| (ResolvedThreeVisualBase & {
			mode: "placeholder";
			assetId?: string;
			asset?: undefined;
	  })
	| (ResolvedThreeVisualBase & {
			mode: "asset";
			assetId: string;
			asset: ThreeVisualAssetDefinition;
			requestedMode: "asset";
			source: "authored";
	  });

export type ResolvedThreeVisualAssetTransform = {
	heightOffset: number;
	normalizationOffsetY: number;
	rotationYRadians: number;
	scale: number;
};

export const THREE_PLACEHOLDER_VISUAL_OPTIONS: {
	label: string;
	value: ThreePlaceholderVisualType;
}[] = THREE_PLACEHOLDER_VISUAL_TYPES.map((value) => ({
	label:
		value === "marketStall"
			? "Market stall"
			: value === "hostileNpc"
				? "Hostile NPC"
				: value === "genericObject"
					? "Generic object"
					: value === "npc"
						? "NPC"
						: value.slice(0, 1).toUpperCase() + value.slice(1),
	value,
}));

const PLACEHOLDER_VISUAL_TYPE_SET = new Set<string>(
	THREE_PLACEHOLDER_VISUAL_TYPES,
);

export const DEFAULT_THREE_VISUAL_SCALE = 1;
export const DEFAULT_THREE_VISUAL_HEIGHT_OFFSET = 0;
export const DEFAULT_THREE_VISUAL_ROTATION_OFFSET = 0;

export function isThreePlaceholderVisualType(
	value: unknown,
): value is ThreePlaceholderVisualType {
	return typeof value === "string" && PLACEHOLDER_VISUAL_TYPE_SET.has(value);
}

function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
): number {
	const numberValue =
		typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, numberValue));
}

export function clampThreeVisualScale(value: unknown): number {
	return clampNumber(value, DEFAULT_THREE_VISUAL_SCALE, 0.1, 5);
}

export function clampThreeVisualHeightOffset(value: unknown): number {
	return clampNumber(value, DEFAULT_THREE_VISUAL_HEIGHT_OFFSET, -5, 5);
}

export function clampThreeVisualRotationOffset(value: unknown): number {
	return clampNumber(value, DEFAULT_THREE_VISUAL_ROTATION_OFFSET, -360, 360);
}

function textIncludes(text: string | undefined, fragments: string[]): boolean {
	const value = text?.toLowerCase() ?? "";
	return fragments.some((fragment) => value.includes(fragment));
}

function isShopInteraction(interaction: Interaction | undefined): boolean {
	return interaction?.type === "open_shop";
}

export function resolveInferredPlaceholderVisualType(
	entity: PlaceholderVisualEntity,
): ThreePlaceholderVisualType {
	if (entity.kind === "player") {
		return "player";
	}
	if (entity.kind === "pickup") {
		return "pickup";
	}
	if (entity.kind === "event") {
		return "event";
	}
	if (entity.kind === "npc") {
		return entity.attributes?.alignment === "hostile" || entity.enemyEnabled
			? "hostileNpc"
			: "npc";
	}
	if (entity.kind === "structure") {
		if (
			textIncludes(`${entity.name ?? ""} ${entity.structureId ?? ""}`, ["tree"])
		) {
			return "tree";
		}
		if (
			textIncludes(`${entity.name ?? ""} ${entity.structureId ?? ""}`, [
				"rock",
				"stone",
				"boulder",
			])
		) {
			return "rock";
		}
		return "house";
	}

	const label = entity.name ?? "";
	if (
		entity.category === "vehicle" ||
		entity.behaviour?.type === "vehicle" ||
		textIncludes(label, ["boat"])
	) {
		return "boat";
	}
	if (
		entity.category === "container" ||
		entity.behaviour?.type === "container"
	) {
		return "chest";
	}
	if (entity.category === "sign" || entity.behaviour?.type === "sign") {
		return "sign";
	}
	if (entity.category === "door" || entity.behaviour?.type === "door") {
		return "door";
	}
	if (
		isShopInteraction(entity.interaction) ||
		textIncludes(label, ["market", "shop", "stall"])
	) {
		return "marketStall";
	}
	if (textIncludes(label, ["tree", "oak", "pine"])) {
		return "tree";
	}
	if (textIncludes(label, ["rock", "stone", "boulder"])) {
		return "rock";
	}
	return "genericObject";
}

export function resolveThreeVisual(
	entity: PlaceholderVisualEntity,
): ResolvedThreeVisual {
	const config =
		entity.kind === "object" ||
		entity.kind === "npc" ||
		entity.kind === "player"
			? entity.threeVisual
			: undefined;
	const inferredPlaceholderType = resolveInferredPlaceholderVisualType(entity);
	const authoredPlaceholderType = isThreePlaceholderVisualType(
		config?.placeholderType,
	)
		? config.placeholderType
		: undefined;
	const requestedMode =
		config?.mode === "asset" || config?.mode === "placeholder"
			? config.mode
			: "placeholder";
	const requestedAssetId =
		typeof config?.assetId === "string" && config.assetId.trim()
			? config.assetId
			: undefined;
	const assetDefinition =
		requestedMode === "asset"
			? getThreeVisualAssetDefinition(requestedAssetId)
			: undefined;
	const hasAuthoredTransform =
		(typeof config?.scale === "number" && Number.isFinite(config.scale)) ||
		(typeof config?.heightOffset === "number" &&
			Number.isFinite(config.heightOffset)) ||
		(typeof config?.rotationOffset === "number" &&
			Number.isFinite(config.rotationOffset));
	const source: ResolvedThreeVisualBase["source"] =
		authoredPlaceholderType ||
		requestedMode !== "placeholder" ||
		hasAuthoredTransform
			? "authored"
			: "inferred";
	const resolved = {
		heightOffset: clampThreeVisualHeightOffset(
			config?.heightOffset ?? assetDefinition?.defaultHeightOffset,
		),
		placeholderType: authoredPlaceholderType ?? inferredPlaceholderType,
		requestedMode,
		rotationOffset: clampThreeVisualRotationOffset(
			config?.rotationOffset ?? assetDefinition?.defaultRotationOffset,
		),
		scale: clampThreeVisualScale(
			config?.scale ?? assetDefinition?.defaultScale,
		),
		source,
	};

	return assetDefinition && requestedMode === "asset"
		? {
				...resolved,
				asset: assetDefinition,
				assetId: assetDefinition.id,
				mode: "asset",
				requestedMode: "asset",
				source: "authored",
			}
		: {
				...resolved,
				...(requestedAssetId ? { assetId: requestedAssetId } : {}),
				mode: "placeholder",
			};
}

// Characters share the object/NPC resolver, cache, transform, and fallback
// rules. Keeping this seam distinct makes future animation presentation data
// possible without introducing a second character transform schema.
export function resolveThreeCharacterVisual(
	entity: ThreeCharacterVisualEntity,
): ResolvedThreeVisual {
	const visual = resolveThreeVisual(entity);
	if (
		entity.kind !== "player" ||
		visual.mode !== "asset" ||
		visual.asset.category === "character"
	) {
		return visual;
	}
	const { asset: _asset, ...fallback } = visual;
	return { ...fallback, mode: "placeholder" };
}

export function threeVisualRotationOffsetToRadians(
	visual: Pick<ResolvedThreeVisual, "rotationOffset"> | undefined,
): number {
	return (
		((visual?.rotationOffset ?? DEFAULT_THREE_VISUAL_ROTATION_OFFSET) *
			Math.PI) /
		180
	);
}

// Transform order is fixed for editor and runtime parity:
// cached model bounds normalisation -> registry defaults -> authored overrides
// -> marker placement -> terrain surface sampling (when the marker is created).
export function resolveThreeVisualAssetTransform(
	visual:
		| Pick<ResolvedThreeVisual, "heightOffset" | "rotationOffset" | "scale">
		| undefined,
	analysis: Pick<ThreeVisualAssetAnalysis, "bounds"> | undefined,
): ResolvedThreeVisualAssetTransform {
	return {
		heightOffset: visual?.heightOffset ?? DEFAULT_THREE_VISUAL_HEIGHT_OFFSET,
		normalizationOffsetY: -(analysis?.bounds.minY ?? 0),
		rotationYRadians: threeVisualRotationOffsetToRadians(visual),
		scale: visual?.scale ?? DEFAULT_THREE_VISUAL_SCALE,
	};
}

export function composeThreeVisualYaw(
	baseYawRadians: number,
	visual: Pick<ResolvedThreeVisual, "rotationOffset"> | undefined,
): number {
	return baseYawRadians + threeVisualRotationOffsetToRadians(visual);
}
