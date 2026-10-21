# Traversal & Collision Pass — Tidewatch Harbour

## 1. Executive Result

**PARTIAL.** Shared height-aware traversal now makes the harbour's steps, docks,
floors, solid props and water behave consistently with their visible geometry.
The unchanged treasure chest physically obstructs the shack doorway, so the
complete requested interior browser route cannot honestly pass without moving it.
The unobstructed doorway and interior walls are covered by deterministic tests.

## 2. Previous Traversal Model

Player input committed whole grid cells through `attemptPlayerMove`; Three only
interpolated the visual position. Terrain presentation supplied Y. Object flags
blocked cell footprints without respecting fractional placement or transforms.
NPCs use a separate grid movement helper. There was no runtime mesh raycast.

## 3. New Traversal Model

The existing transaction accepts short continuous moves in profiled 3D areas.
`RuntimeSession.traversal` owns position, foot height and accepted movement samples;
rounded `playerPosition` and cardinal gameplay facing still own cells, combat,
vehicle exits, interactions and triggers. Visual facing can follow a diagonal.
Walkable surfaces support the player; solids reject overlap; water, void and
outside-map space have no walking floor. Legacy areas and Phaser retain grid play.

## 4. Collision Representation

Renderer-independent, source-controlled profiles are exposed by the existing
visual registry. Ordinary props use normalized asset-bound boxes. The shack uses
six wall/lintel boxes with a doorway opening; docks, floors and stairs have explicit
surfaces. XYZ Euler rotation, per-axis scale, visual overrides, terrain anchor and
fractional instance translation match marker placement. Steep/upright floor pieces
become barriers. No collider is saved.

## 5. Height-Aware Grounding

Resolve the highest reachable floor within 0.4 m above/below the previous feet.
The limit is below knee height for the 1.82 m character and accommodates the
unchanged harbour's approximately 0.36 m shore/stair transition. Smooth ground
samples the rendered triangle diagonal. Sweeps advance by at most 4 cm, preventing
endpoint tunnelling. Large drops are blocked; there is no falling simulation.

## 6. Steps / Stairs

Wooden Steps use a ramp through the three tread centres, capped at the bottom/top
tread heights. Geometry is unchanged. The actual steps rise toward the beach;
the dock is lower, not an elevated extension above beach level. Off-centre ascent,
descent and resting height are tested.

## 7. Docks / Raised Floors

Measured GLB deck height is 0.445782 m above its base, not the 0.65 m post-top
bound. Wooden Floor uses its measured 0.157895 m plank surface. Dock posts remain
solid. Adjacent pieces share stable support, with a 1.5 cm edge tolerance for
small seams. Tidewatch's dock walking height is 0.625782 m over water.

## 8. Buildings

Small Shack side/back/front walls and lintel block the player. The 1 m doorway
admits the 0.36 m-wide controller when unobstructed; its interior uses terrain.
Tidewatch places its solid chest at (5, 5.2), across the doorway at approximately
Z=5. No saved placement was moved to manufacture a passing interior route.

## 9. Props

Solid profiles: Wooden Barrel, Supply Crate, Treasure Chest, Tavern Table,
Wooden Stool, Large Rock, Small Rock, Timber Wall, Timber Post, Wooden Railing,
shack walls and dock posts. Grass, rope and decorative clutter receive no new
blockers. Legacy explicit cell blockers remain active for unprofiled content.

## 10. Water / World Bounds

Ordinary walking cannot enter water or void. A reachable dock/floor can support
walking over water. The actual 20 × 15 map bounds limit the player's footprint;
the distant visual apron contributes no collision or ground.

## 11. Character Grounding / Animation

The existing normalized GLB root, cached clone and Idle/Walk controller remain.
Accepted sweep height drives root placement and camera follow. Horizontal motion
still controls animation; standing-height changes do not create walking states.
The harbour's idle NPC remains on its existing path; NPC traversal/pathfinding
and new character animations are outside this pass.

## 12. Editor / Debug Support

An optional, initially collapsed **Traversal debug → Show collision** control in
3D Play displays obstacle wireframes and walking surfaces. It is off by default.
The Map Editor retains its existing placement workflow and authored transforms.

## 13. Persistence / Compatibility

No authored schema fields or migration defaults were added. Profiles derive from
stable asset IDs and existing overrides. The play session owns all new mutable
state. Legacy IDs without profiles retain their original cell movement. Grid
triggers fire once per cell entry, and spawn/teleport resets traversal position.
The browser confirmed exact equality of the entire saved project after Play,
return to Edit, Save and reload; traversal worked again in the reloaded project.

## 14. Performance

Descriptors and cell candidate buckets are built with the existing scene lifetime.
Movement queries nearby simple geometry; runtime never raycasts GLB triangles.
A local Node observation over 2,000 warmed 0.2 m sweeps at five harbour locations
measured **0.010 ms median / 0.029 ms p95 / 0.483 ms maximum**. Building the world
took **2.68 ms**; it contained 27 solid boxes and six floor patches, with at most
four nearby candidates at the sampled points. These are collision-only observations,
not a frame-rate claim or performance threshold. See
[timing data](docs/assets/traversal/collision-timing.json).

## 15. Browser Traversal Course

**Passed on 7 October 2026 in 6.5 minutes** (local Chromium,
1100 × 800 viewport). The opt-in `@traversal` case imports the unchanged project
and follows this course using actual arrow-key input:

1. Spawn on beach; attempt to enter the rotated barrel and observe its blocker.
2. Approach the steps slightly off centre; stand at 1.3093 m on the upper tread.
3. Walk down to the first dock, stand on the seam and cross the second dock,
   remaining at 0.625782 m; return over the steps to the 1 m beach.
4. Approach the shack entrance; the existing chest stops movement at Z=5.6667.
5. Walk around the west side; the shack wall stops entry at X=3.3133.
6. Approach the shoreline; unsupported water stops movement at Z=10.4667.
7. Approach the rotated supply crate; it stops movement at X=4.2467.
8. Walk around the props back to spawn, return to Edit, save and reload.
9. Confirm complete saved-project equality, enter Play again, repeat the stair
   traversal and observe the authored character switch from Walk to Idle.

Each obstacle check requires the corresponding collision reason. No teleport
hooks, runtime position writes or scene edits reach the checkpoints. Root Y
matches resolved foot height at every resting checkpoint. Zero browser errors,
asset-load failures or missing animation clips were observed. Large Rock has a
solid profile; the final compact browser route does not visit it.

Evidence: [stairs](docs/assets/traversal/stairs.png),
[dock](docs/assets/traversal/dock.png),
[checkpoint observations](docs/assets/traversal/observations.json).
Fixture SHA-256 remains
`8cf104b9e7d786b7890a3492a90b14bf9308c77f84366e09388c1ade46e6067b`.

## 16. Validation

- Focused geometry, player transaction, Three input, camera, migration and runtime
  session checks passed. Coverage includes transformed boxes, thin-wall sweeps,
  diagonal corners, floor thresholds, seams, off-centre stairs, water/void/bounds,
  doorway/lintel, instance overrides, cell triggers, timing and isolation.
- The world-kit round trip verifies declared dock/floor/tread heights against real
  GLB ray intersections in tests only. Production traversal uses no raycasts.
- `node node_modules/@playwright/test/cli.js test e2e/traversal-collision.spec.ts --grep '@traversal'`:
  **1 passed**, with the interior-route limitation described above.
- `npm.cmd run ci`: **passed once**, exit 0. Vitest passed **88 files / 683 tests**;
  root and Studio type-safe builds, all three package builds/typechecks and
  **63 Node compiler/asset tests** passed. Vite reported bundle-size warnings.
- `git diff --check`: **passed**.

No Blender matrices or unrelated browser suites were run.

## 17. Remaining Limitations

- The unchanged chest blocks the requested shack interior browser course.
- Profiles cover the curated kit, not arbitrary imported mesh collision.
- Stair ramps approximate individual treads; props use simple boxes.
- Phaser and moving NPCs retain grid semantics. No jumping, swimming or physics.
- The unchanged sample uses fixed follow; third-person camera math is shared.

## 18. Recommended Next Feature

**Gameplay interaction authoring.** Traversable docks and solid props are now
useful places to put deliberate doors, containers and interaction prompts.
Do not add richer traversal or pathfinding before making those actions easy to
author. This recommendation is not implemented here.
