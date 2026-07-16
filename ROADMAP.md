# Adventure Game Builder Roadmap

This roadmap records likely follow-up work. It is not a commitment to implement every item in order.

## Near-term

- Three Runtime / Editor Presentation V1 follow-ups:
  - Terrain Sculpting / Shoreline Gradient V2.
  - Sky / Atmosphere Presentation V1.
  - Model Normalisation / Asset Transform Defaults V1.
  - Pirate Vertical Slice Dressing V1.
  - Procedural Mannequin V0 follow-up: expose height as the first genuine
    creator control through a real compile/import boundary; see
    `docs/assets/procedural-mannequin-v0.md`.
  - Runtime contract tests that prove Phaser and Three.js adapters use the same gameplay semantics.
  - Keep using the Playwright Three perf harness for browser/performance-sensitive 3D work.
- Expand map overlay filters for event blocks, collision, quest markers, and NPC movement.
- Add 3D overlay/path painting for overlays, collision review, and authoring guides.
- Polish 3D placement with clearer previews, validity feedback, and inspector shortcuts.
- Improve editor validation, deletion warnings, and reference navigation.
- Expand generic object workflows for switches, decorative props, and richer container/door states.
- Add more focused tests around editor workflows and project migration.
- Export and package a playable game build.

## Gameplay systems

- Horses, carts, and richer vehicle handling.
- Advanced boat steering, vehicle animations, and vehicle-specific interactions.
- Diagonal/free movement later, after visual, animation, and parity work clarify requirements.
- Economy and shops.
- Equipment, armour, and clothes.
- Enemy NPC behavior built on the shared NPC foundation.
- Combat.
- NPC schedules and time-based behavior.

## Editor improvements

- HUD/UI builder.
- Better inspector navigation for referenced rules, items, quests, and map entities.
- More map overlay filters and layer visibility controls.
- Bulk map editing and map-template improvements.
- Height-aware map authoring tools for stairs, ramps, cliffs, and water-depth planning.
- Height-aware movement rules once the 2D runtime is ready to use terrain elevation.
- Better 3D placeholder meshes for common entity types before real asset imports.
- Asset upload/library workflow after the built-in registry and transform defaults settle.

## Visual/asset pipeline

- Asset imports.
- GLB/GLTF support for editor previews and future runtime presentation.
- Model normalisation for scale, origin, orientation, material/texture expectations, and reusable transform defaults.
- Pirate demo dressing using current registry-backed visual assignments.
- Asset generation workflows.
- Better graphics and expanded pixel-art tools.
- Sprite animation and visual preview improvements.

## Later/advanced

- Save and export a standalone playable game.
- Richer NPC behavior without replacing the shared NPC model.
- Advanced rule authoring, including an optional node-based view.
- Larger-world authoring and additional runtime optimization.
- General animation/compiler coverage beyond the pair-specific offline-baked
  Golden Reference.
- WebGPU optimisation after real performance constraints are measured.
- Native/C++ exploration only if deployment or performance requirements justify it.
