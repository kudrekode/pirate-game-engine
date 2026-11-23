import { Input, NativeSelect, RangeInput } from "@/components/ui/control";
import { terrainPresets } from "../../data/mapVisuals";
import {
	MAX_TERRAIN_HEIGHT,
	MIN_TERRAIN_HEIGHT,
	TERRAIN_WATER_SURFACE_OFFSET,
} from "../../data/terrainHeight";
import type { MapTerrainTool } from "./MapWorkspacePanels";
import type { TerrainBrushFalloff, TerrainBrushShape } from "./terrainBrush";

export type MapBrushSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type MapBrushGesture = "brush" | "line" | "rectangle" | "fill";
export type MapBrushMask = "all" | "land" | "water";
export type WaterBrushAction = "paint" | "restore" | "elevation";

export function MapBrushInspector({
	tool,
	waterAction,
	onWaterActionChange,
	size,
	onSizeChange,
	shape,
	onShapeChange,
	gesture,
	onGestureChange,
	strength,
	onStrengthChange,
	falloff,
	onFalloffChange,
	height,
	onHeightChange,
	material,
	onMaterialChange,
	mask,
	onMaskChange,
}: {
	tool: MapTerrainTool;
	waterAction?: WaterBrushAction;
	onWaterActionChange: (action: WaterBrushAction) => void;
	size: MapBrushSize;
	onSizeChange: (size: MapBrushSize) => void;
	shape: TerrainBrushShape;
	onShapeChange: (shape: TerrainBrushShape) => void;
	gesture: MapBrushGesture;
	onGestureChange: (gesture: MapBrushGesture) => void;
	strength: number;
	onStrengthChange: (strength: number) => void;
	falloff: TerrainBrushFalloff;
	onFalloffChange: (falloff: TerrainBrushFalloff) => void;
	height: number;
	onHeightChange: (height: number) => void;
	material: string;
	onMaterialChange: (material: string) => void;
	mask: MapBrushMask;
	onMaskChange: (mask: MapBrushMask) => void;
}) {
	const adjustableStrength =
		!waterAction && ["raise", "lower", "smooth", "roughen"].includes(tool);
	const showMaterial =
		waterAction === "restore" || (!waterAction && tool === "paint");
	const showHeight =
		waterAction === "elevation" || (!waterAction && tool === "flatten");
	return (
		<div className="map-context-fields">
			{waterAction && (
				<label>
					Water brush action
					<NativeSelect
						value={waterAction}
						onChange={(event) =>
							onWaterActionChange(event.target.value as WaterBrushAction)
						}
					>
						<option value="paint">Paint water</option>
						<option value="restore">Restore land</option>
						<option value="elevation">Set water elevation</option>
					</NativeSelect>
				</label>
			)}
			<label>
				Brush gesture
				<NativeSelect
					value={gesture}
					onChange={(event) =>
						onGestureChange(event.target.value as MapBrushGesture)
					}
				>
					<option value="brush">Stroke</option>
					<option value="line">Line</option>
					<option value="rectangle">Rectangle</option>
					{!waterAction && tool === "paint" && (
						<option value="fill">Fill matching terrain</option>
					)}
				</NativeSelect>
			</label>
			{gesture === "brush" && (
				<>
					<label>
						Brush diameter <span>{size} tiles</span>
						<RangeInput
							min={1}
							max={8}
							step={1}
							value={size}
							onChange={(event) =>
								onSizeChange(event.target.valueAsNumber as MapBrushSize)
							}
						/>
					</label>
					<label>
						Footprint
						<NativeSelect
							value={shape}
							onChange={(event) =>
								onShapeChange(event.target.value as TerrainBrushShape)
							}
						>
							<option value="circle">Circle</option>
							<option value="square">Square</option>
						</NativeSelect>
					</label>
				</>
			)}
			{adjustableStrength && (
				<>
					<label>
						Strength <span>{strength}</span>
						<RangeInput
							min={1}
							max={4}
							step={1}
							value={strength}
							onChange={(event) => onStrengthChange(event.target.valueAsNumber)}
						/>
					</label>
					{gesture === "brush" && (
						<label>
							Falloff
							<NativeSelect
								value={falloff}
								onChange={(event) =>
									onFalloffChange(event.target.value as TerrainBrushFalloff)
								}
							>
								<option value="hard">Hard</option>
								<option value="linear">Linear</option>
								<option value="smooth">Smooth</option>
							</NativeSelect>
						</label>
					)}
				</>
			)}
			{showMaterial && (
				<label>
					{waterAction ? "Shore material" : "Terrain material"}
					<NativeSelect
						value={material}
						onChange={(event) => onMaterialChange(event.target.value)}
					>
						{terrainPresets
							.filter((tile) => !waterAction || tile.id !== "water")
							.map((tile) => (
								<option key={tile.id} value={tile.id}>
									{tile.label}
								</option>
							))}
					</NativeSelect>
				</label>
			)}
			{showHeight && (
				<label>
					{waterAction ? "Water level offset" : "Target height"}
					<Input
						type="number"
						min={MIN_TERRAIN_HEIGHT}
						max={MAX_TERRAIN_HEIGHT}
						step={1}
						value={height}
						onChange={(event) => {
							if (Number.isFinite(event.target.valueAsNumber))
								onHeightChange(
									Math.max(
										MIN_TERRAIN_HEIGHT,
										Math.min(MAX_TERRAIN_HEIGHT, event.target.valueAsNumber),
									),
								);
						}}
					/>
				</label>
			)}
			{!waterAction && (
				<label>
					Terrain mask
					<NativeSelect
						value={mask}
						onChange={(event) =>
							onMaskChange(event.target.value as MapBrushMask)
						}
					>
						<option value="all">Whole terrain</option>
						<option value="land">Land only</option>
						<option value="water">Water only</option>
					</NativeSelect>
				</label>
			)}
			{waterAction && (
				<p className="map-context-note">
					Water tiles define the shoreline and existing boat routes. The surface
					sits {TERRAIN_WATER_SURFACE_OFFSET} units above the tile level.
				</p>
			)}
			{!waterAction && tool === "smooth" && (
				<p className="map-context-note">
					Smooth samples the surrounding eight tiles. Strength controls how far
					the result moves toward their average.
				</p>
			)}
		</div>
	);
}
