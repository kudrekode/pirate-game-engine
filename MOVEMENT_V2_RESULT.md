# Movement V2 Result

19 October 2026. Gameplay Movement V2; animation source `golden-movement-v1`.

## 1. Executive Result

**PASS for the bounded movement course and selected visual review.** Third-person
play supports Walk -> Run -> Jump -> Fall -> Land -> continued movement. The final
real-input route passed, including walls, a supported raised landing, combat and
Save/Continue. Run has a separate authored stride, lean, arm swing and knee lift.
This is the agent's assessment of the linked views; the user has not reviewed them.
Residual gait/contact limitations are recorded below.

## 2. Existing Movement Reused

`playerMovementTransaction` remains authoritative for horizontal movement, facing,
terrain speed and cell entry. `traversal` retains its cached terrain sampler,
transformed boxes, explicit floor patches, spatial buckets, 4 cm sweep samples and
0.4 m step-up/down limits. Movement duration still derives from the existing player
speed formula and terrain multiplier. Continuous Three steps remain 0.2 m.

Phaser keeps grid movement and its controls. Legacy Three areas without profiled
world assets keep grid walking until a sprint/jump request opts into the already
cached continuous world. Existing saves restore through the same traversal factory.
NPC timing, wander/patrol/chase and definition/instance overrides remain unchanged.

## 3. Input Changes

| Three control | Action |
| --- | --- |
| WASD / arrows | Move; camera-relative in third-person Follow, world-relative in Inspect |
| Shift | Sprint while moving |
| Space | Jump; held auto-repeat cannot double-jump |
| F | Existing attack, including normal cooldown-controlled repeat |
| E / Enter | Grounded interaction |

`threeRuntimeInput.ts` owns the small action mapping. F avoids conflict with the
existing click-to-look camera. There is no binding UI or authored-project migration.
Phaser still uses Space attack. Existing Three combat tests and the combat profiler
were remapped to F, including their input-timestamp observer.

## 4. Sprint

The session's traversal motion records sprint state; it is not inferred from clip
playback speed. The multiplier is **1.65**, with no stamina or inventory/stat gate.
Release returns to Walk, stopping returns to Idle, and blocked movement settles.
The demo's accepted movement rates were **3.333 m/s Walk / 5.5 m/s Run** on sand.
Those are transaction rates; the existing input poll quantizes segment starts.
A 32 ms presentation grace bridges the 16 ms input poll gap without extending
collision travel or keeping a blocked run alive.

## 5. Run Animation

`GoldenMovement_Run_V1` is a separate 40/60 s in-place cycle. It has forward lean,
opposing bent-arm swing, an authored stance/swing foot path and lifted recovery
knees. It does not reuse Walk at a faster rate. The accepted Idle/Walk and combat
sources, all character GLBs and Golden's 65-bone rest rig remain unchanged.

The [source package](tools/blender-character/animations/golden-movement-v1/README.md)
contains editable Actions, authoring and export scripts. Two isolated exports
produced the same **81,428-byte** [library](public/assets/derived/humanoid-animations/golden-movement-v1/actions.glb),
SHA-256 `8e3678b41513221ffd6a314e4f5fb6006962a545fcf733f38a21f7407ffb375e`.
The production GLTFLoader round trip checks exact clips/channels, rest/hierarchy,
finite deformation, loop seams, world-space horizontal root motion, independent
clones and rest restoration. Source/reference hashes remain unchanged.

[Timed Run](docs/assets/movement-v2/run.gif) and the body sheets below show motion.
Walk and Run use modest speed-based playback scaling, clamped to **0.8-1.2x**.
This improves speed response without stride warping or a promise of locked feet.

## 6. Jump Model

`playerLocomotion.ts` owns vertical gameplay. `RuntimeTraversal.motion` records
phase, actual foot height, vertical velocity, elapsed recovery, sprint state and
accepted horizontal speed. The supporting floor/path stays in `traversal.position`.

Takeoff applies **4.8 m/s** immediately, gravity is **13 m/s^2**, and integration
uses bounded 1/120 s substeps with exact constant-acceleration displacement. The
measured apex was **0.88615 m** above support. Descent changes phase to Fall;
reaching valid support produces Land. A suspended tab advances at most 0.1 s per
update. Air input uses 0.85 of the current horizontal speed and the same sweep.
There is no rigid body, root-motion movement, double jump or fall-damage system.

## 7. Jump / Fall / Land Animation

Exact clips are `GoldenMovement_Jump_V1` (0.30 s),
`GoldenMovement_Fall_V1` (0.60 s looping) and
`GoldenMovement_Land_V1` (13/60 s). Jump compresses then extends without delaying
physical takeoff. Fall uses relaxed bent limbs. Land compresses and recovers while
horizontal gameplay continues; its 0.22 s semantic recovery adds no stun.

Priority is **Defeated > Hit > Attack > Jump/Fall/Land > Run > Walk > Idle**.
Existing 120 ms crossfades handle gait changes and recovery. Missing Run uses Walk;
missing airborne clips use Idle; missing Land uses available locomotion. Optional
missing clips never latch an unfinishable action.

[Jump](docs/assets/movement-v2/jump.gif), [Fall](docs/assets/movement-v2/fall.gif)
and [Land](docs/assets/movement-v2/land.gif) retain timed four-view samples.
Final-code gameplay captures show [Run](docs/assets/movement-v2/gameplay-run.png),
[Jump](docs/assets/movement-v2/gameplay-jump.png),
[Fall](docs/assets/movement-v2/gameplay-fall.png) and
[Land](docs/assets/movement-v2/gameplay-land.png) at the authored camera.

## 8. Collision / Traversal

Horizontal blockers remain conservative at supporting-floor height, with an
additional body check at airborne height. Vertical body checks reuse the same
solid/floor buckets and stop upward travel at a ceiling. No arbitrary prop tops
become platforms. An explicit low floor can become support after the feet clear it.

The browser run stopped at **x 14.68** against the authored wall, including while
jumping into it. It landed on the **0.65 m raised floor**, with feet at world Y 1.65.
Ordinary stairs remain steps. Water, void and bounds have no invented landing
surface; every accepted horizontal sample must retain valid support. Large drops
beyond the current step-down envelope remain blocked rather than introducing a
falling-death system. Grounded interaction/touch/progression discovery is reused,
and landing checks the current location again.

## 9. Combat Integration

F calls the existing shared attack transaction. Damage, range, cooldown, targeting,
defeat and Golden combat one-shots remain authoritative. Airborne attacks are
rejected without consuming cooldown. An already accepted combat one-shot retains
its normal priority. Attack interrupts Run visually and recovers to Run when the
held movement still applies. The browser verified that recovery and defeated the
stationary sparring target through two normal 25-damage attacks after Continue.
Existing incoming-contact behavior remains unchanged.

## 10. Camera

The existing third-person follow/look smoothing now follows actual airborne feet.
A held movement gesture keeps a stable camera-relative heading while the actor and
follow camera turn; current mouse-look offsets still apply. This prevents held
strafe/back input from repeatedly steering itself around the turning camera.
Inspect and fixed-camera movement retain their existing convention. FOV stays 55;
there is no bob, zoom effect or new camera system.

## 11. Save / Continue

Airborne saves return **"Land before saving the game."** Grounded saves use the
existing version-1 supporting coordinates. Velocity, held Shift, aerial phase,
landing timer and mixer state are omitted. Continue creates grounded defaults.

The browser restored the raised landing at **(11.88, 12), height 1.65**, with zero
vertical velocity. Existing modal/transition save restrictions remain. The
successful route also compared the complete saved editor JSON before/after Play;
it was unchanged. No authored schema fields or migration defaults were added.

## 12. Golden / Clothing Review

Existing dressed [Athletic](docs/assets/movement-v2/athletic.png),
[Broad](docs/assets/movement-v2/broad.png) and [Fuller](docs/assets/movement-v2/fuller.png)
were reviewed across all four clips, six selected phases, dense motion samples,
gameplay scale, side and quarter views. No character builds were performed.
The [deformation record](docs/assets/movement-v2/deformation.json) includes exact
body hashes and 61 samples per clip/body.

The selected poses show no severe new shoulder, elbow, thigh or trouser failure.
Minimum sampled points were 9.39 mm for Run, -1.25 mm for Jump, 2.35 mm for Fall and
4.62 mm for Land on these targets. Small interpolation penetration and existing
close-up elbow/knee creases remain. This review does not cover every identity,
height, outfit, slope or obstacle. Numerical export success alone was not used as
visual approval.

## 13. Demo Project

Import [movement-v2-demo.project.json](movement-v2-demo.project.json), choose
**3D View**, then **Play**. Start is (3, 8). The flat lane has room to run and jump.
The wall is at (15, 8); stairs and a connected lower floor are near (8, 12);
the jump floor is at (12, 12), with a lower exit floor at (12, 10).
A crate, rock, water border and stationary sparring target at (23, 12) use ordinary
project data and existing world/character assets. NPC passivity uses its placed
`enemyBehaviourOverride`; no test-only runtime hooks are present.

## 14. Browser Acceptance

**Final route: 1 passed in 1.8 minutes**, installed Chrome, real keyboard input.
It covers Idle/Walk/Run/release, rest/moving/sprint jumps, Fall/Land, continued Run,
a running attack, wall blocking, jumping near a wall, supported platform landing,
modal blocking, airborne save rejection, grounded save, reload/Continue, combat
and editor isolation. Detailed collision waypoints use existing Inspect controls;
locomotion/jump chains also run at the authored third-person camera.

The [compact acceptance record](docs/assets/movement-v2/acceptance.json) retains
state transitions, apex, rates, positions and before/after diagnostics from 8,413
read-only RAF samples. No movement state was mutated by the harness. Earlier
attempts exposed screenshot/native-button timing and authored route obstructions;
those were corrected before the final pass. There were zero page exceptions.
A further [real-input smoke on final code](docs/assets/movement-v2/runtime-capture.json)
verified the legacy held-key handoff, F attack, all five runtime visual captures
and unchanged authored data after the final compatibility correction.

```powershell
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts --grep @movement-v2 --list
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts --grep @movement-v2 --output=test-results/movement-v2/browser
```

## 15. Performance

Across the final movement window: scene builds **2 -> 2**, clones **20 -> 20**,
GLB loads **4 -> 4**, zero new GLB requests, two active mixers and **one active RAF**.
The initial asset-settlement rebuild is outside the window. Save/reload deliberately
creates a fresh runtime afterward. All movement/combat transitions reused existing
controllers/actions; clip preparation remains in initial source refresh, not state
switches. Focused controller tests prove one source load across repeated transitions;
the component test retains renderer and terrain-sampler identity across a jump.
There is no sampler/world rebuild on a movement transition. These are lifecycle
checks, not a new comparative GPU/FPS benchmark.

## 16. Validation

- Focused movement, traversal, controller, input, combat, save, component and
  shared-registry checks passed, including the last 81-test focused selection.
- Four-action publication passed two-export byte determinism and production
  GLTFLoader round trip. Athletic/Broad/Fuller fresh round trips and selected visual
  review passed; canonical, Idle/Walk and character reference hashes were checked.
- The final real-input browser route passed; no heavy historical browser, character
  compile or Blender matrix was selected.
- `npm.cmd run ci` was invoked **once**. Its Vitest stage passed **794/795 tests
  in 96/97 files**; one registry assertion still listed only the old animation
  mappings. The exact assertion was updated to include all four new clips.
  The affected registry/shared-preview/component selection then passed **75 tests**,
  including the added legacy held-key handoff regression. Passing unrelated suites
  were not repeated.
- CI had stopped before its build stages. Those remaining stages were subsequently
  completed once on final code: type-safe root build, both contract package builds,
  shared preview package build/typecheck, type-safe Studio build and **70 passing
  cheap Node compiler/asset tests**. The original CI invocation exited 1 at the stale
  assertion; the corrected checks and all resumed stages exited 0. Existing Vite
  large-chunk advisories remain.
- `git diff --check` passed; new text files, report links and source/published hashes were checked.

Local validation logs are under ignored `test-results/movement-*.log`.

## 17. Remaining Limitations

- Conservative blockers prevent jumping over solid props and crossing unsupported
  gaps/water. High step-downs remain blocked. Only declared floors support landings.
- Full-body Attack/Land can slide during movement; gait has no phase matching,
  foot locking or stride warping. Fast authored speeds retain some foot drift.
- Existing clothing creases and the small sampled Jump penetration remain; only
  the selected dressed bodies/views received visual acceptance.
- NPCs retain Idle/Walk and existing AI. There are no aerial attacks, NPC jumps,
  fall damage, swimming expansion or configurable controls.

## 18. Recommended Next Feature

**Movement polish.** Refine contact and gait timing within this bounded model.
No further feature was implemented.
