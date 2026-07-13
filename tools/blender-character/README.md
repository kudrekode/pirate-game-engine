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
