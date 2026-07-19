# Asset Studio Body Proportions V1

## Result

Asset Studio now compiles six body parameters through the existing local
pipeline:

```text
CharacterRecipeV1
  -> request and anatomy validation
  -> ProceduralMannequinRecipeV1 snapshot
  -> two-pass headless Blender generation
  -> GLB round trip and Idle/Walk validation
  -> immutable generated job
  -> shared Three.js preview
```

The supported parameters are exactly `height`, `shoulderWidth`, `torsoLength`,
`armLength`, `legLength`, and `hipWidth`. Each has a minimum, maximum, default,
units, and validation description in the shared CharacterRecipe contract and
the procedural compiler contract. All six values participate in canonical
recipe hashing.

## Anatomical Model

Height scales the authored body uniformly after its local shape is generated,
so taller bodies naturally retain longer world-space limbs. The other five
normalized offsets are converted by the compiler to conservative multipliers
around the Golden base humanoid. Blender applies those values to torso, limb,
shoulder, hip, hand, foot, and transition anchors before exporting geometry.

The Golden 65-joint rest skeleton stays unchanged for proven animation-clip
compatibility. Generated mesh anchors remain bone-relative and are validated
against a maximum placement tolerance. Recipe validation rejects unsupported
torso and cross-limb thigh reach, legs that would intersect the lower torso,
and shoulder/hip ratios
that cannot remain centred. Negative, non-finite, missing, and out-of-range
values are rejected before Blender starts.

There is no browser deformation, morphing, or body-part scaling. Every accepted
change regenerates the GLB.

## Randomise And Recent Compilations

Randomise uses a deterministic string-seeded PRNG and bounded rejection
sampling. It emits only range-valid, anatomy-valid recipes and never starts a
compile. The seed stays visible and editable; repeating a seed reproduces the
same six values.

Each successful compile is kept in the in-session Recent Compilations list,
limited to ten entries. Selecting an entry restores its body values, seed,
manifest, and immutable generated asset URL without invoking Blender again.

## Validation Evidence

The checked-in default recipe now uses Generated Body Topology V1: one closed,
manifold, genus-zero skinned surface with the unchanged 65-joint rest skeleton,
deterministic blended weights, and passing Idle and Walk round trips. The full
21-body acceptance matrix is documented in
[`generated-body-topology-v1.md`](generated-body-topology-v1.md).

| Height | Shoulders | Torso | Arms | Legs | Hips | Bounds (X × Y × Z) | GLB SHA-256 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1.68 | 0.20 | 0.20 | 0.30 | 0.80 | 0.70 | 1.3806 × 1.6800 × 0.3116 | `e52bdc664604c98ff51555e75a4554a3b16871db7937a7cd7eb75da740d07a1d` |
| 1.96 | 0.90 | 0.80 | 0.80 | 0.30 | 0.20 | 1.9163 × 1.9600 × 0.3416 | `32dcfec2e36e8248c5440b05b6264081f15829e776e0602cdd10989515188b8d` |

Playwright generates several seeded bodies, verifies every compile and
validation, samples Idle and Walk, checks bounds/hash variation, watches for
browser crashes and binding errors, and confirms recent-entry switching causes
no additional compile request.

## Next Milestone

The next body milestone should refine generated topology and deformation
quality while preserving these six parameters and the deterministic compiler
boundary rather than expanding the parameter set.
