import { useProjectStore } from "../../store/useProjectStore";

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function CameraEditor() {
	const camera = useProjectStore((state) => state.project.camera);
	const updateCamera = useProjectStore((state) => state.updateCamera);
	const threeCamera = camera.three;

	const updateThreeCamera = (patch: Partial<typeof threeCamera>) => {
		updateCamera({
			three: {
				...threeCamera,
				...patch,
			},
		});
	};

	return (
		<section className="editor-panel camera-editor">
			<div className="content-panel camera-settings">
				<div className="panel-title">Play-mode camera</div>
				<p className="helper-text">
					These settings control the Phaser play viewport. The Map tab still
					shows the editable map with its own editor zoom.
				</p>

				<div className="form-grid compact">
					<label>
						Viewport width in tiles
						<input
							min={1}
							onChange={(event) =>
								updateCamera({
									viewportWidthTiles: Math.round(
										clampNumber(Number(event.target.value), 1, 100),
									),
								})
							}
							type="number"
							value={camera.viewportWidthTiles}
						/>
					</label>
					<label>
						Viewport height in tiles
						<input
							min={1}
							onChange={(event) =>
								updateCamera({
									viewportHeightTiles: Math.round(
										clampNumber(Number(event.target.value), 1, 100),
									),
								})
							}
							type="number"
							value={camera.viewportHeightTiles}
						/>
					</label>
				</div>

				<label className="checkbox-row standalone">
					<input
						checked={camera.followPlayer}
						onChange={(event) =>
							updateCamera({ followPlayer: event.target.checked })
						}
						type="checkbox"
					/>
					Follow player
				</label>

				<div className="form-grid compact">
					<label>
						Follow smoothing
						<input
							max={1}
							min={0}
							onChange={(event) =>
								updateCamera({
									followSmoothing: clampNumber(
										Number(event.target.value),
										0,
										1,
									),
								})
							}
							step={0.01}
							type="range"
							value={camera.followSmoothing}
						/>
					</label>
					<label>
						Smoothing value
						<input
							max={1}
							min={0}
							onChange={(event) =>
								updateCamera({
									followSmoothing: clampNumber(
										Number(event.target.value),
										0,
										1,
									),
								})
							}
							step={0.01}
							type="number"
							value={camera.followSmoothing}
						/>
					</label>
				</div>

				<div className="panel-title secondary">Deadzone</div>
				<div className="form-grid compact">
					<label>
						Deadzone width in tiles
						<input
							min={0}
							onChange={(event) =>
								updateCamera({
									deadzoneWidthTiles: Math.round(
										clampNumber(Number(event.target.value), 0, 100),
									),
								})
							}
							type="number"
							value={camera.deadzoneWidthTiles ?? 0}
						/>
					</label>
					<label>
						Deadzone height in tiles
						<input
							min={0}
							onChange={(event) =>
								updateCamera({
									deadzoneHeightTiles: Math.round(
										clampNumber(Number(event.target.value), 0, 100),
									),
								})
							}
							type="number"
							value={camera.deadzoneHeightTiles ?? 0}
						/>
					</label>
				</div>

				<div className="panel-title secondary">3D runtime camera</div>
				<p className="helper-text">
					These settings control Play 3D Experimental follow presentation.
					Inspect mode remains a temporary runtime camera.
				</p>
				<label>
					Follow style
					<select
						onChange={(event) =>
							updateThreeCamera({
								style:
									event.target.value === "thirdPerson"
										? "thirdPerson"
										: "fixedIsometric",
							})
						}
						value={threeCamera.style}
					>
						<option value="fixedIsometric">Fixed / Isometric Follow</option>
						<option value="thirdPerson">Third-Person Follow</option>
					</select>
				</label>
				<div className="form-grid compact">
					<label>
						Distance
						<input
							max={24}
							min={2}
							onChange={(event) =>
								updateThreeCamera({
									distance: clampNumber(Number(event.target.value), 2, 24),
								})
							}
							step={0.1}
							type="number"
							value={threeCamera.distance}
						/>
					</label>
					<label>
						Height
						<input
							max={12}
							min={0}
							onChange={(event) =>
								updateThreeCamera({
									height: clampNumber(Number(event.target.value), 0, 12),
								})
							}
							step={0.1}
							type="number"
							value={threeCamera.height}
						/>
					</label>
					<label>
						Pitch degrees
						<input
							max={75}
							min={-10}
							onChange={(event) =>
								updateThreeCamera({
									pitchDegrees: clampNumber(
										Number(event.target.value),
										-10,
										75,
									),
								})
							}
							step={1}
							type="number"
							value={threeCamera.pitchDegrees}
						/>
					</label>
					<label>
						Yaw offset degrees
						<input
							max={180}
							min={-180}
							onChange={(event) =>
								updateThreeCamera({
									yawOffsetDegrees: clampNumber(
										Number(event.target.value),
										-180,
										180,
									),
								})
							}
							step={1}
							type="number"
							value={threeCamera.yawOffsetDegrees}
						/>
					</label>
					<label>
						Look height
						<input
							max={4}
							min={-1}
							onChange={(event) =>
								updateThreeCamera({
									lookAtHeight: clampNumber(Number(event.target.value), -1, 4),
								})
							}
							step={0.1}
							type="number"
							value={threeCamera.lookAtHeight}
						/>
					</label>
					<label>
						3D follow smoothing
						<input
							max={30}
							min={1}
							onChange={(event) =>
								updateThreeCamera({
									followSmoothing: clampNumber(
										Number(event.target.value),
										1,
										30,
									),
								})
							}
							step={1}
							type="number"
							value={threeCamera.followSmoothing}
						/>
					</label>
					<label>
						3D look smoothing
						<input
							max={30}
							min={1}
							onChange={(event) =>
								updateThreeCamera({
									lookSmoothing: clampNumber(Number(event.target.value), 1, 30),
								})
							}
							step={1}
							type="number"
							value={threeCamera.lookSmoothing}
						/>
					</label>
				</div>
				<label className="checkbox-row standalone">
					<input
						checked={threeCamera.allowRuntimeOrbit}
						onChange={(event) =>
							updateThreeCamera({ allowRuntimeOrbit: event.target.checked })
						}
						type="checkbox"
					/>
					Allow runtime orbit in third-person follow
				</label>
			</div>

			<aside className="inspector-panel">
				<div className="panel-title">Current viewport</div>
				<div className="camera-readout">
					<strong>
						{camera.viewportWidthTiles} x {camera.viewportHeightTiles} tiles
					</strong>
					<span>Follow: {camera.followPlayer ? "on" : "off"}</span>
					<span>Smoothing: {camera.followSmoothing.toFixed(2)}</span>
					<span>
						3D:{" "}
						{threeCamera.style === "thirdPerson"
							? "third-person"
							: "fixed/isometric"}
					</span>
				</div>
			</aside>
		</section>
	);
}
