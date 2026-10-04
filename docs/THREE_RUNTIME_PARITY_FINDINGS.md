# Three Runtime Parity Findings

## Current Status

The original parity risk was that Phaser and Three could drift into separate gameplay engines. Current implementation work has moved the Three runtime toward the intended adapter model: the manually tested pirate flow broadly uses shared runtime helpers for gameplay semantics in both runtimes.

Current remaining work is mainly visual/editor/runtime feel:

- Camera polish and framing.
- Model presentation, transform defaults, and broader animation coverage.
- UI polish for runtime panels.
- Broader contract tests for shared helper semantics.
- Reproducible browser/performance observation through the Playwright smoke harness.

Do not treat visual differences as gameplay parity failures unless they change `RuntimeSession` state, shared helper results, authored data, or player-facing game rules.

## Parity Principles

- `RuntimeSession` owns play-session state.
- Shared runtime helpers own gameplay semantics.
- Phaser and Three adapters translate input/events/presentation only.
- Imported GLTF/GLB assets are presentation-only.
- Placeholder meshes, visual transform defaults, water surfaces, coastline strips, terrain smoothing, camera state, and diagnostics are presentation-only.
- Runtime movement remains discrete/cardinal/grid-based unless shared movement helpers deliberately change.

## Reproducible Checks

Use focused helper tests for gameplay semantics. Use `npm run test:e2e:three-perf` when a change affects the browser-mounted Three editor/runtime, imported assets, performance diagnostics, or screenshots.

The Playwright Three perf smoke now verifies the deterministic Demo Adventure benchmark:

- Project: `Demo Adventure`
- Area id/name: `area_main` / `Main Area`
- Imported assets: `pirate-chest`, `pirate-small-ship`
- Editor and runtime diagnostics snapshots
- Screenshots, console entries, network failures, and renderer/RAF metrics

## Parity Checklist

| System | Current Status | Notes |
| --- | --- | --- |
| game start | broadly shared | Runtime startup creates `RuntimeSession` from cloned project. |
| initial progression | broadly shared | Shared progression helpers run startup flow. |
| spawn | broadly shared | Runtime position is session/progression driven. |
| player movement | broadly shared | Three input calls `playerMovementTransaction`; third-person remains grid/cardinal. |
| collision | broadly shared | Movement helper remains source of truth. |
| terrain height | presentation-only | Height affects 3D visuals, not movement. |
| interaction discovery | broadly shared | Three uses shared discovery for interact/touch. |
| rules/actions | broadly shared | Shared rule dispatch/action helpers own state changes. |
| cutscenes/dialogue | functional, presentation differs | UI polish remains. |
| quests | broadly shared | Quest state/sync/rewards remain runtime-helper driven. |
| inventory/pickups | broadly shared | Runtime quantities are session state. |
| shops | broadly shared | Shop stock/currency flow uses shared helpers. |
| area links/teleport | broadly shared | Runtime transition helpers own state changes. |
| NPC movement | broadly shared | Three presentation is visual interpolation over runtime grid state. |
| enemy contact | broadly shared | Shared NPC tick/contact helpers. |
| combat | broadly shared | Shared combat helper owns damage/defeat/flags. |
| boats/vehicles | broadly shared | Shared object/vehicle helpers own board/sail/dismount. |
| imported assets | presentation-only | Registry ids in authored config; live Three objects are not runtime state. |
| offline-baked Golden animation | presentation-only | Shared registry playback; gameplay movement remains authoritative. |
| water/coastline | presentation-only | Does not change walkability, collision, sailing, or water physics. |

## Finding Template

Use this template only for concrete parity differences. Visual-only issues belong in the visual backlog unless they change gameplay semantics.

### Finding P-XXX

System:
Severity:
2D behaviour:
3D behaviour:
Expected shared-runtime behaviour:
Flow log / diagnostics evidence:
Reproduction steps:
Suspected layer:
- shared runtime
- Phaser adapter
- Three adapter
- presentation only
Status:

## Visual/Presentation Backlog

Visual findings should not be treated as runtime parity failures unless they change gameplay semantics.

- [ ] camera collision/framing polish
- [ ] sky/atmosphere presentation
- [ ] terrain sculpting and shoreline gradient polish
- [ ] water/coastline V2
- [ ] model normalisation and transform defaults
- [ ] pirate vertical slice dressing
- [ ] object/structure model coverage
- [ ] character/NPC model coverage
- [ ] general animation/compiler coverage beyond the pair-specific offline-baked Golden Reference
- [ ] attack/contact/damage feedback
- [ ] runtime HUD layout polish
- [ ] cutscene/dialogue/shop presentation polish
- [ ] asset upload/library workflow

## Exit Criteria For Three Runtime Parity V1

- No Blocker parity findings.
- No unresolved Major shared-runtime semantic differences.
- Movement, collision, and interactions use shared semantics.
- Quest, inventory, pickup, shop, area transition, NPC, combat, and vehicle flows work through shared helpers.
- Phaser and Three adapter tests prove key workflows call the same shared helper paths.
- Remaining issues are Minor or Visual and are clearly documented as presentation work.
