# PR 02 — Asset Creator: Library, Previews, Variants, Animations & Effects

**Branch:** `feat/editor-02-assets`  
**Dependency:** PR 01 merged (shared shell and navigation).  
**Visual source:** master HTML → Asset Creator, then `Assets`, `Animations`, `Effects` tabs; `refs/asset_creator.png`.

## Objective

**Replace the current visible Asset/Character creation interface**, but preserve and extend its **actual Blender/GLB, character recipe, shared Three.js loader, rig-aware clone, animation, registry and promotion plumbing**. Do not iframe the old Studio UI or ship static SVG mannequin placeholders. This workspace combines asset browsing, creation, inspection, preview, variants and minimal reusable motion/effects authoring.

## Screen contract

- Top: exactly `Assets | Animations | Effects` tabs; selected asset/rig persists across tabs.
- Left 240–280px: search, horizontally scrollable categories `All, Humans, Animals, Buildings, Foliage, Props` (extensible), two-column thumbnail grid, + Create tile; source list from the real asset registry including local project assets and supported imported resources.
- Centre: **two real, orbitable 3D views**, left static reference/pose and right animated preview of the same object; linked camera option, sync lighting, zoom/pan/focus. Static assets remain static when no compatible clip exists.
- Right 280–320px: context-sensitive inspector powered by supported property metadata; no human eye-colour sliders on pine trees. Save, Save as New, Revert and dirty-state handling.
- Bottom ~40px: preview-only background preset (black/white/grid/forest/castle), skeleton, wireframe, light, ground/grid, linked cameras and reset.
- Keep the viewport dominant; layouts responsive and panels scroll independently.

## Assets data and editing behaviour

- Distinguish *archetype/source recipe*, *compiled artifact*, *variant*, *world instance*, *attachment*, and *editor pose*. Reuse existing schema where possible, introduce minimal extensions/adapters.
- Provide a supported property inspector for each category based on existing actual capabilities; unsupported properties disabled/hidden, not fake.
- Create dialog: name, category, base asset/variant, description, optional reference images, constraint level `Constrained / Extended / Custom` as descriptive metadata only unless functionality exists; do not pretend model or Blender jobs are run when they aren't.
- Reconnect existing Blender character creation/compilation (Studio may stay a separate service launched via the UI initially), GLB validation, promotion and asset selection. If browser cannot run Blender, show an actual job/process state and correct endpoint/path instead of a fake success banner.
- Implement **durable asset variants** with stable IDs and override/provenance records; Save updates editable asset revision, Save as New forks without mutating base. Preserve references used by world placements; warn on edits to shared bases.
- Model previews should use the engine's actual GLBs and materials, respect rig compatibility and dispose Three resources correctly to avoid GPU leaks.

## Rig and attachments

- Skeleton overlay and bone hierarchy/selection on real `SkinnedMesh`/skeleton. Pose editing rotates bones in local parent-space; do not distort joint screen coordinates or rewrite the bind pose.
- Preview pose/reset is transient; pose presets/edits become durable only on explicit Save.
- Props are Assets. Named sockets (`right_hand`, `left_hand`, `back`, `head`, etc.) or compatible metadata attach a prop by reference; inspector can adjust local transform. Test sword following Oswin's moving hand, not floating in world space.
- For non-humanoid rigs, inspect provided bones/metadata and do not assume the Golden 65-bone skeleton universally.

## Animations tab — minimum coherent real feature

- Left filters for current rig-compatible clips and all clips. Library independent of specific character instances; animations reuse rig signatures/profiles.
- Centre dual preview + timeline. Support selecting, play/pause, speed/loop, playhead scrubbing, viewing bone tracks and available keyframes.
- For a supported rig and existing clip format, implement **at least one real local-rotation keyframe edit workflow** (select bone → set rotation at time → keyframe → save clip variant → reload → preview). Preserve original clip. If source format prevents editing, document migration/adaptation and don't present nonfunctional Add Keyframe.
- Right clip properties: name, rig compatibility, duration, loop, source/provenance, Save and Save as New. Imported Blender clips remain usable.

## Effects tab — intentionally small but real

- Same tab shell: effect library, preview attached to asset or preview environment, right parameters.
- Start with supported light/glow, fog and one simple animated/particle effect **only if the existing runtime can render them**; add minimal components where necessary.
- Effects have stable IDs, type/parameter schema, duration/loop where relevant, preview-only context, save/reload and optional named-socket attachment.
- Do not attempt a professional VFX graph, full particle simulation editor or complex facial rig authoring.

## Integration & tests

1. Open Merewatch → Asset Creator → select real Oswin or equivalent checked-in humanoid; two Three.js views render the real model and compatible clip.
2. Orbit/zoom both views; grid/light changes affect preview only and reset cleanly.
3. Enable skeleton, select bone, change an editable pose and reset; original bind pose and existing animations remain intact.
4. Attach real sword by right-hand socket; it follows the arm through an attack animation.
5. Save a material/recipe variant and reload app; variant remains selectable and original is unchanged.
6. Switch to Animations, inspect/edit/save a minimal supported keyframe/clip, reload and play it.
7. Switch to Effects, preview and persist one real effect; reference it from a compatible asset.
8. Re-enter Map and place/reference the variant without breaking existing placements.
9. Checks: GLB load/clone tests, rig compatibility, asset import validation, app UI Playwright, build, relevant CI. Monitor two-view GPU memory/disposal and test many selections.

## Explicit non-goals

No hosted AI key setup, automatic mesh generation from prompt, advanced IK/retargeting, nonhumanoid rig authoring suite, broad rewrite of Studio. Existing Studio capabilities must remain reachable if not yet surfaced in the new UI. Do not ship an eye-colour/height control unless it updates a supported underlying recipe/variant.

## Agent delegation

Lead owns shared asset registry/schema and save integration. Suitable independent subtasks: real dual viewport + rig visualization; animation clip UI/format; effects preview. Integrate them *sequentially into one selected-asset state*. Avoid concurrent edits to the shared store.
