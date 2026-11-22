# PR 04 — Map Editor: Three Drawers, Fast Navigation, Real Terrain & Context Inspector

**Branch:** `feat/editor-04-map`  
**Dependency:** PRs 01–03 merged; reuse Asset registry and cinematic markers.  
**Visual source:** master HTML → Map Editor; `refs/map_editor.png`.

## Objective

**Replace the current visible Map Editor layout** while preserving existing actual Three.js scene, terrain brush, asset browser, object placement, gizmos, bounds/collision and persistence. Make it significantly faster to navigate a large area, place assets, sculpt terrain and paint reusable vegetation. The illustrated prototype's map is **NOT the renderer to ship**.

## Screen structure

- Left: **exactly three collapsible drawers** in one sidebar: **Asset Drawer**, **Tools Drawer**, **World Details**. They can be open simultaneously; remember their state as editor-only preferences.
- Centre: maximum-size real 3D world viewport, small top-left mode toolbar and lower status/nav hints. Selection and gizmos live directly over the world.
- Right: **one contextual inspector**, switches among selected instance, active tool, and chosen world setting. No duplicate configuration in both sidebars.
- Header: area/project name, scene save/revision, Play (opens existing runtime), Home. Global shell consistent with other workspaces.

## Asset Drawer

- Search across assets, category chips, small thumbnail grid using the exact same registry as Asset Creator. Drag a card to place it with placement ghost and valid/invalid indicator; alternative select asset + click ground. Instancing should store stable asset reference and transform, **not clone model data**.
- Select existing instance by click or hierarchy. Inspector shows name/ID, base asset/variant link, position X/Y/Z (Three Y-up), rotation, scale, visible/locked/group, collision profile (`none`, `solid`, `walkable-floor`, `trigger` where supported), physics behaviour only if the runtime supports it, links to NPC/dialogue/Story and asset base.
- Distinguish editing base asset properties (Asset Creator) from overriding a placed instance. Map edits never silently mutate base recipe/GLB.
- Gizmo move/rotate/scale, numeric fields, snapping, duplicate/delete, multiselect where possible, undo/redo. User pressing E to fly vertically must not activate map interactions in editor mode.

## Tools Drawer and contextual parameters

- Explicit terrain operations: Raise, Lower, Smooth, Roughen, Flatten and paint material based on existing `terrainBrush` operations.
- For active brush, right inspector displays radius, strength, falloff, target height/material, masks, smoothing sample and mode. A drag stroke is **one undoable edit**, not thousands of snapshots.
- Keyboard modes (outside text inputs): `1` Select, `2` Foliage Scatter, `3` Terrain Sculpt, `4` Water; optional subtools/transform keybindings consistent with engine conventions.
- **Foliage Scatter:** reusable weighted palette of asset IDs (e.g. two pines + one dead pine), radius, density, brush spacing, seed, random scale/rotation, exclusion masks, terrain height/slope restrictions, no-water/no-road mask. Paint and erase, preview prospective scatter, seeded repeatability and bounded instance count to avoid frame stalls. Groups remain individually selectable or manageable by brush group ID.
- **Water:** prefer existing water/shore definitions and boat collision/traversal. Provide placement/selection/size/elevation of lake/river volumes where supported. A flat illustrative water overlay does not constitute a real lake; avoid a giant new fluid simulation. Show where volume intersects terrain.
- Paths/Roads and advanced biome/ecosystem tools may remain deferred unless available already; avoid dead toolbar buttons.

## World Details drawer

- Settings index: Sky & Lighting, Gravity & Physics, Player & Spawn, HUD preset/link, Scene Hierarchy / Layers.
- Right inspector displays the selected world settings, with explicit units, defaults, reset and saved values. Distinguish area-specific vs whole-project defaults.
- Hierarchy supports search, select, hide, lock, group/layer and focus. Use existing object IDs; showing a UI-only flattened list where a real parent/group model exists would discard useful information.
- HUD: choose an existing HUD preset and link to future HUD editing. Do not implement a full HUD designer in this PR.

## Editor navigation — first-class requirement

- Provide **Orbit** and **Fly** camera modes distinct from Play/walk mode. Orbit around selection/focus; wheel zoom; middle pan. Fly: hold right mouse button to look; WASD camera-relative move, Q/E down/up, Shift fast, adjustable speed. `F` focus selection. Reset and view orientation control.
- Avoid unintentional terrain edits while navigating. Contextual help strip and hotkeys shown; pointer lock/mouse inversion/sensitivity predictable and configurable where already possible.
- Editor WASD should not move the *player RuntimeSession*; authoring is non-play simulation. Suppress shortcuts while editing text inputs/when dialogs open.
- Camera and rendering performance: use existing scene renderer, frustum culling, instance/batch where useful, and existing diagnostics. Profile significant scene drops rather than hypothesising.

## Data integrity

- Preserve current map/area data and terrain deformation format. Add schema migration only when necessary for brush sets, water volumes or hierarchy data.
- Persist placement, transforms, collision, terrain, foliage sets and sky settings through save/reload and import/export. Undo/redo consistent across strokes, placed assets and inspector edits.
- Story/Cinema references to entity IDs and markers must survive moving or renaming scene objects; broken links diagnosed, not silently re-created under a new ID.

## Acceptance criteria

1. Open Merewatch in Map; existing houses, Oswin, terrain and lake appear with same positioning as in Play.
2. WASD fly, right-drag camera look, Q/E vertical and `F` selection focus work and don't interfere with typing or runtime input.
3. Drag a real asset from left drawer onto terrain, ghost snaps, create stable placed instance; numeric XYZ transform and gizmo editing stay in sync.
4. `1` selects, `2` paints a seeded pine foliage mix with configurable density/size, erase and undo one stroke; visually appropriate placements on slopes.
5. `3` raise/smooth/roughen works against existing terrain; saved terrain is visible in Play. `4` edits a supported water body; preserves boat traversal.
6. Scene Hierarchy can find, select, hide, lock and focus object; right inspector offers Asset/Story deep links.
7. World Details updates sky/fog/player spawn defaults and reloads correctly; changes don't touch editor-only save identity.
8. Collision profiles are explicit and apply to real gameplay traversal; test cottage doorstep, dock edge and water boundary.
9. Existing 2D/Phaser or historical map authoring features remain reachable or migrated; compatibility tests pass.
10. Browser Playwright interaction, visual screenshots and full integration tests including boats/horse/traversal are reported.

## Risks / non-goals

Don't rewrite the Three runtime or physics. Don't require full voxel terrain, realistic fluid dynamics, complete weather simulation or HUD designer. Avoid throwing away historical 2D support during a visual 3D overhaul. Do not bind brush tools to mock SVG circles.

## Agent delegation

Lead owns map state, history, stable IDs and terrain serialization. Independently assign (a) fly camera controls, (b) foliage scattering, (c) drawer/inspector UI/tests when file boundaries permit. Integrate and test each against real Merewatch.
