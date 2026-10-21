# Camera Vertical Orbit V4

21 October 2026.

## 1. Executive Result — PASS

**PASS for implementation, real-Chrome acceptance and repository CI.** Follow
now reaches an approximately 82-degree sky view on ordinary terrain, stairs,
raised supports and a slope. Pointer lock, unlimited yaw, camera-relative movement,
wall obstruction and current Bow aiming passed the selected routes. The report
distinguishes this automated real-input evidence from a separate hands-on feel review.

## 2. Root Cause

The audit covered the V3 and Pointer Lock result documents, current Follow/Inspect
paths, mouse input, player center, obstruction, terrain/support structures and tests.
The old restriction was primarily explicit pitch and orbit geometry, not terrain
being misclassified as a wall:

- The spherical formula adds `sin(pitch) * distance` to camera Y. Positive orbit
  pitch raises the camera and looks **down**. The sky-facing end was **-5 degrees**,
  not +65. Increasing +65 would extend the downward view.
- Camera height and look-target height were independent. On Movement V2, the
  6 m distance, 1.5 m height and 0.3 m target height leave the camera 0.677 m above
  its target even at -5 degrees: its center ray still looks about **6.5 degrees down**.
  Bow's existing higher target only brought that limit approximately to horizontal.
- Negative `movementY` previously increased orbit elevation. Follow's vertical
  mapping therefore moved the view downward when the physical mouse moved upward.
- V3 obstruction tested padded traversal solid boxes only. Terrain was absent from
  that query; widening the negative clamp alone would put the desired camera below
  ground. Traversal support slabs could also contract a descending boom.
- The old short-boom target lift (up to 0.45 m) was useful for walls, but would add
  unnecessary pitch changes to a ground-contracted sky view.

## 3. Previous Pitch / Orbit Model

Follow used -5 through +65 degrees, an authored 6 m radius in the demos, camera
height 1.5 m and player center at foot height +0.625 m. Look target was center
+0.3 m normally and at least center +1 m with Bow. Camera near plane is 0.1 m,
vertical FOV 55 degrees. Yaw accumulated without wrapping; input response was 30.
Inspect independently used 3 through 86 degrees and its own pan/zoom controls.

## 4. New Vertical Orbit Model

Follow uses **-82 through +65 degrees** in the existing orbit-elevation convention.
Mouse-up now decreases elevation and raises the visible aim. Sensitivity remains
0.22 degrees/pixel yaw and 0.18 pitch. Neither endpoint is singular.

Ordinary nonnegative-pitch framing retains its authored geometry. Between 0 and
-45 degrees a smoothstep blends the camera's additional height toward target
height. For negative pitch, radius is bounded smoothly by available foot clearance:

`radius = 1 / hypot(1 / authoredDistance, sin(pitch) / availableHeight)`

This avoids the abrupt distance knee of a hard minimum. A bounded rearward
translation of both camera and target keeps the camera outside the character;
it is capped at the smaller of 2.2 m and half the authored distance. At -82 degrees
on the 6 m movement fixture, camera horizontal separation is 2.2 m, camera height
is about foot +0.245 m, and the center ray looks 82 degrees upward. The virtual
target moves rearward about 2.10 m, with no added vertical target lift.

All adaptation is a deterministic function of the already delta-time-damped
pitch. Returning the pitch restores distance and target without a new spring,
timer, zoom control or camera mode. At steep pitch horizontal focus translation
is shared by both endpoints, preventing different damping rates from reversing
the very short projected view ray during movement.

## 5. Ground / Floor Handling

The existing camera obstruction query now reads the existing terrain sampler and
spatial support candidates. A 0.18 m footprint and 0.22 m vertical clearance protect
the near plane. The desired radius reserves 0.24 m above the player's feet; the
world query then accounts for different terrain beneath the camera, stairs,
platforms and follow translation. Smooth samples use traversal's rendered-triangle
height interpolation; blocky samples reuse cell heights within each query.

The segment is checked at intervals no longer than 0.15 m, then its first blocked
interval is refined eight times. Ground constrains position along the view ray,
not the input pitch. Support planes above the focus remain the solid/ceiling
check's responsibility. Normal flat-terrain sky-look has full obstruction clearance.

## 6. Wall Obstruction Compatibility

Existing oriented-box intersection and 0.18 m wall padding remain. Inward
contraction is immediate; outward restoration retains exponential response 8.
The rearward target translation is checked separately so it cannot silently move
the ray origin through a wall. A little space is retained before that contact to
avoid collapsing the view ray to zero. The old upper-body target lift remains for
downward-facing obstructed cameras and is omitted for upward-facing cameras.

## 7. High-Pitch Framing

Rendered review identified excessive character size in the initial 1.1 m setback.
The final 2.2 m external clearance gives more sky and space around the character
at intermediate angles; near the limit the character naturally leaves the bottom
of the frame. This is a single rearward adjustment, with no shoulder-camera mode,
head attachment, first-person transition or cinematic composition system.

Reviewed captures: [normal](docs/assets/camera-v4/normal.png),
[intermediate upward view](docs/assets/camera-v4/upward.png),
[82-degree sky](docs/assets/camera-v4/flat-sky.png),
[recovered](docs/assets/camera-v4/recovered.png),
[tight wall sky](docs/assets/camera-v4/wall-sky.png) and
[Bow arrow in flight](docs/assets/camera-v4/bow-sky.png).

## 8. Pointer Lock

Ownership checks, relative `mousemove`, request/release handling, Inventory return,
dialogue release, Escape, blur and teardown retain their existing implementation.
Only Follow's vertical delta sign and pitch bound change. Yaw remains unwrapped.
Inspect's absolute drag path and limits are unchanged. Mouse deltas still update
refs, not React state. Mounted tests exercise 1080-degree turns at both pitch ends,
denied requests and UI/lifetime boundaries.

## 9. Movement Compatibility

Movement, sprint, jumping, landing and traversal code are unchanged. The visible
ray still defines the horizontal movement basis. Tests cover normalized forward,
strafe and diagonals, repeated yaw revolutions, ground heights and held/repressed
W at both ordinary and maximum upward pitch. Inspect retains world-relative input.
The real-input route uses ordinary keys for all movement and supporting elevations.

## 10. Bow / Combat Compatibility

Bow continues consuming the actual visible camera ray after obstruction. Current
release timing, speed, range, damage and muzzle-to-camera-ray aim correction are
unchanged. A shared-projectile regression fires upward from the new rig. Browser
acceptance equips Bow through Inventory and checks the released arrow's upward
direction and convergence on the visible ray's 48 m aim point. Parallel directions
would be an incorrect assertion because the existing muzzle offset adds parallax.
Sword and unarmed targeting still use their existing gameplay-facing semantics.

## 11. Real-Input Acceptance

Selected Chrome routes are in the existing movement and ranged suites:

```powershell
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts e2e/ranged-combat-v1.spec.ts --grep '@camera-v4' --list
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts e2e/ranged-combat-v1.spec.ts --grep '@camera-v4' --workers=1 --output=test-results/camera-v4/acceptance
```

They cover mouse-up to sky, rapid/slow recovery, repeated horizontal revolutions,
walk/sprint/jump/land, stairs, raised platform, smooth shoreline slope, a tight wall,
Bow pickup/equip/fire, unarmed/sword attack, chest, physical pickup, dialogue,
Inventory restoration, Inspect and leaving Play. Gameplay state and pointer lock
are never injected. Browser diagnostics are read-only observations.

**Final run: 3 passed in 2.1 minutes**, with no page exceptions. The orbit course
took 1.1 minutes, pointer-lock/combat/UI 37.0 seconds, and Bow 14.0 seconds.
Measured sky view was approximately **82 degrees** on every sampled support:
flat ground **1.00 m**, stairs **1.54 m**, platform **1.65 m**, and smooth shoreline
**0.95963 m**. Camera Y was respectively **1.24451**, **1.78451**, **1.89451** and
**1.20414 m**. Flat ground clearance was 1; the tight wall retained upward view and
the route verified contraction at intermediate pitch followed by restoration.
The lifecycle route measured over 1080 degrees of yaw in each direction at steep
pitch. The compact [review record](docs/assets/camera-v4/review.json) preserves
the selected measurements and bow direction.

Early route iterations correctly hit traversal's step-down boundary when attempting
to leave raised supports sideways; the final route descends the stairs normally
and ends on the jump-only platform. Those harness failures are not reported as
camera passes. This is automated real-browser acceptance with rendered inspection,
not a separate hands-on hardware feel session or multi-browser certification.

## 12. Performance

The existing runtime RAF and scene own all state. No collision world, traversal,
renderer or scene is rebuilt for pitch. No full-GLTF raycasting or React render per
mouse movement is added. Existing traversal boxes, sampler and spatial floor
buckets are reused. The translated-pivot check is skipped when there is no offset.
The selected browser route compares scene, clone and RAF counters before/after.

Observed scene builds stayed **2 -> 2** and RAF starts **2 -> 2**, with **one active
runtime loop** throughout the settled route. Those startup counts include the
existing initial asset-load rebuild. Camera update cost averaged **0.1 ms**, with
**1.4 ms** worst over 13,380 observed callbacks. These are measurements from this
run, not a cross-machine benchmark or a comparison with historical timings.

## 13. Validation

- Focused camera, obstruction, mounted runtime and projectile tests passed:
  124 tests before the extra moving sky-look case; the changed runtime/obstruction
  subset then passed all 84 tests, including that new case.
- Deterministic 30/60/120 Hz sequences verify orbit/boom recovery and obstruction
  restoration. This does not claim hardware runs at those frame rates.
- Changed-file Biome check/write passed with nonblocking style warnings.
- Final real-Chrome acceptance: **3/3 passed**. Selected outputs are under
  `test-results/camera-v4/acceptance`; durable captures and measurements are under
  `docs/assets/camera-v4/`.
- `npm.cmd run ci` ran **once and passed, exit 0**: **104 files / 871 Vitest tests**,
  type-safe root build, all three package builds/typechecks, type-safe Asset Studio
  build and **77/77 cheap Node compiler/asset tests**. The existing Vite large-chunk
  advisories remain. Complete log: `test-results/camera-v4/ci.log`.
- `git diff --check` passed. All 15 requested report sections and every linked
  evidence file were checked. No broad browser or Blender matrix was run.

## 14. Remaining Limitations

Very tight walls can still force close character framing. A player/focus already
embedded in authored solid geometry has no universal escape solution. Unprofiled
decorative meshes still do not participate in obstruction. Terrain clearance uses
a sampled footprint, not a general physics sphere sweep. The compact sky rig is
tuned against the current human/demo scale; extreme authored character scales and
camera settings have not received a separate visual matrix. Subjective mouse feel
on other hardware and browsers remains for human review.

## 15. Recommended Next Step

Review the supplied sky-look and recovery captures, then do a short hands-on
Follow/Bow pass on the user's normal hardware. This stays within the roadmap's
camera-polish scope; no additional gameplay system is introduced here.
