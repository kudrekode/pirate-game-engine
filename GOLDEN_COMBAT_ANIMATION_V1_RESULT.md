# Golden Combat Animation V1 Result

18 October 2026. Implementation follows `CHARACTER_ANIMATION_CAPABILITY_AUDIT.md`.

## 1. Executive Result

**PASS.** Golden-native Attack, Hit and Death are implemented, exported and
integrated with the existing combat events. Real-input runtime acceptance,
Studio preview, deformation/export checks and combat lifecycle/performance checks
passed. All required validation stages are complete; the single full CI invocation
initially failed, then its four failed cases passed focused retries and all skipped
build/compiler stages passed separately (details in section 15).
Existing Idle/Walk, character GLBs, rig, identity baking, combat values and saved
character references are preserved.

## 2. Animation Assets

[Editable source and provenance](tools/blender-character/animations/golden-combat-v1/README.md)
contains one armature and exactly three saved Actions. The [published library](public/assets/derived/humanoid-animations/golden-combat-v1/actions.glb)
is **105,668 bytes**, with no meshes, materials or textures. Its SHA-256 is
`8443c9e5ade21a269a5a2517ea6422f139f116fe359ef7f318304bad38f5c1d3`.

| Motion | Exact clip name | Duration | Tracks |
| --- | --- | ---: | ---: |
| Attack | `GoldenCombat_Attack_V1` | 0.500 s | 52 rotations, including 30 non-leaf finger joints |
| Hit | `GoldenCombat_Hit_V1` | 0.333 s | 22 rotations |
| Death | `GoldenCombat_Death_V1` | 1.350 s | 22 rotations and vertical pelvis position |

Death includes 0.25 s of final-pose hold. All curves use sampled LINEAR keys.
The source blend is approximately 270 KB. No body/texture payload is duplicated.

## 3. Golden Compatibility

The actual multi-clip GLB was loaded with production GLTFLoader. Source local
rest matrices match the dressed canonical target exactly, across all 65 names
and the same hierarchy. Targets pass the existing pinned Golden inverse-bind/rest
signature. Exact channel contracts reject missing fingers, added scale/root
tracks, extra clips and non-finite values.

61 samples over each complete clip verify finite transforms/deformed bounds,
no horizontal pelvis motion, clamped final poses, clone independence and rest
restoration. Attack and Hit have no translation tracks. Root/wrapper position
remains gameplay-owned. The unchanged rest representation preserves native +Z
forward and the existing 180-degree presentation correction.

[Shipping round trip](public/assets/derived/humanoid-animations/golden-combat-v1/roundtrip.json)
and [height checks](docs/assets/golden-combat-v1/height-roundtrip.json) record the
actual results. Node checks use the repository's texture stand-in; browser images
provide separate material/deformation observations.

## 4. Animation Controller

The existing controller now explicitly chooses **Defeated > Hit > Attack > Walk
> Idle**. Hit interrupts cosmetic Attack, and accepted Attack requests during Hit
are discarded. Repeated accepted Attack/Hit requests restart their own one-shot;
there is no queue. Missing/loading actions retain locomotion and are not replayed
later. Invalid zero/non-finite clip durations are rejected.

Attack/Hit finish into the latest locomotion context. The existing 120 ms blend
now also applies on return: a clamped recovery pose remains available while the
next action fades in. A real-clip boundary check exposed an approximately
73-degree upper-arm jump on the old return path; keeping the action for the
crossfade removes that single-frame jump. No blend graph, masking or IK was added.

## 5. Attack

The 0.5 s right-hand strike has preparation, extension and recovery, with controlled
finger closure. Existing `attackStarted` is authoritative: an accepted miss plays,
while a cooldown rejection does not restart it. Shared damage remains immediate.
No hit-frame callback changes targeting, health or cooldowns.

[Attack sequence](docs/assets/golden-combat-v1/attack-sequence.png) shows the
exported poses; the real-input route separately observes Attack and its return.

## 6. Hit Reaction

Positive nonlethal `npcDamaged` and `playerDamaged` trigger the victim's short
recoil. Zero damage does not trigger Hit; lethal damage enters Death directly.
Movement, collision and cooldowns continue under the same shared gameplay rules.
There is no displacement or stun.

## 7. Death

Shared defeat still removes the NPC from the session area, collision, targeting,
NPC decisions, quest semantics and saves immediately. The Three effect retains
only that actor's group/controller. A loaded Death action plays locally and is
removed after completion; a duration-plus-250-ms deadline (capped at 10 s) prevents
an indefinitely retained visual. Missing/unloaded/failed Death or no controller
uses immediate removal.

The existing scene effect owns retention, RAF updates and teardown. Removal
cleans the actor's cloned skeleton/controller once, leaving cached geometry,
materials, renderer, terrain, traversal and surviving controllers intact. Effect
cleanup removes remaining dying actors; Continue never restores them.

The browser crossed the defeated NPC's former cell while its visual remained,
saved during that presentation, and continued with the NPC still absent.
[Death sequence](docs/assets/golden-combat-v1/death-sequence.png) shows the authored
fall and final pose.

## 8. Successful Completion vs Death

Player defeat presentation has its own ref, set by real game-over defeat and
zero health. `endGame`/`gameEnded` still end the UI/session and block input, while
living players retain locomotion/Idle. The RAF no longer treats every terminal UI
state as death. Separate real-input actual-death and successful-completion routes
passed. The existing centered terminal overlay can obscure the fallen player in
some camera framing; its UI behavior is preserved.

## 9. NPC Contact Attack

Positive `playerDamaged` identifies the source NPC by its existing `npcId` and
requests its cosmetic Attack. Zero-damage contact does not. The shared contact
transaction and timing are unchanged. The browser observed source-NPC Attack and
player Hit during ordinary contact.

## 10. Deformation / Clothing

Reviewed the existing dressed **Athletic, Broad and Fuller** outputs with T-shirt,
trousers and boots. Attack shows a forward fist, torso rotation and readable elbow
extension; Hit is a restrained upper-body recoil; Death buckles the knees and
falls backwards into a held grounded pose. The initial shoulder-order and floor
penetration defects were corrected before publication. No severe shoulder,
armpit, elbow, wrist, hip, knee or clothing failure appeared in the selected views.
Deep joint creasing remains part of the existing stylised body/outfit foundation.

[Three-body numeric evidence](docs/assets/golden-combat-v1/deformation-numeric.json)
records reused artifact paths and whole-clip samples. [Athletic](docs/assets/golden-combat-v1/athletic.png),
[Broad](docs/assets/golden-combat-v1/broad.png), and
[Fuller](docs/assets/golden-combat-v1/fuller.png) are fresh rendered observations.

Height endpoints 1.50 m and 2.10 m were checked using the compiler's documented
uniform parent-scale convention on the existing 1.82 m dressed output, without
re-exporting character GLBs. Minimum sampled model-space floor clearance was
about 6.1 mm and 8.5 mm respectively; final minimum Y was 12.2 mm and 17.1 mm.
[Short](docs/assets/golden-combat-v1/height-min.png) and
[tall](docs/assets/golden-combat-v1/height-max.png) captures show those presentations.
This is a small representative selection, not universal outfit/action acceptance.

## 11. Asset Pipeline

`author.py` creates the separate saved source; `export.py` exports those three
explicit names. `npm.cmd run bake:golden-combat` runs two isolated Blender exports,
requires identical GLB bytes, validates the real loader round trip, checks input
hashes, and writes metadata/evidence. Different bytes cannot overwrite an existing
published output. Future changes require a new revision/cache ID.

The Golden registry adds one stable external source, looked up by exact clip name.
Imported `golden-idle-walk-v1` records stay loadable. SkeletonUtils clones,
per-actor mixers/actions and the shared prepared-clip cache remain the existing
path. The new library loads once, not per strike. Compiler/finalisation flows and
existing Idle/Walk export validation are unchanged.

Studio adds only Attack/Hit/Death controls beside Rest/Idle/Walk on authored
humans. One-shots clamp for inspection and can be replayed with the same button.
Diagnostic retarget modes retain their existing locomotion controls.

## 12. Performance

Three fresh profiler-free runs used the unchanged Runtime Parity Demo with six
loaded authored characters, installed Chrome, hardware ANGLE/D3D11 on Intel Iris
Xe, and the existing 1440 x 830 runtime canvas. Each run measured an accepted miss,
positive contact, nonlethal hit, cooldown rejection and lethal hit. The lethal
window extends through delayed disposal.

| Event | Samples | Input/tick to next RAF | First runtime render completion |
| --- | ---: | ---: | ---: |
| Accepted miss | 3 | 3.5-7.1 ms | 7.0-15.3 ms |
| Incoming contact damage | 10 | 0.6-6.9 ms | 4.2-14.6 ms |
| Nonlethal player hit | 3 | 4.3-5.3 ms | 9.3-14.1 ms |
| Cooldown rejection | 3 | 2.6-3.4 ms | 9.9-11.1 ms |
| Lethal player hit | 3 | 3.5-4.8 ms | 8.8-14.2 ms |

Every window retained scene/renderer/surviving-controller identity: **zero scene
rebuilds, new clones, controller creations, GLB loads, traversal builds, clip
requests or clip preparation**. Only the defeated controller was eventually
disposed. Authored project serialization remained unchanged. Event-containing
frame intervals were 8.3-18.4 ms. Whole windows included occasional unrelated
intervals up to 38 ms; this is not a claim of universally hitch-free rendering.
No recurring hit-frame stall or former lethal whole-scene stall appeared.

[Per-event measurements and lifecycle evidence](docs/assets/golden-combat-v1/performance.json)
retain the ranges, raw event rows and identities. Original windows are in ignored
`test-results/combat-hitch/after-golden-combat-v1.json`. Historical numbers in
`COMBAT_HITCH_RESULT.md` are context, not a newly rerun baseline. These are browser
CPU/RAF observations, not display scan-out or GPU execution timings.

## 13. Demo Project

Import [golden-combat-animation-demo.project.json](golden-combat-animation-demo.project.json),
select **3D View**, then **Play**. It uses the existing permanent authored character
as player, one hostile Sparring Guard and one passive Guide, on the ordinary
courtyard project. No runtime mutation hooks or new schema are required.

Press Space at spawn for a miss. Move right once to (3,7), let the guard approach,
and press Space twice with at least 500 ms between attacks. Observe incoming Hit,
NPC Hit and Death. The freed cell can be crossed immediately. Save Game, Back to
Edit, Play and Continue retain the defeat.

## 14. Browser Acceptance

The existing `e2e/runtime-parity-save.spec.ts` now has three opt-in
`@golden-combat` cases. They use real import/Play, keyboard movement/Space,
Save/Continue and ordinary authored fixture variants for actual death and success.
All three passed. The route checks Walk/Idle, accepted miss, blocked restart,
NPC/player Hit, NPC contact Attack, immediate freed collision, temporary dying
presentation, local cleanup, stable scene/clone counts and authored equality.
[Runtime observations](docs/assets/golden-combat-v1/browser-observations.json)
record observed states and lifecycle snapshots.

Initial browser attempts were interrupted during page loading. DOM-ready
navigation and installed Chrome completed the routes. These interruptions are not
counted as passes. Studio's first added test attempted the creator's hidden
legacy seek slider; it was corrected to use visible playback controls.

## 15. Validation

- Focused controller: 9 tests passed, including loading/missing fallback,
  interruptions, restarts, completion, death priority and independent actors.
- Focused Three adapter: 55 tests passed, including zero/nonlethal/lethal contact,
  accepted miss/cooldown, retained death, deadline fallback, teardown and success.
- Actual shipping multi-clip round trip and contract rejection: 2 Node tests passed.
- Two isolated exports produced identical bytes; canonical and Idle/Walk hashes
  remain unchanged. Existing character GLBs were not regenerated or modified.
- Three runtime browser cases passed. The affected combat route passed again
  after the return blend; the focused Studio preview case also passed.
- Required `npm.cmd run ci` was invoked **once**. It exited 1 after Vitest:
  **91 files / 763 tests passed; four cases failed** out of 95 files / 767 tests.
  Two exact mapping expectations still described only Idle/Walk; these were
  updated to assert all five mappings and the shared action source. Their two
  files then passed all **16 tests**. The existing Ctrl+S editor smoke case and
  character assignment/save/reload case timed out (15 s and 5 s limits); both
  passed an unchanged focused retry. No timeout was raised and no test was disabled.
- Per AGENTS.md, the full CI command was not rerun. Its skipped stages were run
  in the same order: root type-safe production build, both contract package
  builds/typechecks, shared preview package build/typecheck, Studio type-safe
  production build, and **65 cheap Node compiler/asset tests**. All passed,
  combined exit 0. Vite emitted its existing large-chunk advisories; PowerShell
  renders redirected stderr as `NativeCommandError` text despite successful exits.
- `git diff --check` passed. New text files were additionally checked with
  `git diff --no-index --check`; no whitespace errors. All 17 report sections,
  local links and source/published hashes were checked.

Local validation logs are in ignored `test-results/golden-combat-v1/`:
`ci.log` preserves the original failed run; `registry-retry.log`,
`editor-retry.log` and `ci-remaining.log` record the corrections/retries and
completed stages. The source and portable evidence linked in this report do not
require those local logs to be distributed. This is completed validation after
focused corrections, not a claim that the original CI invocation exited zero.

## 16. Remaining Limitations

One stylised strike, recoil and backward fall; no directional variants. Damage is
immediate and can precede the visible extension. Movement can continue during a
cosmetic one-shot. The existing terminal overlay can cover the player corpse.
The fixed fall is reviewed on representative flat-ground presentations, not every
slope, identity/outfit combination or neighboring obstacle. Existing deep-joint
creases remain. Phaser retains its existing marker presentation.

## 17. Recommended Next Pass

**Animation polish.** Review anticipation/recovery and player-death readability
under the terminal overlay at normal gameplay framing. Do not add mechanics in
that pass. No follow-up system is implemented here.
