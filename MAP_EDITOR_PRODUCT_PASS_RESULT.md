# Map Editor Product Pass — Result

## 1. Executive Result

**PASS** for the core small-editor workflow. The Map workspace now brings asset discovery, placement, scene selection, transforms, history and Play together. A real browser workflow built a scene with a prop and an imported authored character, manipulated it, played it, returned to Edit, saved and reloaded with identical authored project data.

The existing project, store, runtime session, visual registry and GLTF clone path remain authoritative. This pass adds editor interaction and presentation, not a replacement engine.

Validation qualification: the editor workflow and builds pass. The overall repository gate is not fully green because seven compiler tests encounter a pre-existing clothing source/registry hash mismatch, verified against committed `HEAD` bytes. Details are in section 17.

## 2. Existing Problems Found

The initial manual browser exercise used a demo scene, placed Supply Crates, selected and moved them, renamed a crate, entered Play, returned and saved/reloaded. It exposed:

- Assets buried in palette dropdowns, with no visual browser or scene hierarchy.
- No practical per-instance prop rotation, scale or duplicate controls.
- Small selection targets and a crowded viewport surrounded by repeated controls.
- Missing width preferences incorrectly resolving to the narrowest panel width.
- Play starting in 2D and returning through a remounted editor, losing workspace context.

The first automated workflow also exposed full Three.js scene recreation during rename and numeric edits. Those operations now update the existing scene.

## 3. Final Editor Layout

Asset Browser on the left; world viewport and view/history controls in the center; Scene list, compact object actions and an independently scrolling Inspector on the right. Existing terrain, pixel and area tools remain under **Map tools & area settings**. They stay expanded in 2D and collapse in 3D. Panels remain resizable.

## 4. Viewport / Camera

- Right-drag or Alt-drag: orbit.
- Middle-drag or Alt+Shift-drag: pan.
- Wheel: zoom.
- **Focus selected** / **F**: frame the selected bounds.
- **Reset camera**, Top, Isometric and Low angle provide recovery and useful views.

Camera gestures disable transform handling while active. Initial framing gives the world more space. The existing ground and grid remain the placement reference.

## 5. Selection

Click an entity or its Scene row to select it. A bright cyan bounding box and transform handles identify the selection. Clicking empty world deselects. Helpers and selection outlines are outside the entity picking list; transform handles deliberately own their drag gesture. Delete clears selection safely.

## 6. Transform Tools

The existing Three.js dependency supplies `TransformControls`: XYZ Move, XYZ Rotate, per-axis Scale and the central uniform-scale handle. Toolbar buttons and W/E/R select modes. Numeric XYZ position, rotation in degrees and scale use the same authored values.

Move snapping: Off, 0.25, 0.5, 1. Rotation snapping: Off, 15°, 45°, 90°. Defaults are 1 and 15°. Scale is bounded to 0.05–20; reset restores rotation and scale while preserving position.

Integer map coordinates still own gameplay. Fractional X/Z offsets, elevation, rotation and scale are presentation transforms. Collision remains on the nearest grid cell; this is explained beside the fields.

## 7. Asset Browser

Search names, categories and tags. Categories come from available definitions and registry content: Characters, Props, Nature and Buildings. Cards have human names, categories, an Add button and cached GLTF thumbnails where available; placeholder content uses type icons. Animation-only sources are excluded. No asset pack was downloaded.

## 8. Placement

Drag a card into 3D: a cyan ground marker previews the drop location, a terrain raycast determines the cell, and a ground-plane/camera-focus fallback keeps placement in the map. Release places and selects the instance with Move active. **Add** places near camera focus. In 2D, drops target the hovered tile and Add uses the map center. Both use existing store mutations and history.

## 9. Character Placement

Finalised project characters appear in Characters and use the same drag/Add workflow. Placement creates or reuses the existing NPC definition with its character asset identity. **Use in Game** returns to Map with guidance to the Asset Browser. Editor previews retain the authored bind pose; Play uses the existing animation pipeline.

## 10. Hierarchy

A flat searchable Scene list shows objects, characters, structures, pickups and events, with type indicators, human names and selected state. Focus, Duplicate and Delete act on the common selection. No parenting or new visibility system was introduced.

## 11. Inspector

Instance name and Transform are immediately visible. Visual expands existing asset controls for props and characters. Properties & gameplay retains the established contextual inspectors. NPC instance names and prop instance visual overrides persist independently of their definitions. Pickups retain item-derived names.

## 12. Undo / Redo

The existing 50-entry project snapshot history now observes placement, duplication, deletion, rename, transforms and inspector edits. Field focus/blur groups typing; a gizmo gesture commits once. Undo/Redo restores valid entity selection. Project replacement clears history; Play preserves it.

Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y, Ctrl/Cmd+D and Delete/Backspace respect text inputs. Editor shortcuts are inactive while the workspace is hidden in Play.

## 13. Edit / Play

Editing and Playing badges make mode explicit. Play starts in the current Map view. Editor mutation controls are hidden or disabled, and the established cloned `RuntimeSession` isolates gameplay. **Back to Edit** reveals the mounted workspace, preserving camera, selection and history without a page reload.

## 14. Persistence

Migration preserves optional instance transforms, prop visual overrides and NPC names. Legacy instances without transforms retain identity behavior; deleted content is not recreated by this pass.

The browser saved a prop at X 10.5 / Y 0.25 / Z 7.25, Y rotation 45°, scale X 1.5 / Y 1.2 / Z 1, and a character at X 12.25 / Z 7. It deleted the duplicate. Full saved-project equality held both after Play and after reload, including the character asset reference.

## 15. UI / Presentation

Compact global controls, useful default panel widths, card previews, searchable scene rows, grouped properties, axis-colored labels, clear selection, and an empty-scene placement prompt improve the workspace. Most screen height belongs to the viewport. Existing 2D tooling stays accessible.

Selection, instance names and numeric transforms reuse the mounted Three.js scene. Transform drags update the live group and commit authored data on release. Topology, asset and terrain changes can still rebuild the scene through its existing lifecycle.

## 16. Browser Workflow

One opt-in Playwright case, `e2e/map-editor-product.spec.ts` (`@map-product`), passed in 2.4 minutes on this machine:

1. Create a blank project and import project data containing an already finalised, hash-verified character artifact.
2. Enter 3D, inspect the empty state, search Pirate Crate and use native drag/drop.
3. Verify automatic selection; drag Move, Rotate and Scale handles; undo and redo the move.
4. Duplicate and rename a spare; add and position the authored character.
5. Select the original through Scene, rename it, edit numeric XYZ/rotation/scale, undo and redo.
6. Verify those edits did not increment scene build count; delete the spare.
7. Deselect on empty world and reselect the prop in the viewport without rebuilding.
8. Save, enter 3D Play, verify the character animation mixer, move the player and exercise Delete safely.
9. Return to the same editor canvas and selection; save and compare the entire project.
10. Reload, confirm prop and character values, save and compare the entire project again. No page errors were recorded.

There are no authored light entities in the schema, so the conditional light step is inapplicable; the existing renderer lighting remains in use.

Fresh local evidence (ignored test output):

- [Editor workspace](test-results/map-product-browser/map-editor-product-builds--2640d--Edit-Play-loop-map-product/editor-workspace.png)
- [Play scene](test-results/map-product-browser/map-editor-product-builds--2640d--Edit-Play-loop-map-product/play-scene.png)
- [Reloaded scene](test-results/map-product-browser/map-editor-product-builds--2640d--Edit-Play-loop-map-product/reloaded-scene.png)
- [Persistence evidence](test-results/map-product-browser/map-editor-product-builds--2640d--Edit-Play-loop-map-product/persistence-evidence.json)

## 17. Validation

- Focused placement, transform composition/update and history tests: 15 passed after the scene update fix.
- Focused mounted product workflow tests: 2 passed; existing editor smoke: 45 passed; migration: 20 passed during iteration.
- Real browser acceptance: 1 passed. Screenshots reviewed in editor, Play and after reload.
- Required `npm.cmd run ci` was run **once**. Its Vitest stage initially reported 629 passed / 31 failed: the existing viewport mock lacked the new Three helpers, and old UI queries no longer matched the revised controls. After focused fixture/query corrections, the viewport suite passed all 33 tests and character integration passed all 3. Together with the unchanged passing suites, all **660 Vitest tests** are accounted for as passing. The legacy active-tool caption remains visible in embedded 3D.
- The unexecuted CI stages were then run directly: root TypeScript/Vite build, both contract package builds, shared Three preview package build and Asset Studio TypeScript/Vite build all passed. Existing bundle-size advisories remain.
- Cheap Node compiler checks: **56 passed / 7 failed**. All seven fail on the existing clothing coverage provenance mismatch. The committed registry expects `b63b6d9efebc61af94c7aceefc5a412625616eeec0128ae248841ff35016da47`, while committed `tools/blender-character/clothing/everyday-v1/coverage.json` hashes to `d17cda43999fb87339f6b8523b4131d663e7a7afb8a57bd21ee4a0f5beb7b9d7`. Windows CRLF checkout adds a separate byte difference, but canonical committed bytes already fail the contract. Neither clothing sources nor their expected hashes were changed. This is an unresolved baseline failure, not a claimed CI pass.
- `git diff --check`: passed.

Logs: `test-results/map-product-ci.log`, `map-product-ci-repair.log`, `map-product-preview-final.log`, `map-product-ci-remaining.log` and `map-product-browser.log`.

No Blender compile, character visual matrix, broad browser suite or new dependency was added or run for this pass.

## 18. Remaining Limitations

- Single selection; multi-select and scene parenting remain outside this pass.
- Transforms affect presentation, not rotated/scaled collision volumes or height-aware movement.
- Scene lights are not authored entities. No lighting editor was added.
- Existing asset quality and bind-pose thumbnails vary; missing/unavailable previews use icons.
- New/deleted geometry, asset changes and terrain edits still use the existing scene rebuild path. This pass is not a large-scene performance redesign.
- Full reload restores project data and the last 2D/3D preference, not undo history or the previous camera. Play/Back to Edit preserves both.

## 19. Recommended Next Feature

**More world assets.** Add a small, curated set of recognizable props and buildings with consistent scale, materials and readable thumbnails. The editor can now place and manipulate them coherently; a better small library would immediately improve practical level building. This recommendation aligns with the roadmap's pirate scene dressing and visual asset work and is not implemented here.
