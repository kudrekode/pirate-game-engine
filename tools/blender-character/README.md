# Blender Character Compiler Boundary

This folder documents the future boundary for a humanoid character compiler.

Conceptual command:

```bash
blender --background \
  --python compile_character.py \
  -- \
  --request request.json \
  --output-dir output/
```

V0 intentionally does not implement `compile_character.py`, procedural body generation, rig creation, skinning, animation retargeting, or GLB export.

Any future stub in this folder must return a clear not-implemented result and must never create invalid GLBs or report compilation success without a verified output package.

The Golden Reference animation spike confirms that a deterministic offline
retarget bake is the next compiler experiment. Blender was unavailable during
that spike, so `retarget_golden_reference.py` is not implemented and no baked
GLB is claimed. Its required inputs, mapping, root-motion policy, output
boundary, and exact prospective command are documented in
`docs/assets/golden-reference-animation-retargeting-spike.md`.
