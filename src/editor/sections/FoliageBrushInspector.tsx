import { useState } from "react";
import { Button, Input, NativeSelect } from "@/components/ui/control";
import {
	FOLIAGE_BRUSH_LIMITS,
	FOLIAGE_PALETTE_LIMIT,
} from "../../data/foliageBrushSettings";
import type { FoliageBrushSettings } from "../../types/game";
import "./foliageBrushInspector.css";

export type FoliageBrushMode = "paint" | "erase";

type FoliageAssetOption = { id: string; name: string };

type FoliageBrushInspectorProps = {
	settings: FoliageBrushSettings;
	onChange: (settings: FoliageBrushSettings) => void;
	mode: FoliageBrushMode;
	onModeChange: (mode: FoliageBrushMode) => void;
	assets: readonly FoliageAssetOption[];
};

type NumberFieldProps = {
	label: string;
	inputLabel?: string;
	unit?: string;
	value: number;
	range: readonly [number, number];
	step: number;
	onChange: (next: number) => void;
};

function NumberField({
	label,
	inputLabel = label,
	unit,
	value,
	range,
	step,
	onChange,
}: NumberFieldProps) {
	const [draft, setDraft] = useState<string>();
	return (
		<label className="map-foliage-field">
			<span>
				{label}
				{unit && <small> {unit}</small>}
			</span>
			<Input
				aria-label={inputLabel}
				type="number"
				min={range[0]}
				max={range[1]}
				step={step}
				value={draft ?? value}
				onChange={(event) => setDraft(event.currentTarget.value)}
				onBlur={(event) => {
					const number = event.currentTarget.valueAsNumber;
					setDraft(undefined);
					if (!Number.isFinite(number)) {
						return;
					}
					const next = Math.min(range[1], Math.max(range[0], number));
					if (next !== value) {
						onChange(next);
					}
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						event.currentTarget.blur();
					}
				}}
			/>
		</label>
	);
}

export function FoliageBrushInspector({
	settings,
	onChange,
	mode,
	onModeChange,
	assets,
}: FoliageBrushInspectorProps) {
	const { palette } = settings;
	const assetNames = new Map(assets.map((asset) => [asset.id, asset.name]));
	const activeIds = new Set(palette.map((entry) => entry.assetId));
	const nextAsset = assets.find((asset) => !activeIds.has(asset.id));
	const limits = FOLIAGE_BRUSH_LIMITS;
	function update(patch: Partial<FoliageBrushSettings>) {
		onChange({ ...settings, ...patch });
	}
	function updateEntry(id: string, patch: Partial<(typeof palette)[number]>) {
		update({
			palette: palette.map((entry) =>
				entry.assetId === id ? { ...entry, ...patch } : entry,
			),
		});
	}
	return (
		<div className="map-foliage-controls">
			<fieldset className="map-foliage-mode" aria-label="Foliage mode">
				<Button
					type="button"
					aria-pressed={mode === "paint"}
					onClick={() => onModeChange("paint")}
				>
					Paint
				</Button>
				<Button
					type="button"
					aria-pressed={mode === "erase"}
					onClick={() => onModeChange("erase")}
				>
					Erase
				</Button>
			</fieldset>
			<NumberField
				label="Brush radius"
				unit="tiles"
				value={settings.radius}
				range={limits.radius}
				step={0.25}
				onChange={(radius) => update({ radius })}
			/>
			{mode === "erase" ? (
				<p>Drag across scattered foliage to erase it.</p>
			) : (
				<>
					<section className="map-foliage-palette" aria-label="Asset mixture">
						<h4>Asset mixture</h4>
						{palette.map(({ assetId, weight }) => {
							const name = assetNames.get(assetId) ?? assetId;
							return (
								<div className="map-foliage-asset-row" key={assetId}>
									<label className="map-foliage-field">
										<span>Asset</span>
										<NativeSelect
											aria-label={`Foliage asset ${name}`}
											value={assetId}
											onChange={(event) =>
												updateEntry(assetId, { assetId: event.target.value })
											}
										>
											{!assetNames.has(assetId) && (
												<option value={assetId}>{name} (missing)</option>
											)}
											{assets.map((asset) => (
												<option
													key={asset.id}
													value={asset.id}
													disabled={
														asset.id !== assetId && activeIds.has(asset.id)
													}
												>
													{asset.name}
												</option>
											))}
										</NativeSelect>
									</label>
									<NumberField
										label="Weight"
										inputLabel={`Weight for ${name}`}
										value={weight}
										range={limits.weight}
										step={0.25}
										onChange={(next) => updateEntry(assetId, { weight: next })}
									/>
									<Button
										type="button"
										aria-label={`Remove ${name} from mixture`}
										title={`Remove ${name}`}
										onClick={() =>
											update({
												palette: palette.filter(
													(entry) => entry.assetId !== assetId,
												),
											})
										}
									>
										×
									</Button>
								</div>
							);
						})}
						<Button
							type="button"
							disabled={!nextAsset || palette.length >= FOLIAGE_PALETTE_LIMIT}
							onClick={() => {
								if (nextAsset) {
									update({
										palette: [...palette, { assetId: nextAsset.id, weight: 1 }],
									});
								}
							}}
						>
							Add asset
						</Button>
						{!palette.some(
							({ assetId, weight }) => weight > 0 && assetNames.has(assetId),
						) && <p>Add an available asset with a positive weight to paint.</p>}
					</section>
					<section aria-label="Scatter settings">
						<h4>Scatter settings</h4>
						<div className="map-foliage-fields">
							<NumberField
								label="Density"
								value={settings.density}
								range={limits.density}
								step={0.05}
								onChange={(density) => update({ density })}
							/>
							<NumberField
								label="Brush spacing"
								unit="tiles"
								value={settings.spacing}
								range={limits.spacing}
								step={0.05}
								onChange={(spacing) => update({ spacing })}
							/>
							<NumberField
								label="Seed"
								value={settings.seed}
								range={limits.seed}
								step={1}
								onChange={(seed) => update({ seed: Math.round(seed) })}
							/>
						</div>
					</section>
					<section aria-label="Variation">
						<h4>Variation</h4>
						<div className="map-foliage-fields">
							<NumberField
								label="Minimum scale"
								value={settings.minScale}
								range={limits.scale}
								step={0.05}
								onChange={(minScale) =>
									update({
										minScale,
										maxScale: Math.max(minScale, settings.maxScale),
									})
								}
							/>
							<NumberField
								label="Maximum scale"
								value={settings.maxScale}
								range={limits.scale}
								step={0.05}
								onChange={(maxScale) =>
									update({
										maxScale,
										minScale: Math.min(maxScale, settings.minScale),
									})
								}
							/>
							<NumberField
								label="Rotation variation"
								unit="±°"
								value={settings.rotationVariation}
								range={limits.rotationVariation}
								step={5}
								onChange={(rotationVariation) => update({ rotationVariation })}
							/>
						</div>
					</section>
					<section aria-label="Terrain exclusions">
						<h4>Terrain exclusions</h4>
						<div className="map-foliage-fields">
							<NumberField
								label="Minimum elevation"
								unit="m"
								value={settings.minHeight}
								range={limits.height}
								step={0.25}
								onChange={(minHeight) =>
									update({
										minHeight,
										maxHeight: Math.max(minHeight, settings.maxHeight),
									})
								}
							/>
							<NumberField
								label="Maximum elevation"
								unit="m"
								value={settings.maxHeight}
								range={limits.height}
								step={0.25}
								onChange={(maxHeight) =>
									update({
										maxHeight,
										minHeight: Math.min(maxHeight, settings.minHeight),
									})
								}
							/>
							<NumberField
								label="Max slope"
								unit="°"
								value={settings.maxSlope}
								range={limits.maxSlope}
								step={1}
								onChange={(maxSlope) => update({ maxSlope })}
							/>
						</div>
						<label className="map-foliage-mask">
							<Input
								type="checkbox"
								checked={settings.excludeWater}
								onChange={(event) =>
									update({ excludeWater: event.target.checked })
								}
							/>
							Exclude water
						</label>
						<label className="map-foliage-mask">
							<Input
								type="checkbox"
								checked={settings.excludeRoads}
								onChange={(event) =>
									update({ excludeRoads: event.target.checked })
								}
							/>
							Exclude roads
						</label>
					</section>
				</>
			)}
		</div>
	);
}
