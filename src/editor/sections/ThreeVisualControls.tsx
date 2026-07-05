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
	const updateVisual = (patch: Partial<ThreeVisualConfig>) => {
		onChange({
			...value,
			mode: value?.mode ?? "placeholder",
			...patch,
		});
	};

	return (
		<>
			<div className="panel-title secondary">3D Visual</div>
			<div className="form-grid compact">
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
			</div>
		</>
	);
}
