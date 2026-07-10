# Playwright Browser Smoke

This repo has an opt-in Playwright smoke harness for the Three.js editor preview and experimental 3D runtime. It is diagnostic infrastructure only; it is not a gameplay E2E suite or a performance gate.

`npm run ci` does not include Playwright. Run the browser smoke explicitly when a task changes browser-mounted Three rendering, imported assets, diagnostics, screenshots, or performance-sensitive code.

## Run

Install the Chromium browser once if Playwright reports that it is missing:

```bash
npx playwright install chromium
```

Run the Three performance smoke:

```bash
npm run test:e2e:three-perf
```

Useful variants:

```bash
npm run test:e2e
npm run test:e2e:headed
```

## Benchmark Scene

The harness uses a deterministic benchmark:

- Project: `Demo Adventure`
- Area id/name: `area_main` / `Main Area`
- Editor surface: Map Workspace `3D View`
- Runtime surface: `Play 3D Experimental`
- Required imported assets: `pirate-chest`, `pirate-small-ship`

The smoke starts or reuses the Vite dev server, opens Chromium, clears `localStorage` and `sessionStorage` before app boot, chooses the Demo Project through the normal startup chooser, selects the pirate demo `Main Area`, opens the editor 3D view, then opens Play mode and selects `Play 3D Experimental`.

It waits for the real pirate benchmark scene before sampling. It fails if either Three surface is still on the blank demo area, has too few scene entities, has active GLB loads still pending, or is missing the required imported pirate assets.

## Captured Artifacts

Artifacts are written to:

```text
test-results/perf/
```

Key files:

- `summary.json`
- `console.json`
- `network-failures.json`
- `three-editor-snapshot.json`
- `three-runtime-collapsed-snapshot.json`
- `three-runtime-snapshot.json`
- `three-runtime-after-move-snapshot.json`
- `three-editor.png`
- `three-runtime.png`

The harness captures:

- console warnings and errors
- uncaught page errors
- failed requests and non-OK local asset responses
- editor/runtime Three performance snapshots as JSON
- editor/runtime screenshots

## Perf Snapshots

Snapshots are read from `window.__THREE_PERF_DIAGNOSTICS__`, a dev/test-only global registered by mounted Three diagnostics objects. Labels include `ThreeDPreview` and `ThreeRuntimePanel`.

Snapshots include:

- scene identity and rebuild reasons
- active imported asset ids, cache hits, clones, loads, failures, fallbacks, and stuck loading counts
- frame/FPS data
- RAF interval timing, separated from `renderer.render` timing
- frame callback, visual update, camera update, water update, runtime tick, and render phase stats
- hitch counts and recent hitches
- renderer draw calls, triangles, geometries, textures, and programs
- terrain mode, tile count, mesh count, water mesh count, and coastline edge count
- RAF loop starts/cancels/restarts

The smoke resets diagnostics sample windows after the scene and imported assets settle. Idle and movement snapshots are read before screenshots so browser screenshot/readback work does not pollute the sample window.

## Assertions

V1 intentionally keeps assertions conservative:

- fail if the main app cannot load
- fail if either Three surface cannot mount
- fail if the benchmark does not use project `Demo Adventure`, area `area_main` / `Main Area`, and the expected imported pirate assets
- fail if imported pirate assets are still loading or missing from active asset diagnostics
- fail if required snapshots are missing or record no frames/FPS
- fail if renderer draw calls or triangles are unavailable
- fail if water/coast diagnostics are absent for the benchmark
- fail on uncaught page errors

Console warnings, console errors, and asset/network failures are captured in artifacts. They are not broad failure gates yet, except for explicit local asset response failures.

## Known Current Artifact Noise

Current pirate assets may log `THREE.GLTFLoader: Couldn't load texture Textures/colormap.png`. Current screenshots can also trigger WebGL `ReadPixels` performance warnings. These are captured for diagnosis and should be mentioned when relevant, but they are not currently fail conditions.

Future optimisation work can compare snapshots before and after changes, then promote stable checks such as idle scene rebuild counts, stuck loading assets, repeated missing asset requests, or large post-settle hitches into explicit thresholds.
