# The Bell Court — combat engine evaluation

25 November 2026 · The Hollow Kingdom

Import [the Bell Court project](../../hollow-kingdom-combat-arena.project.json), click **Play**, select an encounter and click **Begin bout**. Reset restores that encounter's spawn, combatants, health and starting weapon. **I** changes equipment. **F** swings a blade or draws and releases the bow. **Q** guards while facing an incoming blow. Raising it just before melee contact parries. A tail sweep goes through a raised guard.

## What the engine bought us

The engine substantially accelerated this build. Before the change a hostile NPC could close on the player, a projectile could sweep against terrain and transformed cover, and a wyrm could lock its heading, telegraph a bite and miss a sidestep. The same rig loaders, hand sockets, mixers, health transactions, defeat flags, inventory and save format run the court. Those were major pieces of the playable result.

Three gaps prevented a duel. Player damage landed on input even while the sword was still loading at the shoulder. A successful enemy hit had no opposing defensive action. The existing bow accepted a player as its only shooter. Adjusting old NPC damage and detection radii could not resolve these.

## Capability ledger

A means existing engine or authored schema. B means a compatible contract extension. C means new reusable runtime, editor or presentation code. D means an implementation specific to this arena or one opponent. Authored settings and placements using existing fields count as A. Rows list separate contributions when a feature crosses those boundaries.

| Feature | Class | What shipped and where |
| --- | --- | --- |
| Court and encounter composition | A | Each trial is an ordinary 23 × 24 area with 41 placed props and one hostile NPC. Chapel arches, lancet walls, a vigil altar, fieldstone paving, trees, lanterns and blue-hour lighting use existing assets and transforms. The layout, names and briefings are bespoke authored content in [the fixture builder](../../tools/hollow-kingdom/combat-arena/build.mjs). |
| Trial selection and reset | B, C | Optional `GameArea.encounter` supplies a briefing and starting item ID. The first spawn block supplies position. Selection creates a fresh isolated session through the existing save restoration path. The original project stays available to the editor. [Schema](../../src/types/game.ts) · [Play entry](../../src/runtime/RuntimePanel.tsx) |
| Enemy patterns and AI | A, B, C | `EnemyAttack` already described reach, arc, locked heading, windup, strike and recovery. Optional arrow speed, guard bypass, preferred spacing, guard-on-windup, stagger, weapon and body dimensions extend the definition/instance resolver. Retreat selects an available step farther from the player. The authored order selects the next attack. [Enemy attacks](../../src/runtime/enemyAttack.ts) · [movement](../../src/runtime/npcMovement.ts) · [NPC ticks](../../src/runtime/runtimeNpcTick.ts) |
| Player sword and defence | B, C | An optional `ItemDefinition.melee` describes damage, reach, contact delay, cooldown and parry window. A pending swing locks its heading and checks the live target at contact. Incoming damage can interrupt it. A held frontal guard blocks. A fresh guard can cancel the enemy's melee recovery into a stagger. A raised enemy guard can stop a frontal cut. [Weapon resolution](../../src/runtime/weaponRuntime.ts) · [melee](../../src/runtime/runtimeCombat.ts) · [incoming damage](../../src/runtime/enemyDamage.ts) |
| Ranged trial | A, B, C | Player draw/release, gravity, range, swept intersections and arrow presentation already existed. NPC shots enter that same simulation with shooter identity, saved aim and a player hit volume. World contact consumes the arrow. The warden can yield ground to an approaching player. [Projectile simulation](../../src/runtime/projectileRuntime.ts) |
| Quadruped | A, B, C, D | The horse provides the existing mesh, twenty-bone skin and walk loop. The courser adds two original forehoof actions on six of those joints. A registry clip-source map shares the horse model and resolves the small action library. Body radius and height configure creature contact and projectile targeting. [Clip authoring and loader round trip](../../tools/hollow-kingdom/combat-arena/courser.mjs) · [asset registration](../../src/runtime/three/threeVisualAssetRegistry.ts) · [traversal](../../src/runtime/traversal.ts) |
| Wyrm | A, B | The original drake skin, Bite, Sweep, two windups, hit and death clips already existed. The Bell Wyrm's two-attack sequence, heavier sweep, guard bypass and longer punish window are data. Its decisions run through the same enemy tick as the duellist. |
| Animation and feedback | A, C | Socket-attached sword and bow, clip caching, independent mixers, hit reactions and death playback were reused. Humanoids can hold a sampled sword load or drawn bow. Sword delivery speed follows the authored impact delay. Enemies release the held pose into the strike. The trial HUD shows both health meters, equipment, controls, telegraphs and result. [Animation controller](../../src/runtime/three/threeCharacterAnimation.ts) · [Three adapter](../../src/runtime/three/ThreeRuntimePanel.tsx) · [HUD](../../src/runtime/EncounterHud.tsx) |
| Authoring | B, C | Import validates the optional fields. Migration bounds them and preserves missing fields in old projects. The NPC inspector edits patterned attacks, clips and defensive decisions. The item inspector edits timed blade profiles. [Import](../../src/data/projectImport.ts) · [migration](../../src/data/migrateProject.ts) · [inspector fields](../../src/editor/CombatDefinitionFields.tsx) |
| Save and compatibility | A, C | Health, inventory, weapon, selected area and defeat use the existing save format. Windups, arrows, held guard and pending melee are transient. Restoring starts a fresh tell. Saves still use authored project identity and existing replacement protection. [Save format](../../src/runtime/gameSave.ts) · [runtime session](../../src/runtime/runtimeSession.ts) |

The custom forehoof clip generator is D. The fixture builder also constructs this particular yard and its cast. Those scripts run offline. Scenery placement, trial composition and attack choices are project data at runtime. Combat resolution has no NPC-name, quest-ID or Bell Court location check. The Phaser adapter translates Q, attack timing and incoming projectiles through the same helpers. Browser play evidence below is for Three.

## Authoring challenge

The baseline builder emits four trials. A separate [variant data file](../../tools/hollow-kingdom/combat-arena/variants.json) supplies Edric and the falchion. The gatekeeper inherits the first duel's placement and equipment and overrides his actor, speed, health and attack profile. The falchion trial retains Rook and substitutes the starting item. Edric visibly carries a sword and guards with it.

| Authored variable | Rook | Edric |
| --- | ---: | ---: |
| Health / movement speed | 84 / 2.4 | 100 / 1.25 |
| Frontal guard during windup | Off | On |
| First windup / impact delay / recovery, ms | 700 / 175 / 650 | 1,100 / 210 / 1,200 |
| First cut damage | 14 | 19 |

| Authored variable | Quayside hanger | Bellman's falchion |
| --- | ---: | ---: |
| Damage / reach, tiles | 22 / 1.85 | 34 / 2.15 |
| Contact delay / cooldown, ms | 215 / 660 | 325 / 920 |
| Parry window, ms | 210 | 120 |

An AI author can produce another enemy, attack sequence or sword using project data and registered assets. The NPC and Items editors expose the common numeric parameters, attack addition/removal, guards and clip names. The Map editor places the NPC and scenery. **Add Sword** and **Add Bow** create stable canonical items. Creating another independently named blade currently starts in JSON, after which its profile is editable in Items. Encounter registration and loadout references, custom creature body dimensions and new rig/clip registration still require JSON or source changes as appropriate. The editor lacks a timed preview, clip picker and hit-volume overlay. Adding a genuinely new weapon family still requires runtime and presentation work. The parry window is configurable per sword. The 900 ms parry stagger, 280 ms player hit recovery and guard re-raise delay are shared constants. Telegraph and impact effects have no general per-attack VFX slot. A designer can tune existing moves more readily than invent a new class of response.

## Gameplay and performance evidence

All four original trials and both configuration variants reached victory in Chromium 158.0.8127.37. Reset restored both combatants and the starting loadout. The wyrm trial also reached player defeat, then restarted at full health. The four-trial fixture and the separately imported six-trial fixture used the same JavaScript bundle, SHA-256 `6ab766eaa9caeba84f07b7de6b68a280214e336767616569d4b4d1980d44ebc9`. [Raw measurements and event logs](combat-arena-measurements.json) · [Chromium harness](../../e2e/combat-arena.mjs)

| Trial | Observed play |
| --- | --- |
| [Sword duel](../assets/combat-arena/blade.jpg) | Rook closed to striking range. Holding guard blocked, and a later timed guard staggered him. The hanger left him at 84 HP on input, then at 62 HP after 234 ms. Save, exit and Continue restored 62 HP. |
| [Bow](../assets/combat-arena/bow.jpg) | The warden's arrow crossed the yard and damaged the player. Approaching made him give ground. Following a reset, the player used pointer-lock aim and draw/release to defeat him with arrows. |
| [Courser](../assets/combat-arena/courser.jpg) | The idle loop wrapped. HorseWalk transitioned into PawLift and PawStrike in the fight. The forehoof hit the player for 19. In a fresh bout a keyboard sidestep during the lift made the forehoof miss and preserved all 112 player HP. |
| [Wyrm](../assets/combat-arena/wyrm.jpg) | Both windups and both strike clips played. The sweep damaged a stationary player. The player defeated the wyrm with the blade. On a fresh bout a held guard stopped the bite at 112 HP, but the following sweep took health to 84. Player defeat and reset also succeeded. |
| [Gatekeeper](../assets/combat-arena/guard.jpg) | Edric blocked a frontal attack during his tell. Waiting through the descending cut opened a counter from 100 to 78 HP. Further block-and-counter exchanges won the fight. |
| [Falchion](../assets/combat-arena/falchion.jpg) | Against the original Rook, the new blade changed health from 84 to 50 after 378 ms. Input alone left his health intact. The heavier weapon won the same encounter. |

At 1120 × 760 and device pixel ratio 1, ANGLE used Intel Iris Xe through Direct3D 11. Two skinned actor roots were visible throughout all 1,955 sampled frame intervals and both mixers updated. The six samples returned 164 valid GPU timings. Missing or incompatible clip counts were zero. CPU, GPU and frame columns are milliseconds. CPU frame, render submission and mixer update figures are averages. GPU is the median of the available timer queries.

| Trial | Frames | p50 | p95 | p99 | CPU frame | CPU render | Mixer update | GPU | Skinned meshes | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sword duel | 317 | 16.5 | 20.9 | 37.4 | 3.2 | 2.5 | 0.2 | 14.2 | 23 | 119 |
| Bow | 338 | 12.8 | 20.7 | 25.3 | 3.1 | 2.4 | 0.3 | 14.06 | 22 | 113 |
| Courser | 330 | 12.8 | 20.9 | 25 | 3 | 2.5 | 0.2 | 13.3 | 22 | 117 |
| Wyrm | 320 | 16.4 | 20.9 | 29 | 2.8 | 2.3 | 0.2 | 13.87 | 21 | 116 |
| Gatekeeper | 314 | 16.6 | 20.9 | 24.9 | 3.3 | 2.6 | 0.2 | 14.7 | 22 | 118 |
| Falchion | 336 | 12.8 | 20.7 | 20.9 | 3.1 | 2.5 | 0.2 | 13.03 | 23 | 119 |

A second pair of five-second samples accompanied the courser sidestep and wyrm guard tests. The courser recorded 16.6 / 21.0 / 28.9 ms and the wyrm 20.7 / 29.6 / 54.3 ms at p50 / p95 / p99. The repeat wyrm GPU median rose to 17.86 ms and CPU render submission averaged 7.2 ms. The raw file includes both extra samples. The p95 in every run exceeds the 16.7 ms budget for 60 Hz. GPU draws occupy much more time than the CPU mixer update. The samples support two visible fighters in this particular yard. Frequent block opportunities and a predictable attack order leave fight quality and variety open for human playtesting.

### Regression and build checks

- The single repository CI run executed 1,122 Vitest cases. Two existing Three panel assertions caught the extra argument passed to legacy sword and bow animations. After restoring those calls, the affected panel, animation and combat suites passed all 112 cases. The rest of the CI Vitest run had passed.
- The expanded arena suite passed all 13 cases, including import and save restoration for Chapter One, Merewatch Field Study, Merewatch Frontier and Merewatch Vale. The suite also checks rear hits, interruption, one hit per swing, shot obstruction before and after release, creature flanking and collision after defeat. These are deterministic session tests. They do not constitute fresh playthroughs of the older games. [Combat tests](../../src/runtime/combatArena.test.ts)
- All remaining CI stages passed individually, including the root and Asset Studio type-checked production builds, three package builds and all 78 compiler/animation tests. The builds retain the existing large-chunk advisory. Biome reported zero errors and 22 warnings on the touched source and fixture set. The courser GLB round-tripped through Three's GLTFLoader with two valid six-track actions. [Asset generator](../../tools/hollow-kingdom/combat-arena/courser.mjs)

### Reproduce locally

From the repository root, build the diagnostic bundle once. The first fixture omits both configuration variants. The second uses the shipped import. The harness records the SHA-256 of the main JavaScript bundle in each result. It drives keyboard, pointer-lock mouse, inventory and Play controls. Its renderer and HUD probes only observe state.

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/combat-arena-build',copyPublicDir:false}})"
node tools/hollow-kingdom/combat-arena/build.mjs --base
node e2e/combat-arena.mjs --list
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:HOLLOW_ANGLE = 'd3d11'
$env:ARENA_PROJECT = 'test-results/combat-arena-base.project.json'
node e2e/combat-arena.mjs blade bow courser wyrm
$env:ARENA_PROJECT = 'hollow-kingdom-combat-arena.project.json'
node e2e/combat-arena.mjs guard falchion
```

Playwright serves local build and asset bytes at a loopback origin using route fulfilment. The measurements exclude network transfer. A five-second sample starts when the bout opens, with the enemies approaching, aiming or attacking and the camera in Follow. It excludes model loading, the ready screen, reset and evidence screenshots. Frame percentiles use RAF intervals. CPU figures measure the main-thread frame callback and render submission. GPU figures use non-disjoint WebGL timer queries. Visible actors are distinct skinned roots submitted by the renderer. Mesh count includes separately skinned clothing on the same skeleton.


## Limits and priorities for a longer game

1. **Fight feel needs a human decision.** The duellist has a legible counter and punish window. Indefinite blocking is inexpensive, and repeated attacks can interrupt the aggressive opponent. The gatekeeper rewards timing but always follows the same authored pattern. Playtest whether new players can identify the opening without reading the briefing. Record first attempts, successful parries and how often repeated F presses win.
2. **Close-range positioning is the next gameplay constraint.** Actors make discrete NPC steps, and melee samples a volume at a single instant. A moving model can visually lag its authoritative cell. The courser and wyrm have coarse bodies. The guard outcome tests facing and timing. Precise blade-to-blade contact, per-limb collision, coordinated enemies and navigation around long obstacles remain open. Better spacing and a debug view of the live hit volume would help more than another opponent archetype.
3. **Animation coverage limits visual variety.** Both blades share a mesh and a diagonal cut. The raised sword uses a held load pose. The warden holds a drawn pose while aiming. The creature has its own strike but shares the mounted horse's locomotion and lacks a dedicated death clip. The courser can still slide between short NPC steps, and the warden backpedals with a forward walk cycle. Dedicated guard, deflect, strafe, recoil and quadruped defeat clips would materially improve the seen result.
4. **Make encounter iteration cheaper.** Reset remounts the presentation, and each trial duplicates the court's area data. Relative clip contacts, a reusable placement template, a loadout selector in the editor and a selected-attack preview would reduce authoring errors. Save/Continue preserves health and defeat but the existing save format does not store transient NPC pursuit positions. A continued live opponent resumes from its authored placement. The encounter entry path is intended for standalone trials. It starts directly at a spawn with its supplied inventory and bypasses the narrative startup sequence.
5. **Measure groups before expanding the chapter.** These measurements concern two active actors in a small yard. A mixed three- or four-enemy encounter would expose crowd spacing, skinned draw cost and camera occlusion that this duel-sized sample cannot establish.
