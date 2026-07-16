# Three Runtime Status

## Current Position

`Play 3D Experimental` is still experimental, but it is no longer just a placeholder proof. It now exercises the shared runtime session through a real Three.js presentation path with asset loading, camera modes, visual interpolation, terrain tools, diagnostics, and a reproducible Playwright perf smoke.

`Play 2D` remains the default and Phaser remains the reference runtime for production behavior. The Three runtime should continue to be treated as an adapter over shared runtime helpers, not as a second gameplay engine.

## Implemented Runtime Systems

- `Play 3D Experimental` can be selected from Play mode while `Play 2D` remains the default.
- Runtime startup creates a shared `RuntimeSession` from a cloned `GameProject`.
- Movement, facing, touch targets, interactions, object behaviours, pickups, shops, vehicles, rules, progression, quests, NPC ticks, enemy contact, and combat route through shared runtime helpers.
- Player and NPC visual positions interpolate between authoritative grid positions.
- Runtime camera modes include follow and inspect; project camera config supports fixed-isometric and third-person follow.
- Third-person mode supports mouse-look state, recentering, and camera-relative WASD input.
- Movement remains discrete/cardinal/grid-based even in third-person camera mode.
- Runtime UI uses React overlays for status, flow log, health, inventory, quests, shops, cutscene/dialogue requests, game over, and end game.
- Three performance diagnostics track RAF interval, frame callback cost, render cost, visual update, camera update, runtime tick, terrain rebuilds, water/coast updates, asset status, hitches, scene rebuilds, renderer counts, and RAF loop lifecycle.

## Implemented Visual Systems

- Placeholder meshes cover terrain, structures, objects, NPCs, pickups, vehicles, event blocks, and the player.
- Object and NPC definitions can author 3D visual settings through `threeVisual`.
- `resolveThreeVisual` selects authored placeholder/asset config, inferred fallback placeholders, and transform defaults.
- `ThreeVisualControls` provides registry-backed asset selection in object/NPC editors.
- Built-in registry entries include Demo Box and curated pirate demo GLB assets.
- GLTF/GLB loading uses a loader cache; active instances are cloned from cached source scenes.
- While assets load or fail, the renderer falls back to placeholder meshes and reports diagnostics.
- The default demo assigns real pirate chest and pirate small ship assets.
- The editor preview and runtime both use the shared visual renderer/cache/clone path.
- The shared animation registry provides validated offline-baked Golden Reference idle and walk GLBs; playback is presentation-only and gameplay movement remains grid-authoritative.
- Procedural Mannequin V0 is a validated compiler-generated character entry. It
  uses one 1,108-triangle skinned mesh, one material, the 65-joint Golden
  compatibility skeleton, explicit weights, skeleton-safe clones, and the same
  offline-baked Idle/Walk mappings.
- Editor 3D view supports orbit, pan, zoom, camera presets, accurate terrain/entity picking, selection sync, entity dragging, and 3D placement.
- Terrain tools include drag painting, brush/line/rectangle/fill gestures, height sculpting, brush falloff, and polished brush previews.
- Terrain can render in blocky or smooth mode.
- Water/coastline V1 presents authored water tiles with a shared animated material and derives simple coastline strips from land-water adjacency.

## Playwright Perf Harness

`npm run test:e2e:three-perf` opens the Demo Adventure benchmark, selects `area_main` / `Main Area`, captures editor/runtime diagnostics snapshots, screenshots, console entries, and network failures, and verifies the imported pirate chest/ship assets are active.

Use this harness for browser/performance-sensitive Three work. Do not infer performance regressions or fixes without comparing artifacts.

## Character Presentation Budget (V1)

The curated Patchbeard walking source is the reference budget sample: one skinned
mesh, 11,116 vertices, 10,373 triangles, 24 bones, one material, and one shared
texture image. Its registry entry uses a cached `standard` material profile and
does not receive shadows; `SkeletonUtils.clone` keeps each active character's
skeleton independent while sharing immutable geometry, material, and texture
resources.

For this current proof of concept, prefer character sources at or below roughly
12,000 triangles, 32 bones, one material, and one to two textures. Treat 15,000
triangles or more, more than 48 bones, or more than two materials as a diagnostic
warning that needs a benchmark, not an automatic rejection. The deterministic
benchmark currently supports three simultaneous skinned characters; larger
crowds need a new measured budget before they become a target.

## Current Limitations

- No general-purpose skeletal/model compiler; the current animation bake remains
  pair-specific and procedural generation covers one engineering mannequin.
- No asset upload browser/library yet; registry entries are built in.
- No model normalisation pipeline for consistent scale, origin, orientation, materials, or texture packaging.
- Some pirate GLBs currently log missing `Textures/colormap.png` warnings in the browser console, even when assigned assets render and no fallback is used.
- The barrel asset is present in the registry but is not part of the default benchmark assignment; validate it separately before using it as a required demo asset.
- Terrain is still grid-authored; smooth terrain is a presentation mesh over authored tiles.
- Terrain height remains editor/3D presentation data and does not affect runtime movement.
- Water/coastline is V1/simple: no waves, reflections, depth, flow, shore gradients, foam simulation, or water gameplay/physics.
- Third-person movement is camera-relative but still cardinal/grid-based, not diagonal/free movement.
- No camera collision or obstacle avoidance.
- Runtime cutscene/dialogue/shop UI is functional but not visually polished.
- Imported model materials/textures are loaded as-is; there is no content pipeline validation beyond loader success/fallback diagnostics.

## Current Parity View

The manually tested pirate flow broadly uses shared gameplay semantics in both Phaser and Three. Remaining work is mostly visual/editor/runtime feel: camera polish, model presentation, animation, UI polish, and broader contract tests.

Visual differences, imported asset styling, water/coast presentation, and camera feel should be tracked as presentation issues unless they change runtime state or shared helper behavior.

## Next Recommended Work

1. Add/expand runtime contract tests for shared movement, interaction, progression, object/pickup/shop, NPC tick, combat, and vehicle semantics.
2. Terrain Sculpting / Shoreline Gradient V2 for more readable height and coast transitions.
3. Sky / Atmosphere Presentation V1.
4. Model Normalisation / Asset Transform Defaults V1.
5. Pirate Vertical Slice Dressing V1 using current registry/visual-renderer paths.
6. First genuine Asset Studio creator control, beginning with height through a
   real compile/import boundary. See
   [`docs/assets/procedural-mannequin-v0.md`](assets/procedural-mannequin-v0.md).
7. Asset Upload/Library V1 later, once built-in registry workflows are stable.
8. Diagonal/free movement later, after visual, animation, and parity work clarify requirements.
