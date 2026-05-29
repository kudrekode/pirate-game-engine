import { useProjectStore } from "../../store/useProjectStore";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function CameraEditor() {
  const camera = useProjectStore((state) => state.project.camera);
  const updateCamera = useProjectStore((state) => state.updateCamera);

  return (
    <section className="editor-panel camera-editor">
      <div className="content-panel camera-settings">
        <div className="panel-title">Play-mode camera</div>
        <p className="helper-text">
          These settings control the Phaser play viewport. The Map tab still shows the editable map
          with its own editor zoom.
        </p>

        <div className="form-grid compact">
          <label>
            Viewport width in tiles
            <input
              min={1}
              onChange={(event) =>
                updateCamera({
                  viewportWidthTiles: Math.round(clampNumber(Number(event.target.value), 1, 100)),
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
                  viewportHeightTiles: Math.round(clampNumber(Number(event.target.value), 1, 100)),
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
            onChange={(event) => updateCamera({ followPlayer: event.target.checked })}
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
                  followSmoothing: clampNumber(Number(event.target.value), 0, 1),
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
                  followSmoothing: clampNumber(Number(event.target.value), 0, 1),
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
                  deadzoneWidthTiles: Math.round(clampNumber(Number(event.target.value), 0, 100)),
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
                  deadzoneHeightTiles: Math.round(clampNumber(Number(event.target.value), 0, 100)),
                })
              }
              type="number"
              value={camera.deadzoneHeightTiles ?? 0}
            />
          </label>
        </div>
      </div>

      <aside className="inspector-panel">
        <div className="panel-title">Current viewport</div>
        <div className="camera-readout">
          <strong>
            {camera.viewportWidthTiles} x {camera.viewportHeightTiles} tiles
          </strong>
          <span>Follow: {camera.followPlayer ? "on" : "off"}</span>
          <span>Smoothing: {camera.followSmoothing.toFixed(2)}</span>
        </div>
      </aside>
    </section>
  );
}
