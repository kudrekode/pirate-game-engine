# Hairstyle Slot V1

Hairstyle Slot V1 adds one real compiled character component to the procedural
humanoid creator. The authored choice is exactly `none` or
`quaternius-hair-v0`; selecting hair changes recipe state only, and Compile
embeds the hairstyle geometry, material, textures, and weights into the
complete GLB.

## Selected Asset And Provenance

The chosen source is Quaternius `Hair_Buzzed.gltf` from the local Hairstyles
pack. It is a compact, close-fitting style suited to the generated mannequin's
head and the V1 animation set. The immutable component registry is
`packages/character-contract/src/character-component-registry.json`.

- Provider: Quaternius
- Source: `public/assets/source/quaternius/Hairstyles/Origin at 0/glTF (Godot)/Hair_Buzzed.gltf`
- Source mesh: `Hair_Buzzed`
- Source glTF SHA-256: `43752a4c8f2464eb2494a8ab179bf7ad237638a3d47fb3de0a38361db40e1451`
- Buffer SHA-256: `89992fc7a5319df6f2908e44a3b694329fac4b500629a573224702e5fdd16f77`
- Base-colour texture SHA-256: `bc7aa863bd22ab0a995cd838cceb4d3a5186ee54ee2fb0108fad85d20c057e6e`
- Normal texture SHA-256: `57fd0ad8c96a4d01b38769637e066cecaa285b456f6e48ce00863754a457affb`
- Licence: CC0-1.0, licence SHA-256 `0f4beaf0fe360a7732e58bbe3dbf60a2422367fbea60cb9ea4add968f383268e`

The compiler validates every source and licence hash before Blender starts and
checks the same files again after both isolated builds. Unknown component ids,
changed source bytes, unexpected meshes, materials, textures, or armatures fail
the build.

## Attachment And Fit Strategy

V1 uses Strategy B: main-skeleton head-surface skinning. Blender imports the
origin-aligned vendor mesh, fits its width and depth to the generated Head-led
surface, aligns the crown with recorded height/torso/leg compensation, copies
the generated crown's stable surface weights, and joins the result into the
body mesh before export. glTF exports two primitives but only one skin and one
65-joint skeleton.

This was chosen after round-trip evidence showed that a separate rigid
bone-parent and a separate all-Head skin both introduced exporter bind-space
offsets at non-default body heights. The accepted path keeps the body primitive
unchanged, gives the hairstyle its own material/texture primitive, and reuses
the exact main-skin bind matrices. Idle and Walk sampling records a maximum
Head-relative vertex drift of about 1.9 mm, within the 2 cm V1 guard.

The versioned `quaternius-buzzed-fit-v1` profile records source/normalized
transforms, generated-head bounds mode, a 1 cm scalp offset, and the calibrated
height/torso/leg terms. These are compiler-owned defaults, not user controls.

## Artifact And Determinism Evidence

The promoted artifact is
`public/assets/derived/procedural-humanoids/mannequin-hair-v0/mannequin.glb`.

- Output SHA-256: `4cf0c14a9c4301f57c28ee38ae6524178fc496dbd76837cfdb614f518b00921c`
- Recipe SHA-256: `385cfb6ff4c81dde461d5b182ec4f26519bc4203c7d00f0d46fcb01ae559146f`
- Normalized semantic SHA-256: `43598cdd3a1286f32a968e3a4abfb85d964aa85bb3b22c2b45453a5862c7293e`
- Body geometry/skinning SHA-256: `cefef92c58d85eda857eb1f2bc4e371c9efbd7f45e91f4909201e8b34f25aec4`
- Skin material SHA-256: `47910204fab5b9005c6845ae61b5002087e4a7831f7fd98b0c2aca967bc61df5`
- Skeleton signature: `24264599feb13a49857540c8efab3e46fcfb2a45cec1a03b8bf90bbd4f74b840`
- Complete artifact: 2 primitives, 2 materials, 2 embedded textures, 3,190 vertices, 6,274 triangles
- Hairstyle contribution: 1 primitive, 1 material, 2 textures, 466 vertices, 830 triangles
- Skeleton resources: one skin, one 65-joint skeleton, no embedded animation clips

Two isolated Blender 5.2 builds are byte-identical. The haired and bald builds
have different complete semantic/output hashes, while their body-only geometry,
skin material, and skeleton hashes are identical. Observed reference builds
take roughly 7–12 seconds for the two-pass compile and validation pipeline on
the development machine.

## Fit Matrix And Browser Evidence

`npm run validate:procedural-hairstyle-matrix` compiles eight deterministic
cases: default, 1.50 m, 2.10 m, narrow/long-leg, broad/long-torso, and three
seeded bodies. All cases pass centring, crown clearance, back coverage,
width/depth, animation attachment, round-trip, and build determinism checks.
Observed crown clearance is 1.1–5.3 cm and back coverage is 10.7–19.9 cm.
The summary is written to
`test-results/hairstyle-slot-v1/body-fit-matrix/summary.json`.

The Asset Studio Playwright workflow compiles bald and haired recipes, samples
Rest/Idle/Walk in front/side/three-quarter views, switches recent results in
both directions, checks one active canvas, and fails on loader/mixer/WebGL
errors. Captures are under the hairstyle Playwright result directory. A second
Playwright workflow assigns the promoted hairstyle asset to both the player and
Captain Mira and validates the shared editor 3D and experimental runtime 3D
loaders, clone path, two animation sources, two skinned primitives per instance,
and zero asset failures.

## Asset Studio And Runtime Boundary

`CharacterRecipeV1.components.hair` always exists; legacy recipes migrate to
`none`. The development compile request is V4 and rejects unknown ids. Draft
selection never mutates the active preview. A successful response must echo the
requested component id; a failed or mismatched response preserves the previous
preview. Recent Compilations snapshot and restore the whole recipe including
hair.

The promoted complete GLB is registered once in the shared Three asset registry
as `procedural-mannequin-quaternius-hair-v0`. Player, NPC, editor preview, and
runtime preview all use the existing cache/load/clone/material/animation path;
there is no browser-only hair overlay or second gameplay/runtime path.

## Known Limits And Recommendation

- One compiled hairstyle plus `none`; no library browsing or thumbnails.
- Vendor-authored hair colour/material is fixed; the recipe hair palette is not
  compiled yet.
- No secondary hair motion, physics, morphs, per-strand deformation, or
  user-facing fit controls.
- The fit profile is specific to the generated stylised head and current body
  parameter contract.

Recommended next milestone: Hairstyle Library V2. Add a small, curated set of
additional provenance-backed styles through this same registry, fit-profile,
single-skin compiler, matrix, and runtime integration before adding headwear or
clothing interaction rules.
