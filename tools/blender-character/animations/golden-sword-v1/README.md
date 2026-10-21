# Golden Sword V1

Original project-authored one-handed diagonal cut on the unchanged 65-bone
`golden-humanoid-v0` rig. `actions.blend` is the editable action source;
`author.py` reproduces it from the existing canonical rig/Idle reference using
the established offline pose/ankle authoring helper. No character GLB is rebuilt.

`GoldenSword_Attack_V1` lasts 0.75 seconds at 60 Hz: shoulder load at 0.15 s,
hip lead at 0.217 s, delivery at 0.30 s, follow-through at 0.40 s and recovered
opening pose by 0.70 s. LINEAR sampled joint keys; no horizontal root translation,
constraints, meshes, materials or textures in the library. The right finger keys
at time zero also supply the small runtime grip overlay during other actions.

From the repository root:

```powershell
node tools/blender-character/golden-sword-bake.mjs --list
node tools/blender-character/golden-sword-bake.mjs
node --test tools/blender-character/golden-sword.test.mjs
node tools/blender-character/review-golden-sword.mjs --list
node tools/blender-character/review-golden-sword.mjs --body athletic
```

The bake performs two isolated deterministic Blender exports and the production
GLTFLoader Golden rest/hierarchy, track, finite deformation, recovery, root-motion,
independent-clone and rest-restoration round trip. Installed output is immutable;
use a new version for subsequent accepted revisions. The initial unpublished
candidate was refined for wrist/follow-through before final V1 acceptance.

Art review requires the ordinary root Vite server. Athletic/Broad/Fuller reuse
existing dressed first-outfit artifacts; canonical reviews the sword through
Idle/Walk/Run/Jump/Fall/Land/Hit/Death/Interact/Pickup. Review pages use the
production registry, marker factory, hand attachment and finger-grip overlay.
They deliberately keep the sword visible for inspecting interaction clipping;
normal Play hides it during Interact/Pickup.
