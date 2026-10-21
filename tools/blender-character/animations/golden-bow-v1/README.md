# Golden Bow V1

Original project-authored Golden pose animation. `author.py` creates the editable
mesh-free `actions.blend`; `export.py` uses the existing Golden export settings.
No vendor motion, character, clothing, rig or skin weights are changed.

One 0.9-second `GoldenBow_Fire_V1`: raise, draw, release at 0.30 s, and recovery.
Archery V2 samples 0–16/60 s progressively over a 1.2-second draw, holds frame 16,
then resumes at 16/60 s on key release. The shared runtime releases the arrow
33 ms later, at frame 18. Animation callbacks own no damage. The installed clip
and source remain unchanged; `review-golden-bow.mjs --body athletic --charged`
uses the production controller for Draw, a five-second Hold, and Release.
Hand and arm rotations are authored offline; there is no hand IK or runtime solver.

Build only this source, then run `golden-bow-bake.mjs --list` and the selected bake.
The bake requires two identical exports and the existing production GLTF round trip.
