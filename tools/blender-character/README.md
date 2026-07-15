# Blender Character Compiler Boundary

This folder contains the first genuine, narrow Blender compiler experiment and
the boundary for a future procedural humanoid compiler. Blender remains a
tooling dependency; browser, shared contracts, and game runtime packages do not
import Blender code or objects.

## Golden Reference Offline Bake

`retarget_golden_reference.py` imports a canonical Mixamo FBX and the immutable
Quaternius target glTF, validates the versioned
`profiles/mixamo-to-quaternius-v2.json` signatures, applies the accepted
world-space rest-frame delta to 22 bones, bakes at 30 fps, freezes horizontal
pelvis motion, preserves vertical motion, and exports a complete target GLB.

The Node entry point adds source-provenance validation, Blender discovery,
two-pass isolated determinism checks, source immutability checks, canonical
metadata, and staging cleanup:

```powershell
npm run bake:golden-animation -- idle "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
npm run bake:golden-animation -- walk "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
npm run validate:golden-animation-bakes
npm run test:blender-bake
```

The low-level execution contract is:

```text
blender --background --factory-startup --python-exit-code 1
  --python tools/blender-character/retarget_golden_reference.py --
  --source <source.fbx> --target <target.gltf> --clip <idle|walk>
  --output <output.glb> --profile <profile.json>
  --profile-version mixamo-to-quaternius-v2 --frame-rate 30
  --root-motion-policy <policy> --metadata <metadata.json>
  --diagnostics <diagnostics.json>
```

See `docs/assets/golden-reference-animation-retargeting-spike.md` for hashes,
format choice, determinism, Three.js round trip, browser evidence, and limits.

## Future Procedural Compiler

The conceptual recipe compiler remains separate:

```text
blender --background --python compile_character.py --
  --request request.json --output-dir output/
```

`compile_character.py`, procedural body generation, rig creation, and
deterministic skinning are not implemented. No future stub may create invalid
GLBs or report success without a verified output package.
