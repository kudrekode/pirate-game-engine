# Character Creator Architecture Decision

Investigation date: 4 October 2026. Repository inspected at `3117eb00138396edf04c3d23d464ed5528d657bc`.

Scope: architecture decision only. No prototype, production changes, replacement assets, dependencies or external asset downloads. All stages below are recommendations for subsequent work.

## 1. Executive Decision

- **Choose Option C: a bounded, authored-first hybrid.** Use one deliberately authored human deformation mesh with curated body/face morphs; retain recipe-driven offline compilation and limited fitting automation for hair and garments.
- Authored topology, anatomy, UVs and weights establish visual quality. Procedural operations adapt approved assets rather than reconstruct anatomy from primitive volumes.
- Preserve the procedural creator as a separate legacy geometry path and retain its existing compiled characters.
- Keep the actual Golden **65-joint hierarchy, names, axes and default rest pose** as the first compatibility target. Bone count is not the current visual bottleneck.
- Bake identity/body morph values into exported meshes initially. Games receive ordinary skinned GLBs and matching animation references, not a character generator.
- Use uniform whole-character scale for height and authored morphs for mass, muscle and bounded shape changes. Substantial limb/joint-proportion changes need a separately proven offline rig-proportion profile.
- Use coherent face presets on one topology, followed by roughly 8–12 meaningful controls. Do not build a procedural face modeller or full facial animation rig now.
- Fit garments through canonical surface/cage correspondence, then authored corrections and shared-skeleton skinning. Shrinkwrap alone is not a clothing architecture.
- Preserve all five hairstyle sources, identifiers, provenance and material work. Replace mannequin-specific fit assumptions through versioned adapters.
- Keep compiler orchestration, preview/full assurance, manifests, provenance, shared GLTF cache/cloning, registry and Studio transaction/preview boundaries. Adapt geometry-specific assumptions.
- Stop expanding the voxel/loft generator as the route to believable faces, hands, body archetypes and reusable clothes. Continue legacy correctness maintenance.
- **Build a small proof next:** one legally qualified authored human, current rig, three body and three face morphs, existing short hair, one simple garment fit sample, idle/walk and GLB round trips. No public controls or library migration until it passes.

## 2. Current System Assessment

### Evidence standard and repository references

**Observed** means inspected code, current asset bytes or explicitly identified existing evidence. **Inference** means a conclusion from those observations. **Recommendation** means future design, not an implemented capability.

The investigation read the requested result documents, current routing instructions, architecture Quick Resume, relevant compiler/animation/preview code, README, roadmap and validation guide. Historical acceptance is not a fresh build or visual pass.

| Reference | Concrete source / relevant owner |
| --- | --- |
| R1 — recent results | [Human Foundation](ASSET_CREATOR_HUMAN_FOUNDATION_RESULT.md); [Workflow](ASSET_CREATOR_WORKFLOW_RESULT.md); [Phase 3](PHASE_3_VISUAL_COMPILER_OPTIMISATION_RESULT.md); [Phase 4](PHASE_4_STRUCTURAL_DECOMPOSITION_RESULT.md) |
| R2 — boundaries | [AGENTS.md](AGENTS.md); [Asset Studio architecture](docs/ASSET_STUDIO_ARCHITECTURE.md); [validation guide](docs/PLAYWRIGHT_SMOKE.md); [roadmap](ROADMAP.md) |
| R3 — authored source | [character-contract](packages/character-contract/src/index.ts): `CharacterRecipeV1`, `HUMANOID_V1_CONTRACT`, `CHARACTER_BODY_PARAMETER_LIMITS`, `migrateCharacterRecipe` |
| R4 — body, weights, face, hair | [Blender generator](tools/blender-character/generate_procedural_mannequin.py): `MeshBuilder.add_profile`, `create_geometry`, `assign_analytic_weights`, `create_face_features`, `measure_head_contract`, `import_hair_component`, `compile_mannequin` |
| R5 — compiler | [procedural contract](tools/blender-character/procedural-mannequin-contract.mjs): `deriveProceduralMannequinAnatomy`, `validateProceduralMannequinRecipe`; [orchestration](tools/blender-character/procedural-mannequin-compiler.mjs): `compileProceduralMannequin`, `validateInstalledProceduralMannequin` |
| R6 — exported acceptance | [round-trip validator](tools/blender-character/procedural-mannequin-roundtrip.mjs): `analyzeGeometry`, `compareSkeletonContracts`, `validateAnimation`, `validateCloneAndRest`, `validateProceduralMannequinArtifact` |
| R7 — animation | [retarget profile](tools/blender-character/profiles/mixamo-to-quaternius-v2.json); [Blender baker](tools/blender-character/retarget_golden_reference.py): `bake`; [bake orchestration](tools/blender-character/golden-animation-bake.mjs); [provenance](tools/animation-retargeting/source-provenance.mjs) |
| R8 — creator boundary | [App](apps/asset-studio/src/App.tsx): `handleCompile`, `selectRecentCompilation`; [request adapter](apps/asset-studio/src/proceduralMannequinCreator.ts): `createProceduralMannequinCompileRequest`; [development API](apps/asset-studio/dev/procedural-mannequin-compile-api.mjs): `createRecipeForProportions` |
| R9 — preview/loading | [HumanoidPreview](apps/asset-studio/src/HumanoidPreview.tsx); [previewSources](apps/asset-studio/src/previewSources.ts); [shared loader](packages/three-asset-preview/src/index.ts): `prepareThreeVisualAssetMaterials`, `cloneThreeVisualAssetRoot`, `requestThreeVisualAsset`, `requestThreeVisualAssetAnimationClip` |
| R10 — runtime | [registry](src/runtime/three/threeVisualAssetRegistry.ts); [loader facade](src/runtime/three/threeVisualAssetLoader.ts); [renderer](src/runtime/three/threeVisualRenderer.ts): `createThreeVisualMarkerGroup`; [game schema](src/types/game.ts) |
| R11 — hair sources | [component registry](packages/character-contract/src/character-component-registry.json); [registry verification](tools/blender-character/character-component-registry.mjs) |

Current versions observed in R2/R5: CharacterRecipe V1; creator request and procedural recipe V6; compiler `procedural-mannequin-blender-v8`; validator `procedural-mannequin-roundtrip-v9`; topology `procedural-humanoid-v4`; head contract V3 and current hair fitting V3. These are separate identities, not one interchangeable version number.

**Observed strengths:** recipes are separate from artifacts; Blender compilation is inspectable; vendor input hashes are checked; full builds compare two isolated outputs; both preview and full outputs receive a Three.js round trip. Skeleton-aware cloning isolates instances. Studio distinguishes draft values from successful results, preserves the working preview on failure, and restores recipe/result/history together. These responsibilities survive a geometry change.

**Observed limits:** six body controls describe frame proportions, not mass or muscularity. Separate simple eyes/nose/mouth sit on a fused head; hands are mitts. Skin has no authored texture layout. Hair fitting contains corrections specific to this generated head. Animation acceptance covers idle/walk rather than a complete action/adventure motion set.

**Integration gap:** R3 has `body.baseId`, `skeletonId`, `animationSetId` and component slots, but R8's compile request forwards only appearance, proportions and hair. Its API starts from the procedural default recipe. Changing `baseId` alone cannot load an authored human. Future backend dispatch must be explicit here.

**Inference:** the surrounding architecture is more reusable than the generated anatomy. Material improvements alone leave facial construction, hands, pelvis contours and deformation visible at conversation distance.

R2 still defers clothing and lists library/asset work. Earlier guidance to add anatomical stations, and manifest wording describing Golden as only a temporary rig, are historical positions. This decision changes the recommended geometry investment and retains Golden as the first compatibility target; it does not claim that a new base has already passed.

## 3. Current Mesh / Topology Assessment

### Direct artifact observations

A read-only Node inspection decoded existing GLB JSON/binary accessors, triangle indices, UVs, joints and weights; counted body edge/valence data; and inspected primitives, materials and animation targets. No Blender regeneration was performed.

| Existing artifact | Body vertices | Body triangles | Total triangles including face | Other observations |
| --- | ---: | ---: | ---: | --- |
| Checked-in `mannequin-v0/mannequin.glb` | 7,298 | 14,592 | 14,740 | 440,264 bytes; 5 primitives; 3 materials; 65 joints; no images, morph targets or embedded animations |
| Checked-in `mannequin-hair-v0/mannequin.glb` | 7,298 | 14,592 | 15,570 | Buzzed adds 830 triangles; 6 primitives; 4 materials; one normal image; 4,855,768 bytes |
| Existing local `human-foundation/short-wide/mannequin.glb` | 7,884 | 15,764 | 15,912 | Different body vertex/index topology; no morph targets |
| Existing local `human-foundation/tall-slim/mannequin.glb` | 7,011 | 14,018 | 14,166 | Different body vertex/index topology; no morph targets |

Checked-in fixtures are under `public/assets/derived/procedural-humanoids/`. The last two are ignored local evidence under `test-results/human-foundation/`, not portable checked-in proof.

Default SHA-256: `8dae96b198e48d31ef7881d65b3d69da9261afc3dbc6ba4088d027becd9d12d0`. Buzzed SHA-256: `e2ab6a3e93cfb82359975c1d013834cfd8c6fcbbb903103d406dbcc160839e8b`. These identify inspected bytes, not fresh compilation of every current input.

Direct default-body index analysis found 21,888 edges, zero boundary/non-manifold edges, Euler characteristic 2 and no repeated-index degenerate triangles. Triangle-graph valence ranges from 3–11, mostly 5–7. Weights have at most four nonzero influences and maximum raw sum error about `1.42e-7`; 22 of the 65 joints actually influence the body. Existing round-trip diagnostics additionally report one component and no degenerate-area faces. None of these metrics proves good deformation loops.

The bald body has no `TEXCOORD_0`. Joining textured hair adds a body UV accessor, but every body UV is `(0, 1)`: it is not a usable skin unwrap. The compiler explicitly disables morph and animation export. Registered external GLBs supply idle/walk.

### The actual topology limitation

**GLB triangles are not the fault.** A properly authored quad human also exports triangles. The stored Blender report has 8,711 pre-export polygons versus 14,592 resulting triangles, so even the generator's pre-export surface should not be described as exclusively triangles. Polygon side count alone is not a sound decision criterion.

R4 builds anatomical stations/overlapping volumes, voxel-remeshes at 18 mm, smooths five times and applies symmetric decimation with ratio 0.7. Connectivity follows geometry rather than authored loops at eyes, lips, shoulders, groin and knuckles. Proportion changes alter vertex counts/correspondence, as the inspected outputs show.

A deformation cage supplies stable vertex identities, usable UVs, meaningful regions and deliberate density/edge direction at moving features. Quads are convenient for authoring; designed triangles can also work. The requirements are stable correspondence and designed deformation. glTF morphs are per-vertex deltas with accessor counts matching the base primitive, so the independently remeshed bodies cannot directly become targets of one morph family. [Khronos morph-target specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#morph-targets).

| Future use | Assessment |
| --- | --- |
| Body deformation | Useful for the present bounded stylised range. Regenerating separate meshes works, but does not preserve a reusable morph/UV/weight domain. |
| Shoulders | Analytic weights provide attachment, not designed deltoid/armpit flow or volume under elevation/twist. Both topology and authored weights matter. |
| Hips | Connected thighs and corrected midline weighting prevent some tearing. Manifold geometry can still pinch, fold or intersect during crouching/sitting. |
| Facial shaping | Missing integrated lids/lips/nasal structure/ears. Moving a nose wedge and mouth box cannot deliver the intended facial variation. |
| Clothing | One frozen output can be dressed. Repeated remeshing makes persistent fitting correspondence, masks and morph transfer fragile across identities. |
| Weight painting | Possible on triangles, but corrections on one export do not reliably survive regeneration without transfer. |
| Morph targets | Possible on a frozen mesh with fixed indices. Freezing, retopologizing, adding UVs and facial structure effectively starts an authored-base pipeline. |
| Close-up humans | Face construction, hands, UVs, surface design and skinning limit quality together; more triangles alone do not solve them. |

Three existing minimum-torso workflow screenshots were viewed: `output-Rest-Front.png`, `output-Rest-Side.png`, `output-Walk-Front.png` under `apps/asset-studio/test-results/human-foundation-reviews-h-309ef-min-output-human-foundation/torsoLength-min/`. They show a readable humanoid, simplified face/hands and pronounced side pelvis contour. They are historical captures, not new default-body renders or fresh appearance acceptance.

**Inference:** the body is suitable for mannequins and bounded stylised background characters. Its cost rises sharply when reusable faces, persistent skin textures, garment fitting and pose corrections must survive across body types. The requested product is at that threshold.

## 4. Rig Assessment

**Keep the actual Golden 65-joint rig as the initial canonical rig.** Improve the mesh/weights first.

The inspected list includes `root`, `pelvis`, three spine joints, clavicles, arm/hand joints, five finger chains per hand with leaves, `neck_01`, `Head`, thighs/calves/feet/balls/toe leaves. Forty joints belong to finger chains including leaves. There are no jaw, eye, facial or dedicated limb-twist bones. A count of 65 is not evidence of an elaborate face rig.

R4 weights the main 22 body joints; skull/features are Head-bound. R7's bake drives 22 target bones. Both inspected clip GLBs have 23 channels: rotations plus a translation channel. Finger/end bones remain at rest. Authored fingers can use existing joints, but grasping/finger animation is unproven new work.

Authored meshes and garments can share the rig's names, rest transforms and inverse binds. Bounded mass/muscle/identity morphs are compatible with that skeleton. Static face identity needs morphs, not facial bones; blinking/speech is a later expression feature.

**Important contract mismatch:** R3's provisional `humanoid-v1` describes a 21-bone `Root/Hips/Spine` A-pose hierarchy, while real output uses Golden's `root/pelvis/spine_01` hierarchy and `golden-humanoid-v0` signature. The real rig also has fingers despite provisional “deferred” wording. Do not rename joints or impose that provisional pose. Add an explicit compiled rig profile/mapping later while retaining old authored IDs.

R6 compares rest translations, rotations and scales, not names alone. Changing hierarchy, axes, bind pose, rest positions or joint order without remapping affects weights, inverse binds, clips, bake profiles, hair, hashes and validation. A new rest-proportion variant needs a matching animation/profile identity; it cannot silently replace the default rig.

Bind the first authored base to the exact existing rig and assess realistic joint placement. If that forces poor anatomy, record the failure before allowing a versioned rest-profile adjustment. Preserve joint identities/hierarchy where possible and rebake offline instead of weakening compatibility gates. Uniform whole-character scale remains a lower-risk height mechanism.

Missing twist bones may limit severe rotations. Evaluate authored topology/weights first. Blender-only corrective drivers do not execute in Three.js: pose correctives require exported behaviour and tests if introduced. Do not promise arbitrary pose correction from baked static identity or add bones pre-emptively.

## 5. Architecture Options

### A — Continue fully procedural geometry

Improve profiles, union, hands/feet, facial construction and generated clothing. Almost all current code remains initially, but anatomical rules and validators expand together.

A more attractive stylised human is achievable. Procedural modelling is not intrinsically incapable of high quality. For this project, deliberately parameterized facial connectivity, UVs, detailed hands, stable weights and clothing correspondence would amount to creating a bespoke character-modelling system. Introducing fixed connectivity and sculpted targets would in practice move toward B/C.

Immediate migration risk is low, but long-term authoring/maintenance effort is very high. Agents can change profiles reliably; numerical passes cannot establish anatomical appeal. This is the weakest feasible route to the specified conversation-distance quality, despite maximum short-term code retention.

### B — Canonical authored base plus authored morphs

Use a UV-mapped, artist-weighted mesh with fixed vertex identities and curated shape keys. Clothes/hair are authored for that base, with explicit garment-specific fit morphs. Keep the rig fixed apart from uniform height.

Retain recipes, orchestration, preview/full policy, loaders, registry, clips and Studio ownership. Replace anatomy/analytic weights; add source provenance, backend dispatch and authored-family validators.

This is the simplest credible high-quality option and the core of the first experiment. It is predictable, art-reviewable and efficient when identity is baked. It could be the final architecture for a small body range/wardrobe. Its cost is manual garment targets/corrections across many body combinations. Fixed joints also bound independent limb-length variation. Acquiring a mesh does not supply the desired morph library, rig adaptation or garment rights automatically.

### C — Bounded authored-first hybrid — recommended

Use B's authored topology, UVs, weights and identity targets. Add constrained offline automation: uniform height, landmark/region-aware head and garment fit transfer, deterministic materials, and only later an approved rest-proportion profile if necessary.

Retain B's infrastructure and useful ideas from measured-head fitting, provenance and parameter-to-compiler translation. Replace body construction only in the new path. This reduces repetitive fitting across bodies but introduces binding metadata, modifier ordering, corrections and combination tests. Automatic fit is an initial result requiring review, not a quality guarantee.

C wins because reusable clothes/hair must follow distinct bodies/faces and the repository already has an offline compiler. It does not win merely by combining techniques. If transfer cannot preserve a simple garment without disproportionate exceptions, use explicit garment morphs on the same canonical base. Do not build a universal fitting engine.

### D — Curated finished-character/preset kit

Select a small set of professionally authored characters with matched outfits, adapting them offline to the current rig where practical. Recipes select presets/materials/limited swaps rather than continuous anatomy.

Keep source identity, assembly/import validation, registry, preview, library concept and potentially the canonical clips. This can deliver a few convincing NPCs fastest. Independent source topologies multiply seams, rig adaptations and wardrobe variants and do not support general face/body blending. It underdelivers the requested Sims-like customization. No external service or new DCC application is required for any option.

## 6. Decision Matrix

Ratings apply to the requested product and a small team. High effort/risk/burden is a cost; high capability is a benefit. No arbitrary weighted total hides unresolved art quality.

| Criterion | Fully Procedural (A) | Authored Base + Morphs (B) | Bounded Hybrid (C) | Curated Preset Kit (D) |
| --- | --- | --- | --- | --- |
| Visual ceiling at feasible effort | Medium; stylised strength | High with good art | High with good art | High per selected character |
| Development effort | Low next edit; very high to target | Medium code, substantial art | Medium-high code/art | Low-medium plus adaptation |
| Face quality | Low-medium without modelling project | High, coherent topology | High, authored foundation | High fixed faces, limited variation |
| Body variation | Numerical freedom; hard quality control | Strong within authored envelope | Strong with bounded fitting/proportion support | Discrete archetypes |
| Clothing support | Weak persistent correspondence | Strong, more manual targets | Strong with reviewed transfer/corrections | Strong in matched sets only |
| Animation compatibility | Current narrow range proven | Strong with exact rig | Strong default; variants need proof | Depends on source/adaptation |
| Current system reuse | Highest code retention | High surrounding infrastructure | High infrastructure/fitting concepts | High loader/UI; less generator |
| Determinism | Existing strength | Straightforward pinned inputs | Achievable; pin binding/modifier inputs | Straightforward assembly |
| Runtime efficiency | Good within budgets | Good, identity baked | Same as B when offline | Asset-dependent |
| Maintainability | Declines with anatomy exceptions | Best for small wardrobe | Good only with strict scope | Simple code, many content variants |
| Agent friendliness | Easy numbers, difficult art convergence | Clear contracts; art expertise needed | Testable adapters; harder fit debugging | Easy selection, asset inconsistency risk |
| Future expansion | Expensive faces/clothes | Strong, manual-fit cost grows | Best fit for bodies plus wardrobe | Limited continuous customization |
| Existing-character risk | Low with retained old versions | Low parallel; high in-place replacement | Same as B | Low with new IDs |
| Animation migration risk | Low now, higher with wider range | Low default rig | Medium at proportion variants | Medium-high across unrelated rigs |
| Body customization ceiling | High theoretical, costly | High within morph library/fixed joints | High within approved envelopes | Low continuous ceiling |
| Long-term developer burden | High heuristics | Medium, largely asset authoring | Medium-high fit discipline | Low code, higher content bookkeeping |

B beats C on simplicity; D on time to a few finished NPCs; A on immediate retention. C is selected for reusable fit across identities, with explicit limits on its added complexity.

## 7. Recommended Character Architecture

**Recommendation:** a versioned canonical human asset package is compiler input. It contains the neutral deformation mesh, stable topology/UVs, authored weights, named morphs, regions/landmarks, material sources, provenance and compatible rig profile. Blender source files may belong to the asset package; recipe contracts contain only portable IDs, versions and values.

1. Validate the recipe and resolve exact base/component/profile revisions.
2. Load immutable canonical source; verify topology, morph and rig identities.
3. Resolve preset plus explicit overrides into bounded values; apply body/face identity.
4. Use the unchanged default rig initially. Any later approved proportion profile must update mesh, rest joints and inverse binds consistently. Height uniformly scales the grounded character.
5. Deform hair/garments from canonical bindings; apply curated corrections and clearance checks in rest space before animation, avoiding double deformation.
6. Assign materials, apply coverage masks after fitting, bake identity, derive runtime meshes and triangulate deterministically. Preserve the full editable source.
7. Export a skinned GLB with references to matching external clips. Run round trips and full two-build comparisons before finalisation.
8. Preview/use the result through the existing shared loader, registry and visual marker path.

Identity targets need not ship to games. Keep them in source for reopening/recompilation. Later expression targets are a separate small export capability. Blender supports exporting skinning and shape keys, but current `export_morph=False` output is not expression-ready. [Blender glTF documentation](https://docs.blender.org/manual/en/5.3/addons/scene_gltf2.html).

A narrow legacy/new geometry discriminator and compiler entry point are enough; do not build a backend plugin framework first. Separate shared checks from geometry-family rules. Canonical topology, triangulated output and coverage-masked output have different identities: record the derivation rather than require all dressed exports to retain the same counts.

### Base asset requirements and licensing

Use a commissioned/project-owned source, a permissively licensed base, or a commercial asset explicitly permitting this creator's distribution model. Prefer editable topology over an opaque decimated final character.

| Requirement | Acceptance before adoption |
| --- | --- |
| Rights | Commercial use, modification, inclusion in the distributed creator, relevant source/derivative redistribution, downloadable generated GLBs and inclusion in users' games. Permission for one rendered game is not sufficient evidence for every use. |
| Provenance | Author/provider, acquisition record, exact licence/version, hashes and obligations for mesh, morphs, textures, components and animations separately. A manifest hash is not a rights grant. |
| Anatomy/topology | Believable neutral anatomy; deliberate shoulder/hip/facial loops; hands, eyelids, lips and ears; stable morphable vertex domain; front/side/three-quarter and motion review. |
| Rig/pose | Legally and technically reriggable to the current 65 joints. Document source neutral pose; convert A/T pose offline before final binding. |
| Materials | Nondegenerate UVs, portable PBR maps, correct tangents/normals and controllable skin tone. |
| Editing | Accessible morph source or permission/ability to author it; no vendor cloud dependency or unexportable essential feature. |
| Runtime | Meets section 14 budgets without losing deformation/silhouette; no hidden renderer or rig dependency. |

MakeHuman/MPFB core assets are one ecosystem worth evaluating. Its official page distinguishes CC0 core assets from GPL/AGPL software. That does not approve every community asset or prove suitable topology/art, and it does not require adopting the software as a dependency. [Official MakeHuman/MPFB licensing](https://static.makehumancommunity.org/about/license.html). A commissioned base offers direct control over style/rights; commercial marketplace assets need product-specific terms review. No candidate was acquired or selected here.

The existing hair registry records CC0 source licences/hashes. Animation provenance records are project-maintained, not vendor-issued grants. Adobe's FAQ permits personal/commercial use of Mixamo characters/animations; that statement alone does not establish all creator-library or asset-redistribution rights. Verify the intended packaged/exported use before distributing a library. [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html). The technical pipeline can remain while those product rights are resolved.

## 8. Face Strategy

| Approach | Assessment |
| --- | --- |
| Fully procedural geometry | Useful for simple stylisation; coherent eyelids/lips/nose-cheek transitions require a large modelling effort. Current separate primitives show the gap. |
| Morph targets / shape keys | Best foundation for identity variation, shared UVs, hair correspondence and later expressions; requires sculpted targets and combination review. |
| Independent authored head presets | Fast variety but neck seams, UV/material differences, eye alignment and per-head hair fit multiply. Reserve for intentionally distinct character families. |
| Presets plus bounded sliders on one topology | Recommended: coherent identities first, meaningful controls afterward, without exposing technical targets. |

A face preset should be an approved value vector on the same canonical head. One visible control may drive several sculpted targets/corrective adjustments.

| Feature | Technical ownership |
| --- | --- |
| Head width/length | Morphs plus updated scalp/cage fit; preserve neck seam and Head attachment |
| Jaw width/depth/chin | Coupled lower-face targets; no jaw bone needed for static identity |
| Cheeks/brow | Sculpted volume preserving sockets/lids |
| Eye spacing/size | Coupled socket/lid targets and explicit eye placement/scale, not eyeball scaling alone |
| Nose size/length/width | Connected nose/cheek/upper-lip targets |
| Mouth width/lip shape | Lip/surrounding-face targets preserving closure and any interior |
| Ears | Local shape/size targets preserving attachment and hair clearance |

Start with a few distinct presets and roughly 8–12 controls, combining related dimensions and placing secondary details in an optional panel. Reset returns to the chosen preset. Randomization samples approved combinations/distributions, not every technical axis uniformly.

Use credible eye/iris/sclera and closed-lip geometry suitable for conversation shots. Blinking/speech can follow as expression morphs, separately owned from identity. Static customization is not a facial performance system. Evaluate under neutral lighting and at an agreed conversation framing, not only a distant full-body view.

## 9. Body Strategy

Slim, average, athletic, broad, heavy and stocky should be coherent morph presets on one base family initially. Height is independent: tall need not mean slim; broad shoulders need not mean muscular.

| Variation | Primary mechanism | Constraints |
| --- | --- | --- |
| Height | Uniform root scale of mesh, rig and components | Preserve grounded origin, bounds and animation scale |
| Mass/fat distribution | Authored morphs | Include abdomen, limbs, neck/face relationships; test compression and garment combinations |
| Muscle | Authored volume/silhouette targets; compatible normal detail where useful | Separate from mass; no skeleton scaling to fake muscle |
| Shoulder width | Bounded torso/shoulder morph | Larger changes require corresponding clavicle/arm-joint placement through an approved offline profile |
| Chest/waist | Authored targets | Garment ease and combination corrections; no universal narrow-waist rule |
| Hips | Pelvis/thigh targets initially | Extreme frame changes may need joint repositioning; review gait/groin |
| Limb thickness | Authored targets and reviewed weights | Preserve joint articulation zones |
| Limb length/torso proportions | Small fixed-rig-safe changes initially; real skeletal-length variation uses mesh-and-rest-joint profile | Update inverse binds and compatible clip bake; do not move mesh elbows away from joint centres |
| Hands/feet | Authored geometry and bounded morphs | Existing finger joints can be weighted; grasp and boot fit require acceptance |

Procedural stations stay in the legacy path. Do not treat the old six normalized controls as visually equivalent values on a new base. Preserve old recipes and make any later approximate conversion explicit.

A future proportion profile should preserve joint names/hierarchy/orientation conventions where possible, derive rest positions from approved landmarks, rebind body/components and produce matching offline clips. Sharing one rotation clip across profiles is a test result, not a guarantee: current clips include pelvis translation and depend on rest axes/root policy. Demonstrate useful variation through morphs and height before adding this complexity. Avoid runtime nonuniform bone scaling.

The supported range is a reviewed envelope of combinations, not independent slider maxima. Heavy bodies can legitimately lack a narrow waist. Validation must distinguish desired archetypes from defects.

## 10. Clothing Strategy

Author garments against the canonical rest body with thickness, seams, UVs, intended ease and reviewed weights. Clothes need neither the body's vertex count nor identical deltas: they need correspondence that maps body changes to garment-specific deformation and corrections.

| Strategy | Role |
| --- | --- |
| Same semantic body controls driving garment targets | Explicit robust contract; garment-specific targets, never body deltas copied by index |
| Canonical surface/cage binding | Preferred offline automation over bounded ranges; store binding identity/version |
| Archetype-specific variants | Appropriate for extreme heavy/stocky shapes, structured armour or cuts that cannot deform well |
| Automatic Blender fitting | Deterministic assembly/transfer of prepared assets; not a replacement for garment design |
| Shrinkwrap/projection | Local clearance correction for close-fitting regions; unsuitable as the whole solution for sleeves, lapels, hems, crotches or thickness |
| Shared skeleton | Ordinary clothes use the final body rig; transferred weights are a starting point requiring shoulder/hip review |
| Body hiding | Authored coverage masks with margins at collars/cuffs/waist; apply after correspondence evaluation and retain full source for undressing |

Blender Surface Deform is a candidate offline tool. Its documentation describes target validity requirements and increasing artifacts when the bound mesh departs from its control surface. This supports a small fit proof, not universal automatic dressing. [Blender Surface Deform](https://docs.blender.org/manual/en/dev/modeling/modifiers/deform/surface_deform.html).

Fit in neutral identity space, then skin to the final rest skeleton. Rest clearance does not prove animated clearance. Keep corrections as reviewed source assets rather than scattered generator exceptions.

Progress from shirt/trousers/boots to jackets/armour. Rigid armour should preserve panel shape/attachment rather than inflate with soft-body morphs. Robes/coats come later: surfaces bridging both legs cannot rely on naive nearest-limb weighting. Start with authored hem behaviour and constrained motion; extra garment bones require a separate demonstrated need. No custom cloth physics is proposed.

Helpful choices now: stable regions/topology, consistent pose/UVs, reusable measurements, versioned bindings, reviewed weights and material/slot conventions. Harmful choices: per-identity remeshing, bounds-only fitting, arbitrary triangle deletion, joint changes without rebinding and accepting garments merely because export succeeds.

## 11. Hair Strategy

**Observed:** R11 supplies Buzzed, Short Crop, Simple Parted, Long and Buns, with `none` in the recipe. R4 verifies source hashes, preserves normal maps, replaces source albedo with selected colour, fits by head/profile dimensions, corrects hairline/scalp clearance and joins hair into the exported body object. Hair remains a separate material primitive.

Every hair vertex receives the crown vertex's weights, rather than individual nearby scalp/neck/shoulder weights. With the Head-bound crown this behaves as rigid head-attached hair. Long also has special front-collar deletion/surface corrections. Existing fit acceptance therefore does not prove natural long-hair movement on new identities.

**Keep:** IDs, source meshes, licences/hashes, normal maps, colour controls, vendor immutability and actual-surface clearance checks. Stylised hairstyles are useful initial content, though later art-direction refinement may be warranted.

**Adapt:** fit profiles keyed to canonical head/topology revision; stable scalp/hairline/ear/neck regions; a small cage or stored surface binding following head morphs. Separate cap/root seating from locks/ends rather than scaling everything by bounds. Apply bounded clearance correction without collapsing style volume into the scalp.

Accept a short style first, then Long/Buns separately with neck/shoulder/head-turn review. Longer styles may require authored fit variants or reviewed neck/upper-torso weight blending; neither is automatically superior to current attachment. No secondary simulation is proposed. Styles that fail should clearly remain legacy-only until adapted, with explicit `none` preserved.

## 12. Materials Strategy

Current colour/roughness controls and PBR transport are a useful foundation, not sufficient skin/eye detail. Establish usable UVs and believable geometry, then authored base/normal/roughness maps and controlled palette tinting. Avoid a procedural texture-generation project.

| Surface | Practical next tier |
| --- | --- |
| Skin | Restrained base-colour variation, normal detail and roughness map; tone presets/masks preserving lips/palms and shading detail. No pores or custom subsurface renderer required. |
| Eyes | Correct eyeball/iris/sclera layout and controlled gloss, matched to sockets/lids. Credible placement precedes complex corneal shading. |
| Hair | Retain normals/colour controls; add authored colour/roughness variation as needed. Economical opaque locks first; alpha cards require separate overdraw/sorting acceptance. |
| Clothes/armour | Shared fabric/leather/metal presets, base/normal/roughness maps and palette masks; reuse textures across colour variants. |

R9's `standard` profile converts physical materials to `MeshStandardMaterial`, retaining conventional maps. Do not depend on clearcoat/transmission/custom skin shaders without shared-path support. Verify sRGB/linear handling, normals/tangents and texture/resource sharing in actual Studio and game rendering. A good material cannot repair missing anatomy.

## 13. CharacterRecipe Evolution

Keep editable renderer-independent source separate from immutable artifact manifests. `body.baseId` is a starting point, but a new geometry family deserves explicit version/dispatch semantics rather than overloading procedural V6.

This table proposes data responsibilities; it is **not an implemented schema**.

| Area | Future source data |
| --- | --- |
| Identity | Stable character ID/name and recipe version |
| Geometry | Explicit legacy-procedural/canonical-human family; base ID and immutable revision |
| Rig | Compiled rig profile; optional approved rest-proportion profile distinct from conceptual humanoid schema |
| Body | Archetype/preset ID/revision, height, bounded semantic morphs and explicit overrides |
| Face | Preset ID/revision and bounded identity values; expressions remain separate |
| Components | Hair/headwear/torso/legs/feet/accessory IDs/revisions; outerwear when implemented; explicit empty selections |
| Appearance | Material/texture presets and revisions, skin/eye/hair colours, garment palette overrides |
| Animation | Set/profile matching the compiled rig |
| Randomization | Optional seed/algorithm revision plus stored resulting values, so editing does not require rerunning a randomizer |

Define preset expansion once: versioned preset, then explicit overrides, with resolved values captured in compile input. Updating a preset must not silently alter saved characters. Manifests add base/morph/fit/material/rig/clip hashes, compiler/validator/toolchain identity, output hash and preview/full level. Do not embed renderer objects or output-session state in anatomy source.

Migration is additive: decode old CharacterRecipe V1 as legacy, preserve authored parameters/default semantics, explicit `none`, removed components and unresolved IDs. Report unavailable assets rather than substitute a different human. Existing old-topology migration is not authority to replace a recipe's geometry family.

Keep procedural recipe versioning for the old compiler. Add a canonical compile-input contract and request discriminator, preserving old endpoint behaviour. Offer approximate conversion only as “create a new character from this recipe,” retaining the old source/artifact and using a new identity/revision. Palette/hair may transfer; six body values cannot guarantee visual equivalence. Installed GLBs preserve old appearance; reproducible recompilation also needs pinned historical tool/source inputs, not only migration defaults.

A future durable library pairs recipe revisions with exact finalised artifacts/manifests. Current Recent Compilations is session-only. Games should reference approved asset IDs/transforms through existing assignments; no second gameplay schema or mutation of editor defaults during Play.

### Creator UI implications

Keep the established transaction and preview owners. A future high-level structure can be **Character, Body, Face, Hair, Clothing, Appearance**. Character chooses a sensible preset and supports save/reopen; Body/Face start from coherent archetypes before details; Hair/Clothing show compatible options; Appearance controls curated materials/palettes. Show fitting restrictions in user terms, with technical details expandable.

Retain clear draft/preview/finalised distinction, failure preservation and reset behaviour. Do not expose source topology, shape-key names or rig profiles as ordinary user decisions. Begin with explicit Generate Preview and Finalise actions; no Blender compile on every slider movement. A later instant morph preview must reproduce compiler semantics and keep per-instance edits isolated from the shared cache. Do not redesign the UI in this task.

## 14. Runtime / Performance Budget

These are **proposed starting budgets**, not measured guarantees or platform limits. Assume desktop browser play with gameplay and occasional conversation cameras; select a reference/low-end device before production acceptance.

| Resource | Starting target |
| --- | --- |
| Editable deformation source | Approximately 15k–30k quads for body/head/hands with deliberate local density. Optional detailed sculpt stays offline as texture-bake source. Use less if it meets the target. |
| Ordinary near/mid NPC | 20k–40k total exported triangles, including visible hair/clothes and excluding hidden body regions |
| Player/conversation character | 35k–60k total triangles, concentrating detail in face/hands/silhouette; more needs measured benefit |
| Hair | 1k–6k triangles for initial solid styles, inside the total character allowance |
| Materials/base-pass draws | Target 3–5 material primitives per dressed NPC, roughly 6 maximum for a special near character |
| Textures | Shared 1k sets for ordinary NPCs; up to 2k important skin/head/outfit sets; 512–1k eyes/hair where adequate; avoid routine 4k |
| Texture memory | Aim for 16–40 MiB incremental GPU residency for a shared ordinary character texture set, with a separately measured near-hero allowance |
| Skinning | Keep 65 joints initially, normalized maximum 4 influences per vertex; extra bones need a concrete requirement |
| Population | Initial target 8–12 mixed near/mid characters plus 1–2 conversation subjects. Roughly 20–30 or more requires measured LOD/culling/update work, not a promise from triangle counts. |
| Frame target | Begin with 16.7 ms total frame time on the named reference device; allocate character CPU/GPU work within the complete scene budget |

An uncompressed RGBA8 2k texture with mipmaps is about 21.3 MiB; three approach 64 MiB. File compression is not GPU compression. The inspected Buzzed GLB grows from approximately 0.44 MB to 4.86 MB while adding only 830 triangles: image resources deserve explicit budgets.

Materials do not equal draw calls. The current bald fixture has five primitives despite three materials; Buzzed has six. Shadows/additional passes multiply work. Ten characters at five primitives imply about 50 base-pass character draws before shadows. Current resource caching/skeleton cloning is not skinned-crowd instancing; mixers and skinning still cost per instance.

LODs should eventually exist. Preserve the canonical cage; derive lower-detail runtime outputs after identity compilation with repeatable weights/materials and silhouette review. Initial reductions around 50% and 20% of the highest runtime triangle count are reasonable experiments, not fixed product requirements. Reduce texture/material cost too. Screen size and measurements determine transitions. Do not independently decimate each source morph, and do not implement LODs now.

## 15. What Existing Infrastructure We Keep

Keep means preserve responsibility and existing behaviour, not pretend every current branch is generic.

| Component | A — Procedural | B — Authored/morphs | C — Recommended hybrid | D — Preset kit |
| --- | --- | --- | --- | --- |
| CharacterRecipe | Extend current values | Base/morph semantics | Base/morph/fit semantics | Kit/components selection |
| Procedural versioning | Continue family | Legacy retained; new family | Legacy retained; new family | Legacy retained; assembly family |
| Blender process | Keep | Replace geometry stage | Authored geometry plus bounded fitting | Conversion/assembly |
| Preview/full validation split | Keep | Keep | Keep | Keep |
| Determinism | Existing comparison | Pin base/morph inputs | Also pin bindings/profiles | Pin kit versions/transforms |
| Provenance | Keep | Add base/morph/texture sources | Also fit/corrective sources | Every kit asset |
| GLB validation | Extend existing | Shared plus authored rules | Shared plus fit/proportion rules | Shared plus kit rules |
| Shared preview loader | Keep | Keep; map/UV acceptance | Keep; no generation in loader | Keep |
| Runtime registry | Keep | New asset/profile IDs | New asset/profile IDs | New kit IDs |
| Animation clips | Current rig envelope | Reuse exact rig | Reuse default; variants need approved rebake | Reuse after compatible adaptation |
| 65-joint skeleton | Keep | Keep default | Keep hierarchy/default; gate rest variants | Prefer adapting kit to it |
| Hairstyles | Existing fitting | Sources plus explicit fit targets | Sources plus canonical binding/corrections | Approved head-specific fits |
| Materials | Add UVs/textures | Palette/PBR retained; authored maps | Same as B | Adapt kit materials |
| Studio UI | Transaction/preview owners | Same owners, semantic presets | Same owners, fit internals hidden | Same owners, preset selection |
| Future library | Recipe/artifact pairing | Same | Same | Same |

For C specifically:

- Preserve R5's process/assurance pattern, source hashes and publication behaviour. Current compiler report checks expect procedural head/face versions; replace those expectations only in the new family.
- Keep R6's finite/index/weight/clone/root-motion checks. Introduce authored-family rules instead of weakening legacy tests. Current rules include exact rest transforms, one skin, particular face objects/materials, topology properties and no embedded animations. Authored mouths, multiple skinned sections or coverage masks can need different explicit expectations.
- Add usable UV/tangent/resource checks, morph correspondence, material roles and fit/coverage acceptance. Do not apply the mannequin's universal narrow-waist gate to every authored body.
- Retain shared cache, clone and teardown. Any future per-instance material/morph preview must not mutate cached shared resources; baked character identity keeps this simple.
- Retain registry/resolver/`createThreeVisualMarkerGroup`, shared gameplay and both adapters. No runtime generation or engine rewrite.
- Keep `App.tsx`'s draft/compile/history transaction together and `HumanoidPreview.tsx`'s scene/RAF/cleanup together, as Phase 4 established. Geometry work does not justify unrelated UI decomposition.

## 16. What We Should Stop Investing In

Stop these as the route to the new visual target:

- Standalone procedural nose/mouth/eyelid/ear primitives intended to grow into believable face customization.
- Ever more loft stations, union resolution and smoothing exceptions as a substitute for authored deformation structure.
- New mass/muscle/face sliders on the legacy body before proving the new foundation.
- Analytic weight exceptions intended to eliminate authored shoulder/hip/hand skinning work.
- A general wardrobe fitted against changing voxel topology, or bounds/projection as its only fit representation.
- More mannequin-specific hairline/collar special cases intended to support arbitrary future heads.
- High-resolution skin textures before usable UVs and convincing anatomy.
- Treating successful export, closed topology, preserved bone lengths or a 3× edge-stretch bound as an artistic pass.

Continue legacy bug fixes, saved-recipe/GLB preservation, provenance, material correctness, exported validation and clone isolation. Do not delete the generator or overwrite old assets to introduce the new path. Some geometry code will not carry forward; preserving every line is not the objective.

## 17. Staged Migration Plan

These are future stages, not work started by this report. Use focused contract/helper checks first, then selected real export/visual checks for changed acceptance. Follow R2's listing/selectors; do not launch historical full matrices automatically.

| Stage | Purpose | Deliverable | Acceptance criterion | Dependencies | Principal risk |
| --- | --- | --- | --- | --- | --- |
| 0 — Preserve and define | Protect the creator; define “better” | Legacy recipe/artifact identities, documented actual rig, fixed gameplay/conversation review shots and target device | Existing recipes/no-hair/GLBs reopen; new work cannot overwrite legacy IDs; appearance criteria separated from numerical validity | Repository/artifact inventory | Assuming repeatability without historical inputs; generic/actual rig confusion |
| 1 — Qualify source | Obtain credible editable human | Legally usable mesh/UVs/weights with morph potential and provenance, separate experimental family | Neutral face/body/hands meet camera goal; rights and topology support editing/fitting/distribution | Stage 0; source acquisition/authoring | Attractive render hides poor topology, rig or licensing |
| 2 — Prove architecture | Resolve rig, fit and export uncertainties | Section 18 experiment | Round trips, determinism, independent clones, visible anatomy/deformation, one hair and garment fit pass | Qualified source | Rest looks good but animation/fitting fails |
| 3 — Durable recipes and bounded bodies | Productize the core without broad UI expansion | Canonical contract/dispatch, base/preset revisions, modest archetype range, save/load | Reopening preserves resolved values/artifact identity; legacy unchanged; bodies animate within budgets | Stage 2 and migration rules | Reinterpreting old controls; overpromising limb range |
| 4 — Face and hair coverage | Credible identities; preserve styles | Face presets/controls and canonical style fit profiles | Conversation/rest/head-turn/idle/walk review; eye/lip relationships intact; advertised hair passes or remains explicitly legacy-only | Stable base/body family | Combined head edits cause clipping; rigid long hair |
| 5 — First wardrobe | Repeatable garment authorship | Shirt/trousers/boots, fit bindings/corrections, masks and materials | Approved body/outfit pairs pass rest/stress poses, clearance and budgets; exported round trips pass | Body envelope and Stage 2 fit proof | Projection replaces garment design; mask holes; unsupported combinations |
| 6 — Library and game use | Durable reuse and assignment | Local recipe revisions paired with finalised artifacts; explicit promotion/import and player/NPC selection | Edits create new artifact revisions; old games retain references; resources package correctly; independent instances work in editor/Play | Stable IDs, packaging and provenance decisions | Session URLs treated as storage; referenced assets deleted; distribution rights |
| 7 — Measured expansion | Add only needed capabilities | Selected proportion profiles, run/attack/crouch, outerwear or LODs in separate tasks | Each meets its own motion/export/appearance/performance gate; no silent rig replacement | Earlier stages and demonstrated need | Hybrid becomes a general DCC/fitting/retarget engine |

Library design can accompany Stage 3, but assignment must not precede durable artifact identity. The workflow result's recommendation for named reusable recipes remains useful; it does not require more procedural anatomy first.

### Animation acceptance before migration

Gate skeleton binding/orientation first, then actual surface behaviour. Current R6 samples five points in idle/walk and allows maximum edge stretch <=3. Stored default diagnostics report approximately 1.87× idle and 2.41× walk stretch. These are existing recorded metrics, not artistic acceptance for every region. Preserve gross-corruption checks, then add focused deformation/clearance criteria from a reviewed baseline rather than inventing one universal stricter number.

Review raised/reaching arms, elbow bend/forearm twist, deep hip/knee flexion, stride, head turns and actual required run/attack clips. Static diagnostic poses can expose defects before clips exist; they do not certify absent animations. Check grounding, held contacts, volume loss, inversions, self-intersection, garment penetration and rest restoration. Compatible attacks/run on the new base are unproven today.

## 18. Proof-of-Architecture Prototype

**Build next in a subsequent task:** one authored full human on the unchanged Golden rig, minimal source manifest and separate experimental recipe path. Reuse existing compilation/preview tools; no new creator UI or migration.

Include three body targets (mass, muscle, bounded shoulder breadth), three face targets (head width, jaw/chin, nose shape), uniform height, one existing short hairstyle, one untextured sleeveless garment fit sample and current idle/walk. The garment is an internal fitting coupon, not a clothing feature/library: omitting it leaves the main reason to choose C untested. Nothing is authored or acquired in this investigation.

Use a small output set: neutral, fuller body, athletic/broad and one combined body/face case. Check intermediate values as well as endpoints without a large matrix. Apply hair/garment to neutral and the hardest combined case; check uniform height separately. Exclude independent limb-length changes from this first proof.

| Question | Required evidence | Failure/stop condition |
| --- | --- | --- |
| Is it visually human enough? | Neutral-material and PBR views at fixed gameplay/conversation framing; front/side/three-quarter; explicit face/hand/shoulder/hip review | More detail but same mannequin impression, or poor anatomy forced by rig placement |
| Do morphs preserve source identity? | Stable vertex/index domain and usable UVs; finite targets; approved combinations; repeatable reopening | Changing source topology or uncontrolled intersections |
| Can current rig/clips carry it? | Unchanged rest signature, resolved targets, correct facing/grounding, idle/walk round trips and independent clones | Numerical binding passes while visible articulation is wrong |
| Can it bend beyond walking? | A few exported diagnostic poses: raised/reaching arm, bent/twisted forearm, deep hip/knee bend, head turn | Collapse, tearing/inversions or reliance on Blender-only corrections |
| Is fitting worthwhile? | Stored binding follows neutral/combined morphs with bounded corrections, preserved garment ease and clearance | Every body needs a new custom algorithm or fit destroys style |
| Is it reproducible? | Preview one-pass round trip, full two-pass semantic/binary comparison with pinned inputs and complete manifests | Semantic changes across identical builds; unexplained binary differences or dishonest assurance labels |
| Does runtime remain ordinary? | Baked-identity GLB, normalized <=4 weights, supported materials/resources, existing loader and matching external clips | New runtime geometry/animation engine or excessive resource cost required |

Use existing Studio preview and one targeted editor/runtime integration path. Extend relevant acceptance only; no broad new browser suite. Record compile latency, primitives, texture-memory estimates and frame cost without assuming an authored mesh is faster beforehand.

A pass supports planning subsequent product stages; it does not automatically migrate characters. Distinguish poor source art/weights from architectural failure. If fit transfer fails but base/morphs/rig pass, use explicit garment morphs (B's simpler implementation) on the same foundation. If exact Golden rest placement fails, evaluate a tightly scoped rest-profile revision while retaining hierarchy. Neither outcome justifies unlimited voxel refinement.

## 19. Risks / Unknowns

| Risk | Still needs proving |
| --- | --- |
| Art source/effort | No candidate selected. Believable anatomy, UVs, morphs and weights require character-art expertise and review; agents/tests cannot supply artistic acceptance by themselves. |
| Rig placement | The hierarchy is a reasonable starting point; exact joint locations have not been proved on a grounded authored human. |
| Morph combinations | Endpoints do not prove combinations/intermediates, compression or garment clearance. Define reviewed envelopes. |
| Face quality | Architecture enables, but does not supply, good identities/lids/eyes/material art. |
| Long hair/loose clothes | Head-bound caps and short-style fitting do not establish coats, robes or moving locks. |
| Exported corrections | Blender drivers/modifiers are not automatic runtime behaviour. Static identity is baked; pose correctives/expressions need explicit export/playback validation. |
| Reproducibility | Pin asset/morph/fit/rig/toolchain identities. Installed validation is not current-source cache freshness; no new cache is required now. |
| Licensing | No source is approved; verify creator/source/GLB/game redistribution independently for mesh, textures, morphs and clips. |
| Library/packaging | Session outputs/fixtures are not durable user storage or packaged-game asset management. |
| Hardware | No new multi-character GPU benchmark; budgets remain proposed constraints. |
| Legacy compatibility | Keep family/version meanings, explicit absence, installed artifacts and historical toolchain identities distinguishable. |

### Validation performed

- Read-only code/report investigation and binary inspection of both checked-in fixtures and two existing local variants; inspected index, weight and UV data plus actual rig/clip targets.
- Viewed three identified existing workflow screenshots. No fresh Blender build, screenshot gallery, garment prototype or new appearance acceptance.
- Consulted the primary Khronos, Blender, MakeHuman and Adobe sources linked with relevant claims. No downloads/installations or third-party asset commitment.
- Ran `npm.cmd run ci` once: **passed** — 76 Vitest files / 623 tests, root/Studio builds, all three package checks/builds and 50 Node compiler/asset tests. Existing bundle-size advisories remain. Log: `test-results/character-architecture-ci.log` (ignored local evidence).
- `git diff --check` passed. The new report was separately checked for trailing whitespace, all 20 required sections and valid local reference links. Git status showed only this report as a new tracked-scope artifact; no production sources/assets changed. CI verifies the unchanged implementation/installed artifacts; it does not validate a proposed mesh or prove the future architecture.

## 20. Final Recommendation

**For a Sims-like creator producing believable action/adventure humans, build the authored-base proof next, using the bounded hybrid architecture.** Put authored, UV-mapped, properly weighted human geometry and stable morph topology at the centre. Retain the existing rig, recipe/compiler workflow and shared runtime path. Use small deterministic fitting operations to adapt approved hair/clothing rather than generate the anatomy itself.

Invest next in a qualified base and a small exported, animated, fitted experiment. Keep the working creator operational until that experiment proves visible human quality, useful deformation, stable editing and reproducible GLB output. Additional legacy sliders, a procedural face system, a new skeleton and a creator-wide rewrite are not prerequisites.

This report ends the investigation. Do not begin the prototype or migration automatically.
