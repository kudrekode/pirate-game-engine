# Ranged Combat V1 — One Bow, One Arrow

21 October 2026.

## 1. Executive Result

**PASS for the complete implemented loop, selected real-input browser acceptance
and completed CI checks.** The player can collect and equip Bow,
aim with the pointer-locked Follow camera, fire a travelling arrow, damage/defeat
hostile NPCs through shared combat, and Continue with Bow equipped and no restored
projectiles. Sword and unarmed combat remain available through the same equipment slot.

This is one player bow and one straight-line arrow. No ranged framework, ammunition
inventory, additional weapon families, NPC shooting or new camera architecture was added.

## 2. Existing Systems Reused

The pre-edit audit found Sword's inventory item reference, session-owned
`equippedWeaponId`, `getEquippedWeapon` / `getRuntimeAttackStats`, Inventory
Equip/Unequip, cardinal melee targeting, and `attackStarted` animation seam.
Damage, defeat flags, quest synchronization and rewards already belonged to shared
`runtimeCombat`. There was no projectile collection or projectile collision helper.

The existing traversal world supplies transformed oriented boxes, floor quads and
the terrain sampler. NPCs retain their authoritative area/grid positions and
runtime attributes. Golden had `hand_l` / `hand_r` bones; the attachment helper
previously supported only the right hand. Pointer Lock already supplied relative
mouse deltas to the Follow rig, with Inventory releasing/restoring lock.

The implementation extends these boundaries. `beginRuntimeCombatAttack` owns common
acceptance/cooldown; `damageRuntimeNpc` owns common impact damage. The new renderer-free
`projectileRuntime` owns the small transient collection. Three and Phaser translate
input and draw its results in their existing loops. No editor defaults are mutated.

## 3. Bow Asset / Attachment

Original [bow/arrow geometry source](tools/blender-character/build-bow.mjs), using
the existing registry, GLTF cache/clone and `createThreeVisualMarkerGroup` path.
The [asset notes](public/assets/weapons/README.md) describe origins and dimensions.

- Bow: 21,700 bytes, 192 triangles, one vertex-colour material, no textures.
- Arrow: 8,312 bytes, 68 triangles, one vertex-colour material, no textures.

Bow is parented to the actual Golden **`hand_l`** bone. Its grip-local position is
`(0.035, 0.095, 0.008)` metres, XYZ rotation `(-1.648906, 0.043131, 1.530908)` radians,
scale 1. A fixed left-finger grip comes from the action source. Bone parenting
supplies the bow transform; no loop chases the hand. The initial horizontal firing
grip was rejected and corrected before the final body review.

Sword and Bow each retain one reusable held clone, with only the active one attached.
Fired arrows belong to the world scene, never to the character. There is no separate
nocked-arrow presentation in this version.

## 4. Bow Definition

[`src/data/bow.ts`](src/data/bow.ts) contains the one behaviour and ordinary starter
item. Authored items optionally reference `weapon: "bow"`; imported projects receive
no injected Bow or restored deleted items.

| Parameter | Value |
| --- | ---: |
| Damage | 32 |
| Cooldown | 1000 ms |
| Release delay | 300 ms |
| Arrow speed | 28 m/s |
| Maximum travel | 48 m |
| Maximum lifetime | 2000 ms |
| Ammunition | Unlimited |

The definition also references the bow/arrow visuals, left-hand grip, tip socket
`(0, 0.035, 0.28)` and `GoldenBow_Fire_V1`. It adds no general weapon-definition editor.

## 5. Aiming Model

The accepted attack captures the **actual visible camera position and look direction**,
including orbit damping and camera obstruction. Coordinates are converted from the
centred Three scene into shared grid/metre coordinates. Screen cursor coordinates
are never used.

At release, the camera ray finds its first world/NPC intersection or a point 48 m
along the ray. The current bow socket launches toward that point, correcting
third-person parallax. It never snaps to a nearby target or requires one to exist.
Aim is captured when F is accepted; later mouse movement belongs to the next shot.

Bow-equipped third-person Follow uses a **0.45 m shoulder offset** and a minimum
look-at offset of **1 m above the existing player-centre anchor**. This clears the
reticle and makes long-range aiming possible within the existing pitch limits.
The same camera rig, damping, obstruction and Pointer Lock remain authoritative;
there is no ADS mode. Unequipping returns to authored camera framing.

## 6. Bow Animation

[Editable source](tools/blender-character/animations/golden-bow-v1/README.md) and
[published library](public/assets/derived/humanoid-animations/golden-bow-v1/actions.glb):
one **0.9 s** Golden-compatible action at 60 Hz. Raise at 0.15 s, draw by 0.267 s,
release at 0.30 s, short recoil, then recovery by 0.85 s. See the
[timed four-view capture](docs/assets/ranged-combat-v1/bow-fire.gif).

Two isolated exports produced identical 78,784-byte output, SHA-256
`b0b018dd1a756aab985282599a83c6df796e8e978762d1cc846630b8b68eb4e4`.
The existing round trip verifies the exact Golden rest/hierarchy, 53 finite tracks,
duration, recovered endpoint, independent clones and no horizontal root motion.
No character, clothing, skeleton or skin weights were rebuilt. There is no hand IK.

The explicit shared 300 ms timer owns release; no animation event controls damage.
The existing semantic controller selects Bow Fire while retaining Attack priority
and normal locomotion recovery. The string is static and there is no nocked arrow;
draw/release precision remains a presentation limitation.

## 7. Projectile Runtime

Session-only arrows contain position/previous position, normalized direction, speed,
remaining time/range, source actor and damage/weapon context. The adapter owns visual
groups separately. Motion uses delta time, including only the remainder of the frame
after a pending release becomes due. It does not depend on frame count.

One accepted shot produces one arrow. Pending releases cannot be overwritten or
changed by equipping another weapon. Menus pause the pending clock and its player
animation; close the menu to finish that release before switching weapons.
Projectiles also pause with gameplay overlays. Death, terminal presentation, scene
teardown and Continue clear transient state. No transient state enters project data.

## 8. Collision

Swept segments find the nearest intersection between previous/current arrow tips.
They reuse traversal oriented boxes and floor quads, intersect crossed terrain
triangles (block surfaces in blocky mode), and respect legacy authored blocking
footprints. Definition defaults and instance overrides are retained.

NPCs use a bounded **0.64 m × 1.7 m × 0.64 m** body volume at their authoritative
position plus authored offset and terrain support. A first NPC/world hit removes
the arrow; no piercing. Friendly bodies stop arrows without receiving damage.

A separate body-to-socket sweep prevents the bow tip from starting through nearby
geometry. A blocked launch terminates at the obstruction instead of teleporting
through it. Thin walls, rotated boxes, inside-solid origins, ground, floors,
close/medium/far ray correction and near-wall launch paths have deterministic tests.

## 9. Damage Integration

Both melee and arrow impacts call `damageRuntimeNpc`. The shared path retains health,
nonlethal Hit, Death, immediate defeated-NPC removal, defeat flags, quest progression,
reward synchronization and existing local corpse lifetime. The projectile path
does not force an impact through melee's adjacent/cardinal target selector.

Tests verify a lethal arrow completes an existing defeat quest, grants its ordinary
item reward once, and preserves the completed quest/reward through Continue.

## 10. Crosshair / Input

**F remains attack.** Left-click still only acquires Pointer Lock. F does not release
lock, and relative mouse look continues. A small centred white aim dot appears during
Bow-equipped Follow gameplay and hides for blocking UI or other equipment.
Inventory retains its existing release and automatic lock restoration behavior.

The real browser route uses Chrome mouse/keyboard input and actual Pointer Lock.
The harness reads diagnostics; it never writes projectile positions, NPC health,
equipment or gameplay transactions.

## 11. Weapon Switching

Physical pickup grants ownership without auto-equipping. Existing Inventory detail
provides Equip/Unequip. Bow replaces Sword and Sword replaces Bow; unequip restores
unarmed combat. Weapon switching never refunds the accepted cooldown.

Bow stays attached through Idle/Walk/Run/Jump/Fall/Land. Airborne F is rejected.
Interact/Pickup temporarily hide the held weapon using the existing presentation rule.
Phaser also uses the same projectile helper with facing-based Space firing and a
simple 2D arrow; the full hand/reticle/Pointer Lock acceptance is the Three route.

## 12. Save / Continue

Version-1 saves persist ordinary Bow ownership and the equipped inventory item ID.
Known/owned equipment validation now recognizes Sword or Bow; older saves remain
unarmed when no equipment field exists. No save version bump is needed.

Explicit serialization excludes queued releases, arrows, bone references, pooled
groups and action clocks. The browser saves during arrow flight, then reloads and
Continues: Bow is attached, the player is Idle and projectile counts restart at zero.

## 13. Golden / Clothing Review

Inspected six phases from four views on the existing dressed
[Athletic](docs/assets/ranged-combat-v1/athletic.png),
[Broad](docs/assets/ranged-combat-v1/broad.png) and
[Fuller](docs/assets/ranged-combat-v1/fuller.png) artifacts, plus ordinary gameplay
framing and the sampled timed motion. Shoulder lift, elbow bend, wrists, torso,
bow clearance and recovery remain readable without severe new deformation in
these views. The static string does not follow the drawing fingers exactly.

The fresh [deformation record](docs/assets/ranged-combat-v1/deformation.json) checks
61 samples per body, exact Golden compatibility and finite skinned bounds.
Lowest sampled geometry is about **9.96 mm above the reference floor** on all three;
horizontal root drift is effectively zero. This is a selected visual assessment,
not acceptance of every outfit, identity, slope or tight camera angle.

## 14. Demo Project

Import [ranged-combat-v1-demo.project.json](ranged-combat-v1-demo.project.json), choose
**3D View → Play**, then click the viewport. Start at **(5, 12)**; press **E** to
collect the Bow at **(6, 12)**, **I → Bow → Equip**, then close Inventory.
Aim with the mouse and press **F**. Each target has 64 HP, requiring two arrows.

| Authored content | Position |
| --- | --- |
| Close / medium / far targets | (10, 12), (20, 12), (35, 12) |
| Sword pickup | (5, 14) |
| Animated chest with ordinary reward | (7, 16) |
| Wall / corner / large crate | (14, 8), (15, 6), (17, 16) |
| Separate sword/unarmed target | (7, 20) |

The 48 × 24 yard uses the existing authored character, stationary hostile overrides,
ordinary objects and standard Save Game / Continue controls. There is no special
demo-only gameplay code or harness-driven state mutation.

## 15. Browser Acceptance

Final selected route: **1 passed, about 1.5 minutes of test time**. It verifies pickup,
equip/left-hand attachment/reticle, real camera aiming at all three ranges, travelling
arrow samples, Hit/Death, cooldown, an intentional miss, world/near-wall termination,
Run/Jump and airborne rejection, Inventory lock lifecycle, Sword and unarmed damage,
chest use, switching back, Save and Continue. **Zero page errors.**

[Compact acceptance record](docs/assets/ranged-combat-v1/acceptance.json),
[equipped view](docs/assets/ranged-combat-v1/equipped.png),
[flight/release view](docs/assets/ranged-combat-v1/arrow-flight.png),
[near-wall view](docs/assets/ranged-combat-v1/near-wall.png).
The record retains distinct arrow positions and observed Hit/death/animation states.

```powershell
node node_modules/@playwright/test/cli.js test e2e/ranged-combat-v1.spec.ts --grep @ranged-combat-v1 --list
node node_modules/@playwright/test/cli.js test e2e/ranged-combat-v1.spec.ts --grep @ranged-combat-v1
```

An initial attempt caught a demo health-override mismatch (100 instead of 64), which
was corrected in ordinary authored data. The complete route then passed, followed
by the final pass with explicit motion/reaction assertions and menu-release fixes.
This is automated real-control Chrome acceptance, not a separate human playtest.

## 16. Performance / Lifecycle

Across the final settled action window, scene builds **2 → 2**, cleanups **1 → 1**,
asset loads **8 → 8**, and one active RAF with loop starts **2 → 2**. Marker clones
were **26 → 27**, exactly the first held Sword clone; repeated bow shots add none.
There were no new GLB requests. Two defeated NPCs reduced active character mixers
**5 → 3**. Terrain/traversal, surviving characters and the renderer stay alive.

Three prewarmed arrow groups are reused, hidden on impact/expiry and detached on
teardown. They add no mixer, listener, React frame state or RAF. Focused tests verify
shared resource ownership, re-equip reuse and pool cleanup. A 30-shot deterministic
test observes at most two simultaneous arrows and drains all 30; the browser's
deliberately spaced route observed at most one.

The browser's combined visual-update phase averaged **0.3 ms**; this includes actor,
animation and projectile work, not an isolated arrow benchmark. Whole-window render
stalls remain in the captured diagnostics. These observations establish lifecycle
and cache behavior, not a universal FPS or GPU performance guarantee.

## 17. Validation

- Focused projectile suite: **19 passed**, including ownership, switching, release,
  cooldown, deterministic motion, collisions, expiry, sustained cleanup, quest
  rewards and Continue. Existing melee/unarmed shared tests passed.
- Full Vitest selection: **862 tests across 104 files passed**, covering the combined
  projectile, attachment, animation, arrow pool, mounted input/lifecycle and editor state.
- Installed Bow/Arrow/action Node tests: **2 passed**. Two identical exports and
  production GLTFLoader round trips passed; final three-body deformation passed.
- Final real-input Chrome selection: **1 passed**.
- `npm.cmd run ci` was invoked **once**. Its tests passed, then the root build found
  a TypeScript narrowing error in the legacy obstacle check. After a type-safe local
  reference correction, all **19 projectile tests** passed again. The failed root
  build and every previously unreached stage then passed: root/Studio production
  builds, all three package typechecks and **77 compiler/asset Node tests**.
  The full test suite was not redundantly repeated. Logs: `test-results/ranged-combat-v1/ci.log`,
  `ci-recovery.log` and `ci-compiler.log` in the same directory.
  PowerShell's redirected-stderr wrapper returned exit 1 after recording Vite's
  chunk warning as `NativeCommandError`; the chained build stages all completed
  and the final Node runner reported 77 passed, zero failed.
- Biome reports no blocking errors on the changed source/test files; nonblocking
  style warnings remain. Production builds retain the existing large-chunk warnings.
  Final `git diff --check` passed. All 19 report sections and local evidence links
  were verified.

## 18. Remaining Limitations

- Straight-line, fixed-damage arrows; no gravity, ammo, retrieval, piercing or NPC fire.
- Rigid bow/string, no visible nocked arrow, fixed grip and no hand IK. Finger/string
  precision, stronger release/impact feedback and carry silhouettes can improve.
- NPC hit volumes use authoritative positions and fixed dimensions, not animated
  meshes. Legacy blocking props use conservative two-metre-high footprints;
  nonblocking decorative meshes are not projectile colliders.
- Full-body actions retain existing movement sliding. Menu-paused pending releases
  must finish before equipment can change. Missing Golden hand/clip support keeps
  the existing presentation fallbacks; custom rigs need their own compatible assets.
- Visual and real-input acceptance covers the selected dressed bodies and Chrome
  course, without a separate hands-on or multi-browser feel assessment.

## 19. Recommended Next Feature

**Combat presentation polish.** Improve the bow draw/string relationship and impact
readability within these existing melee/projectile paths. No next feature was implemented.
