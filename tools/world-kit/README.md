# Harbour kit authoring

The small built-in kit uses one world unit per metre. Run `author.py` with the
installed Blender in background mode to reproduce its static GLBs. This is an
offline content script, never an editor/runtime geometry system. No character
source or character compiler is involved.

Existing pirate files are intentionally preserved: many were saved under the
previous file's name. `author.py` records the exact source path and hash for
each reused mesh, fits it to metre scale, grounds it, and replaces the bright
palette with the shared muted material family. The original PNG masquerading
as `barrel.glb` is also retained at `public/assets/pirate-demo/Textures/colormap.png`.

New content is original project-authored geometry. Reused geometry and the
original palette are Kenney Pirate Kit, CC0: https://kenney.nl/assets/pirate-kit
and https://creativecommons.org/publicdomain/zero/1.0/ (checked 2026-10-07).
The kit's manifest records individual source paths, hashes, bounds, triangles,
materials and revision. Its generated GLBs are separate from this source script.

Do not overwrite old registry identities or silently add a sample to a user's
project. The example is ordinary exported project JSON created by the editor
acceptance workflow, available for explicit import.
