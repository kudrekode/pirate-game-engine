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
- Optional instance `transform` values add XYZ presentation offsets, degree rotations and scale multipliers to the resolved visual defaults. Map editing keeps integer `x`/`y` gameplay anchors and stores fractional X/Z residuals in the transform. Elevation, rotation and scale do not change grid collision or movement. Missing transforms retain legacy identity behavior.

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

Procedural Mannequin V0 reuses that presentation contract. Its Blender-generated
body and explicit weights compile to a separate deterministic GLB using the
exact Golden compatibility rest skeleton; its registry definition maps Idle and
Walk to the existing offline-baked sources. The asset adds no gameplay state or
runtime retargeting. See
[`generated-body-topology-v1.md`](assets/generated-body-topology-v1.md).

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

### Scene lifetime ownership

The root editor scene is owned by `src/editor/sections/ThreeDPreview.tsx`;
the play scene and session bridge are owned by `src/runtime/three/ThreeRuntimePanel.tsx`.
Each retains its renderer effect with input listeners, RAF, animation/resource refs
and disposal. Domain helpers handle camera math, terrain, loading, visuals and
smoothing; they do not acquire a second render loop. These effects remain together
because splitting them currently requires a large mutable interface. Phaser's
`AdventureScene.ts` likewise remains one scene adapter. Asset Studio's separate
preview lifetime is in `apps/asset-studio/src/HumanoidPreview.tsx`.

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

## Startup and input contract (Phase 2)

Both adapters call `startRuntimeSession` after creating their presentation and
isolated session. Startup runs `on_game_start` rules to completion, then initial
progression. Cutscenes suspend that sequence; player input and NPC ticks remain
paused until progression reaches a trigger wait, completion, or end-game boundary.
Initial spawn/teleport steps may update presentation, but do not mark provisional
areas entered or automatically evaluate quests. At the boundary the actual current
area is recorded, automatic quests synchronize and grant once-only rewards, then
`on_area_enter` is dispatched for that area exactly once. With no authored spawn,
the editor-active/fallback area remains the actual area. Later transitions retain
their normal entry/sync behaviour. Explicit quest completion actions still take
effect where authored; only automatic startup evaluation is deferred.

`RuntimeSession.nextMoveAt` is the gameplay deadline. A successful
`attemptPlayerMove(session, direction, nowMs)` commits its grid position and sets
`nextMoveAt = nowMs + moveDurationMs`. Repeated input before that deadline is
ignored; input at the deadline is eligible. Blocked collision attempts do not
consume a step. Duration uses the existing speed clamp and vehicle multiplier.
Each adapter supplies its monotonic clock consistently: Phaser scene time or
Three `performance.now()`. Tweens, RAF and interpolation never release the gate.
Phaser now dispatches touch/trigger work on the accepted grid step, without
waiting for tween completion. Area spawn/teleport resets the movement deadline.

`runtimeInput` blocks movement, interaction and attack during startup, a shop,
a dialogue, a cutscene, or game over/end. It also holds those inputs during a
movement interval; attack eligibility additionally uses the existing combat
cooldown. NPC simulation pauses for the modal/startup/end states, but not for a
normal player movement interval. Modal buttons can still advance/close the modal.
Inputs are not buffered by the Three handler; held/repeated input only moves when
an eligible event arrives. Phaser polls held directions on its update clock.

## Dialogue contract (Phase 2)

Both adapters use `dialogueEngine` for authored nodes, condition-filtered choices,
node transitions and once-per-conversation node actions. Session `dialogue` owns
the active dialogue id, node id and entered-node set; adapter UI only presents it.
The current schema places effects on nodes reached by choices, not on separate
choice-action fields. Actions use `createRuntimeRuleContext`, including quests,
teleports and asynchronous cutscenes. A node appears after its actions finish;
cutscene-end rules run before the suspended action sequence resumes.

Missing definitions/start/next nodes terminate or reject the conversation safely.
An authored choice node with no available choices offers End conversation in both
adapters. Completing a conversation clears its session state and restores input,
subject to any remaining modal, deadline or end state. Phaser retains its canvas
panel and portrait presets; Three uses a React text/choice overlay. Portrait and
layout parity are presentation work, outside this correctness pass.
