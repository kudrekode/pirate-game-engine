# Validation Optimisation Result — Phase 1

4 October 2026. Only validation configuration, browser harnesses and documentation
changed; no production gameplay, assets, schemas or large components changed.

## Changes

- Root Vitest now uses disjoint Node/DOM projects and loads each workspace's own
  config. **62 files use Node; 9 use jsdom**. All existing assertions remain.
  Single-worker file isolation, React cleanup, storage clearing and existing
  state-reset hooks are retained.
- CI now validates root, Asset Studio, character/compiler contracts, shared Three
  preview, and cheap compiler/API/provenance/installed-GLB checks. No browser or
  Blender rebuild is required. CI uses Node 22.
- Standalone builds still typecheck; CI no longer separately repeats the root
  typecheck. Workspace tests have one owner and execute once in the CI command.
- AGENTS.md is now a short routing guide. Existing README, Asset Studio resume
  and Playwright guide explain focused commands and validation cost.
- Added targeted browser selections; retained all Studio real-compiler/visual cases.
  Split transient animation acceptance from performance sampling and preserved
  failure artifacts. No sleeps or production changes were added to make walking pass.

## Comparable benchmark

Same checkout/machine, Windows, Node 22.12.0, npm 10.9.0, Vitest 4.1.7; one worker,
isolated files. Both measurements execute `npm run test:run` (after: inside CI).
No browser/compiler workload ran concurrently with either measured test run.

| Vitest metric | Before | After |
| --- | ---: | ---: |
| Files discovered / passed | 71 / 71 | 71 / 71 |
| Tests discovered / passed | 571 / 571 | 571 / 571 |
| Total duration | 138.14 s | 78.31 s |
| Environment | 61.98 s | 8.40 s |
| Setup | 13.54 s | 1.53 s |
| Import | 9.58 s | 12.49 s |
| Test execution | 41.35 s | 44.33 s |

**59.83 seconds saved (43.3%)** in this single paired measurement, not a universal
CI-speed guarantee. Studio's DOM setup now counts under import because its UI test
imports it explicitly. The audit's older 247.34 s run is historical context only.

Final discovery matched all 571 test identities/owners after a config correction:
root Node 397, root DOM 125, Studio 20, character contract 15, compiler contract 4,
shared preview 10. No file belongs to two owners.

## CI coverage and validation outcome

Before: root types/build plus 571 Vitest tests under root jsdom settings;
workspace types/builds and Node tests omitted. Separate Studio checking repeated
39 already-discovered tests.

After: the same 571 tests under their intended owners, type-safe builds for both
apps, all three package typechecks, and **40 passing Node tests** (32 compiler/
asset tests plus 8 retarget/provenance tests). Thus routine CI covers 611 unique
test cases without installing Blender or Chromium.

Ran `npm run ci` once. Root tests/build and package typechecks passed; Studio
caught a redundant `node:url` config import without installed Node declarations.
Removed it: Vitest already sets workspace roots. Verified unchanged discovery,
reran the affected workspace owners (**49/49**, 8.10 s), and completed Studio
types/build and Node checks (**40/40**, 4.81 s). The complete CI chain was not
repeated after this correction; passed root stages were preserved.
`git diff --check` passed. Builds retain existing large-chunk warnings.

## Walk smoke and browser evidence

The old smoke polled only after input for a 216 ms walk state, never checked
position, and aborted later sampling on timeout. This is structurally unreliable;
historical idle snapshots do not prove a gameplay bug.

The new separate smoke observes each rendered frame before input, verifies the
real move from (2,2) to clear grass at (2,1), checks walk/idle/attack states and
existing mixer/source/timing invariants, and persists observation/HUD evidence.
Both changed cases passed: performance **44.4 s**, initial animation **24.4 s**.
After adding persisted evidence and restoring per-state metric assertions, only
animation was rerun: **20.5 s**, zero page errors, 22 movement-observation frames
including walk and 34 attack-observation frames including attack. Product code
is unchanged; the precise cause of every historical failure remains unproven.

Performance artifacts have zero gate failures and seven existing missing
`Textures/colormap.png` messages. No full browser sweep or Blender matrix ran.
A PowerShell argument-forwarding issue accidentally started the fixture preview
during selection inspection; it was stopped before any compiler case. Use
`npm.cmd`/`npx.cmd` on Windows when forwarding flags. Direct listing verified
the Studio inventory and compile/hair selectors.

Local evidence is under `test-results/validation-*.log`,
`test-results/validation-discovery*.json`, `test-results/perf/`, and the
Playwright animation test's `animation-observation.json`.

## Future commands and deferred work

- Iterate: `npm run test:run -- <affected test file>`; select an owner with
  `--project root-node`, `root-dom`, `asset-studio` or the package name.
- Cheap compiler checks: `npm run test:compiler` or a single `node --test` file.
- Final gate: `npm run ci`, then `git diff --check`.
- Browser/visual/performance/compiler selection: use the
  [existing routing guide](docs/PLAYWRIGHT_SMOKE.md), not broad suites by default.

Remaining cost: React/component execution, worker/import startup, large builds
and public asset copies; real compile galleries still rebuild multiple artifacts.
Deferred: parallelism tuning, compiler/gallery conversion and artifact reuse,
adapter correctness/recovery work, asset packaging and all component refactors.
Phase 1 stops here.
