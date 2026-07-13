import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
	type ThreeVisualAssetCategory,
} from "../../runtime/three/threeVisualAssetRegistry";
import {
	clampThreeVisualHeightOffset,
	clampThreeVisualRotationOffset,
	clampThreeVisualScale,
	THREE_PLACEHOLDER_VISUAL_OPTIONS,
} from "../../runtime/three/threeVisuals";
import type {
	ThreePlaceholderVisualType,
	ThreeVisualConfig,
} from "../../types/game";

type ThreeVisualControlsProps = {
	assetCategories?: ThreeVisualAssetCategory[];
	inferredPlaceholderType: ThreePlaceholderVisualType;
	onChange: (visual: ThreeVisualConfig) => void;
	title?: string;
	value?: ThreeVisualConfig;
};

export function ThreeVisualControls({
	assetCategories,
	inferredPlaceholderType,
	onChange,
	title = "3D Visual",
	value,
}: ThreeVisualControlsProps) {
	const assets = listThreeVisualAssets().filter(
		(asset) =>
			asset.animationOnly !== true &&
			(!assetCategories ||
				(asset.category !== undefined &&
					assetCategories.includes(asset.category))),
	);
	const mode = value?.mode === "asset" ? "asset" : "placeholder";
	const assetId =
		typeof value?.assetId === "string" && value.assetId.trim()
			? value.assetId
			: "";
	const registeredAsset = getThreeVisualAssetDefinition(assetId);
	const resolvedAsset = assets.find((asset) => asset.id === assetId);
	const hasUnresolvedAsset = Boolean(assetId && !resolvedAsset);
	const assetTransformDefaults = mode === "asset" ? resolvedAsset : undefined;
	const scale =
		value?.scale ?? clampThreeVisualScale(assetTransformDefaults?.defaultScale);
	const heightOffset =
		value?.heightOffset ??
		clampThreeVisualHeightOffset(assetTransformDefaults?.defaultHeightOffset);
	const rotationOffset =
		value?.rotationOffset ??
		clampThreeVisualRotationOffset(
			assetTransformDefaults?.defaultRotationOffset,
		);

	const updateVisual = (patch: Partial<ThreeVisualConfig>) => {
		onChange({
			...value,
			mode,
			...patch,
		});
	};
	const updateMode = (nextMode: ThreeVisualConfig["mode"]) => {
		if (nextMode === "asset") {
			const nextVisual: ThreeVisualConfig = {
				...value,
				mode: "asset",
			};
			const nextAssetId = assetId || assets[0]?.id;
			if (nextAssetId) {
				nextVisual.assetId = nextAssetId;
			}
			onChange(nextVisual);
			return;
		}

		onChange({
			...value,
			mode: "placeholder",
		});
	};
	const renderTransformControls = () => (
		<>
			<label>
				Scale
				<input
					max={5}
					min={0.1}
					onChange={(event) =>
						updateVisual({
							scale: clampThreeVisualScale(Number(event.target.value)),
						})
					}
					step={0.1}
					type="number"
					value={scale}
				/>
			</label>
			<label>
				Height offset
				<input
					max={5}
					min={-5}
					onChange={(event) =>
						updateVisual({
							heightOffset: clampThreeVisualHeightOffset(
								Number(event.target.value),
							),
						})
					}
					step={0.1}
					type="number"
					value={heightOffset}
				/>
			</label>
			<label>
				Rotation offset
				<input
					max={360}
					min={-360}
					onChange={(event) =>
						updateVisual({
							rotationOffset: clampThreeVisualRotationOffset(
								Number(event.target.value),
							),
						})
					}
					step={1}
					type="number"
					value={rotationOffset}
				/>
			</label>
		</>
	);

	return (
		<>
			<div className="panel-title secondary">{title}</div>
			<div className="form-grid compact">
				<label>
					Visual source
					<select
						onChange={(event) =>
							updateMode(event.target.value as ThreeVisualConfig["mode"])
						}
						value={mode}
					>
						<option value="placeholder">Placeholder</option>
						<option value="asset">Asset</option>
					</select>
				</label>
			</div>
			<div className="form-grid compact">
				{mode === "placeholder" ? (
					<label>
						Placeholder type
						<select
							onChange={(event) =>
								updateVisual({
									placeholderType: event.target
										.value as ThreePlaceholderVisualType,
								})
							}
							value={value?.placeholderType ?? inferredPlaceholderType}
						>
							{THREE_PLACEHOLDER_VISUAL_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				) : (
					<label>
						Asset
						<select
							disabled={assets.length === 0}
							onChange={(event) =>
								updateVisual({
									assetId: event.target.value,
									mode: "asset",
								})
							}
							value={assetId}
						>
							{assetId ? null : <option value="">Choose asset</option>}
							{hasUnresolvedAsset ? (
								<option value={assetId}>Missing asset: {assetId}</option>
							) : null}
							{assets.map((asset) => (
								<option key={asset.id} value={asset.id}>
									{asset.name}
								</option>
							))}
						</select>
					</label>
				)}
				{renderTransformControls()}
			</div>
			{mode === "asset" && assets.length === 0 ? (
				<p className="empty-state compact">
					No matching built-in 3D assets are registered.
				</p>
			) : null}
			{mode === "asset" && hasUnresolvedAsset ? (
				<p className="validation-message">
					Asset "{assetId}" is{" "}
					{registeredAsset ? "not available for this visual" : "not registered"}
					. The 3D preview will use the placeholder fallback until a valid asset
					is chosen.
				</p>
			) : null}
			{mode === "asset" && !assetId && assets.length > 0 ? (
				<p className="validation-message">
					No asset selected. The 3D preview will use the placeholder fallback
					until an asset is chosen.
				</p>
			) : null}
			{mode === "asset" && resolvedAsset ? (
				<p className="empty-state compact">
					{resolvedAsset.name} · {resolvedAsset.category ?? "asset"}
					{resolvedAsset.tags?.length
						? ` · ${resolvedAsset.tags.join(", ")}`
						: ""}
				</p>
			) : null}
		</>
	);
}
