# Golden Bow V1

Original project-authored Golden pose animation. `author.py` creates the editable
mesh-free `actions.blend`; `export.py` uses the existing Golden export settings.
No vendor motion, character, clothing, rig or skin weights are changed.

One 0.9-second `GoldenBow_Fire_V1`: raise, draw, release at 0.30 s, and recovery.
The runtime owns the explicit 300 ms release timer; animation callbacks own no damage.
Hand and arm rotations are authored offline; there is no hand IK or runtime solver.

Build only this source, then run `golden-bow-bake.mjs --list` and the selected bake.
The bake requires two identical exports and the existing production GLTF round trip.
