# Procedural Head and Hair Fit V1

## Result

Procedural Head and Hair Fit V1 replaces the short pill-shaped generated head
with a deterministic stylised cranium, rear cranium, face/jaw, chin, face plane,
and neck transition. It also replaces the fixed Quaternius Buzzed placement
with `quaternius-buzzed-fit-v2`, a geometry-aware fit derived from measured head
and source-hair geometry.

The authored recipe remains unchanged: users still choose `none` or
`quaternius-hair-v0`. Fit data remains compiler/component metadata and is not a
user-facing character parameter.

## V1 Failure Diagnosis

The old compiler first aligned the source-hair maximum to the generated body
crown and then applied `normalizedTransform.translationMetres = [0, 0, -0.12]`
in Blender space. Height, torso, and leg compensation added further recipe-wide
offsets unrelated to the generated scalp.

For the default body, the old compiler-local hair bounds were:

- minimum `[-0.106396, -0.078458, 1.407575]` m;
- maximum `[0.106396, 0.099910, 1.576940]` m;
- body crown `Z = 1.686940` m.

The hair top was therefore about 11 cm below the body crown and the mesh
straddled the Neck/Head bone region. The exported Three.js hair bounds appeared
to reach `Y = 1.837720` m because skin/bind transforms changed the reported
world bounds. The old eight-case gate trusted those exported axis-aligned
bounds, whole-character maximum height, width/depth ranges, centring, and the
attachment bone name. It did not measure compiler-local scalp placement, neck
clearance, shoulder clearance, vertex distribution, or front/rear coverage.

## Head Strategy and Coordinate Contract

The head remains part of the single voxel-unioned, closed, genus-zero body. The
canonical 65-joint Golden skeleton is unchanged. Procedural Head V1 adds ordered
and symmetric source volumes for:

- upper cranium;
- rear cranium;
- cheek/jaw taper;
- chin;
- a simple forward face plane;
- neck/head continuity.

No eyes, mouth, detailed nose, ears, facial rig, blend shapes, or textures are
generated.

The compiler measures the remeshed result rather than publishing raw vertex
indices. `manifest.head` and `diagnostics.blenderReport.head` record:

- compiler-local head bounds and centre;
- width, depth, and height;
- Head bone position and measured neck top;
- scalp top/front/back/left/right extents and scalp bounds;
- forehead and rear-cranium references;
- canonical right `+X`, forward `+Y`, and up `+Z` Blender-local axes;
- symmetry error and neck-connection sample count;
- body/head topology version.

The default measured head is `0.346707 × 0.288124 × 0.276179` m in
width/depth/height, has zero recorded lateral symmetry error, 46 neck-connection
samples, and a scalp top at local `Z = 1.726206` m.

## Geometry-Aware Fit V2

The immutable source hairstyle is measured after Blender import. Its default
source bounds are `0.154590 × 0.190924 × 0.169364` m. The V2 profile records the
source `+Y` forward/`+Z` up frame, coverage ratios, independent scale limits,
front/rear offsets, Head attachment, and vertical seating.

The compiler derives non-uniform scale from measured head width/depth, centres
the style on the head, aligns its front/rear extent to the measured scalp, and
places its source crown 12 mm above the measured scalp top. The small positive
crown allowance prevents the scalp from visibly clipping through the sparse
vendor crown while the sides and rear remain close to/intersect the scalp.

For the default body, the derived transform is:

```json
{
  "translationMetres": [0, 0, 0],
  "rotationDegrees": [0, 0, 0],
  "scale": [2.1, 1.509102583, 1.233511209],
  "fittedCrown": [0.000000007, 0.028381154, 1.738205552]
}
```

The fitted compiler-local bounds are `0.324640 × 0.288124 × 0.208913` m,
from local `Z = 1.529293` to `1.738206` m.

## Fit Gates and Thresholds

Every compiled hairstyle now records and must pass geometry-aware checks:

- at least 90% of vertices above measured neck top; the remaining allowance is
  for a small style-specific nape fringe;
- at least 68% of vertices inside the upper scalp vertical band;
- at least 12% of vertices within 4.5 cm of the remeshed scalp proxy;
- width ratio `0.86–1.08` and depth ratio `0.82–1.12` relative to the head;
- lateral centring within 8 mm or 4% of head width;
- front and rear gaps no larger than 16% of head depth;
- at least 2.5 cm clearance from the non-neck shoulder proxy;
- hair centre above head centre;
- V2 crown seating between 6 and 20 mm above measured scalp top.

These thresholds reject the prior neck placement while allowing the source
style's intentional nape and small scalp intersection.

## Determinism and Body Matrix

The expanded matrix compiles ten bodies twice each: default, minimum/maximum
height, narrow/long-leg and broad/long-torso challenges, three seeded bodies,
and two additional height/frame/limb combinations.

Recorded matrix ranges:

- 10/10 passed;
- vertices above neck: `0.929185–0.961373`;
- scalp vertical range: minimum `0.766094`;
- near-scalp ratio: minimum `0.536481`;
- shoulder clearance: minimum `0.048570` m;
- crown seating: stable at approximately `0.012000` m;
- head width: `0.333248–0.347160` m;
- head height: `0.267748–0.277494` m.

Repeated default builds are byte-identical and also record identical head
contracts, derived hair transforms, fit-validation reports, skeletons,
materials, topology, and normalized semantic hashes.

## Versioning and Compatibility

- body/head topology: `procedural-humanoid-v2`;
- compiler: `procedural-mannequin-blender-v5`;
- round-trip validation: `procedural-mannequin-roundtrip-v6`;
- hairstyle fitting profile: `quaternius-buzzed-fit-v2`.

Recipes authored with `procedural-humanoid-v1` remain accepted and canonicalize
to V2 before Blender compilation. Existing V1 artifacts retain their original
topology/compiler/profile metadata; only newly compiled artifacts receive V2
labels.

## Visual and Runtime Validation

Asset Studio has deterministic Front, Side, Right side, Three-quarter,
Three-quarter rear, Back, and elevated Scalp presets. The hairstyle workflow
captures bald and haired Rest, representative Idle, and representative Walk
poses. Captures are written below:

`apps/asset-studio/test-results/procedural-mannequin-compi-de38f-aternius-hairstyle-variants/`

The shared promoted GLB remains one skin and one 65-joint skeleton with two
skinned primitives. Asset Studio, player, NPC, editor Three view, and Three
runtime continue to use the shared loader/cache/clone/animation path.

## Remaining Limits and Recommendation

The head is deliberately low-detail and the voxel-union face plane remains
coarse. The Quaternius Buzzed source has a sparse crown and fixed vendor
material; there is no hair colour authoring or secondary motion.

The recommended next milestone is a simple face-feature milestone. The scalp
and hair attachment are now usable, while minimal eye/nose/mouth presentation
would improve character readability more than adding several hairstyles to the
still featureless engineering face. Hairstyle Library V2 should follow that
small readability pass through the same fit-profile contract.
