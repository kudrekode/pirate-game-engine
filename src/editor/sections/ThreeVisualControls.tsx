import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
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
	inferredPlaceholderType: ThreePlaceholderVisualType;
	onChange: (visual: ThreeVisualConfig) => void;
	value?: ThreeVisualConfig;
};

export function ThreeVisualControls({
	inferredPlaceholderType,
	onChange,
	value,
}: ThreeVisualControlsProps) {
	const assets = listThreeVisualAssets();
	const mode = value?.mode === "asset" ? "asset" : "placeholder";
	const assetId =
		typeof value?.assetId === "string" && value.assetId.trim()
			? value.assetId
			: "";
	const resolvedAsset = getThreeVisualAssetDefinition(assetId);
	const hasUnresolvedAsset = Boolean(assetId && !resolvedAsset);

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
					value={value?.scale ?? 1}
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
					value={value?.heightOffset ?? 0}
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
					value={value?.rotationOffset ?? 0}
				/>
			</label>
		</>
	);

	return (
		<>
			<div className="panel-title secondary">3D Visual</div>
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
					No built-in 3D assets are registered.
				</p>
			) : null}
			{mode === "asset" && hasUnresolvedAsset ? (
				<p className="validation-message">
					Asset "{assetId}" is not registered. The 3D preview will use the
					placeholder fallback until a valid asset is chosen.
				</p>
			) : null}
			{mode === "asset" && !assetId && assets.length > 0 ? (
				<p className="validation-message">
					No asset selected. The 3D preview will use the placeholder fallback
					until an asset is chosen.
				</p>
			) : null}
		</>
	);
}
