# Authored Human V4 — local skin-weight repair

**Rejected experimental revision. Do not promote this source into the creator.**
See [the result](../../../../AUTHORED_HUMAN_V4_SKINNING_RESULT.md).

The preserved V2 candidate is also the exact V3 body/weight baseline. V4 changes
only the body weights near both elbows and knees. The tank is hidden in every
render; garment fitting and garment validation remain paused.

- `candidate.blend`: separate packed source with the rejected local weights.
  All six identity keys open at zero. Original V2/V3/vendor files are preserved.
- `weights.json`: every changed source vertex, anatomical region, original and
  replacement influence values, source hashes and protected-data fingerprints.
- `evidence.json`: body edge measurements by four circumferential sectors,
  source/GLB checks, render hashes and diagnostic-script identities.
- `validation.json`: final gate results and log hashes.

## Repair rule

`joint-centred-v1` changes 134 vertices per elbow and 148 per knee (564 total
of 7,281). It redistributes only upperarm/lowerarm or thigh/calf weights on the
same side. Other chains, geometry, UVs, identity keys, materials, hair and the
65-joint Golden rest rig are untouched. No shoulder edit was attempted.

The child influence uses a cubic smoothstep along the joint's rest-space
longitudinal coordinate. Its half-width varies smoothly around the circumference:
38–80 mm at the elbow and 40–95 mm at the knee, narrow on the flexion surface,
wide on the outer surface. Full replacement is restricted to the inner 90 mm
on each side of the pivot; a second smoothstep restores original weights at
125 mm. This is a fixed source-weight profile, not a pose-dependent correction.
The same weights are baked for neutral and the unchanged all-ones combined.

It reduces outer stretch, but produces new visible creases and moves strain
into another knee sector. Per the stop condition, no further repaint, garment
work, topology changes or rig edits were undertaken. This is not proof that
all possible local weight paintings would fail.

## Reproduction

Use the existing Blender 5.2 installation from the repository root. Builds write
to ignored `test-results/authored-human-v4/` and never overwrite this preserved
package or V2/V3. The baseline build also saves the complete source weight map.

```powershell
$blenderV4 = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --revision baseline --build
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --build
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4_test.py
node --experimental-strip-types tools/blender-character/validate-authored-human-v4.mjs
```

Run the following **four selections for each revision**, `baseline` and
`joint-centred-v1`. Inspect with `--list` first; remove only `--list` to render.
This is 44 views per revision, **88 unique renders** total, two identities only.

```powershell
$v4Revision = 'baseline' # Repeat these exact selections with 'joint-centred-v1'.
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --revision $v4Revision --poses rest,idle,walk,elbow,crouch,raised-arm --views front,side,torso-back --list
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --revision $v4Revision --poses elbow,crouch --views back --list
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --revision $v4Revision --poses elbow --views elbow-side --list
& $blenderV4 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v4.py -- --revision $v4Revision --poses crouch --views knee-side --list
```

The renderer directly imports V3's pose function and camera definitions, including
its lowered close-camera framing during the deep bend, and V2's lighting. Each
pose imports a fresh GLB. Idle/walk use the same existing quarter-clip samples.
No pose, camera, light, material or render-quality setting is eased for V4.
Do not rewrite exports while a renderer is using them.

After all selections:

```powershell
python tools/blender-character/authored_human_v4_evidence.py
```

This uses local Pillow and Matplotlib. It labels/resizes actual renders and plots
weights against the original mesh edges; it does not retouch model images.
It writes this package's evidence and seven images under
`docs/assets/authored-human-v4/`. It uses Windows Arial for labels.

## Validation scope

Four focused Blender tests cover unchanged protected source data, locality,
normalisation, feather boundaries and mirrored weights. The independent Node
round trip checks exact non-weight vertex/index attributes, embedded materials,
images, nodes, rig/binds, edit membership, identical weights across both identities,
Golden clip target resolution, finite skinning, clone isolation and rest restore.
Node texture decoding is stubbed; Blender provides the visual round trip.

These checks validate preservation and transport. The visual experiment failed.
The complete CI result is recorded in the result report and `validation.json`.
No creator/browser or garment acceptance suite is part of this experiment.
