# Golden Combat V1 source

Exactly three project-authored Golden-native Actions: `GoldenCombat_Attack_V1`
(0.5 s), `GoldenCombat_Hit_V1` (1/3 s), `GoldenCombat_Death_V1` (1.35 s,
including a 0.25 s final-pose hold). `actions.blend` contains the unchanged
65-joint armature and these Actions only. No character body, clothing or texture
payload is copied into the source or exported library.

The rig is copied from the immutable canonical-v1 candidate, hash
`7773ca3ee38eeb5ff168783d8753b7adb49c79499f273b050cd105f75763a63d`.
It derives from the repository's Quaternius CC0 source; see
`../../experimental/authored-human-canonical-v1/README.md` and its licence.
Action timing and poses are authored in this project by `author.py`.
The boundary pose samples the accepted Golden Idle at its first frame; that
existing derived clip has Adobe Mixamo provenance, not CC0. Its source/licence
records remain at `public/assets/source/humanoid-animations/retarget-spike/idle/`.
No new external motion was downloaded or retargeted.

`author.py` is the reproducible pose/timing source and `actions.blend` is the
editable saved animation source. Re-author into a new revision if these published
Actions change. Run the script with Blender 5.2 and one output blend path only;
it reads the canonical rig and Idle without saving either reference. `export.py`
exports only the named Actions from the saved source. The existing character
compiler and Idle/Walk bake retain their original contracts.

```powershell
node tools/blender-character/golden-combat-bake.mjs --list
npm.cmd run bake:golden-combat
node --test tools/blender-character/golden-combat-roundtrip.test.mjs
```

The inspected build runs two isolated exports and requires identical GLB bytes,
unchanged source hashes, production GLTFLoader playback, the pinned Golden
inverse-bind/rest signature on the target, exact source rest/hierarchy, exact
channel names, finite samples, no horizontal pelvis travel, independent clones,
rest restoration and a clamped final pose. Existing outputs reject different
bytes. The companion `metadata.json` and `roundtrip.json` record actual results.

Attack has 52 quaternion tracks (22 main joints plus 30 non-leaf finger joints).
Hit has exactly 22 quaternion tracks and no translation. Death has those 22
rotations plus vertical-only pelvis position. No scale or root tracks are allowed.
All clips use LINEAR sampled curves. Root/world position remains gameplay-owned.
The death pelvis height is a fixed authored curve reviewed against dressed-body
floor clearance; there is no runtime grounding solver, IK or foot placement.

The published GLB is one mesh-free armature containing all three clips. Its
106 KB payload does not rely on the registry's `animationOnly` flag to strip
geometry. Runtime mappings retain existing imported `golden-idle-walk-v1`
references and add optional actions through the ordinary shared cache/clone path.
