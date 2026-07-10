# Playwright Browser Smoke

This repo has an opt-in Playwright smoke harness for the Three.js editor preview
and experimental 3D runtime. It is diagnostic infrastructure only; it is not a
gameplay E2E suite or a performance gate.

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

`npm run ci` does not include Playwright. The browser smoke is explicit so CI
does not become dependent on local browser binaries or non-deterministic browser
performance.

## What It Does

The smoke starts or reuses the Vite dev server, opens Chromium, clears
`localStorage` and `sessionStorage` before app boot, chooses the Demo Project
through the normal startup chooser, selects the `Main Area` pirate demo map,
opens the Map Workspace `3D View`, then opens Play mode and selects
`Play 3D Experimental`.

The harness waits for the real pirate benchmark scene before sampling. It fails
if either Three surface is still on the blank demo area, has too few scene
entities, has active GLB loads still pending, or is missing the imported
`pirate-chest` and `pirate-small-ship` assets. The editor preview currently
expects at least 13 rendered entities because gameplay overlay filters hide
non-spawn event blocks by default; runtime expects at least 16 entities,
including the player.

It captures:

- console warnings and errors
- uncaught page errors
- failed requests and non-OK local asset responses
- Three performance snapshots as JSON
- editor and runtime screenshots

Artifacts are written to:

```text
test-results/perf/
```

Key files:

- `three-editor.png`
- `three-runtime.png`
- `console.json`
- `network-failures.json`
- `three-editor-snapshot.json`
- `three-runtime-snapshot.json`
- `three-runtime-after-move-snapshot.json`
- `summary.json`

## Perf Snapshots

Snapshots are read from `window.__THREE_PERF_DIAGNOSTICS__`, a dev/test-only
global registered by mounted Three diagnostics objects. It returns serialisable
JSON for labels such as `ThreeDPreview` and `ThreeRuntimePanel`.

The snapshot includes scene identity, active imported asset ids, frame/FPS data,
RAF interval timing, hitch counts, renderer draw calls and triangles, scene
rebuild counts and reasons, asset status counts, terrain rebuild data, and
runtime tick, visual update, camera update, and render timing.

The Playwright smoke resets the diagnostics sample window after the scene and
imported assets settle. Idle and movement performance snapshots are read before
screenshots are taken so browser screenshot/readback work does not pollute the
sample window.

## Assertions

V1 intentionally keeps assertions conservative:

- fail if the main app cannot load
- fail if either Three surface cannot mount
- fail if the pirate benchmark does not use project `Demo Adventure`, area
  `area_main` / `Main Area`, and the expected imported pirate assets
- fail on uncaught page errors
- fail if required snapshots are missing or record no frames/FPS

Console warnings, console errors, and asset/network failures are reported in
artifacts but are not broad failure gates yet.

Future optimisation work can compare snapshots from this harness before and
after changes, then promote stable checks such as idle scene rebuild counts,
stuck loading assets, repeated missing asset requests, or large post-settle
hitches into explicit thresholds.
