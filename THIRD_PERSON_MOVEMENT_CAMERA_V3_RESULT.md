# Third-Person Movement + Camera Feel V3

20 October 2026.

## 1. Executive Result

**PARTIAL.** The reproduced steering discontinuity is fixed, character turning is
smooth, and the reviewed recordings show a materially more connected camera and
player. Releasing/repressing W after an orbit changed travel heading by **55.007
degrees before / 0.000419 degrees after** in the selected route. The camera no
longer turns itself behind every new character heading.

Full CI also remains red: eight editor cases timed out in its single invocation;
seven passed a focused normal-limit retry, while the unchanged character
placement/save case still exceeded its 5-second limit. All final builds/package
checks and 75 cheap Node tests passed. See section 14.

Does ordinary navigation now feel smooth and predictable? The captured motion and
real-input routes support improved predictability and visual continuity. A full
hands-on subjective PASS remains unverified: the computer-use inventory exposed no
browser, and opening the in-app browser returned unavailable. I used actual
Playwright keyboard/mouse controls and visually reviewed fresh captures; I did not
personally play through a connected interactive browser. This result deliberately
does not equate passing vectors/tests with completed subjective acceptance.

## 2. Original Feel Problems

- Follow yaw was **actor facing + authored yaw offset + mouse offset**. V2 held a
  different heading from keydown, while the visible camera followed the changing
  actor. After a 55-degree mouse orbit, releasing/repressing W re-established the
  basis and produced another approximately 55-degree change without more mouse input.
- Every movement segment assigned character yaw directly. Reversals and diagonal
  changes produced visible facing jumps rather than a short turn.
- Mouse offsets were damped at response 22, then the entire camera position was
  damped again at the demo's response 9. Orbit and translational follow shared this
  second delay, making the visible reference frame trail the control frame.
- Continuous 0.2 m segments restarted at the next 16 ms input poll. Ordinary late
  polls introduced small gaps; the baseline selected walk window averaged about
  2.97 m/s against its 3.33 m/s transaction rate. This is a diagnostic observation,
  not a controlled cross-version speed benchmark.
- The camera could remain behind a solid wall, obscuring almost the entire player.
  Click-to-look also stopped receiving movement when the pointer crossed the HUD.

Original camera audit:

| Concern | Before |
| --- | --- |
| Player anchor | Centered render-world X/Z; terrain/support or airborne feet + 0.625 m |
| Look target | Anchor + authored look height (demo: 0.3 m) |
| Desired position | Anchor + `(6 cos(pitch) sin(yaw), 1.5 + 6 sin(pitch), 6 cos(pitch) cos(yaw))` |
| Pitch/yaw | Degrees; actor yaw plus authored/runtime offsets; mouse current/target offsets |
| Smoothing | `1 - exp(-response * deltaSeconds)`; mouse 22, demo position/look 9/9 |
| Input | Keydown and 16 ms held-input poll, then shared swept transaction |
| RAF order | Vertical locomotion; sampled player position; direct facing; animation sync/update; mouse damping; camera target/damping; render |
| Frame dependence | Existing camera damping was already delta-time safe; the 16 ms movement deadline gap was separate |
| Feedback | Movement changed facing, which changed desired camera yaw; keydown could then capture that changed frame |

These diagnoses come from the original source and the fresh before recording,
not historical milestone evidence. No original stair/combat defect is inferred
merely from the camera problem.

## 3. Camera-Relative Movement

Follow Player now initializes an independent camera heading from spawn/restored
facing and the authored yaw offset. Mouse look changes it; explicit Recenter aims
it behind the current gameplay facing. Travel, attacks and interactions do not
automatically rotate this camera heading.

Movement projects the **visible camera position minus look target onto X/Z**.
W follows its forward ground vector, S reverses it, and A/D use its perpendicular
right/left vector. Continuous diagonals are normalized. Pitch and obstruction
focus height cannot change horizontal speed.

There is no held-heading lock and no separate slowly chasing movement controller.
Held and fresh keys use the same visible basis. The camera's short orbit damping
and existing short movement segments bound steering changes. Inspect remains
world-relative, with its existing orbit/pan/zoom; legacy grid movement retains
cardinal transactions. Collision, terrain, cell-entry and trigger ownership stay
in shared runtime helpers.

## 4. Character Turning

Player wrapper yaw follows the shortest angular arc with exponential damping:
response **18 walking, 24 sprinting, 12 airborne, 30 during an accepted attack**.
These correspond to roughly 128/96/192/77 ms to remove 90% of a fixed angular error.
Stationary characters finish the current small turn and retain their facing.

Combat latches the accepted transaction's cardinal facing for the one-shot;
movement cannot swivel its rendered strike during recovery. Hit/Death retain
their orientation. Existing target-facing Interact/Pickup presentation still
overrides travel, then blends back. The animation/controller identity is unchanged
by yaw updates. No collision position is interpolated or displaced by this turn.

## 5. Acceleration / Deceleration

No acceleration, inertia or new speed state was added. Immediate starts and short
stops were retained; normal animation crossfades already soften gait changes.
The diagnosed discontinuity was heading/camera feedback and segment timing.

A small shared scheduling helper lets an ongoing held segment join the previous
deadline, recovering **at most one 16 ms poll**. Fresh presses start at the current
time. Pauses cannot accumulate a backlog. The same swept 0.2 m path remains
authoritative; blocked paths are never extended. Releasing a key completes only
the current segment (normally about 60 ms walking / 36 ms sprinting on this demo).
Long host hitches can still lose movement time beyond the bounded recovery.

## 6. Camera Follow

Translation is damped independently of orbit. At the demo's authored 9/9 settings,
the camera anchor uses response **14.4**, the look target **18**. The orbital offset
is reconstructed around that anchor, rather than damping the mouse turn through
another entire-position filter. Horizontal and vertical anchor translation use
the same response; no additional vertical spring or camera editor was needed.

Continue/reset initializes the anchor directly at the restored supporting/foot
height, including the initial +0.625 m player center. Transient focus, look and
obstruction state is not serialized. Fixed-isometric follow keeps its prior path.
Returning from Inspect places Follow around the current player with its stored
Follow heading; Inspect movement does not redefine that heading.

## 7. Camera Orbit

Sensitivity remains **0.22 degrees/pixel yaw / 0.18 pitch**, with response **30**
and no mouse acceleration. Runtime Follow pitch is clamped to **-5 through 65
degrees**, including initialization from an extreme authored base pitch. Inspect's
separate limits remain unchanged.

Click-to-look receives pointer movement at the window while active, so crossing
the HUD no longer interrupts a turn. Escape and existing modal/mode boundaries
release it. Cleanup removes the same listener; Inspect still requires its existing
Alt-drag gestures. Recenter preserves current orientation initially and damps
toward the new heading instead of snapping it.

## 8. Jump / Sprint Camera

The anchor follows actual airborne feet through Jump/Fall/Land with the same
bounded damping. Airborne facing steers gently toward horizontal travel. Existing
gravity, support sampling, air-control multiplier and landing recovery are unchanged.
No landing shake, bounce, bob or vertical disconnection was added.

Distance remains the authored **6 m**, height **1.5 m**, FOV **55** on these demos.
Sprint has faster character turning, with no FOV effect or separate camera offset.
Walk/Run playback tuning remains V2's existing speed scaling; no speculative gait
multiplier, IK, root motion or new animation asset was introduced.

## 9. Camera Obstruction

Implemented a segment check against the existing transformed traversal solid boxes,
expanded by **0.18 m** for camera near-plane clearance. Grid/render-world centering
is accounted for once per scene. There is no duplicate collision world, GLB raycast,
player-body collision or large per-frame structure allocation.

The boom contracts immediately before a blocker and restores with response **8**.
A bounded short-boom look-target lift (at most **0.45 m**) keeps the head/upper
body visible without moving the already collision-tested camera position. Initial
review rejected a closer-camera view with the head cropped; the final wall view
keeps the face visible. It remains a close upper-body view, not full-body framing.

The real-input orbit crosses the HUD behind the wall, then turns clear and asserts
restoration above 99% of the normal boom. The selected run reached a minimum boom
fraction of approximately 0.182. Player collision and position are unaffected.

## 10. Combat / Interaction Compatibility

The fresh sword route passed unarmed and sword attacks, movement/attack/recovery in
Follow Player, sprint, Jump/Fall/Land, airborne attack rejection, damage/defeat,
chest opening, physical pickup, dialogue, equip/unequip and both Continue paths.
No lock-on or enemy-driven camera rotation was added.

Attack-facing and interaction-facing regressions have mounted boundary tests.
Immediate damage and cardinal combat targeting remain existing semantics; during
an abrupt reversal, the faster attack turn converges during the windup rather
than inventing a new targeting rule. Cosmetic full-body actions can still slide
while gameplay movement continues.

Browser observation records rendered transient actions and the phase at the actual
F event. This avoids treating a driver-delayed post-landing input as an airborne
test. It never calls gameplay methods or writes player/camera transforms.

## 11. Performance

The selected camera window retained **2 -> 2 scene builds, 20 -> 20 asset clones,
one active runtime RAF**. Recorded camera-update cost was **0.1 ms average / 1.1 ms
worst** in that capture; this is local instrumentation, not a controlled GPU/FPS
benchmark. The sword route recorded zero new GLB requests during actions, stable
scene/load/clone/RAF counters and normal local defeated-NPC disposal.

Camera/facing state stays in refs or scene-owned presentation state. No React
camera-frame updates, controller recreation, traversal rebuild or second runtime
RAF was added. Development-only attributes expose Follow yaw/pitch, facing, target/actual
rig and clearance. They provide observation, not a mutation API or dashboard.

## 12. Before / After

Fresh recordings use the same initial movement fixture and control sequence.
Their browser scheduling/loading times differ; GIF playback retains the captured
timing and is not a controlled frame-pacing comparison.

| Motion | Before | After |
| --- | --- | --- |
| Walk + orbit + W repress | [Before](docs/assets/camera-v3/before-walk-orbit.gif) | [After](docs/assets/camera-v3/after-walk-orbit.gif) |
| Sprint turn | [Before](docs/assets/camera-v3/before-sprint.gif) | [After](docs/assets/camera-v3/after-sprint.gif) |
| Jump + orbit | [Before](docs/assets/camera-v3/before-jump.gif) | [After](docs/assets/camera-v3/after-jump.gif) |
| Wall | [Obscured player](docs/assets/camera-v3/before-wall.png) | [Short-boom framing](docs/assets/camera-v3/after-wall.png) |
| Sword -> moving recovery | No fresh pre-change sword capture | [Follow Player recovery](docs/assets/camera-v3/after-sword-recovery.gif) |

The before attack segment was unarmed, so it is not presented as a sword comparison.
Full source recordings and read-only samples remain under `test-results/camera-v3/`.
The GIFs are 768 x 540 at 12 FPS; the original 1280 x 900 videos retain 25 FPS.
The visual review checks connected framing, turn continuity, jumping and obstruction;
it cannot substitute for the unavailable hands-on control assessment.

## 13. Browser Acceptance

- Original real-input baseline: **1 passed**, before runtime edits.
- Final camera route: **1 passed in 60 seconds**. Follow W/orbit/repress, A/D,
  diagonals/reversals, repeated starts/stops, sprint/orbit/walk, moving jump/air
  orbit/land, attack/recovery, wall contraction and restoration; stable lifecycle.
- Final sword route: **1 passed in 1.4 minutes**, covering section 10 and unchanged
  authored serialization, with zero page exceptions.
- Final movement course: **1 passed in 2.6 minutes**. Wall stop at x 14.68, jump into
  wall, raised support at height 1.65, grounded Save/Continue, combat and editor
  isolation. Its long sprint leg now starts farther inside the lane; the old route
  held W into the water border and correctly became Idle.
- Explicit Follow stair/crate/rock route: **1 passed in 1.2 minutes**. Stair ascent
  reached support height **1.54 m**, descent returned to **1 m**, and held WASD
  circled both props. Reviewed [stairs](docs/assets/camera-v3/after-stairs.png),
  [crate](docs/assets/camera-v3/after-crate.png) and
  [rock](docs/assets/camera-v3/after-rock.png) frames retain comfortable player framing.

All cases use the ordinary checked-in `movement-v2-demo.project.json` or
`melee-weapon-v1-demo.project.json`, existing imports/UI, actual keys/mouse and
read-only observations. No fixture or gameplay hook was added. Each final run
uses one worker, separately from CI and media extraction.
The [compact evidence record](docs/assets/camera-v3/review.json) retains the selected
heading, lifecycle, support and position measurements.

Exact opt-in selectors in the existing test files are `@camera-v3$` (main motion),
`@camera-v3-obstacles`, `@movement-v2`, and `@melee-weapon-v1`. Use `--workers=1`.
`CAMERA_REVIEW_LABEL` enables review video; output overrides keep fresh evidence
separate from historical milestone assets. Normal browser defaults remain integration-only.

For a hands-on review, import [Movement V2 Demo](movement-v2-demo.project.json),
choose **3D View**, then **Play**. Follow Player is the normal mode. Click the
viewport to look, move the mouse while holding WASD, and use Escape to release.
Use [Melee Weapon V1 Demo](melee-weapon-v1-demo.project.json) for sword/chest/pickup
and dialogue review.

## 14. Validation

Focused camera, yaw, obstruction, movement-deadline and mounted runtime checks
passed during iteration. They cover projected forward/strafe, normalized diagonals,
pitch initialization/clamp, held/repressed steering, Follow/Inspect, shortest-arc
yaw, sprint/air/attack turning, target-facing interaction, transformed obstruction,
restoration and restored support/camera initialization.

Constant-target orbit, yaw, focus and clearance response is tested with **30, 60
and 120 FPS delta sequences**. These are deterministic response checks, not a claim
of actual hardware runs at all three refresh rates.

`npm.cmd run ci` was invoked **once**. Vitest finished with **826 passing / 8
timed-out tests across 102 files** (99 files passed). The failures were two cases
in `characterGameIntegration.test.tsx`, one in `mapProductPass.test.tsx`, and five
in `projectRecovery.test.tsx`; these files are unchanged. No assertion failure was
reported. Log: `test-results/camera-v3/ci.log`.

Only those eight cases were retried using their existing limits: **7 passed, 1
timed out**. Character placement/duplication/transform/save again exceeded its
5-second limit (6.24 seconds reported). Repository timeouts and editor code were
left unchanged. This remains a failing full CI gate; the focused retry does not
replace it. Log: `test-results/camera-v3/ci-timeout-recheck.log`.

The stages CI did not reach were then completed in their original order: final
type-safe root build, all three package builds/typechecks, type-safe Studio build,
and **75 passing cheap Node compiler/asset tests**. Root compilation first identified
two new test-fixture query options belonging to Playwright rather than Testing
Library; they were corrected, and the **two affected mounted cases passed** before
the successful build. Logs: `test-results/camera-v3/test-fixture-recheck.log` and
`ci-remaining.log` in the same directory. Existing Vite large-chunk advisories remain.

Final `git diff --check` passed. Whitespace checks passed for all 14 changed/new
text files; all 16 report sections and 15 artifact/demo links were validated.
The seven timed GIFs and five selected gameplay images were inspected. No Blender
build or broad browser/performance matrix was run.

## 15. Remaining Feel Issues

- Hands-on simultaneous movement/mouse judgement remains unavailable, so the
  primary subjective acceptance is PARTIAL even with passing real-input routes.
- Close walls produce a tight upper-body view and immediate inward contraction.
  Very narrow corners and abrupt obstruction boundaries warrant human review.
- Obstruction uses profiled traversal solids, not arbitrary decorative meshes,
  terrain triangles or every legacy unprofiled structure. A focus embedded in
  geometry is not solved by a cinematic/fading system.
- The current short segment can finish after release/direction change. Poll gaps
  beyond the bounded 16 ms recovery remain during longer host stalls.
- Walk/Run still have residual foot drift. Full-body Attack/Hit/Interact/Land may
  slide during movement; these existing animation limits were not disguised as
  fixed by camera work.
- No fresh pre-change sword motion or interactive hardware 30/120 FPS acceptance
  was captured. No broad body/animation/Blender matrix was claimed.

## 16. Recommended Next Feature

**Camera polish.** Complete a hands-on feel review and refine tight-corner/short-boom
comfort on the existing controller before choosing another gameplay system.
No next feature was implemented.
