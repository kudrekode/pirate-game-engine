# Runtime Architecture

## Overview

Adventure Game Builder uses one authored project schema and multiple runtime adapters. `GameProject` is editor-authored data. `RuntimeSession` is isolated play-session state. Phaser remains the default/reference 2D runtime. The Three.js runtime is an experimental but increasingly capable adapter that presents the same shared runtime state in 3D.

Adapters are not separate engines. They translate input, rendering, camera, animation, audio/visual effects, and UI into calls to shared runtime helpers. Gameplay decisions belong in shared helpers and `RuntimeSession`, not in Phaser or Three.js presentation code.

## GameProject Authored Data

`GameProject` contains durable authoring data:

- Areas, terrain, terrain heights, overlays, structures, objects, pickups, NPC instances, and event blocks.
- Object/NPC/item/shop/quest/rule/cutscene/dialogue definitions.
- Player defaults, camera defaults, and game-state defaults.
- 3D visual config such as placeholder type, registry asset id, scale, height offset, and rotation offset.

`GameProject` must not store live runtime state or live renderer objects. GLTF/GLB assets are referenced by id and loaded by presentation helpers at render time.

### Animation Asset Boundary

The current animation pipeline is an offline compilation and presentation path:

```text
vendor Mixamo FBX
  -> immutable source/provenance records
  -> versioned retarget profile
  -> headless Blender bake
  -> deterministic Golden-target GLB
  -> Three.js round-trip validation
  -> shared animation registry
  -> Asset Studio / editor / runtime
```

Blender is an offline compiler implementation detail; it is not a runtime
dependency. Production/default playback uses offline-baked artifacts. Runtime
retargeting V2 remains an experimental comparison path only. The current
`mixamo-to-quaternius-v2` profile is specific to this verified source/target
skeleton pair. Walk artifacts are in-place: horizontal root motion is
neutralized while vertical hip movement is retained, and gameplay movement
remains authoritative. Vendor assets are immutable; derived assets are
reproducible compiled artifacts. Full per-clip GLBs currently duplicate
mesh/material/texture data as a proven but temporary format choice. The
[detailed spike](assets/golden-reference-animation-retargeting-spike.md)
contains the measurements and validation evidence.

### Dual Character Presentation

Player and NPC gameplay data remains renderer-independent. `mapAvatarId` and
portrait fields continue to serve the Phaser/2D presentation, while optional
`threeVisual` config stores the Three presentation source, registry asset id,
and transform overrides. Neither presentation choice changes movement,
alignment, interactions, combat, or any `RuntimeSession` state.

## RuntimeSession State

Play mode starts from a cloned project snapshot and creates a `RuntimeSession` in `src/runtime/runtimeSession.ts`.

`RuntimeSession` owns runtime copies of:

- Current area id, player grid position, and facing.
- Flags, variables, inventory quantities, NPC attributes, quest state, shop stock, player health, and combat state.
- Progression/waiting-trigger state, entered areas, collected pickups, opened objects, defeated NPC ids, vehicle state, NPC movement timing, and enemy contact timing.

Runtime helpers may mutate this state. Editor defaults must not be mutated by a play session.

## Shared Runtime Helpers

Shared helpers are renderer-independent and own gameplay semantics:

- `runtimeSession`: create and hold play-session state.
- `interactionDiscovery`: nearest/touch interactables, priority, and eligibility.
- `playerMovementTransaction`: grid movement, facing, movement duration, touch targets, and trigger targets.
- `runtimeRuleActionDispatcher`: renderer-neutral rule effects and presentation requests.
- `runtimeProgression`: start progression, cutscene progression, trigger waits, area entry, and area transitions.
- `runtimeObjectInteractions`: object behaviours, pickups, shops, and vehicle transactions.
- `runtimeNpcTick`: NPC movement, hostile chase, and contact damage.
- `runtimeCombat`: player attacks, NPC damage, defeat state, combat flags, and defeat trigger requests.

Shared gameplay helpers must not depend on Phaser, Three.js, React, WebGL, DOM state, or editor store state.

## Phaser Adapter

`src/runtime/AdventureScene.ts` is the Phaser adapter and remains the reference runtime path. It owns Phaser-specific concerns:

- Phaser scene lifecycle, sprites, tile/world rendering, tweens, keyboard input, and cameras.
- Translating shared runtime events into Phaser presentation and React overlay callbacks.
- Existing 2D cutscene/dialogue/status/debug presentation.

It should call shared helpers for movement, interactions, rules, progression, objects, pickups, shops, vehicles, NPC ticks, and combat.

## Three.js Adapter

`src/runtime/three/ThreeRuntimePanel.tsx` is the experimental Three.js runtime adapter. It now supports real 3D presentation features while keeping gameplay grid-authoritative:

- Runtime scene, camera, renderer, geometry/material, RAF, cleanup, and diagnostics lifecycle.
- Blocky and smooth terrain presentation, authored terrain heights, water/coastline visuals, and runtime-visible entities.
- Placeholder and registry-backed GLTF/GLB asset visuals through the shared visual resolver/renderer path.
- Visual interpolation for player/NPC grid movement.
- Follow, inspect, fixed-isometric, third-person follow, camera-relative WASD, and third-person mouse look.
- React overlays for status, flow log, cutscene/dialogue/shop requests, quests, inventory, health, and session end.

The adapter must not import editor store/live editor state for gameplay. It may use Three-specific helpers for presentation, camera math, visual smoothing, GLTF loading/cache/clone, terrain mesh generation, water/coast rendering, and diagnostics.

## Presentation-Only Systems

These systems are visual/editor presentation and must not be mistaken for gameplay semantics:

- Imported GLTF/GLB assets, cached source scenes, and cloned active instances.
- 3D placeholder meshes and authored visual transform defaults.
- Terrain height/elevation, smooth terrain mesh generation, water surface material animation, and coastline strips.
- Camera follow/inspect/third-person state and mouse-look state.
- Performance diagnostics overlays and Playwright perf snapshots.

Runtime movement remains discrete/grid-based. Terrain height and water/coast visuals do not change collision or movement until shared movement helpers explicitly add height-aware or water-depth rules.

## Event Flow

Typical runtime flow:

1. Play mode receives a cloned `GameProject`.
2. Adapter creates `RuntimeSession`.
3. Adapter fires startup/progression work through shared helpers.
4. Shared helpers mutate session state and emit renderer-neutral events.
5. Adapter translates events into UI, camera, rendering, or presentation requests.
6. Player input calls shared movement, interaction, combat, and object/shop/vehicle helpers.
7. Runtime state changes trigger adapter presentation updates or scene rebuilds.

Presentation requests such as cutscenes, dialogue, shops, teleports, game over, and end game should stay renderer-neutral until the adapter displays them.

## Testing Guidance

Prefer focused runtime-helper tests for gameplay semantics. Adapter tests should verify input/event/render translation without relying on real WebGL where possible.

Use the Playwright Three perf smoke only for browser/performance work or when a task changes the Three editor/runtime browser surface. It captures reproducible diagnostics and screenshots, but it is not part of `npm run ci`.

Useful checks:

- Runtime session cloning does not mutate editor defaults.
- Movement/collision decisions are deterministic.
- Interaction priority and rule/object/quest/shop/pickup/vehicle transactions use shared helpers.
- NPC tick/contact, combat defeat flags, and trigger requests match expected session state.
- Three adapter tests prove it calls shared helper paths and does not import editor store state for gameplay.
