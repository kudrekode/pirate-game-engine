# Asset Creator — Human Foundation Result

## 1. Previous Generator

The old generator removed the Golden source meshes, retained its 65-joint rest
skeleton, and joined separate ellipsoids, joint spheres and box hands/feet with a
35 mm voxel union. The torso read as stacked volumes. The broad, low head buried
the short neck, uniform limb sections obscured elbows/wrists/knees, and the chest
facing marker was visible geometry. Analytic distance weights and bone/bounds
checks established technical compatibility but did not establish good anatomy.

## 2. New Generation Approach

`tools/blender-character/generate_procedural_mannequin.py` now lofts elliptical
anatomical sections through the torso and limbs. Sections follow existing joint
anchors, with explicit changes in width/depth at the ribcage, waist, shoulders,
elbows, wrists, thighs, knees, calves and ankles. An 18 mm union, five smoothing
iterations and symmetric 70% decimation produce one closed body surface before
weights are assigned. The head retains cranium/jaw/chin volumes with revised
placement. The chest marker is removed.

The default is approximately 7–7.5 heads tall, with compact stylised arm reach.
Pelvis height is about half the total; knees are around 29% and shoulders around
80%. Elbows, wrists and other articulation points follow the compatible Golden
rig. These are stylised proportions, not a claim of anatomical realism.

The existing recipe → Blender → two deterministic exports → GLB round trip →
manifest → shared preview/runtime path remains. Compiler/topology/validator
versions are now v8/v4/v9. CharacterRecipe stays V1 and procedural recipe stays V6;
older topology declarations migrate safely to the current generator.

## 3. Anatomy Improvements

| Region | Result and remaining limit |
| --- | --- |
| Head | Narrower cranium, visible jaw/chin, head lifted above its pivot. Fixed eyes/nose/mouth remain very simple; no ears or brows. |
| Neck | Visible continuous neck between jaw and torso, with a measured surface-width gate. |
| Shoulders | Sloped upper torso and rounded deltoid transition replace the flat block connection; raised-arm armpits are still stylised. |
| Torso | Continuous ribcage, narrower waist and broader hips. Actual surface slices must retain waist taper. |
| Arms | Upper-arm mass, elbow narrowing, forearm bulge and slimmer wrists. |
| Pelvis | Continuous hip/thigh connection; the front/side hip ridge and rear groin contour still need refinement. |
| Legs | Fuller thighs, narrower knees, calf bulges and tapered ankles. |
| Hands/feet | Smaller rounded palms with thumb volume, shaped foot/toe profiles. Hands remain mitts; fingers/toes are not individually modelled. |

## 4. Skeleton / Skinning

The 65-joint names, hierarchy, Golden rest signature, shared facing correction,
root policy and baked idle/walk clips are unchanged. Height scales the complete
result; other controls move mesh anchors within the existing safe range around
the unchanged skeleton. This deliberately limits extreme edits.

Weights remain deterministic and normalized, with at most four influences.
The skull and face are Head-bound. Opposite limb weights are excluded, and a
continuous midline falloff replaces a hard exclusion seam that stretched the groin
during walking. The exported-surface validator now measures finite triangle-edge
lengths and a maximum 3× stretch at five samples per idle/walk clip. A deliberately
misweighted skull vertex verifies that this gate catches deformation even when
bone lengths remain valid. Haired validation explicitly selects the body surface.

Existing hairstyles retain their source assets, registry and shared
skeleton attachment. Fits now use the real scalp surface, including face-centre
clearance checks and local collar correction. Narrower-head coverage bounds were
updated; neck and shoulder clearance requirements remain. Long's generated front
collar faces are removed to avoid a band below the chin; vendor files are unchanged.
There is no new rig,
retargeting system or secondary hair motion. No compatible attack clip was available
in the canonical set, so attack deformation is not claimed as validated.

## 5. Parameterisation

The six existing controls remain meaningful: height (metres), shoulder width,
torso length, arm length, leg length and hip width (normalized controls).
Skin colour/roughness, eye colour, hair choice and hair colour remain separate.
No speculative sliders were added.

Authored ownership remains in `packages/character-contract/src/index.ts`.
Compiler measurements/ranges live in `procedural-mannequin-contract.mjs`; geometry,
joint-relative anchors and weights live in `generate_procedural_mannequin.py`.
Future waist/chest depth, limb thickness, head size and neck controls should drive
these same profile stations, with recipe defaults/migration and round-trip tests.
Large proportion changes will require a deliberate rig-proportion contract.

## 6. Editor Integration

The main toolbar now has **Asset Creator**. Its accessible modal checks Studio's
identity endpoint, offers **Open Asset Creator** in a new tab, and shows local
setup guidance if unavailable. Escape/Close return to the editor.

Run `npm run dev:asset-studio`; Studio uses port 5174 and fails clearly if occupied.
The editor defaults to its current host on that port. Set `VITE_ASSET_STUDIO_URL`
in the root `.env.local` and restart the editor for a different HTTP(S) address.
The small public health endpoint permits cross-origin reads; compile endpoints
retain their existing access rules. The launcher does not start a process or merge
Studio into the editor. Saved game schema and isolated runtime state are unchanged.

## 7. Visual Review

Fresh artifacts were reviewed in the real Studio WebGL preview, not accepted from
export success alone. Each body was inspected in rest front/side/back, idle front
at 25%, walk side at 25%, and walk front at 75%. Camera bounds were corrected to
measure skinned vertices, fixing the tall character's clipped head.

| Character | Configuration | Observations and weaknesses |
| --- | --- | --- |
| A — Default | Height 1.82 m; other five controls 0.50 | Clearly human silhouette, visible neck, sloped shoulders, waist and tapered limbs. Idle/walk preserve connections without obvious tearing. Side hip ridge, mitt hands and flat facial detail remain. |
| B — Short/wide | Height 1.58 m; shoulders 0.85, torso 0.50, arms 0.50, legs 0.40, hips 0.85 | Distinct shorter, wider frame with intact neck and limb taper. This is frame-width variation, not a body-fat/muscle system. Broad pelvis and armpit forms remain simplified. One walking view slightly crops the leading foot at the canvas edge. |
| C — Tall/slim | Height 2.02 m; shoulders 0.20, torso 0.50, arms 0.60, legs 0.65, hips 0.20 | Longer, slimmer silhouette; knees/calves and neck remain readable. Idle/walk remain attached. The narrow hip/groin region is the most stressed case and needs care before extending slider ranges. |

These are usable stylised base bodies at a simple indie game's gameplay distance,
not finished hero characters. Close-up face and pelvis quality are still below a
polished character creator. The new algorithm is a triangle base, not a designed
quad cage ready for production clothing deformation.

The five existing hairstyles were separately inspected in close-front, side and
back views. Initial bounds-only passes concealed skull clipping, especially in
Long; fitting was corrected against the actual surface and the visual checks rerun.
Hair remains solid-colour with the existing normal maps and stylised silhouettes.

Local visual evidence (ignored, regenerate using the validation guide):
`apps/asset-studio/test-results/human-final/` and
`apps/asset-studio/test-results/human-hair-final/`, with the final Long correction in
`apps/asset-studio/test-results/human-long-final/`. Fresh compiler artifact sets are
under `test-results/human-foundation/`. The default and Buzzed fixture sets in
`public/assets/derived/procedural-humanoids/` are updated together with their manifests,
diagnostics, recipe snapshots and logs.

## 8. Validation Results

Validation completed on 4 October 2026 with Blender 5.2.0 LTS.

| Check | Observed result |
| --- | --- |
| Deterministic generation | All three body configurations and five hair configurations passed two-build binary/semantic determinism and exported GLB validation. |
| Final artifact round trips | 8/8 passed using the current validator, including material, face, hair, skinning, skeleton, topology and idle/walk checks. Compact metrics: `test-results/human-foundation/final-validation.json`. |
| Focused logic/application checks | Creator/recipe contracts, launcher, compile health API, shared fixture loading, geometry and deformation regression checks passed. Legacy v3 topology explicitly preserves authored proportions, appearance and `none` hair while upgrading to v4. |
| Root browser acceptance | Asset Creator availability/fallback/modal keyboard behavior and procedural character editor/runtime integration: 2 passed. |
| Studio browser acceptance | Checked-in preview/animation lifecycle: 1 passed; real browser → compile API → generated GLB preview: 1 passed. |
| Visual acceptance | Three body cases, six views each: 3 passed and 18 images inspected. Five hairstyle cases: 5 passed and 15 images inspected; the final Long collar correction was rebuilt and its separate 1-case/3-view check passed and was inspected again. |
| `npm run ci` | Run once, exit 0: 75 Vitest files / 619 tests passed; root and Studio builds plus all three package typechecks/builds passed; 46 Node compiler/asset tests passed. Log: `test-results/human-foundation/ci.log`. |
| `git diff --check` | Passed. |

| Body | Exported vertices / triangles | Maximum idle edge stretch | Maximum walk edge stretch |
| --- | --- | --- | --- |
| Default | 7,408 / 14,740 | 1.870× | 2.415× |
| Short/wide | 7,994 / 15,912 | 2.044× | 2.394× |
| Tall/slim | 7,121 / 14,166 | 1.805× | 2.901× |

The body topology is one closed manifold component; facial feature meshes are
separate Head-bound meshes. Final hair vertex/face-centre clearance minima are
positive for all five styles (approximately 2.3–9.8 mm). These are sampled geometric
gates, not proof against every intersection at every pose or every slider setting.
Full extreme-range and historical matrices were intentionally not run.

Iteration caught real failures: a pelvis weighting seam, skull clipping in hair,
and Long's front neck band. Those were corrected before final acceptance. One
browser assertion still expected recipe V1 and was updated to V6. Three component
tests timed out during concurrent browser work; all passed in isolation and the
final full CI run, without increasing timeouts. Build chunk-size warnings remain
non-failing. No unrelated browser suite or new dependency was introduced.

## 9. Remaining Gap to a Sims-like Creator

| Area | Still required |
| --- | --- |
| Body editing | Independent mass, muscle, waist/chest depth and limb thickness; broader safe ranges; refined pelvis/armpits and additional poses. |
| Face/head editing | Head and jaw variation, ears, brows, better eyes/nose/lips and a small coherent set of facial controls. |
| Hairstyles | More authored styles, stronger hairline/strand treatment and range-wide fit acceptance; no physics exists. |
| Skin | Richer material detail, palette/preset design and optional authored textures; current skin is a uniform colour and roughness. |
| Clothing | Compatible garment bases, slots, fitting, occlusion and deformation validation. |
| Accessories | Attachment transforms, compatible slots and clipping checks. |
| Saved presets | A named character library with thumbnails, durable recipe editing/versioning and explicit compiled-result promotion; recent compile history is not that library. |
| Editor UX | Friendlier presets, direct body/face editing, framing controls and a clear create/save/use-in-game workflow. The new launcher is only discovery/access. |

## 10. Recommended Next Step

Add a small head/face variation pass: a few coherent presets and bounded head/jaw
controls, with ears and brows, using the existing recipe/compiler and Head attachment.
The face is now the most conspicuously generic part at conversation distance.
Require front/side and idle/walk acceptance plus all existing hair-fit checks.
Do not expand into facial animation or a full facial sculpting UI yet.

That next feature is a recommendation only and was not implemented.
