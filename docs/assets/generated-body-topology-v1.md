# Generated Body Topology V1

## Result

Generated Body Topology V1 replaces the disconnected primitive mannequin body
with one deterministic, closed, genus-zero skinned surface. The public six body
parameters, Golden 65-joint skeleton, offline Idle/Walk clips, compiler
boundary, registry id, and preview/runtime integration are unchanged.

The recorded topology version remains `procedural-humanoid-v1`. Topology V1
introduced procedural recipe V2, compiler `procedural-mannequin-blender-v2`,
and validation `procedural-mannequin-roundtrip-v3`; Material and Skin
Appearance V1 subsequently advanced those to V3/V3/V4 without changing the
topology contract.

## Pre-Implementation Audit And Method Decision

The old default plus all twelve one-at-a-time extrema compiled and animated,
but fixed-camera Rest and Walk captures exposed detached head/neck, torso,
shoulder, elbow, wrist, hip, knee, and ankle sections. Every body remained 648
runtime vertices and 1,108 triangles, with rigid single-bone weights. Walk made
the section gaps more visible.

The implementation spikes compared four approaches:

- bespoke connected ring branching offered direct edge flow but required a
  separate shoulder and hip junction system before it could be stable across
  all six extrema;
- metaballs were easy to join but gave weaker control over silhouette, budget,
  and recorded topology;
- direct booleans/subdivision retained internal-face and ordering risks;
- a deterministic anatomical volume field followed by fixed-resolution voxel
  union gave stable branching, one outer surface, predictable compile time,
  and repeatable topology.

V1 therefore uses ordered anatomical source volumes, explicit transition
volumes, Blender voxel union at 0.035 m, and analytic skin weights. It is not a
browser deformation or runtime scale system.

## Geometry Contract

Blender derives chest, waist, pelvis, shoulder, hip, arm, thigh, calf, knee,
hand, foot, neck, and head measurements from the validated proportions. Limb
cross-sections respect hip/shoulder spacing so bilateral volumes do not touch
at narrow extrema. The source is remeshed once into:

- one skinned mesh;
- one material and no textures;
- one connected component;
- zero boundary, non-manifold, degenerate, or unreferenced elements;
- Euler characteristic 2 and genus 0;
- no embedded animations.

The Three.js round trip recomputes these properties from exported indices. The
Blender source report performs the equivalent pre-export check. A build is not
promoted if either representation fails.

## Skinning And Skeleton Compatibility

Weights are derived deterministically from distance to named anatomical bone
segments. Mirrored limb candidates are restricted to their own side while
central torso segments remain available at shoulder and hip transitions. Each
vertex keeps at most four influences, drops insignificant weights, and is
renormalized. Validation rejects unweighted vertices, invalid joint indexes,
missing principal weighted bones, or a weight-sum error above tolerance.

The imported Golden armature is not edited. Two signatures are compiler gates:

- Blender rest snapshot:
  `38356ace6cdb45ddc8caa325c1989fd3dfe0779d10a03c4f4fd743acf58b22f9`;
- tolerance-normalized exported rest hierarchy:
  `24264599feb13a49857540c8efab3e46fcfb2a45cec1a03b8bf90bbd4f74b840`.

The normalized exported signature is also reproduced by the legacy checked-in
body, proving that topology replacement did not change the animation contract.

## Versioning And Migration

`ProceduralMannequinRecipeV2` records:

```json
{
  "geometry": {
    "profile": "voxel-union",
    "radialSegments": 8,
    "topologyVersion": "procedural-humanoid-v1"
  }
}
```

V0 height-only recipes and V1 six-parameter `ellipsoid` recipes remain accepted
and canonicalize to V2. The stable asset and registry id remains
`procedural-mannequin-v0` so saved game-engine references do not migrate. Asset
Studio labels manifests without topology metadata as `legacy-primitive-v0`;
new compile responses must carry and pass the V1 topology contract.

## Validation Matrix

Run the repeatable matrix with:

```powershell
npm run validate:procedural-topology-matrix
```

It compiles 21 bodies: default, minimum and maximum for each of the six
parameters, five fixed seeded fixtures, and three challenging valid
combinations. Every case performs two Blender builds plus GLB round trip,
source immutability, skeleton, weights, bounds, symmetry, Rest, Idle, Walk,
root-motion, and clone-independence checks.

The accepted matrix produced:

- 21/21 valid deterministic artifacts;
- 2,544 to 2,988 runtime vertices;
- 5,084 to 5,972 triangles;
- approximately 6 to 7.5 seconds per two-pass compile on the recorded Blender
  5.2 LTS environment;
- distinct recipe and output hashes for every distinct body;
- exact authored height, zero-grounded bounds, and the same Golden rest
  signature in every case.

The machine-readable evidence and per-case artifacts are written below
`test-results/generated-body-topology-v1/matrix/`.

## Visual And Integration Evidence

Asset Studio fixed-camera captures cover Rest front and Walk three-quarter for
all 21 bodies. Manual review includes the default, every extrema, all seeded
bodies, and all challenging combinations. It confirmed continuous neck,
shoulder, torso, pelvis, elbow, wrist, hip, knee, and ankle surfaces; independent
feet and legs throughout Walk; stable grounding; and no exploding weights.

Asset Studio continues to compile only when the user presses Compile, preserves
the previous preview on failure, and retains the ten most recent successful
compilations. Diagnostics now display topology version, component/manifold
status, and vertex/triangle counts. The game editor and Three runtime continue
to load independent player/NPC clones through the shared registry; Patchbeard
remains the default authored character.

## Deliberate V1 Limits

This is a stylized low-detail body. Hands remain mitten-like because the
compatibility finger bones are not represented by generated fingers, the head
has no facial topology, and there is no clothing-aware edge flow. The next body
milestone should refine generated topology and deformation quality within this
same six-parameter compiler contract, not add more body parameters.
