# Archery V2 — Charged Draw + Ballistic Arrows

21 October 2026.

## 1. Executive Result

**PASS for implementation, repository CI, selected real-input browser acceptance
and three-body review.**
Holding F draws Bow, charge stops at 100%, and releasing F commits one shot.
Quick shots remain useful nearby. Full draws launch faster, hit harder and travel
farther before falling. The browser course demonstrates a level-aim miss at the
long-range target followed by a compensated hit. Repository CI is recorded in
section 18.

The implementation extends the shared ranged helper and existing Golden controller.
It adds no authored schema, save version, weapon framework, physics engine or asset
export. Static string/hand alignment, quick-release pose transitions and movement
sliding remain presentation limitations.

## 2. Existing Ranged System Reused

Reviewed the Ranged V1, Camera V4, Pointer Lock and Melee V1 result documents,
AGENTS.md, runtime architecture, Bow definition, Golden animation source, input,
equipment, damage, projectile collision, save serialization and reticle.

| Pre-change behavior | Reused boundary / V2 change |
| --- | --- |
| F keydown immediately accepted Bow attack | Three input now begins Draw; Sword/unarmed keep keydown attacks |
| Acceptance consumed a 1000 ms cooldown | Same common combat acceptance runs on successful keyup |
| One 0.9 s `GoldenBow_Fire_V1` action | Same cached clip, sampled Draw, frozen Hold, resumed Release |
| Arrow spawned 300 ms after keydown | Explicit 33.3 ms delay after keyup |
| Straight normalized direction at 28 m/s | Velocity initialized at 16–40 m/s, then constant gravity |
| No projectile gravity | 9.8 m/s²; short swept ballistic segments |
| 48 m range / 2000 ms lifetime | Shared safety caps of 120 m path length / 4000 ms |
| Fixed 32 damage | 18–32 damage through `damageRuntimeNpc` |
| Camera ray captured on acceptance | Actual visible camera ray captured on release |
| Camera/bow parallax correction and body-to-socket check | Retained |
| Oriented boxes, floors, terrain, legacy footprints, NPC bodies | Same nearest-hit sweep; no mesh raycasting |
| Defeated > Hit > Attack > interactions > movement | Retained; Draw/Hold use Attack presentation |
| F retained Pointer Lock; Inventory released/restored it | Retained |

`RuntimeSession` owns transient state; `GameProject` defaults remain isolated.
Equipment, inventory, the registry/cache/clone attachment path, NPC Hit/Death,
defeat flags, quests and rewards remain shared. Phaser also uses the same Draw,
Release and flight helpers through its existing Space attack binding.

## 3. Draw Input Model

Three Bow input is **F down → begin; held → update charge; F up → release**.
Repeated keydown cannot restart the gesture or automatically begin another draw
after cancellation/cooldown. Release without an active Draw does nothing.
The shared helper accepts only owned/equipped Bow, a living grounded player,
unblocked gameplay, no pending shot and an expired cooldown.

Melee still attacks on F down. Space still jumps in Three. The acquisition click
still only requests Pointer Lock. Phaser retains Space for attacks, with Bow
released on Space up and melee on Space down.

## 4. Charge Model

`session.bowDraw` contains the area, equipped item, start timestamp, bounded elapsed
duration, normalized charge and full-draw flag. Its presence means drawing.
The adapters use their existing monotonic runtime clocks.

`charge = clamp(elapsedMs / 1200, 0, 1)`.

Power uses an effective minimum draw of **180 ms**. Taps still fire at minimum
useful power; no zero-speed arrows. Holding indefinitely keeps charge at 1 and
duration at 1200 ms. No stamina, fatigue or accumulating power was added.

## 5. Draw / Hold / Release Animation

The unchanged Golden clip already raises/draws through **16/60 s**, holds its
drawn key through **18/60 s**, releases and recovers by 0.9 s.

- Draw samples clip time `charge × 16/60` using the already prepared action.
- Hold pauses that action at 16/60 s. It neither loops nor restarts.
- Keyup starts the same action at 16/60 s. The shared release clock reaches its
  18/60 s release key after **33.3 ms**, then recovery resumes current locomotion.

There is no clip preparation per frame, animation-driven damage callback, second
mixer or generic animation state machine. Hit/Death retain priority. Quick shots
reuse the authored release pose and can visibly snap from partial draw to that pose.

The existing reticle remains, with a small native charge bar visible only during
Bow Draw. Its value is updated by the existing RAF through a DOM ref, without
React state updates for charge or arrow positions.

## 6. Projectile Ballistics

An arrow stores transient position, previous frame position, velocity, derived
direction, remaining lifetime/path length and its committed damage. Launch velocity
is normalized muzzle-to-aim-point direction multiplied by launch speed.

Flight uses exact constant-acceleration integration:

```text
position += velocity × dt + (0, -gravity × dt² / 2, 0)
velocity.y -= gravity × dt
```

Each integration/collision step is at most **1/120 s**. Only the part of a frame
after the pending release becomes due moves a newly spawned arrow. Free-flight
position/velocity agree across tested frame partitions. Sweeps approximate the
curve with these short chords. The Three arrow's +Z nose follows normalized current
velocity; Phaser uses its derived horizontal direction.

## 7. Gravity / Drop

Gravity is **9.8 m/s²**, with no drag, wind or homing. At equal horizontal distance,
a slower shot spends longer in flight and drops farther. Ideal level-shot values
before collision illustrate the gameplay scale:

| Horizontal distance | 16 m/s quick shot drop | 40 m/s full shot drop |
| --- | ---: | ---: |
| 5 m | 0.48 m | 0.08 m |
| 15 m | 4.31 m | 0.69 m |
| 30 m | 17.23 m | 2.76 m |

Actual arrows terminate at the first ground/world/NPC hit. The browser confirms
the weak shot hits terrain before the medium target; a full draw hits that target.
A full draw aimed directly at the long-range body falls short. Raising the aim
produces the accepted [long-range hit](docs/assets/archery-v2/long-range-hit.png).

## 8. Charge → Speed / Damage

The useful power interval is linear from effective 180 ms draw to 1200 ms:

| Held duration | Launch speed | Damage |
| --- | ---: | ---: |
| Tap through 180 ms | 16 m/s | 18 |
| 690 ms | 28 m/s | 25 |
| 1200 ms or longer | 40 m/s | 32 |

Damage is rounded to an integer and grows less sharply than speed. A 64 HP demo
target requires two full shots or four minimum-power shots. All charge levels
share the same lifetime and range caps; weak arrows are not deleted at an artificial
short distance. The **1000 ms cooldown starts on accepted release**, never Draw.
Draw cannot begin during that cooldown; a fresh key press is required afterward.

## 9. Collision

The existing sweep resolves the nearest world or NPC intersection along every
ballistic substep. Thin/rotated walls, large profiled props, inside-solid origins,
terrain triangles, elevated floors and legacy blocking footprints retain coverage.
The body-to-muzzle sweep prevents spawning through a nearby wall, including when
the camera sees around it.

One arrow terminates on its first hit. Hostile damage routes through
`damageRuntimeNpc` once, including Hit, Death, removal, flags, quests and rewards.
Friendly bodies stop arrows without damage. No piercing, bouncing, sticking,
retrieval, splash damage or alternate health path was added.

Close-target tests cover minimum and full power with an offset muzzle. Real input
also covers wall and near-wall impacts. Lifetime/range expiration is deterministic.

## 10. Camera / Aiming

Camera V4 and Pointer Lock are unchanged. Aim uses the visible camera after its
existing damping and obstruction correction, captured on **release**, so mouse
adjustment during Draw affects the shot. The muzzle still points toward the first
camera-ray intersection or its far point; there is no aim assist or automatic
ballistic compensation.

The course hits an elevated target. The separate real-Chrome sky regression reaches
the existing -82° orbit endpoint and verifies upward ballistic launch from that ray
([capture](docs/assets/archery-v2/sky-shot.png), [record](docs/assets/archery-v2/sky-shot.json)).

When the reticle is raised above a small distant body, it resolves a far point
instead of that body. Existing shoulder/bow parallax then also requires a small
lateral correction. The accepted 30 m shot aims approximately 2.75 m above the
original body aim point and 0.5 m to its side in the test course. This is manual
test input, not targeting assistance in gameplay.

## 11. Movement / Cancellation

Walking remains available during Draw. Shared sprint selection is suppressed while
`bowDraw` exists; the full-body Draw/Hold action overrides locomotion. No aim-walk
set was introduced, so movement can slide visibly under the held pose.

Active Draw cancels without a shot or cooldown when:

- Inventory opens or a gameplay-blocking dialogue/shop/cutscene/terminal state applies.
- Equipment changes or ownership is lost.
- A jump succeeds, the player becomes airborne, dies, or takes positive contact damage.
- The area changes, Play ends, or the Three window loses focus.
- Release has no valid aim ray.

Jump cancellation belongs to the shared jump helper; damage cancellation belongs
to the shared NPC tick. Other runtime gates are rechecked on updates and release.
Hit keeps its existing animation priority, without adding a renderer-owned combat gate.

**After successful keyup the shot is committed.** Its brief pending release and
already flying arrows retain the existing menu pause behavior. A later menu or
cosmetic interruption does not refund that shot's cooldown. Death/area teardown
clears transient projectiles. Near-wall impact counts as a fired shot.

## 12. Weapon Switching

Inventory opening clears Draw immediately, so equipping Sword while holding F
produces no delayed arrow or held Bow pose. Equip/Unequip retains the existing
ownership and pending-release gates. A committed shot's 33 ms pending release must
finish before equipment can change, as in the previous ranged system.

Bow and Sword retain their reusable hand attachments. Browser acceptance observes
Sword's right-hand attachment, 35-damage Sword attack and 25-damage unarmed attack,
then returns to Bow's left-hand attachment.

## 13. Save / Continue

The explicit version-1 serializer is unchanged. It persists inventory ownership
and `equippedWeaponId`, and excludes Draw, charge, arrows, velocity, pending release,
animation time and cooldown clocks. Tests save an actively held full Draw and a
live projectile; restored sessions have neither transient state.

The browser saves during flight and Continues with Bow equipped, Idle presentation
and zero spawned/live arrows. No authored defaults, migration rules or deleted user
state are changed.

## 14. Golden / Clothing Review

Fresh production-controller captures cover Athletic, Broad and Fuller at 0, 0.6,
1.2, 6.2, 6.24, 6.5 and 6.9 seconds from gameplay, side and two quarter views.
All **65 bone matrices remain exactly identical** between full draw and five seconds
later, all sampled matrices are finite, and each body returns to Idle.

Reviewed shoulders, elbows, wrists, grip, torso, bow clearance and prolonged Hold.
The phases remain readable without observed gross joint collapse or bow/torso
penetration in these selected views. Small shoulder/cuff intersections, stylised
wrist/hand shapes and the static string's separation from the drawing hand remain
visible; the prolonged pose makes that string limitation clearer.

| Body | Draw | Five-second Hold | Release/recovery |
| --- | --- | --- | --- |
| Athletic | [image](docs/assets/archery-v2/athletic-draw.png) | [image](docs/assets/archery-v2/athletic-hold.png) | [image](docs/assets/archery-v2/athletic-release.png) |
| Broad | [image](docs/assets/archery-v2/broad-draw.png) | [image](docs/assets/archery-v2/broad-hold.png) | [image](docs/assets/archery-v2/broad-release.png) |
| Fuller | [image](docs/assets/archery-v2/fuller-draw.png) | [image](docs/assets/archery-v2/fuller-hold.png) | [image](docs/assets/archery-v2/fuller-release.png) |

[Compact review and body hashes](docs/assets/archery-v2/body-review.json).
No character/clothing/rig/weights or compiled GLB changed. No new export or Blender
matrix is claimed; existing installed-asset round trips remain part of CI.

## 15. Demo Project

Import [archery-v2-demo.project.json](archery-v2-demo.project.json), choose **3D View
→ Play**, then click the viewport. Start at (5, 12); E collects Bow at (6, 12).
Use **I → Bow → Equip**, close Inventory, hold/release F, and aim with the mouse.

| Content | Position / purpose |
| --- | --- |
| Close target | (10, 12), about 5 m from start |
| Medium target | (20, 12), about 15 m |
| Long-range target | (35, 12), about 30 m |
| Elevated target | (25, 18), on a four-metre raised terrain plateau |
| Sword pickup / melee target | (5, 14) / (7, 20) |
| Wall / corner / large crate | (14, 8) / (15, 6) / (17, 16) |
| Animated chest | (7, 16) |

The 48 × 24 course uses ordinary project data, stationary hostile targets, open sky
and the existing authored character. Remove nearer targets before testing the shared
lane's long shot. Each target starts with 64 HP; there are no special runtime hooks.

## 16. Browser Acceptance

Fresh Chrome/Playwright real mouse and keyboard input passed the current route in
**2.1 minutes**, plus the separate sky regression in **15.2 seconds**. The harness
reads diagnostics and never injects health, positions, charge, equipment or shots.

The current route covers pickup/equip, actual Pointer Lock, quick and partial shots,
full Draw held for another four seconds without power/pose growth, visible charge
bar, close hits, weak medium-range miss, full medium hits, long-range drop and
compensation, elevated hit, world/near-wall impacts, Inventory cancellation/unlock/
reacquisition, walking with sprint suppression, jump cancellation/airborne rejection,
switching while drawing, Sword/unarmed damage, flight Save/Continue and lifecycle
counters. There were **zero page errors**.

[Acceptance record](docs/assets/archery-v2/acceptance.json),
[held pose in Play](docs/assets/archery-v2/full-hold.png),
[arrow flight](docs/assets/archery-v2/arrow-flight.png),
[near-wall termination](docs/assets/archery-v2/near-wall.png).

Hit/death, generic dialogue/area cancellation, release deduplication and saving an
active Draw also have deterministic helper/component coverage. No new Phaser
real-browser or broad historical/performance matrix was run.

## 17. Performance

The settled before/after browser record reports:

- Scene builds **2 → 2**, cleanups **1 → 1** (initial development mount included).
- RAF starts **2 → 2**, active RAF loops **1 → 1**.
- Asset clones **30 → 31**, solely the first held Sword clone; no character recreation.
- GLB request count unchanged throughout shooting/movement/switching.
- Peak one live arrow in this route; a prewarmed five-group pool covers the shared
  four-second lifetime/one-second cooldown bound.

Draw samples cached actions. Arrows update existing groups. Charge writes a DOM
progress value. There is no per-draw scene/traversal rebuild, GLB reload, clip
preparation, React projectile render or additional runtime RAF. These are measured
lifecycle assertions and code review, not a new cross-device frame-time benchmark.

## 18. Validation

- Focused projectile, animation, arrow-presentation and mounted runtime tests passed
  during iteration (37 + 16 + 1 + 76 tests).
- Root typecheck passed during implementation.
- Changed-file Biome check has no blocking errors; existing style warnings remain.
- Current real-input course and Camera V4 sky regression passed.
- Exact Athletic/Broad/Fuller `--charged` reviews passed, including finite/stable Hold.
- Required `npm.cmd run ci`: **passed once**, with **104 Vitest files / 888 tests**,
  root and Studio builds, all three package builds/typechecks, and **77 Node
  compiler/asset tests**. No overlapping compiler or workspace gates were rerun.
- `git diff --check`: **passed** after final documentation.

Reproduce browser selections after `--list`:

```text
node node_modules/@playwright/test/cli.js test e2e/ranged-combat-v1.spec.ts --grep @archery-v2
node node_modules/@playwright/test/cli.js test e2e/ranged-combat-v1.spec.ts --grep @camera-v4-bow
node tools/blender-character/review-golden-bow.mjs --body athletic --charged
node tools/blender-character/review-golden-bow.mjs --body broad --charged
node tools/blender-character/review-golden-bow.mjs --body fuller --charged
```

Art review requires the existing installed dressed bodies and a local Vite server;
it does not compile replacements. The CI log is `test-results/archery-v2-ci.log`.

## 19. Remaining Limitations

- Static bow/string, no nocked arrow or hand IK; release uses one shared authored pose
  even for a tiny tap. Small clothing/hand imperfections remain in close views.
- Full-body Draw/Hold overrides moving legs, causing sliding at walk speed.
- Raising aim above small distant bodies exposes existing shoulder/muzzle parallax;
  no trajectory predictor, aim assist or automatic compensation is provided.
- Existing conservative NPC boxes, legacy blocking footprints and traversal profiles
  remain the collision model; nonblocking decorative meshes do not become colliders.
- The brief committed release retains existing menu pausing; only uncommitted Draw
  cancellation is free of cooldown.
- Phaser shares gameplay but retains its 2D facing-based presentation and cannot
  provide Three's camera elevation aiming experience.

No ammo, quiver, stamina, alternate arrows, critical hits, drag/wind, durability,
NPC archers, retrieval, sticking, ricochet, lock-on or combo system was added.

## 20. Recommended Next Feature

**Archery polish.** Improve nocked-arrow/string-hand presentation and partial-draw
release blending within the existing controller and asset path. This recommendation
is not implemented in this change.
