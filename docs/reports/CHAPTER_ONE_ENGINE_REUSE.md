# Chapter One engine reuse experiment

## Baseline

Baseline `d1e9f157fe425659a022d7c7b0c883af6c632460` (`feat: shadcn UI`), recorded before engine edits. The chapter begins after Oswin reads Mara's dispatch in *The Last Watch*. It uses an independent project and save slot.

| Intended capability | Baseline interfaces and expected limit |
| --- | --- |
| Four connected locations with separate interior maps | `GameProject`, `GameArea`, `EventBlock`, `Interaction` and `GameAction` in `src/types/game.ts`. Area links, spawn points, map terrain, authored traversal collision, `runtimeProgression` and the Map Workspace already cover the route. Distinct interiors depend on asset dressing and shared terrain/lighting presets. |
| Choices, clues, puzzle, quest and endings | `DialogueDefinition`, `DialogueCondition`, `GameRule`, `StoryGraph`, `Quest` and `GameStateConfig`. Story can start quests and request cinematics. Existing actions can set flags/variables, change NPC alignment and teleport. Conditions and rule branches can express gates and ordered puzzle states. |
| Cinematics and persistence | `CinematicSequence` shots and actor/subtitle/audio cues, Story waits, `RuntimeSession` and `gameSave`. The editor has domain-specific controls. Save/Continue already includes authored flags, quests, defeats, Story cursors and player position. |
| Human encounters and equipment | `EnemyBehaviour` supplies detection, chase and contact damage. Existing shared weapon/projectile helpers and Golden humanoid actions cover melee, bows and reactions. The damage trigger does not provide an enemy windup, attack pattern or recovery. |
| Four-legged creature presentation | The existing horse demonstrates embedded, non-Golden Blender/glTF skeleton animation. The built-in registry, clone and animation mixer accept character assets with compatible track names and semantic idle/walk/attack/hit/death mappings. Baseline runtime has one semantic NPC attack, triggered on contact damage, and no way to name multiple telegraph and strike clips from gameplay. |

The chapter follows the warrant behind Mara's three horns from Merewatch through a trapped witness in Hollowwood, a ruined chapel that preserves the terms of the old compact, and a sluice cavern where the player can confront the wyrm or release it. The forest choice changes hostility and evidence. The cavern choice changes what survives and what Oswin learns. The critical path uses ordinary project records. Configurable enemy attack phases and multiple attack clips are the expected reusable additions.

## A. Executive findings

The engine supplied the chapter's map traversal, dialogue, quest state, branching, cinematic playback and saves. The authored chapter needs no location- or story-specific TypeScript gameplay. The biggest runtime gap was attack timing. Humanoids could chase and deal touch damage, but the baseline could express neither a displaced attack arc nor the delay between a creature's warning pose and the impact. Creature animation also needed a way to select a specific embedded clip per attack phase.

The same rig now supports a forest Ashling that closes quickly for a short snap and an adult wyrm that alternates between a narrow bite and a wide sweep. The two forms share animation assets, loading, targeting, damage, reactions and defeat. The change in behaviour is authored in each NPC's definition.

## B. Feature reuse matrix

| Feature | Class | Evidence and whether another project can repeat it |
| --- | --- | --- |
| Sequel start and separate saves | A | `build.mjs` derives a distinct project, uses `ProgressionStep` for the spawn and seeds the hanger and twelve pennies from the last quest's outcome. `projectGameSaveStorage` scopes play to the imported project. Another project can do the same through metadata, progression and initial inventory. |
| Four areas, enterable chapel, crypt and spillway | A | `locations.mjs` authors `GameArea`, terrain, events and object placements. `story.mjs` uses gated dialogue and `teleport`, alongside ordinary `area_link` returns. `runtimeProgression.transitionRuntimeArea` handles the destination and dismount. |
| Gothic prop kit, dressing and physical passages | A | `ruins.py` and `locations.mjs` reuse the Blender-to-GLB path, Merewatch masonry and the existing visual/traversal registries. Five new models and their collision box records are asset data. Another author can place the installed assets and re-use the traversable arches. New environment GLBs with custom collision still require built-in asset declarations. |
| Bracken and optional skiff detour | A | `build.mjs` preserves both original vehicle objects and their `ObjectBehaviour`. The satchel near the tower connects a boating detour to an alternate evidence clue. `vehicleRuntime` owns boarding, riding and movement. |
| Hanger and optional keeper's bow | A | Existing `ItemDefinition.weapon`, Equip, `weaponRuntime`, `attemptRuntimeCombatAttack` and shared projectile logic. The supply chest is a conditional dialogue interaction, authored with `has_item` and `give_item`. |
| Humanoid combat encounters | A | NPC definitions in `locations.mjs` retain chase/contact rules and Golden actions. `npcMovement.updateEnemyNPC` and legacy contact ticks supply behaviour. |
| Iven's bargain and aftermath | A | The authored `witness` variable, flags, inventory and `set_npc_alignment` yield different NPC hostility, evidence access and equipment. State-dependent options use `DialogueCondition`. |
| Chapel vigil and hidden name roll | A | Three `DialogueDefinition` switches use ordered `vigil` values, a reset branch, and a flagged result. A once-only `GameRule` activates the optional quest. The roll can be traced through Iven or Mara's rubbing. |
| Quest journal and divergent endings | A | The opening `StoryGraph` starts a 13-objective sequential `Quest`. Dialogue and defeat effects choose a verdict. `Quest` and `RuntimeSession` persist different rewards, continued NPC alignment and the slain NPC. |
| Three cinematics, actor cues and horn audio | A | Existing `CinematicSequence` shot presets and cues are authored in `story.mjs`. `horns.mjs` generates the original sound as PCM WAV for the existing audio player. Cutscenes enter through dialogue actions. |
| Mid-chapter checkpoint and continuation | A | Existing `createGameSave`/`restoreGameSave`, manual Save Game, authored return spawns and separate project identity. Health, quest facts, items, alignment and verdict are existing persisted fields. |
| Non-humanoid mesh, skin and ordinary animation states | A | `drake.py` authors a new 23-bone skeleton and embeds eight clips in glTF. Idle, Walk, Hit and Death use the existing `createThreeVisualMarkerGroup`, skeleton clone and mixer on a registry character asset. The separate built-in mount rig already established non-Golden clip playback. |
| Attack pattern records | B | `EnemyBehaviour.attacks` and `EnemyAttack` in `src/types/game.ts`, with shape checking in `projectImport.ts` and normalization in `migrateProject.ts`. Authors can configure numbers and embedded clips in project records. |
| Windup, directional impact and recovery | C | `enemyAttack.tickEnemyAttack` holds existing NPC locomotion, cycles attacks, locks the heading and checks the live player position and occlusion at impact. `runtimeNpcTick` uses it for any configured hostile. |
| Named phase clips | C | `createThreeCharacterAnimationController` and `ThreeRuntimePanel` preload and play the existing asset's configured clips. The Phaser adapter receives shared damage and text feedback. It has no equivalent creature animation. |

| Measure | Result |
| --- | --- |
| Major components | 12 A, 1 B, 2 C, 0 D |
| Explicit scene model IDs | 16 reused, 6 newly generated. The 16 include fifteen Merewatch models and the existing World Kit chest. Existing weapon, projectile, sky and animation dependencies are additional indirect reuse. |
| New playable assets | Six GLBs and one WAV. `drake.metadata.json` is generated evidence, not a playable asset. |
| Rig families | Two reused, the Golden humanoid and Bracken's horse rig. One new drake rig shared by the adult and Ashling. The adult uses eight embedded clips. |
| Source files affecting engine | Ten gameplay, schema or adapter files and two asset registry files. Roughly 360 substantive added implementation lines plus 55 lines of asset declarations, excluding tests. |
| Authored content files | Six source generators, one generated project and one generated rig metadata record. Roughly 2,900 lines of authored source, with the 12,739-line serialized project counted separately. Test code and binaries are excluded. |
| Rebuild | Node rebuilds the project and horn WAV from checked-in sources. Blender 5.2 rebuilds the six GLBs from `drake.py`, `ruins.py` and existing textures. Commands are in `tools/hollow-kingdom/chapter-one/README.md`. |

## C. Schema gaps

| Contract | Baseline and extension | Compatibility and authoring implications |
| --- | --- | --- |
| Enemy behaviour | `EnemyBehaviour` had `enabled`, `detectionRadiusTiles`, `chaseRadiusTiles`, `returnToOrigin` and optional `contactDamage`. Optional `attacks` is now an ordered list of `EnemyAttack` records. Each has a label, damage, range, arc, windup, impact delay, recovery and optional embedded windup and strike clip names. | Missing and empty lists retain the old contact path. A nonempty list replaces contact damage. The strict importer checks types and label presence, and migration bounds numeric fields and trims names. Existing definition/instance resolution still applies. A partial instance override can replace only `attacks`. The NPC inspector has no timing or clip fields, so authors can use structured project files and the existing import. |
| Rigs and equipment | The horse and character registry already used glTF skinned data and semantic actions. The chapter adds a different skeleton with its own clip names and no humanoid equipment sockets. | The creature's appearance introduces no new schema. There is no general project-owned non-humanoid rig importer wired to traversal and attack authoring. Another built-in skin with embedded clips can use the same pattern records. |
| Quest, dialogue, map and interiors | Existing quest facts, flag/variable conditions, dialogue actions and links covered the chapter. The ash ritual relies on several dialogue records retaining a shared integer. | No schema change. Conditional links can be modelled through dialogue or rules, but the current workflow makes the gate condition, destination and nearby prompt separate records. The chapter keeps collision boxes in the world-asset registry and validates in Play. |
| Cinematics, variables and saves | Shots, subtitles, actor clips and audio cues already exist. Branch state is strings, flags, ordinary quest facts and NPC alignment. | No cinematic or save version change. In-flight attack phases are transient. Save/Continue restores actor, health and quest state and lets the next attack begin with a fresh warning. |

## D. Engine changes

`enemyAttack.ts` is shared gameplay code. It resolves planar range, locked heading, occlusion, timing and damage. The attack is optional at the NPC level and uses the existing player health and game-over event path. The Three adapter presents windup and strike events in the existing mixer and turns the rendered actor to the shared heading. Legacy enemies retain touch attacks and their original damage event order. The transition and defeat code clear transient attack state.

Adding the five prop collision records and six visual asset entries used existing interfaces. They are chapter asset data maintained in engine registry files. The chapter otherwise uses a generated project import and makes no changes to the editor workspaces or the original Merewatch project.

## E. Bespoke implementation

No runtime modules know the IDs of the chapter, its quest, the wyrm, Iven or the ritual. `build.mjs`, `locations.mjs`, `story.mjs` and the asset builders are chapter-specific authoring code. They emit data and assets that the normal pattern of editor import and runtime playback consumes. Registry declarations bind asset IDs to their installed paths and collision profiles. They carry no chapter-specific gameplay.

## F. Reproducibility test

The independently authored `ashling` placement reuses `chapter-mere-drake` at scale 0.56. It has one short 102° snap, a 420 ms windup and 6 damage. The adult cycles a 66° bite and a 325° sweep, with longer warning windows, different reach, 12 and 18 damage, and additional sweep clips. Changing/configuring the second NPC required no follow-up engine source change. The strict import and comparative runtime test in `src/runtime/runtimeNpcTick.test.ts` exercise the actual authored records. This validates a second behaviour, with a shared rig and mesh family.

## G. Cost of complexity

Choice and quest state were straightforward once the relevant record shape was identified. Building space was slower. Repeated placement, fog, local collision and interactions each have their own records, and editing a reusable layout requires inspecting metre coordinates, cell coordinates and GLB pivots together. Installing environmental assets required explicit visual registry and collision registry declarations. The Blender sources do automated geometry and skin round trips. Those checks leave lighting, silhouette and camera framing to browser review.

Authoring friction also came from testing. Strict import rejects unknown fields before migration and expects the older static fallback fields on cinematic records. Cinematic timing, movement and interaction reach can only be checked in the live scene. A restricted Windows browser environment rejected localhost sockets, so browser validation used a local development bundle and file-backed requests in real Chromium. Software rendering and test input timing make those routes a poor proxy for a new player's pace.

**Counterfactual.** Without the existing engine, an agent would first need project serialization and migration, scene and terrain rendering, a third-person camera and movement, collision, actor placement, GLB loading and skeleton cloning, animation state management, item and equipment state, melee and ranged damage, NPC ticks, quest/dialogue execution, transitions, cutscene controls, save/restore and UI. Those paths were already usable here. The only gameplay adaptation with a new contract was patterned NPC combat and its presentation. The story, layout, prop meshes, creature and chapter-specific animations, camera staging, sound and playtest design would be necessary in either case.

## H. Recommendations

1. Give editor and structured-data authors the same typed import diagnostics, asset-reference checks and route previews. Surface broken or unreachable critical-path references from the story graph.
2. Add a project asset manifest for models, sockets, clips, bounds and simple collision volumes. Let a new creature or prop enter a project without two source registry edits.
3. Add a previewable NPC attack editor for timing, reach and arc. Show the impact cone against the selected animation and map collision. Add animation-aware reach for large creatures only when a second encounter needs it.
4. Add reusable area stamping and landmark tools. A motif such as a gate, its return spawn, framing and prompt should be movable and inspectable as a group.
5. Add optional authored checkpoint prompts and a lightweight reusable journey recorder. Record movement, time, quest changes and loaded-asset failures without full editor DOM traces.

## I. Overall verdict

The architecture now supports a substantial chapter primarily through content authoring. The chapter is reproducible from data and source assets, and the first meaningful engine gap yielded a general-purpose attack system tested against two distinct authored configurations. The built-in asset registrations and missing editor operations are still real dependencies on source editing. They limit how far a second team can operate from the editor alone.
