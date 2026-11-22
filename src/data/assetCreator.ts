import type {
	AssetCreatorAttachment,
	AssetCreatorCategory,
	AssetCreatorClip,
	AssetCreatorEffect,
	AssetCreatorLibrary,
	AssetCreatorVariant,
	AssetCreatorVector,
} from "../types/game";

export const ASSET_CREATOR_CATEGORIES = [
	"Humans",
	"Animals",
	"Buildings",
	"Foliage",
	"Props",
] as const;
export const ZERO_ASSET_VECTOR: AssetCreatorVector = { x: 0, y: 0, z: 0 };

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function string(value: unknown) {
	return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number, min: number, max: number) {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(min, Math.min(max, value))
		: fallback;
}

function color(value: unknown) {
	return typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value)
		? value
		: undefined;
}

function vector(value: unknown, limit = 360) {
	const { x, y, z } = record(value);
	return {
		x: number(x, 0, -limit, limit),
		y: number(y, 0, -limit, limit),
		z: number(z, 0, -limit, limit),
	};
}

function rows<T extends { id: string }>(
	value: unknown,
	read: (entry: Record<string, unknown>, id: string) => T | undefined,
): T[] {
	const entries = new Map<string, T>();
	for (const valueEntry of Array.isArray(value) ? value : []) {
		const entry = record(valueEntry);
		const id = string(entry.id).trim();
		if (!id || entries.has(id)) continue;
		const item = read(entry, id);
		if (item) entries.set(id, item);
	}
	return [...entries.values()];
}

export function migrateAssetCreator(value: unknown): AssetCreatorLibrary {
	const source = record(value);
	return {
		variants: rows<AssetCreatorVariant>(source.variants, (entry, id) => {
			const baseAssetId = string(entry.baseAssetId);
			if (!baseAssetId || id === baseAssetId) return;
			const prop = record(entry.attachment);
			const attachment: AssetCreatorAttachment | undefined =
				string(prop.assetId) && string(prop.socket)
					? {
							assetId: string(prop.assetId),
							socket: string(prop.socket),
							position: vector(prop.position, 20),
							rotation: vector(prop.rotation),
							scale: number(prop.scale, 1, 0.01, 10),
						}
					: undefined;
			const tint = color(entry.tint);
			return {
				id,
				baseAssetId,
				name: string(entry.name).trim() || "Asset variant",
				category:
					ASSET_CREATOR_CATEGORIES.find(
						(category) => category === entry.category,
					) ?? "Props",
				description: string(entry.description),
				constraint:
					entry.constraint === "Extended" || entry.constraint === "Custom"
						? entry.constraint
						: "Constrained",
				referenceImages: Array.isArray(entry.referenceImages)
					? entry.referenceImages
							.filter(
								(image): image is string =>
									typeof image === "string" && /^https?:\/\//i.test(image),
							)
							.slice(0, 8)
					: [],
				scale: number(entry.scale, 1, 0.1, 5),
				pose: Object.fromEntries(
					Object.entries(record(entry.pose)).map(([bone, rotation]) => [
						bone,
						vector(rotation),
					]),
				),
				...(tint ? { tint } : {}),
				...(attachment ? { attachment } : {}),
				...(string(entry.forkedFromId)
					? { forkedFromId: string(entry.forkedFromId) }
					: {}),
				...(string(entry.effectId) ? { effectId: string(entry.effectId) } : {}),
			};
		}),
		clips: rows<AssetCreatorClip>(source.clips, (entry, id) => {
			const sourceAssetId = string(entry.sourceAssetId);
			const sourceClipName = string(entry.sourceClipName);
			if (!sourceAssetId || !sourceClipName) return;
			return {
				id,
				sourceAssetId,
				sourceClipName,
				name: string(entry.name).trim() || sourceClipName,
				loop: entry.loop !== false,
				keys: (Array.isArray(entry.keys) ? entry.keys : []).flatMap((value) => {
					const key = record(value);
					const bone = string(key.bone);
					const time = number(key.time, -1, -1, 86400);
					return bone && time >= 0
						? [{ bone, time, rotation: vector(key.rotation) }]
						: [];
				}),
			};
		}),
		effects: rows<AssetCreatorEffect>(source.effects, (entry, id) => {
			if (
				entry.type !== "glow" &&
				entry.type !== "fog" &&
				entry.type !== "embers"
			)
				return;
			const socket = string(entry.socket);
			return {
				id,
				type: entry.type,
				name: string(entry.name).trim() || "Effect",
				color: color(entry.color) ?? "#ffd7a1",
				intensity: number(entry.intensity, 0.65, 0, 1),
				duration: number(entry.duration, 2, 0.1, 60),
				loop: entry.loop !== false,
				...(socket ? { socket } : {}),
			};
		}),
	};
}

export function assetCreatorVariantDraft(
	id: string,
	name: string,
	category: AssetCreatorCategory,
): AssetCreatorVariant {
	return {
		id,
		name,
		baseAssetId: id,
		category,
		description: "",
		constraint: "Constrained",
		referenceImages: [],
		scale: 1,
		pose: {},
	};
}

export function upsertAssetCreatorEntry<T extends { id: string }>(
	entries: T[],
	entry: T,
): T[] {
	return entries.some((item) => item.id === entry.id)
		? entries.map((item) => (item.id === entry.id ? entry : item))
		: [...entries, entry];
}
