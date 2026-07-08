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
through the normal startup chooser, opens the Map Workspace `3D View`, then opens
Play mode and selects `Play 3D Experimental`.

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

The snapshot includes frame/FPS data, worst frame time, hitch counts, renderer
draw calls and triangles, scene rebuild counts and reasons, asset status counts,
terrain rebuild data, and runtime tick/render timing.

## Assertions

V1 intentionally keeps assertions conservative:

- fail if the main app cannot load
- fail if either Three surface cannot mount
- fail on uncaught page errors
- fail if required snapshots are missing or record no frames/FPS

Console warnings, console errors, and asset/network failures are reported in
artifacts but are not broad failure gates yet.

Future optimisation work can compare snapshots from this harness before and
after changes, then promote stable checks such as idle scene rebuild counts,
stuck loading assets, repeated missing asset requests, or large post-settle
hitches into explicit thresholds.
