# Interaction Animation & Animated Props V1

20 October 2026. Golden source/library: `golden-interaction-v1`.

## 1. Executive Result

**PASS for Chest + player Interact/Pickup in the selected demo and review views.**
Common physical interactions now visibly read as physical actions: successful
container use produces a short forward reach and a real opening lid; physical
collection produces a bend/reach-down while the item is granted and removed
immediately. Gameplay transactions remain authoritative. This is the agent's
visual assessment; the user has not reviewed the new motion.

Physical door animation is deferred. Movement remains cosmetic during these
one-shots: locomotion animation is temporarily suppressed, but movement input and
gameplay coordinates remain authoritative. There is no cinematic lockout.

## 2. Existing Systems Reused

Reused interaction discovery and grounded gating, `runRuntimeObjectBehaviour`,
`collectRuntimePickup`, `collectRuntimeObjectPickup`, opened/collected IDs and
flags, quest facts, inventory validation/feedback, RuntimeSession isolation and
version-1 saves. Only successful container/pickup events request physical feedback.
Failed grants and empty repeated containers do not trigger it. Sign/examine,
dialogue, generic rule/quest rewards and legacy transitions retain their semantics.

Shared gameplay contains no renderer dependency. No authored schema or save
migration was necessary. Phaser continues to use the same transactions.

## 3. Player Interact Animation

`GoldenInteraction_Interact_V1` lasts **0.60 s**. Shoulder and torso lead into an
extended relaxed right hand, a brief settled reach and a clean neutral recovery.
It is reusable for containers, without object attachment or exact contact promises.
The [source package](tools/blender-character/animations/golden-interaction-v1/README.md)
contains editable Actions, authoring and export scripts.
[Timed preview](docs/assets/interaction-animation/interact.gif).

## 4. Player Pickup Animation

`GoldenInteraction_Pickup_V1` lasts **0.80 s**. A 23 cm skeletal pelvis drop with
offline planted ankles creates the knee bend; hips/spine hinge and the hand reaches
down in front before recovery. The first review candidate placed the arm behind
the body; that candidate was rejected and corrected before final acceptance.
[Timed preview](docs/assets/interaction-animation/pickup.gif).

Both clips use the unchanged 65-bone Golden skeleton and ordinary 60 Hz joint
keys. There are no runtime solvers or character GLB builds. Two isolated final
exports produced the identical **116,788-byte** mesh-free library, SHA-256
`b5258c36bf76c7f3a1a541864f51b921ebefeba49ce9591d65b1b7c94556cd5c`.
Canonical, dressed reference, Idle/Walk and source-helper hashes were checked.

## 5. Animation Controller Integration

Priority is **Defeated > Hit > Attack > Interact/Pickup > Jump/Fall/Land > Run >
Walk > Idle**. Interaction requests begin only grounded and with a loaded valid
clip. They do not queue behind combat, replay on source arrival, or latch when a
clip is missing. Completion blends to current locomotion; Hit/Attack/Defeated can
interrupt. Jumping cancels a cosmetic interaction without later replay.

The existing 120 ms transitions remain. Presentation faces the marker's actual
transformed location during the action; cardinal gameplay facing and position
are unchanged. Held movement can therefore slide the full-body action. This
bounded cosmetic policy avoids changing shared movement/input semantics.

## 6. Animated Chest

The [asset audit](docs/assets/interaction-animation/chest-door-audit.json) confirms
`pirate-demo/crate.glb` is a chest with separate `chest` and `lid` nodes, a
**0.30 s `open`**, 1 s `close` and 2 s `open-close`. It comes from the existing
Kenney Pirate Kit / CC0 source documented in the
[world-kit provenance](public/assets/world-kit/PROVENANCE.md). Original bytes are
unchanged. The legacy misleading asset IDs/URLs remain compatible.

New registry asset **Animated Chest** (`world-animated-chest`) uses that real
`open` clip. Its small per-instance mixer plays once and clamps the final pose.
Independent props share cached source data but have independent animated nodes.
Opened IDs/flags reconstruct the final pose on Continue, without playing Open.
The [timed lid preview](docs/assets/interaction-animation/open.gif) was reviewed
for hinge correctness, body clearance, timing and the final pose; no severe
clipping or endpoint snap was observed in those views. Its source is intentionally
simple stylised art.

The closed body bounds retain a solid collider after opening. Existing static
chests retain their Opened badge and feedback; the animated chest uses its lid.

## 7. Door Animation

**Deferred.** The current world shack is a single static mesh with a doorway gap.
The misnamed pirate `castle-door.glb` is actually a cannon; `castle-gate.glb` is a
static door mesh without an opening animation or reusable separated hinge.
Current door use checks requirements then transitions immediately. A new door art
or transition framework would exceed this pass. No artificial delay was added.

## 8. Pickup Visual Lifetime

Gameplay inventory acquisition, collection IDs and source/collider removal remain
immediate. The visual is also removed immediately; the player's bend supplies
the physical feedback. There is no delayed visual retention, duplicate source,
timer or temporary gameplay collection. Local disposal preserves shared GLTF
geometry/materials and releases only instance-owned resources.

`TraversalWorld.removeObject` removes the collected prop from existing solid,
floor and spatial-bucket arrays while retaining world/sampler identity and all
surviving descriptors. It replaces the previous whole-world recreation on prop
collection. Ordinary pickups and placed collect-item props use the same feedback.

## 9. Editor Authoring

Select an object, choose **Animated Chest** in its 3D Visual asset picker and
**Container** in Interaction. Configure rewards as before. The Inspector explains
the optional animated asset; raw clip names are never exposed. Asset metadata
owns supported visual states. Existing static assignments remain unchanged.
The demo uses visual scale 0.55 for the original chest's 1.275 m source footprint.

## 10. Save / Continue

Save data remains semantic: opened container IDs/flags, collected pickup IDs,
inventory and existing progression. No playback time, mixer, animation frame or
interaction-facing state is saved. Continue constructs an opened final lid pose,
omits the collected prop and starts ordinary Idle without Interact/Pickup replay.
The actual browser route and deterministic transaction/save tests verify this.

## 11. Golden / Clothing Review

Existing dressed [Athletic](docs/assets/interaction-animation/athletic.png),
[Broad](docs/assets/interaction-animation/broad.png) and
[Fuller](docs/assets/interaction-animation/fuller.png) were reviewed at six phases
per clip from gameplay scale, side, front quarter and rear quarter, with timed
30 Hz sequences. No characters or outfits were regenerated.

Shoulder/armpit, elbow, torso, hip, knee and trousers retained readable shapes in
these views. No severe new deformation was observed. Existing stylised hands and
close joint creases remain. A fresh 61-sample-per-clip/body
[GLTF deformation round trip](docs/assets/interaction-animation/deformation.json)
checks Golden rest/hierarchy, finite deformation, horizontal root stability,
neutral recovery, held pose and independent clones. Lowest sampled geometry was
9.95 mm for Interact and 9.82 mm for Pickup. Numerical checks alone were not used
as visual acceptance. Other outfits, extreme identities and uneven floors are
outside this selected review.

## 12. Demo Project

Import [interaction-animation-demo.project.json](interaction-animation-demo.project.json),
select **3D View**, then **Play**. Start is (3, 8). Animated chest (5, 8), static
chest (8, 8), Rope pickup (11, 8), sign (14, 8), Keeper (17, 8).
Approach each from its left or lower lane and press E. Inspect provides
world-relative navigation; Follow Player shows the normal authored gameplay camera.
The demo uses ordinary authored project data and an existing finalised character.
The Tidewatch quest showcase remains unchanged.

## 13. Browser Acceptance

**Final route: 1 passed in 1.9 minutes**, installed Chrome, real keyboard movement/E.
It covers both chest types, forward-facing Interact, held open pose, immediate
reward, repeated empty interaction, immediate pickup visual removal and Pickup,
sign/examine and NPC dialogue with no Reach, Save/reload/Continue, restored opened
pose and collected absence, no action replay, and complete editor-save equality.
There were zero page exceptions. [Acceptance record](docs/assets/interaction-animation/acceptance.json),
[normal-camera chest reach](docs/assets/interaction-animation/chest-reach.png),
[normal-camera pickup](docs/assets/interaction-animation/pickup-bend.png).

```powershell
node node_modules/@playwright/test/cli.js test e2e/interaction-animation.spec.ts --grep @interaction-animation --list
node node_modules/@playwright/test/cli.js test e2e/interaction-animation.spec.ts --grep @interaction-animation --output=test-results/interaction-v1/browser
```

## 14. Performance

Across the final settled interaction window: scene builds **2 -> 2**, cleanups
**1 -> 1**, clones **12 -> 12**, GLB loads **5 -> 5**, zero new GLB requests,
unchanged RAF starts and **one active RAF**. The initial asset-settlement rebuild
is outside this window; Save/reload deliberately starts a new session afterward.
Both character controllers survive the window; the prop has its own scene-owned
mixer. These physical feedback paths do not reconstruct terrain/world or request new GLBs. Tests
verify world/sampler identity and one source load across repeated player actions.
These are lifecycle/cache observations, not a comparative GPU/FPS benchmark.

## 15. Validation

- `npm.cmd run ci` was invoked **once and passed**: **809 Vitest tests across
  99 files**, type-safe root/Studio builds, all three package builds/typechecks,
  and **73 passing cheap Node compiler/asset tests**. Existing Vite large-chunk
  advisories remain. The log is `test-results/interaction-v1/ci.log`.
- Final review then identified an existing rule-state notification that could
  rebuild the scene during a container's quest-completion reward. That notification
  now updates diagnostics/HUD state; teleports and other structural events keep
  their existing paths. The added quest-reward regression and affected mounted
  runtime, rule dispatcher, quest and demo-save selection passed **91 tests in
  four files on final code**, followed by a passing root TypeScript check. Passing
  unrelated CI suites were not repeated.
- Final real-input browser route: **1 passed**, with fresh selected-body and chest
  visual review, two-export determinism and production GLTFLoader round trips.
- `git diff --check` passed. All 14 local report links resolve; source/reference
  and final published hashes match. No character build or historical matrix ran.

Focused animation, mounted Three feedback, shared transaction, save, registry,
Inspector and real chest GLTF checks passed during implementation. The mounted
tests cover static fallback, immediate local pickup removal, duplicate container
feedback, and no physical animation for generic rule rewards/signs/dialogue.
The controller tests cover grounding, priority, interruption, missing clips,
one-shot completion and locomotion return. Asset tests do not assert exact poses.

## 16. Remaining Limitations

- Physical doors, levers and richer prop states remain deferred.
- Movement stays cosmetic during the action; no contact matching, auto-walk,
  runtime IK, attachment or foot locking is implemented.
- Pickup visuals vanish immediately; there is no hand attachment or visual grace.
- Other character rigs retain their existing static/HUD feedback when these Golden
  clips are unavailable. Phaser has no new skeletal presentation.
- Broader outfits, slopes and extreme identities were not visually accepted here.
- The Node-only chest structural check cannot resolve its external texture;
  browser review loads the existing colormap successfully.

## 17. Recommended Next Feature

**Animated doors / richer props.** Start with one suitable hinged door asset and
the existing successful-use transaction. No next feature was implemented.
