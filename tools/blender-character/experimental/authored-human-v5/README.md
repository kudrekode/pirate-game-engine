# Authored Human V5 — elbow art-directed skinning gate

**Rejected experiment. Visual FAIL; do not promote this source into the creator.**
See [the result](../../../../AUTHORED_HUMAN_V5_ELBOW_RESULT.md).

This begins from the unchanged V3 body, stored as V2 `candidate.blend`.
Only 118 vertices per elbow change, using the existing upperarm/lowerarm pair.
All other weights, geometry, topology, UVs, six identity targets, materials,
hair and the Golden rest rig remain unchanged. The existing tank is hidden
for rendering; no garment validation or editing is part of this experiment.

## Preserved artifacts

- `candidate.blend`: final rejected, mirrored weight pass; all identity keys at zero.
- `weights.json`: every original/replacement influence and source input hash.
- `topology.json`: complete 172-vertex left elbow map, actual edges/faces, nine
  verified closed rings, seam aliases, partial tip rows, spacing and V3/V4/V5 weights.
- `source-tests.json`: focused source/weight/pose integrity results.
- `roundtrip.json`: both GLBs, exact non-weight attributes, rig/binds,
  Golden idle/walk resolution, shared clone isolation and rest restoration.
- `evidence.json`: render hashes/cameras, edge measurements, checkpoint history,
  source preservation and script hashes. Structural success is not visual approval.
- `validation.json`: final CI/diff status and log hashes.

GLBs and original 720 x 840 renders stay in ignored `test-results/authored-human-v5/`.
Portable labelled sheets/maps are in `docs/assets/authored-human-v5/`.
The vendor source/licence and V2/V3/V4 packages remain intact.

## Authored rings and stopping point

`authored_human_v5_weights.py` lists actual source vertex IDs in edge-connected
circumferential order and explicit lower-arm weights for each edited vertex.
There is no longitudinal smoothstep or automatic paint optimization. Upper-arm
weight is the complement. P3, D3 and D4 are unchanged boundary/context rings.
Coincident normal/UV seam vertices are kept separate, receive identical paint,
and all corresponding right vertices are mirrored. No mesh welding occurs.

Checkpoints in this one pass:

1. `outer`: 58 left vertices; render side/front/rear/three-quarter at 115 degrees.
2. `circumference`: complete adjacent side/flexion rows, 118 left vertices;
   inspect both identities at 70 and 115 degrees, all four views.
3. Stop: the fold still forms a shelf/crease and the elbow stays bulbous/angular.
4. `final`: copy the same left weights to the right for a symmetric rejected
   artifact and final validation. This is not an accepted result or a new strategy.

## Reproduction

Use the existing Blender 5.2 installation, Python with NumPy/Matplotlib/Pillow,
and installed npm dependencies, from the repository root. No product integration.

```powershell
$blenderV5 = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5_inspect.py
python tools/blender-character/authored_human_v5_topology.py
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage baseline --build
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage outer --build
```

Inspect each selection with `--list`; remove only that flag to render. Review
this checkpoint before building the next. Historical checkpoint reproduction
is not permission to begin another weight strategy.

```powershell
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage outer --cases dressed-neutral --poses elbow --views elbow-side,elbow-front,elbow-rear,elbow-quarter --list
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage circumference --build
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage circumference --poses intermediate,elbow --views elbow-side,elbow-front,elbow-rear,elbow-quarter --list
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage final --build
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5_test.py
node --experimental-strip-types tools/blender-character/validate-authored-human-v5.mjs
```

Final comparison selections: **74 renders**, additional to 20 checkpoint views.
The V4 reference reads the existing hash-verified rejected V4 GLBs; if absent,
reproduce that package's one `--build` command first (no V4 gallery is needed).

```powershell
# Run for baseline and v4: 16 views each.
$v5Reference = 'baseline'
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage $v5Reference --poses intermediate,elbow --views elbow-side,elbow-front,elbow-rear,elbow-quarter --list
# Final: 24 close views, 10 context views, 8 idle/walk side/rear views.
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage final --poses rest,intermediate,elbow --views elbow-side,elbow-front,elbow-rear,elbow-quarter --list
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage final --poses rest,idle,walk,intermediate,elbow --views front --list
& $blenderV5 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v5.py -- --stage final --poses idle,walk --views side,torso-back --list
python tools/blender-character/authored_human_v5_evidence.py
npm.cmd run ci
git diff --check
```

Existing V3 poses/cameras and V2 lighting are imported directly. Intermediate
adds only a 70-degree elbow rotation, retaining the diagnostic upper-arm position.
New local front/rear/three-quarter cameras target the unchanged posed elbow pivot
with fixed offsets and scale .42; their actual definitions match across revisions.
The original side and full-body/torso cameras are unchanged. Every pose imports
a fresh GLB. Idle/walk render the same existing quarter-clip samples.

No browser suite, garment validation, body matrix or unrelated Blender gallery
is required. Do not overwrite an export while a renderer is using it.
