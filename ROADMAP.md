# Adventure Game Builder Roadmap

This roadmap records likely follow-up work. It is not a commitment to implement every item in order.

## Near-term

- Expand map overlay filters for event blocks, collision, quest markers, and NPC movement.
- Add 3D terrain painting that reuses existing terrain palette and map tools.
- Add 3D overlay/path painting for overlays, collision review, and authoring guides.
- Polish 3D placement with clearer previews, validity feedback, and inspector shortcuts.
- Improve editor validation, deletion warnings, and reference navigation.
- Expand generic object workflows for switches, decorative props, and richer container/door states.
- Add more focused tests around editor workflows and project migration.
- Export and package a playable game build.

## Gameplay systems

- Horses, carts, and richer vehicle handling.
- Advanced boat steering, vehicle animations, and vehicle-specific interactions.
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

## Visual/asset pipeline

- Asset imports.
- GLB/3D asset import support for editor previews.
- Asset generation workflows.
- Better graphics and expanded pixel-art tools.
- Sprite animation and visual preview improvements.

## Later/advanced

- Save and export a standalone playable game.
- Richer NPC behavior without replacing the shared NPC model.
- Advanced rule authoring, including an optional node-based view.
- Larger-world authoring and additional runtime optimization.
- Eventual 3D runtime experiment after editor data and 2D runtime behavior are stable.
- Full Three.js runtime replacement, if ever pursued, as a separate architecture project.
- WebGPU optimisation after real performance constraints are measured.
- Native/C++ port only if deployment or performance requirements justify it.
