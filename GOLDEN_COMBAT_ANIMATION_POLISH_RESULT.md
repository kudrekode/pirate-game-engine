# Golden Combat Animation Polish Result

19 October 2026. Final motion bundle: `golden-combat-v3`.

## 1. Executive Result

**PASS, on the selected representative views.** Attack, Hit and Death now look acceptably game-like at normal gameplay framing: the strike has a deliberate body lead and recovery, Hit has an impact-led response, and Death accelerates into a grounded settle. This is visual acceptance of this small action set, with the limits in section 13.

Attack now coils into a higher strike, retracts into a repeatable guard and blends
back to locomotion. Hit responds quickly before its slower balance correction.
Death loses support, accelerates into ground contact, then settles into an
asymmetric held pose. These are the reasons for the visual judgment. The export
and regression results establish compatibility separately.

The assessment uses timed motion sequences, dense samples and actual gameplay
framing on the dressed canonical human. It is the agent's visual assessment;
the user has not yet reviewed this revision. Representative flat-ground acceptance
and the remaining weaknesses are described below.

## 2. Original Visual Problems

- **Attack:** hands gathered around the waist, the strike had a low, weak silhouette,
  and the pelvis/stance contributed little. Extension held almost unchanged from
  0.20 to 0.27 s. Preparation, strike and return felt like successive eased poses.
- **Hit:** the approximately 0.10 s ease into a nearly symmetrical backward lean,
  followed by a hold, read as a posture change. The head, chest and arms responded
  too uniformly and the short return offered little balance correction.
- **Death:** the body stayed relatively upright through much of the clip. The feet
  appeared to support a backward lean, then the body lowered rapidly near the end.
  Arms and legs had little delayed response; the straight final arrangement felt staged.

These observations came from the original published V1 library, with the same
lighting, model and four review cameras used for the final comparisons.

## 3. Attack Improvements

The relaxed opening guard rises into a compact load. Pelvis yaw leads the chest;
the striking shoulder advances while the other arm stays bent near the chest.
The head counter-turns toward the target. Extension accelerates through the last
part of the delivery, reaches its strongest pose at about 0.233 s and remains
readable through 0.267 s. The wrist stays aligned with the forearm and the elbow
retains a small bend. The planted ankles prevent the earlier small foot lifts.

Retraction completes into a relaxed guard by about 0.417 s. The clip begins and
finishes in this same guard. That supports the existing 500 ms accepted-repeat
cadence; a single attack uses the existing 120 ms fade into the latest Idle/Walk.
There is no new controller state or combat stance mechanic.

A technically valid intermediate V2 was rejected during cadence review: restarting
it at 500 ms jumped the wrist about **275 mm**, with approximately 33 degrees of
upper-arm and 49 degrees of forearm recovery still outstanding. Final V3 matches
its opening pose at that boundary; the measured wrist difference is below the
focused test's 0.01 mm tolerance. The [cadence comparison](docs/assets/golden-combat-polish/cadence-comparison.gif)
and [boundary sheet](docs/assets/golden-combat-polish/cadence-boundary.png) show this correction.

The fingers close more strongly at their proximal joints, with restrained distal
curl and an opposing thumb. The [four-view hand inspection](docs/assets/golden-combat-polish/fist.png)
shows the actual dressed model at extension. Hands remain deliberately stylised.

## 4. Hit Improvements

The upper torso responds within the first 50 ms of the authored clip. The head
and uneven shoulders make the direction change visible; the lower torso and arms
catch up over the following frames. A small recovery overshoot near 0.25 s precedes
the neutral finish at 0.45 s. Ankles remain planted in model space.

The existing 120 ms runtime crossfade softens the very first recoil frames. The
reaction still reads sooner because its motion is concentrated near the start,
with the remaining time used for recovery. There is no displacement, stun or
change to movement, damage or contact timing.

## 5. Death Improvements

A brief recoil precedes unequal knee buckling. The hips tip as support is lost;
the legs fold and then release as the pelvis descends. The larger rotation and
vertical descent occur during the accelerating fall, rather than the final frames.
The authored contact pose is reached at about 0.767 s. Forearms and head settle
later, and the final pose has unequal knees, arms and head rotation.

The settled pose is reached at 1.05 s and held through 1.65 s. The longer total
clip therefore gives the result more reading time while the fall itself reaches
the ground sooner. Clothing, heels, hips, back and head were inspected from side,
front-quarter and rear-quarter views. The final body rests low across its back
and lower body, with one knee partly bent.

Grounding is baked into the authored vertical pelvis curve using the existing
dressed reference. Offline ankle solving for Attack/Hit is saved as ordinary
joint rotations. No solver, constraint, extra bones or body geometry ships in
the action library, and no runtime grounding system was added.

## 6. Animation Timing

| Motion | V1 | Final | Reason |
| --- | ---: | ---: | --- |
| Attack | 0.500 s | 0.600 s | More distinct load/acceleration; recovered guard before 500 ms; existing return fade |
| Hit | 0.333 s | 0.450 s | Earlier impact response and more controlled recovery |
| Death | 1.350 s | 1.650 s | Earlier ground contact, delayed settling, 0.60 s settled hold |

Attack uses ready/load at 0.08/0.15 s, hip lead at 0.183 s, extension at
0.233-0.267 s and relaxed recovery at 0.417 s. The damage transaction remains
immediate. Death's contact pose moves from approximately 1.10 s to 0.767 s.
Curves remain sampled LINEAR keys at 60 Hz after deliberately unequal acceleration,
fast-response and smooth-recovery segments; there is no procedural micro-motion.

## 7. Golden / Clothing Results

Existing Athletic, Broad and Fuller dressed outputs were reused with their shirt,
trousers and boots. The default dressed reference is byte-identical to the Athletic
artifact. Final V3 was rendered on all four targets and checked over 61 samples
per complete action. Target hashes and results are in the
[deformation evidence](docs/assets/golden-combat-polish/deformation-numeric.json).

| Dressed body | Lowest sampled Death point | Final lowest point | Visual result in selected views |
| --- | ---: | ---: | --- |
| Athletic / canonical | 5.10 mm | 9.82 mm | Stable strike/guard; no severe new shoulder, elbow or trouser failure |
| Broad | 5.10 mm | 9.82 mm | Arm clearance and grounded settling retained |
| Fuller | -0.33 mm | 0.81 mm | No significant floor sinking; small sub-millimetre penetration remains |

[Athletic](docs/assets/golden-combat-polish/athletic.png),
[Broad](docs/assets/golden-combat-polish/broad.png) and
[Fuller](docs/assets/golden-combat-polish/fuller.png) show the final published clips.
Existing deep joint creases and chunky hand anatomy remain visible at close range.
This selection does not establish acceptance for every outfit, height, slope or obstacle.

## 8. Gameplay Camera Review

The untouched [combat demo](golden-combat-animation-demo.project.json) was reviewed
at its ordinary fixed gameplay camera, through real import, Play and keyboard
input. The raised guard and fist separate the strike from Idle more clearly at
that scale. The faster recoil and earlier fall/contact remain visible without
close-up framing. [Attack](docs/assets/golden-combat-polish/gameplay-attack-after.png),
[Hit](docs/assets/golden-combat-polish/gameplay-hit-after.png) and
[Death](docs/assets/golden-combat-polish/gameplay-death-after.png) are runtime captures.

Additional [third-person review](docs/assets/golden-combat-polish/camera-review.project.json)
uses the existing camera controls at distance 6, height 1.5, pitch 18 degrees,
look-at height 0.2 and a 25-degree yaw offset. The passive guide is moved aside
in this separate visual-review fixture. The shipping demo remains unchanged.
[Third-person Attack](docs/assets/golden-combat-polish/third-person-attack-after.png)
and [Death](docs/assets/golden-combat-polish/third-person-death-after.png) show that framing.

An aligned standing attacker or the original guide can obscure the forward arm
or fallen actor. The existing player terminal overlay can cover the corpse.
Those visibility limits remain; the camera and terminal UI were preserved.

## 9. Before / After Evidence

- Attack: [timed motion](docs/assets/golden-combat-polish/attack-comparison.gif),
  [anticipation / impact / recovery sheet](docs/assets/golden-combat-polish/attack-comparison.png).
- Hit: [timed motion](docs/assets/golden-combat-polish/hit-comparison.gif),
  [initial / recoil / recovery sheet](docs/assets/golden-combat-polish/hit-comparison.png).
- Death: [timed motion](docs/assets/golden-combat-polish/death-comparison.gif),
  [standing / fall / contact / final sheet](docs/assets/golden-combat-polish/death-comparison.png).

The four views are gameplay scale, side, front quarter and rear quarter. The
before source is immutable V1; the after source is final V3. GIF samples use a
shared 30 Hz clock, with 30/40 ms delays preserving that rate, and hold the shorter
clip's final pose. The isolated Attack GIF holds its authored guard; the actual
runtime performs the existing locomotion return fade, visible in the
[recovered runtime capture](docs/assets/golden-combat-polish/gameplay-recovery-after.png).

The opt-in [review tool](tools/blender-character/review-golden-combat.mjs) plays
real-time loops, then records dense samples and phase screenshots using the actual
GLBs. It resets paused actions and explicitly updates skinned skeletons for each
sample. Early frozen-pose capture attempts were discarded. Final screenshots and
dense motion strips were inspected before acceptance. Local WebM captures and
raw frames remain under ignored `test-results/combat-polish/review-v3-*/`.

```powershell
node tools/blender-character/review-golden-combat.mjs --list
node tools/blender-character/review-golden-combat.mjs --revision v3 --body canonical
```

Start the ordinary root Vite server first. The same exact body selector supports
`athletic`, `broad` or `fuller` using the existing artifacts, without character builds.

## 10. Runtime Integration

The [final source](tools/blender-character/animations/golden-combat-v3/README.md)
and [published action library](public/assets/derived/humanoid-animations/golden-combat-v3/actions.glb)
use `golden-humanoid-v0`. The GLB is **119,816 bytes**, mesh/material/texture-free,
with SHA-256 `25a4d4475bffe7be4fb71000134bcca6a4b03f8242d3e2f77248542ea8e5b6b2`.
[Metadata](public/assets/derived/humanoid-animations/golden-combat-v3/metadata.json)
and [round trip](public/assets/derived/humanoid-animations/golden-combat-v3/roundtrip.json)
record two identical isolated exports and read-only reference hashes.

V1 and the V2 review candidate remain immutable and loadable. The active source ID
is `golden-combat-actions-v3`. The three existing `GoldenCombat_*_V1` clip names
remain stable, as do Idle/Walk sources and `golden-idle-walk-v1` character records.
Source revision and semantic clip names are separate. Existing Golden rig, skinning,
identity baking, character GLBs, cache/clone path and saved character references
are preserved. Studio selects the new library through its existing action controls.

Gameplay and controller files were unchanged by this pass. Priority remains
**Defeated > Hit > Attack > Walk > Idle**. Default 25 damage, range, 500 ms cooldown,
immediate damage, contact health/timing, defeat, quests, flags and Save/Continue
semantics are preserved. Shared defeat removes collision and session state
immediately; only the local presentation remains for Death. No animation callback
controls damage. No additional motion category or gameplay feature was implemented.

## 11. Performance Regression

**Lifecycle regression passed.** All twelve windows retained the scene, renderer and surviving controller identities. There were zero scene builds/cleanups, new clones, GLB loads, traversal builds, controller creations, clip requests or clip preparation during combat. Only one controller was disposed per lethal window; active mixers fell from six to five. Authored serialization remained unchanged.

| Event | Samples | Input/tick to next RAF | First runtime render completion |
| --- | ---: | ---: | ---: |
| Accepted miss | 3 | 3.4-5.4 ms | 7.1-10.9 ms |
| Incoming contact | 9 | 0.4-3.4 ms | 3.4-8.3 ms |
| Nonlethal hit | 3 | 2.7-4.2 ms | 6.6-7.6 ms |
| Cooldown rejection | 3 | 2-4.1 ms | 6.6-7.3 ms |
| Lethal hit | 3 | 2.7-2.8 ms | 6.3-6.5 ms |

Event-containing frame intervals reached 15 ms; whole windows included an occasional 17.6 ms interval. These measurements do not claim universally hitch-free rendering. [Per-event values, counters and identities](docs/assets/golden-combat-polish/performance.json) retain the final V3 observations.

The final lifecycle run uses the unchanged Runtime Parity Demo with six loaded
authored characters, installed Chrome, hardware ANGLE/D3D11 on Intel Iris Xe,
and the existing 1440 x 830 runtime canvas. No CPU profiler, video capture,
image encoder or CI ran during the accepted measurement set.

An earlier set overlapped GIF encoding and is excluded from timing conclusions.
V2 measurements are also retained locally as candidate evidence; the linked report
uses final V3. Historical hitch reports are context rather than a fresh baseline.
These are browser CPU/RAF measurements, not display or GPU execution timings,
and they do not establish equal frame pacing across different dates.

## 12. Validation

- Final deterministic publication: two isolated exports produced identical bytes;
  production GLTFLoader round trip, exact Golden rest/hierarchy, channel contract,
  independent clones, rest restoration, finite deformation and held final pose passed.
- Final focused Node checks: **5 passed**, including planted ankles, the 500 ms
  repeat boundary and exact equality of V2/V3 Hit and Death tracks.
- Final focused controller, Three adapter and registry/preview checks: **80 passed**
  in four files. The controller and gameplay implementation remained unchanged.
- Final dressed canonical/Athletic/Broad/Fuller round trip passed; final render
  sequences and clothing views were inspected.
- Final real-input gameplay: **3 cases passed**, including a repeat accepted while Attack was still active, cooldown rejection, contact, Hit/Death, immediate freed collision, local disposal, Save/Continue, player defeat and living successful completion. Final Studio preview: **1 case passed**, using one action-library request and the new clamped duration.
- Final profiler-free lifecycle regression: **3 repetitions / 12 windows passed** on V3, with zero page exceptions and unchanged authored serialization.
- `npm.cmd run ci` was invoked **once** and exited **0**: **95 Vitest files /
  767 tests**, root and Studio type-safe production builds, all three package
  builds/typechecks, and **67 cheap Node compiler/asset tests** passed.
- The 500 ms cadence review happened after that full gate. Its final correction
  was validated by the affected **80 Vitest cases, 5 Node cases**, fresh root/shared
  preview/Studio type-safe builds, and the final browser/lifecycle checks above.
  Unchanged contract packages and unrelated suites retain their successful CI result.
  The full CI command was not repeated, following AGENTS.md.
- `git diff --check` and `git diff --cached --check` passed. All 19 new text files also passed `git diff --no-index --check`; report links, section structure and source/published hashes were checked.

Local logs include `test-results/combat-polish/ci.log`, `final-builds.log` and the
lifecycle logs. Vite emitted its existing large-chunk advisories; PowerShell's
redirected stderr decoration did not change the successful process exits.

## 13. Remaining Visual Weaknesses

- One fixed strike, recoil and backward fall. There are no directional variants or
  body-aware obstacle adjustments. Hip/stance movement remains restrained.
- Damage precedes visible fist extension. Gameplay movement during a full-body
  one-shot can still create sliding relative to the world; no masking or root motion was added.
- Hands remain chunky and stylised. Existing elbow/shoulder and deep trouser-knee
  creases remain in close views, especially during the fold into Death.
- The baked fall assumes representative flat ground. Fuller retains about 0.3 mm
  sampled penetration; other outfits, heights, slopes and nearby props need their own review.
- The existing 120 ms blend softens Hit's first frames. Aligned actors and the
  terminal overlay can obscure the action or corpse at some camera angles.
- Whole-window timing still included an occasional 17.6 ms interval. Lifecycle preservation is verified; a fresh cross-version frame-pacing baseline was not measured.

## 14. Recommended Next Feature

**Interaction animation.** It would extend visual feedback to frequent NPC and
object use while keeping the existing gameplay transactions authoritative.
