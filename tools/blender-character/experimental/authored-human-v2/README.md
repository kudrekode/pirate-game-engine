# Authored human V2 — experimental source package

**PARTIAL; visual acceptance failed. Do not register this family or use it as a
finalised creator artifact.** See [the result](../../../../AUTHORED_HUMAN_PROTOTYPE_V2_RESULT.md).

- `canonical-neutral.blend`: packed, unchanged Quaternius body, eyes, brows,
  source materials/UVs/weights and Golden rig. The two invalid vendor normal-map
  URI spellings are resolved on import. Vendor files are not edited.
- `candidate.blend`: editable Basis plus six coordinated identity keys on the
  body, eyes, brows, Buzzed hair and a connected tank. All keys open at zero.
  It retains the canonical body topology and authored weights. The tank has
  its own topology, UVs, 2.5 mm thickness and transferred weights.
- `vendor-hashes.json`, `License_Standard.txt`: exact existing source snapshot
  and its bundled licence, including the hair and image dependencies.
- `targets.json`: the explicitly tested endpoint/combined cases and measured
  source-body displacement sizes. These are experimental values, not approved
  public slider ranges.
- `roundtrip.json`: actual GLB transport, rig, topology and shared-clone evidence.
- `deformation-evidence.json`: sampled signed garment clearance and edge stretch
  from the exported assets in the rendered poses; includes failures.
- `source-reopen.json`: reopening both packed Blender sources, with the candidate
  confirmed to have six identity keys plus Basis, all at zero, on all five meshes.
- `manifest.json`: hashes of the source files and the local exported GLBs,
  with the experimental status and validation limits.

The source is Quaternius Universal Base Characters Standard FREE,
`Superhero_Male_FullBody`, plus the pack's `Hair_Buzzed`.
[Source pack](https://quaternius.com/packs/universalbasecharacters.html).
The copied bundled licence declares CC0 1.0. No new assets were downloaded.

## Reproduce the recorded candidate

From the repository root, with the existing Blender 5.2 installation:

```powershell
$blenderV2 = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blenderV2 --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_v2.py -- --build
python tools/blender-character/authored_human_v2_shapes_test.py
node --experimental-strip-types tools/blender-character/validate-authored-human-v2.mjs
```

The small Python constraint tests require NumPy (also bundled with Blender).
The Node command uses the actual shared `cloneThreeVisualAssetRoot` implementation;
it stubs image decoding, so its success does not certify browser appearance.
Actual Blender renders decode the exported textures.

Builds write only to `test-results/authored-human-v2/`; they do not update this
preserved package. The two Python authoring files reproduce the recorded source.
If the `.blend` is subsequently hand-edited, preserve that new source revision;
rerunning the bootstrap does not incorporate manual edits.

The review renderer accepts explicit case/view/pose selections. Inspect `--list`
first. For example:

```powershell
& $blenderV2 --background --factory-startup --python-exit-code 1 --python tools/blender-character/render_authored_human_v2.py -- --cases dressed-neutral,combined --poses idle,walk,raised-arm,elbow,crouch,head-turn --views front,side --list
# Run the same explicit selection without --list to render it.
```

Other recorded selections: face endpoints `head-wide,head-narrow,jaw,nose` in
`face-front,face-three-quarter`; `neutral,fuller,athletic,broad,combined` in
`front,side` with `--bare`; `source,neutral,legacy,dressed-neutral,combined` in
`front,face-front`; neutral/combined idle and raised-arm `torso-side,torso-back`;
neutral/combined head-turn `face-front,face-side`; neutral/nose/combined rest
`face-side`. The renderer writes the GLB hash alongside each pose's measurements.

`candidate.blend` is an art source. The local GLBs have baked identity and no
runtime morphs. No UI, compiler routing, registry, recipe migration or gameplay
assignment is supplied. The legacy generator is untouched.
