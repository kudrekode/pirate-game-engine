# Authored Human V3 — isolated deformation diagnosis

**FAIL: body-deformation stop condition. No corrected garment is supplied.**
See [the complete result](../../../../AUTHORED_HUMAN_V3_DEFORMATION_RESULT.md).
The V2 package is the preserved art source; V3 adds diagnostic code and evidence.
It does not duplicate or modify the `.blend` sources or register a creator family.

`evidence.json` records source/export/clip hashes, the neutral and combined
identity values, GLB/rig/clone checks, local source-weight diagnosis, sampled
clearance, and hashes of the renders used in six contact sheets. The body-weight
ablation is arithmetic on individual edge endpoints, not an edited body asset.
The focused tests are diagnosis checks, not a passing visual garment test.

## Reproduce

From the repository root on Windows, using the existing Blender installation:

```powershell
$blenderV3 = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --build
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3_test.py
node --experimental-strip-types tools/blender-character/validate-authored-human-v3.mjs
```

Build reads V2's packed canonical and candidate sources, exports the neutral
control plus exactly two dressed identities, and checks that the V2 package is
unchanged. The validator requires fresh exports to match the recorded V2 GLB
hashes, checks normalized four-influence skinning, the existing 65-joint Golden
rest hierarchy, canonical inverse binds, both clips and the actual shared
`cloneThreeVisualAssetRoot` path. It does not certify browser texture decoding.
No old files under `test-results/authored-human-v2/` are required.

Inspect each render selection first; these are the five final selections
(**80 renders total**). Run each same command without `--list` after inspection:

```powershell
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --cases dressed-neutral,combined --poses rest,idle,walk,raised-arm,raised-arm-old,elbow,crouch --views front,side,torso-back --bare --list
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --cases dressed-neutral,combined --poses rest,idle,walk,raised-arm,crouch --views front,side,torso-back --list
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --cases dressed-neutral,combined --poses elbow --views elbow-side --bare --list
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --cases dressed-neutral,combined --poses crouch --views knee-side --bare --list
& $blenderV3 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v3.py -- --cases dressed-neutral,combined --poses raised-arm,raised-arm-old --views torso-side --list
```

`raised-arm-old` is the preserved humerus-only V2 diagnostic. `raised-arm` adds
20° clavicle elevation and 40° humeral elevation with 15° elbow flexion, keeping
the same upper-arm direction. `crouch` retains the old 85° hip/125° knee rotations
and root lowering. Close torso cameras follow that lowering; whole-body cameras
stay fixed. Every pose imports a fresh GLB before evaluation. `--measure-only`
skips rendering if only numeric diagnosis needs repeating.

Outputs and full-resolution PNGs are in ignored `test-results/authored-human-v3/`.
After all five selections, regenerate the report's labelled sheets and compact
evidence using Pillow (available in the local Python installation):

```powershell
python tools/blender-character/authored_human_v3_evidence.py
```

This writes only this package's `evidence.json` and the six images under
`docs/assets/authored-human-v3/`; it resizes and labels real renders. It never
retouches geometry or hides a failed region. The font path is Windows Arial.
Do not run build or rewrite exports while a renderer is reading those exports.

## Recorded validation

- Four focused Blender diagnostic tests pass.
- Both dressed GLBs and the canonical control match V2 hashes; rig/weight/clip/
  clone checks pass. These are transport and diagnosis results, not art approval.
- `npm.cmd run ci` was invoked once. Its editor-smoke worker timed out before
  starting; 75 other files / 578 tests passed. Only the affected editor suite was
  rerun (45 tests passed), followed by the unexecuted root build, three package
  builds/typechecks, Studio build and 50 cheap Node checks. All passed. Existing
  bundle-size advisories remain. Logs: `ci.log` and `ci-recovery.log` in the
  ignored V3 result directory. The original CI command's exit status was failure;
  the focused recovery completed every gate without repeating passed suites.
- No unrelated browser, creator, Blender or identity matrix was run.

The next experiment is a local body-weight review on a separate source copy.
The discovered tank shell-weight mismatch remains uncorrected until that body
gate passes. There is no coverage mask and no permission implied to integrate
this family into Asset Studio.
