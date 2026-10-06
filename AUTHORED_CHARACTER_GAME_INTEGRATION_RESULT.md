# Authored Character → Player/NPC Game Integration

Validated 6 October 2026. This result covers the integration change on top of the existing first-outfit work; it does not claim new character art or broader runtime performance acceptance.

## 1. Executive Result

**PASS — a character created and fully finalised in Asset Creator can now become a real player visual and reusable NPC visual in the local Game Engine.** The actual browser workflow passed through preview, finalisation, Use in Game, player assignment, NPC placement, Play, save, reload and Play again. The exact finalised GLB and stable asset identity survived reload. Five simultaneous animated instances also loaded successfully.

The bridge uses the existing Three visual registry, shared GLTF cache, skeleton cloning and Golden animation controller. Gameplay remains in the shared runtime. Performance on the measured software renderer is poor and is reported below; this is a functional integration pass, not a crowd or hardware performance claim.

## 2. Asset Model

`GameProject.characterAssets` is an optional additive array in `src/types/game.ts`. Each record has a stable ID, display name, Character type, finalised state, geometry family, relative GLB URL, artifact and recipe hashes, manifest and editable-recipe URLs, Golden rig profile and idle/walk animation-set reference. It contains no live renderer objects or browser-session URLs. Old projects keep the field absent; an explicitly empty array remains empty.

The ID is `character-` plus SHA-256 of the finalised artifact hash and compiler recipe hash. Files live under `public/assets/project-characters/<id>/`: `character.glb`, `manifest.json`, `recipe.snapshot.json`, `character.recipe.json` and `asset.json`. The project owns its records and assignments; content-addressed files can be reused by projects in this workspace. They are separate from disposable compiler results.

The imported name comes from the existing recipe name (`New Character` in this test). The Character tab shows the name and `Character · Authored · Finalised`; hashes and rig identifiers are tucked into Technical details. No new naming system or thumbnail generator was added.

## 3. Asset Creator → Game Import

Open Asset Creator from an active local Game Engine project and leave the project tab open. **Use in Game** is offered for the current, successful full finalisation, never for Generate Preview or a changed recipe. The server verifies full deterministic validation, Golden compatibility, GLB format/hash, compiler recipe hash and the editable recipe's correspondence with that finalisation before promoting files atomically into permanent public assets.

The handoff is bound to the exact opener, origin, random launch token and project context. Switching projects while the Creator is open rejects the handoff. A standalone Creator explains that it needs a local project context; it does not guess a destination. On success, the Creator returns focus to the originating project, closes its popup and reveals the imported asset in Character.

Reimporting identical content reuses its ID. Changed artifact/recipe content creates a separate asset; old assignments do not change. The UI states this explicitly. Existing damaged asset folders are reported rather than overwritten.

## 4. Player Assignment

Choose **Set as Player Character** on the imported asset. This updates the existing player `threeVisual` assignment. Spawn position, facing, movement, collision, stats and other gameplay settings keep their existing ownership. Play 3D Experimental renders the finalised character through the normal player marker and animation path. Play sessions remain isolated from editor defaults.

## 5. NPC Placement

Choose **Add to NPC palette**, open Map and click tiles. The action creates/reuses an ordinary NPC definition with the imported visual and selects it in the existing palette. Each placement remains a standard NPC instance; stationary NPCs idle. No AI system was added.

The normal NPC inspector supports position and facing, plus shared Three visual scale, rotation and height overrides. An instance can reset to its definition's visual. Generic NPC duplication copies editable instance fields with a new instance ID and participates in map history; deletion remains the existing operation. The browser flow placed two NPCs, changed one to scale 1.1 and rotation 25°, duplicated/moved/deleted an extra instance, and verified the saved transforms.

## 6. Runtime Loading

Project records resolve explicitly into ordinary Three visual definitions; they do not mutate the built-in global registry. The existing shared GLTF loader caches the source scene, and the existing SkeletonUtils clone path creates instances. The usual marker builder owns positioning, selection metadata, normalization, material presentation and shadows.

Screenshots were inspected for scale, orientation, grounding, hair, navy top, trousers, boots and shadows. Runtime lighting is darker than Creator studio lighting, as expected. The purple tile at the player spawn is the existing map event marker. No runtime Blender, mesh generation or authored-character renderer was introduced.

Vite serves newly imported files immediately without a page reload during handoff. Normal builds copy the public asset folder alongside other visual assets. The built `dist/assets/project-characters/<id>/character.glb` was verified byte-identical by SHA-256 to the imported source (`a801c1d810412c9d0cea7ac71bef370da02cc40514befe4a4c54778ed1c69237`). An exported project JSON contains references, not embedded GLB bytes: retain the corresponding asset folders with it. General standalone game packaging remains outside this change.

## 7. Animation

The imported visual uses `golden-humanoid-v0` and the existing Golden baked Idle/Walk sources through the current controller. Player movement switches to Walk and returns to Idle when stationary. NPCs idle unless existing movement behavior drives them. Browser diagnostics observed both player states and the expected active mixers; runtime observations reported zero missing or incompatible clips. No run, attack, crouch or facial animation was added.

## 8. Multiple Instances

A focused clone test loads one GLB and the two existing animation sources, then proves distinct cloned skeletons and bones, separate animation mixers/states, independent transforms, and an unchanged cached source scene. Geometry and material sharing remains within the existing safe shared-loader behavior.

The real browser ran a player plus one NPC, a player plus two NPCs, and a player plus four NPCs. Diagnostics reported 2/3/5 active skeleton clones and mixers. **Only one character GLB GET occurred across all three runtime mounts in the observation page.** No duplicate per-instance parsing/fetch path was introduced.

## 9. Project Persistence

The primary browser test saved a project containing the authored player and two NPC instances referencing one asset. It checked the full finalised artifact hash, IDs and transformed NPC fields, reloaded the page, selected the existing saved-project recovery option when offered, and entered Play again. All three animated characters loaded with the same references and appearance. Export JSON was also exercised.

Serialization/migration and mounted editor tests cover assignment, two-instance persistence, overrides, empty/legacy asset arrays and independent RuntimeSession state. Import tests confirm that permanent files remain after the temporary compiler source is removed. The browser test exercised page reload, not an OS restart.

## 10. Missing Asset Behaviour

Import rejects preview-only output, missing/corrupt manifests or GLBs, unsupported rigs, hash mismatches and stale recipes. Character cards check the GLB endpoint and full manifest, show an actionable restore/reimport message and preserve saved assignments. Invalid project records remain addressable for diagnosis.

When a requested visual is absent or fails to load, editor/runtime show an unavailable-assets warning and a magenta selectable error marker, retaining the requested ID. They do not silently render the legacy mannequin as the missing character. The browser deliberately intercepted the saved character GLB with a 404 after reload: an explicit error appeared, references survived and no page exception occurred. Separate tests cover missing manifests, damaged imports and deleted/unsupported asset references. Missing recipe source does not force Play to compile or change a still-valid GLB.

## 11. Recipe vs Runtime Artifact

`character.recipe.json` is the editable Creator source; `recipe.snapshot.json` records the compiler input. The Character card's **Save editable character** downloads the source for the existing Creator recipe-load flow. This task does not add an in-app saved-character library or direct re-edit manager.

The immutable `character.glb` is the runtime visual. Play does not consult Blender or regenerate from the recipe. Editing/finalising a recipe later cannot silently alter a saved game's existing revision.

## 12. Browser Workflow

The passing `@game-character` case used the actual local Game Engine and Asset Studio servers, real compiler and real output. Starting with Blank Project, it launched Creator, selected Broad body and Navy top, generated a preview, fully finalised, used Use in Game, assigned the player, placed NPCs and entered Play. It observed player Walk/Idle, edited/duplicated/deleted NPCs, saved, reloaded, played again, exported JSON, loaded five characters, then checked missing-file behavior. The successful run took approximately 3.3 minutes; its preview and full requests use three Blender passes in total. No historical character matrix was run.

The separate `@character-runtime-observation` case reused that permanent GLB without compiling. It measured 2/3/5 instances, verified movement from spawn (10,7) to (11,7), confirmed an NPC blocked the next step, and exercised Inspect and Follow Player camera modes. It passed in approximately 1.2 minutes.

Evidence: [finalised Creator](docs/assets/game-character-integration/finalised-creator.png), [three runtime instances](docs/assets/game-character-integration/three-characters-runtime.png), [after save/reload](docs/assets/game-character-integration/reloaded-runtime.png), [five runtime instances](docs/assets/game-character-integration/five-characters-runtime.png).

## 13. Runtime / Performance Observation

The actual imported Broad/Navy character has **53,796 triangles, 10 skinned meshes/materials, 65 bones and 15,530,852 GLB bytes**. Measurements used headless Chromium at 1440×1000 on ANGLE/Vulkan **SwiftShader software rendering** in the blank runtime scene. Each sample waited for all mixers and more than 35 frames. Load time here includes clicking Play, scene setup, cloning and animation readiness, not just network transfer.

| Total characters | Time to active mixers | Average frame interval | Last-frame FPS reading | Scene draw calls | Scene triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Player + 1 NPC | 4,720 ms | 178.7 ms | 3.4 | 23 | 108,428 |
| Player + 2 NPCs | 4,486 ms | 334.4 ms | 3.2 | 33 | 162,224 |
| Player + 4 NPCs | 5,445 ms | 428.9 ms | 2.4 | 53 | 269,816 |

The FPS diagnostic is based on the latest frame interval, so it is not the reciprocal of the averaged interval. Frame times include startup and headless/software-rendering effects; this is a practical observation, not a controlled benchmark. **This environment is visibly too slow for smooth play, and instance count worsens the cost.** A hardware-GPU performance pass is still needed before claiming comfortable multi-character performance. No LOD, crowd or speculative optimization was added.

The one GLB GET, stable 13 geometry count and 2/3/5 clones confirm reuse; draw calls grow by ten per additional character. Raw bounded-run diagnostics, exact identity/hashes and renderer string are retained in [runtime observations](docs/assets/game-character-integration/runtime-observations.json).

## 14. Validation

- Import/HTTP checks: 8 focused Node tests passed, including immutable promotion, revision isolation, missing/damaged output, recipe matching, rig validation and serving new files.
- Focused Vitest checks passed for project serialization/migration, player/NPC assignment, editor duplication/deletion, save/load, opener/project-context protection, missing assets, animation resolution and independent clones. Studio checks also verify that standalone finalisation cannot guess a game project.
- Primary real browser integration: **PASS** (`@game-character`).
- Runtime reuse/collision/camera observation: **PASS** (`@character-runtime-observation`).
- Required `npm.cmd run ci` ran **once**: 82 Vitest files / 653 tests passed, root typecheck/build passed, and all three package builds passed. It then caught an invalid Testing Library `exact` option in a new Studio test assertion. After removing that option, the affected Studio file passed all 18 tests, the Studio typecheck/build passed, and the remaining CI compiler stage passed all 63 Node tests. All constituent checks are green; the full gate was not redundantly rerun.
- The root and Studio builds emitted their existing large-bundle advisory; neither build failed on it. The root build included the permanent character GLB with its original hash.
- `git diff --check`: passed after final documentation.

Browser commands and cost boundaries are documented in `docs/PLAYWRIGHT_SMOKE.md`. Earlier browser checks exposed immediate public-file serving and first-use Vite reload issues; those were corrected before the successful complete flow. No art expansion, historical Blender matrix, new broad browser suite or coverage threshold was added.

## 15. Remaining Limitations

- Use in Game currently connects local apps in the same workspace; hosted deployments need their own persistence/import service. Standalone/remote Creator usage gives a clear context message.
- Project JSON is not a self-contained asset bundle. Keep the permanent asset folders; general packaged export is still deferred.
- Hardware-GPU performance is unverified; software-rendered multi-character play is slow. Existing body/face/art limitations remain.
- Three visuals do not change the 2D avatar. This task adds no thumbnail system, character library, rename/revision-management UI or new NPC behavior.
- Scene transitions were not separately browser-tested in this task; the shared transition code and RuntimeSession contract are unchanged and covered by the repository gate.

## 16. Recommended Next Feature

**Saved character library.** The game bridge now gives finalised characters durable identities and keeps their editable source. The most useful next product step is a small way to find, reopen and organize saved recipes and deliberately import their new revisions. This is more valuable now than adding more art variants. It is a recommendation only and was not implemented.
