# Character Animation Capability Audit

Audited 18 October 2026 against commit `5c4105b3cccac70f5dafedd71219a2b7ec573f68`, starting from a clean working tree. This is an audit and implementation recommendation only. No animation, Blender source, gameplay, runtime controller, schema or registry was changed.

## 1. Executive Assessment

**Yes. The existing architecture can support a small action set without replacing the controller, changing Golden, or regenerating every character GLB.** There is already a working external-clip registry/cache, independent skeletons and mixers, Idle/Walk switching, attack one-shots, and a clamped defeated state.

The canonical authored human currently has **two usable mapped motions: Idle and Walk**. The repository also contains real pirate Attack, Death, two Run variants and a Triple Combo, but these target a different 24-joint skeleton. They are not Golden-compatible clips waiting for a registry entry. No Golden Hit, Death, Attack, Jump, Land or interaction animation was found, including in local generated artifacts and saved Blender actions.

The shortest clean route is **Option D: reuse the accepted Golden Idle/Walk assets and author only the missing short combat actions directly on Golden**. Retain the existing offline retarget pipeline for future sources that warrant it. The first set should be Idle, Walk, one unarmed Attack, one Hit reaction and one Death. Run, Jump/Land and interactions are separate later decisions.

Three integration details matter as much as the art:

- Attack already plays on the shared cooldown-accepted `attackStarted` event, including a miss. Hit has shared damage events but no controller state or trigger.
- NPC defeat requests a death state and then immediately removes/disposes that actor in the same transaction. A new Death clip alone would remain invisible.
- Successful game completion currently also selects the player's `defeated` animation state. Actual death and successful completion must be distinguished before mapping a human Death clip.

**Evidence boundary.** This audit read the requested current reports, architecture/validation guides, Golden profile, authored source/compiler, both adapters, shared gameplay helpers and current mappings. It inspected file contents rather than inferring contents from names. Fresh checks parsed real assets with the repository's inspectors/Three GLTFLoader, exercised the current controller, read Blender actions without saving, and ran CI. No fresh browser visual-quality or frame-pacing acceptance is claimed. Earlier browser and performance results are identified as historical evidence below.

## 2. Existing Animation Inventory

### Scope and notation

The scan included ignored local artifacts, excluding `.git`, dependencies and generated `dist` copies. It found **111 tracked `.glb`, 18 `.gltf`, 28 `.fbx` and six `.blend` files**. Of the 157 interchange files, 156 parsed and 144 had no clips. The remaining `.glb` is actually a PNG, described in section 10. There are **16 embedded clip entries, including two empty FBX takes**, plus **four serialized diagnostic clips**. The table below accounts for all 20 entries. These are asset representations, not 20 distinct useful human motions.

Local `test-results` adds 399 GLB/GLTF/FBX files: 135 hash duplicates and 264 additional unique files. All 264 additional files parsed with **zero embedded animations**. All six tracked Blender files and 22 local `.blend`/`.blend1` files contain **zero saved Actions**. No BVH file or external animation-pack archive was found; local ZIPs were browser traces.

Source prefixes used in the tables:

- **G** = `public/assets/derived/humanoid-animations/golden-reference-v0/`.
- **M** = `public/assets/source/humanoid-animations/retarget-spike/`.
- **P** = `public/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_`.
- **C** = `public/assets/pirate-demo/crate.glb`, whose actual nodes/meshes are `chest` and `lid`.

Channel sets are exact track targets, not a claim that every supplied channel changes on every frame:

- **G22:** rotation on `pelvis`, `spine_01`, `spine_02`, `spine_03`, `neck_01`, `Head`, and both sides of `clavicle`, `upperarm`, `lowerarm`, `hand`, `thigh`, `calf`, `foot`, `ball`; plus `pelvis` translation. **23 tracks / 22 bones**, no scale tracks or finger motion.
- **P24:** `Hips`; `Left/RightUpLeg`, `Left/RightLeg`, `Left/RightFoot`, `Left/RightToeBase`; `Spine02`, `Spine01`, `Spine`; `Left/RightShoulder`, `Left/RightArm`, `Left/RightForeArm`, `Left/RightHand`; `neck`, `Head`, `head_end`, `headfront`. Rotation, translation and scale on each: **72 tracks / 24 bones**. Many translations/scales are constant; the base clip is entirely a single static sample.
- **M52:** `mixamorigHips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`; both sides of `Shoulder`, `Arm`, `ForeArm`, `Hand`, `UpLeg`, `Leg`, `Foot`, `ToeBase`; and `Hand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}` on both sides. All names have the `mixamorig` prefix. **52 rotation tracks plus Hips translation**, on a 67-joint source skeleton.
- **F64:** quaternion tracks for all Golden joints except `root`, plus `pelvis.position`: **65 tracks / 64 bones**. This is the rejected V1 diagnostic, including finger/leaf targets; it is not an accepted finger animation set.

Durations below are parsed Three clip durations in seconds, rounded to six decimals. Some pirate keys start at 1/30 s; the reported duration is the actual clip end time, not a filename-derived estimate. glTF does not itself prescribe loop intent; the table separates controller policy from inferred source intent.

### Embedded clips

| Actual clip name | Source | Rig / channels | Duration | Intent | Current mapping, users and resolution |
| --- | --- | --- | ---: | --- | --- |
| `GoldenReference_Idle` | G `idle.glb` | Golden 65 / G22 | 8.333333 | Loop | `golden-reference-quaternius-idle-baked-v1`; semantic `idle`. Golden reference, both procedural mannequins and finalised Golden humans. Fresh real-asset resolution succeeds on all six installed character GLBs. |
| `GoldenReference_Walk_InPlace` | G `walk-in-place.glb` | Golden 65 / G22 | 1.033333 | Loop | `golden-reference-quaternius-walk-baked-v1`; semantic `walk`. Same users and successful resolution. |
| `mixamo.com` | M `idle/source.fbx` | Mixamo 67 / M52 | 8.333333 | Idle loop source | Offline Idle bake and retarget experiments. No game FBX mapping; cannot bind directly to Golden. |
| `Take 001` | M `idle/source.fbx` | Mixamo container / no channels | 0 | Empty take | Unused; not playable motion. |
| `mixamo.com` | M `walk/source.fbx` | Mixamo 67 / M52 | 1.033333 | Walk loop source, travelling | Offline Walk bake and retarget experiments. No direct runtime resolution; requires rest-frame retarget and in-place conversion. |
| `Take 001` | M `walk/source.fbx` | Mixamo container / no channels | 0 | Empty take | Unused; not playable motion. |
| `Armature\|clip0\|baselayer` | P `Character_output.glb` | Pirate 24 / P24 | 0.033333 | One static sample | Embedded in `pirate-character-base`, but no semantic mapping. This is **not an Idle animation**. Binds to Patchbeard if explicitly requested; incompatible with Golden. |
| `Armature\|walking_man\|baselayer` | P `Animation_Walking_withSkin.glb` | Pirate 24 / P24 | 1.066667 | Loop | `pirate-character-walk`; `walk` on both registered Patchbeard character definitions. Fresh controller resolution succeeds. |
| `Armature\|Attack\|baselayer` | P `Animation_Attack_withSkin.glb` | Pirate 24 / P24 | 2.833333 | One-shot | `pirate-character-attack`; `attack` on Patchbeard base/walk. Fresh current-controller Attack -> Walk succeeds. Golden preparation rejects it. |
| `Armature\|Dead\|baselayer` | P `Animation_Dead_withSkin.glb` | Pirate 24 / P24 | 3.000000 | One-shot, final pose held | `pirate-character-dead`; `defeated` on Patchbeard base/walk. Fresh controller holds final pose. NPC removal prevents visible completion in the game; player terminal state can retain it. Incompatible with Golden. |
| `Armature\|running\|baselayer` | P `Animation_Running_withSkin.glb` | Pirate 24 / P24 | 0.666667 | Loop candidate | No registry entry or semantic mapping. Fresh preparation succeeds on Patchbeard, rejects Golden. No runtime `run` state. |
| `Armature\|Run_03\|baselayer` | P `Animation_Run_03_withSkin.glb` | Pirate 24 / P24 | 0.833333 | Loop candidate | Unregistered and unused; same compatibility and missing Run-state limitation. This is a different actual clip from `running`. |
| `Armature\|Triple_Combo_Attack\|baselayer` | P `Animation_Triple_Combo_Attack_withSkin.glb` | Pirate 24 / P24 | 4.366667 | One-shot candidate | Unregistered and unused. Binds to Patchbeard; rejects Golden. Current combat has no three-strike timeline or combo semantics. |
| `open` | C | No skeleton; `lid.rotation` | 0.300000 | One-shot candidate | Embedded in registered `pirate-crate` source, but no object-action mapping/mixer. Fresh binding succeeds on that lid only. Not a character Interact clip. |
| `close` | C | No skeleton; `lid.rotation` | 1.000000 | One-shot candidate | Same unused prop path; not a character motion. |
| `open-close` | C | No skeleton; `lid.rotation` | 2.000000 | Combined open/close sequence | Same unused prop path. No automatic runtime loop or interaction mapping. |

All seven pirate GLBs have identical named joint hierarchies and local rest data. Their motions can bind to those pirate skeletons; only the base/walk character definitions and walk/attack/dead sources are registered. No cross-rig compatibility is implied.

### Serialized diagnostics and code-only fixtures

| Actual clip name | Source | Duration / channels | Current use and suitability |
| --- | --- | --- | --- |
| `GoldenReference_Idle` | G `idle.runtime-retarget.json` | 8.333333 / G22 | V2 rest-delta diagnostic/reference. Asset Studio can explicitly load it in diagnostic mode; normal game playback uses the baked GLB. Golden names bind; no normal-game JSON registry path. |
| `GoldenReference_Walk_InPlace` | G `walk-in-place.runtime-retarget.json` | 1.033333 / G22 | Same V2 diagnostic role, loop candidate; not an additional gait. |
| `FailedV1_Idle` | G `diagnostics/failed-v1-idle.json` | 8.333333 / F64 | Deliberately retained rejected baseline. Named targets can bind to Golden, but rest-frame errors deform shoulders/torso. Do not promote. |
| `FailedV1_Walk_InPlace` | G `diagnostics/failed-v1-walk.json` | 1.033333 / F64 | Same rejected diagnostic; not an unused production Walk/finger clip. |

Tests construct additional **synthetic fixtures in memory**, not art files: `Idle`, `Walk`, `Attack`, `Dead` and the two Golden clip names use a one-second `Hips.position` track in [threeCharacterAnimation.test.ts](src/runtime/three/threeCharacterAnimation.test.ts); `Broken` targets `MissingBone`. Loader/analysis tests use empty `Walk` clips of 1.25 s, and the shared preview test uses an empty `Idle` of 1 s. They have no complete human skeleton, licence-bearing source animation, or shipping mapping. They are not reusable action assets.

All four diagnostic JSON clips are inspected as loops by the explicit Studio comparison controls; none is a one-shot action mapping.

The requested categories therefore resolve as follows: **Idle/Walk available for Golden; Run/Attack/Death available only on another rig; Hit/Jump/Land/character Interact/Pickup/talk gestures absent.** Static raised-arm, elbow, hip, crouch, head and hand diagnostic poses are not authored time sequences.

Inventory implementation references: [source inspector](tools/animation-retargeting/animation-source-inspection.mjs), [shared definitions](packages/three-asset-preview/src/index.ts), [game registry](src/runtime/three/threeVisualAssetRegistry.ts), [Studio preview](apps/asset-studio/src/HumanoidPreview.tsx).

## 3. Golden Rig

The canonical contract is **`golden-humanoid-v0`**, derived from Quaternius `Superhero_Male_FullBody.gltf`. The actual authored source is [canonical-v1/candidate.blend](tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend), not the rejected V4/V5 candidates. Its `Armature` has **65 joints**, no saved Actions, and a symmetric T-pose foundation. Basis plus six identity keys are saved at neutral; identity is baked into output geometry.

The complete hierarchy is compactly specified below; `s` expands to `l` and `r`, and each finger expands to index/middle/pinky/ring/thumb:

```text
root
  pelvis
    spine_01 -> spine_02 -> spine_03
      neck_01 -> Head
      clavicle_s -> upperarm_s -> lowerarm_s -> hand_s
        finger_01_s -> finger_02_s -> finger_03_s -> finger_04_leaf_s
    thigh_s -> calf_s -> foot_s -> ball_s -> ball_leaf_s
```

There are seven central joints, 24 joints per arm/hand side, and five per leg side. Capitalization matters (`Head`, not `head`). There are no separate twist, IK-control or facial-expression bone chains in this contract. Finger bones and weights exist and can be animated; current accepted G22 clips leave them at rest.

The exported model is **Y-up, native forward +Z**; Blender uses Z-up with anatomical forward -Y. The engine applies its existing 180-degree Y facing correction. Authored height 1.50-2.10 m is a uniform `CanonicalHeight` scene-parent transform, rather than altered limb bones or inverse binds. Body/face morphs affect the surface, and the outfit/hair bind to the same rig. These choices permit external clip reuse across accepted identities, though they do not prove every extreme action pose fits every body/outfit.

Fresh raw-transform comparisons, excluding the name of the non-bone armature parent:

| Compared to the dressed canonical output | Joint names / bone parents | Maximum local rest-matrix element difference | Interpretation |
| --- | --- | ---: | --- |
| Both Golden baked clip GLBs | Same 65 / same hierarchy | 0 | Exact exported target rest representation. |
| Unclothed canonical and both permanent project characters | Same 65 / same hierarchy | 0 | Exact rest representation; no retarget required. |
| Both legacy procedural mannequins | Same 65 / same hierarchy | 3.58e-7 | Export precision difference; compatible Golden contract. |
| Original vendor male glTF | Same 65 / same hierarchy | 1.62e-6 | Small import/export representation differences, not a different rig. |
| Vendor female glTF | Same 65 names / hierarchy | 0.193912 | Different rest placement/orientations/proportions; names alone do not certify compatibility. Not currently promoted as a canonical playable character. |
| Standalone rigged hair sources | Same named hierarchy in several assets | Up to 0.209796 | Component rigs are rebound/fitted by the compiler; do not use them as replacement Golden animation targets. |

These are matrix-element comparisons, not angular error measurements. The compiler additionally pins Blender rest signature `38356ace6cdb45ddc8caa325c1989fd3dfe0779d10a03c4f4fd743acf58b22f9` and exported rest signature `24264599feb13a49857540c8efab3e46fcfb2a45cec1a03b8bf90bbd4f74b840`.

The Mixamo sources instead have 67 joints and `mixamorig...` names; none of their animated target names matches Golden directly. Their rest frames/local axes and scale also differ. Patchbeard has 24 joints, `Hips`, a different spine chain/order and no equivalent Golden finger structure. Fresh preparation rejects every pirate clip on Golden. Both families require actual rest-frame/proportion retargeting, not renaming.

Sources: [Golden documentation](docs/assets/golden-reference-humanoid-v0.md), [canonical integration](CANONICAL_AUTHORED_HUMAN_INTEGRATION_RESULT.md), [canonical source package](tools/blender-character/experimental/authored-human-canonical-v1/README.md), [compiler contract](tools/blender-character/procedural-mannequin-contract.mjs), [authored round trip](tools/blender-character/authored-human-roundtrip.mjs).

## 4. Runtime Animation Controller

[threeCharacterAnimation.ts](src/runtime/three/threeCharacterAnimation.ts) is a presentation controller over a per-instance `THREE.AnimationMixer`. There is no shared gameplay animation state machine. The shared animation type currently contains only `idle | walk | attack | defeated`.

| Capability | Current implementation |
| --- | --- |
| Idle selection | `moving: false`, unless attack/defeat takes priority. Golden has an explicit Idle mapping. Patchbeard has none and rests in bind pose. |
| Walk selection | `moving: true`; Three supplies this while an accepted visual movement interpolation is unfinished. Chase uses the same selection. |
| Priority | `defeated > requested attack > moving ? walk : idle`. No Hit, Run, Jump or Interact branch. |
| State changes | `sync(context)` updates locomotion/defeat; `triggerAttack()` starts/restarts a loaded attack. Unchanged state/action pairs do not restart. |
| Blending | Transitions between available different actions use `crossFadeFrom(..., 0.12, false)`. No time warping, phase matching, masking, additive layer or per-bone blend tree. |
| Playback speed | Effective time scale is always 1. Player/NPC movement speed changes do not adjust gait playback rate. |
| Loops | Idle/Walk use `LoopRepeat`; Attack/Defeated use `LoopOnce`. |
| Completion | Internal mixer `finished` listener handles the active Attack; clears its request and resolves the latest movement context. No public completion callback. |
| Return blend | On Attack completion, `activeAction` is cleared before locomotion starts. Therefore the ordinary 120 ms crossfade is **not applied to the completed Attack -> locomotion return**. Matching recovery poses or a small explicit return-blend adjustment needs visual review. |
| Defeat | Clamps the final pose and ignores attack requests while context is defeated. It stays selected while that context remains true; it is not an irreversible gameplay state stored by the controller. |
| Interruption | Defeat overrides Attack. Ordinary movement does not interrupt Attack, but gameplay/world movement can continue. Another accepted attack restarts the same one-shot. No queue, combo, animation-driven cooldown or stun. |
| Loading | `refresh()` requests all mapped states, makes actions once their source clips load, and resynchronizes. No deferred replay of an Attack requested before it loaded. |
| Missing clip | An absent mapping is optional. A mapped missing/error clip increments diagnostics once; missing bone targets count as incompatible. Missing/unloaded Attack safely leaves locomotion running. Missing Idle/Walk/Defeated fades the old action toward rest; there is no automatic Walk -> Idle clip substitution. |
| Compatibility check | Checks target object names, then clones/prepares the clip. It does not establish rest-pose, orientation or proportion correctness. Those are offline validation responsibilities. |
| Cleanup | Disposes mixer/actions for the instance, removes its listener and uncaches its root; shared clip/GLTF resources have separate ownership. |

Specific answers:

- **Attack -> return to locomotion: yes already**, when a compatible mapped clip is loaded. Fresh actual Patchbeard Attack returned to Walk; Golden safely ignored missing Attack.
- **Hit -> return to locomotion: not exposed today.** The same mixer/completion pattern can support it with a small additional semantic and trigger; there is no Hit clip or API now.
- **Death -> remain dead: yes at controller level**, via `defeated` + clamp. Fresh actual Patchbeard Death held its pose after additional updates. Golden lacks the clip, and NPC visual lifetime currently prevents the sequence from being seen.
- **Jump Start -> airborne -> Land: no current semantics or transition support.** Three can play clips, but neither shared movement nor this controller supplies these phases.

There are two other presentation paths to distinguish. Asset Studio's [HumanoidPreview.tsx](apps/asset-studio/src/HumanoidPreview.tsx) has its own Rest/Idle/Walk inspection controls, looping mixer, pause and seek; it is not a combat-controller UI. The map editor shares asset loading/marker construction but does not instantiate this character mixer/controller. Phaser renders character circles/initials inside containers and tweens positions; it has no skeletal or sprite-sheet character-animation playback in [AdventureScene.ts](src/runtime/AdventureScene.ts). Adding Three clips does not animate 2D avatars.

## 5. Combat Hooks

Combat decisions already belong to shared [runtimeCombat.ts](src/runtime/runtimeCombat.ts), [combat.ts](src/runtime/combat.ts) and [runtimeNpcTick.ts](src/runtime/runtimeNpcTick.ts). Defaults are 25 attack damage, one tile cardinal range, 500 ms attack cooldown and 100 player health. Player attacks select the first attackable hostile on that facing line; contact damage has a separate 1,200 ms per-enemy deadline.

| Semantic moment | Existing signal | Current animation use / safest future use |
| --- | --- | --- |
| Input requests attack | Space handler in each adapter, behind input/modal/movement gates | Adapter input only; no shared raw-request event. Do not animate every keypress, including blocked input. |
| Cooldown accepts attack | Shared `attackStarted { nextAttackAt }` before target resolution | Three already calls player `triggerAttack()`. Also emitted for an accepted swing that misses. |
| Cooldown refuses attack | `attackBlocked { reason: cooldown }` | No Attack trigger. Preserve this behavior. |
| Swing misses | `attackBlocked { reason: missed }` after `attackStarted` | The accepted swing can animate; boolean return `false` is not proof no swing was accepted. |
| Damage dealt to NPC | `npcDamaged { npcId, damage, health, maxHealth, name }` after mutation | HUD update only. Suitable for a nonlethal Hit trigger. Event `damage` is configured damage, so guard zero damage and prefer Death on lethal health. |
| NPC defeated | `npcDefeated`, `flagChanged`, then `npcRemoved` | Three synchronizes defeated, then immediately detaches/disposes. Gameplay NPC/collision/timers are already removed before these events. |
| Enemy contact accepted | `enemyTouchedPlayer { npcId }` after cooldown check | Shared contact signal, even when contact damage is zero. No hostile attack animation today. |
| Player takes damage | `playerDamaged { npcId, damage, health }` when contact damage is positive | Suitable player Hit and source-NPC cosmetic Attack trigger. Three currently has no animation handler for this event. |
| Player reaches zero health | Shared NPC-tick `gameOver` after health update | Three sets its terminal UI flag and synchronizes defeated. Renderer RAF continues to update animation. |
| Notifications | `status`, `combatChanged`, `stateChanged`; defeat quest updates may emit inventory/reward feedback | Feedback is already separate. Do not parse HUD text to determine animation or use animation completion to award rewards. |

Damage is committed synchronously when the accepted combat transaction runs, not at a clip impact marker. No animation hit-frame callbacks, attack wind-up, physical weapon contact or combo damage sequence exists. A bounded animation pass should preserve that timing and make the short strike's visual cue fit it. Changing damage to wait for animation would be a separate gameplay change.

The declared `triggerRequested/on_npc_defeated` union member is not emitted by the active defeat path. The older `applyEnemyContactDamage` helper is not the active runtime transaction. Neither should be mistaken for an already wired event bus.

**Terminal-state issue:** [ThreeRuntimePanel.tsx](src/runtime/three/ThreeRuntimePanel.tsx) selects `defeated` for progression `endGame` and rule `gameEnded`, as well as real damage `gameOver`. Its per-frame sync reads that same terminal flag. Simply adding a player Death mapping would make successful completion look like death. Gate death presentation from actual defeat/health independently of the UI's ended-session flag; preserve the existing success/game-over flow.

## 6. Movement Hooks

[attemptPlayerMove](src/runtime/playerMovementTransaction.ts) returns accepted/blocked movement, source/destination, facing, duration and movement mode. Shared traversal can sweep a continuous path and maintain rounded gameplay coordinates. Three interpolates that accepted path; Phaser uses its existing grid transaction/tween. Position is never advanced by a skeletal clip.

| Requested distinction | Exists today? |
| --- | --- |
| Idle / Walk | Yes in Three presentation, inferred from whether the accepted visual step has settled. |
| Run / sprint | **No.** Numeric player speed, terrain/vehicle multipliers and NPC movement speed exist; none is a Run gameplay state, sprint input or animation threshold. |
| Jump / airborne / land | **No.** No jump input, vertical velocity, gravity trajectory, airborne flag or landing event. Space is attack. |
| Turning | Facing vectors and NPC `npcFacingChanged` exist. There is no turn phase or turn clip request. |
| Other travel modes | The schema has `walk`, `swim`, `sail`, `ride`, `drive`; these are movement permissions/vehicle modes, not matching skeletal states. The current character controller still selects Idle/Walk. |
| Steps/slopes | Shared traversal samples floors/height with maximum step up/down 0.4 m. It is grounded traversal, not jumping or free falling. NPC movement remains grid-based. |

Player duration uses `max(50, (360 - clamp(speed,1,20)*24) / clamp(multiplier,0.1,4))` ms per tile-equivalent, scaled by distance for continuous traversal. NPC movement uses `max(80,360/speed)` ms plus a decision wait; chasing does not select a faster gait by semantic state. The animation stays at time scale 1, so speed changes can create foot sliding.

**Answers:** Run is not an existing gameplay state merely missing art. Jump is not represented as a movement mechanic. **Idle/Walk are the only current locomotion animation states**, although movement itself includes traversal, facing, speed modifiers and vehicle modes.

**Turn-in-place: defer.** Current `setObjectFacing` assigns yaw directly; position/camera smoothing must not be described as smooth yaw blending. There is no measured turn-specific defect or stationary-turn gameplay requirement here. A dedicated turn clip would add foot-placement/angle/timing work before the combat gaps are addressed. If later review finds abrupt facing objectionable, first assess a small presentation yaw interpolation separately; no change is made by this audit.

Sources: [movement transaction](src/runtime/playerMovementTransaction.ts), [movement](src/runtime/movement.ts), [traversal](src/runtime/traversal.ts), [NPC movement](src/runtime/npcMovement.ts), [visual smoothing](src/runtime/three/visualSmoothing.ts), [schema](src/types/game.ts).

## 7. Interaction Hooks

Interaction discovery, object transactions, conversation state and quest completion already exist. There is no generic shared `playAnimation` action or `interactionAnimationStarted` event. Opening a UI and accepting a world interaction should not be conflated.

| Interaction | Existing authoritative moment | Animation value and limitations |
| --- | --- | --- |
| Examine | Editor-facing Examine maps to `show_message`; `prepareInteractionMessage` validates lines/once state and creates inline dialogue | A small look/reach could be cosmetic. Examination does not inherently mean touching an object. No dedicated examine success event. |
| Container | `containerOpened { objectId }` only when opening succeeds; opened IDs/flags and rewards are shared | Meaningful visual confirmation. One reusable player reach could help later. Existing `lid` clips are prop-specific; current Three presentation shows opened feedback, not lid playback. |
| Placed Pickup / `collect_item` | `collectRuntimeObjectPickup` commits inventory, removes the session object and emits `objectCollected`; internally also emits the once-only `pickupCollected` | Meaningful pickup feedback, but avoid triggering twice from those two events. Item removal and rewards must not wait for a gesture. |
| Legacy pickup | `collectRuntimePickup` returns success; `pickupCollected` is emitted only for `once: true` | Repeatable pickups still update inventory/status but do not emit that identity event. A future general pickup-animation hook needs an accepted-pickup signal for both cases. |
| Door | Successful behavior records `door_used` and emits `teleportRequested`; invalid/locked results have other feedback | Current door is access/transition logic, not a hinged-door animation state. A reach is cosmetic and may be cut off by transition. Defer synchronized physical door opening. |
| NPC dialogue | `start_dialogue`, rule `dialogueRequested`, `session.dialogue` and pending interaction target context | Talk gesture is cosmetic; speaker strings are not a reliable animated actor ID. No speech timing/lip sync or speaker animation track. |
| Generic item collection/reward | Shared inventory changes, quest rewards and item feedback | Not every inventory increase is a physical pickup. Do not trigger a reach on generic `inventoryChanged`. |

`finishQuestConversation`/`finishQuestInteraction` record actual completion and run completion actions; these are gameplay/progression facts, not animation end events. No gameplay delay, new interaction mechanic or animation requirement should be added to these paths for a cosmetic clip.

Current pickup/object/area handlers can still structurally invalidate the scene. A future pickup gesture needs a deliberate lifetime decision because immediate `objectCollected`/`pickupCollected` rebuilds can recreate the player controller and interrupt it. That is a reason to keep interactions out of the initial combat-only pass, not a reason to refactor those paths in this audit.

Sources: [object transactions](src/runtime/runtimeObjectInteractions.ts), [object behavior](src/runtime/objectBehaviour.ts), [interaction messages](src/runtime/interactionMessages.ts), [discovery](src/runtime/interactionDiscovery.ts), [quest interaction completion](src/runtime/questInteractions.ts), [Three handlers](src/runtime/three/ThreeRuntimePanel.tsx).

## 8. NPC Animation

Stationary, wander and patrol are shared behavior modes. Hostility can enable detection, chase, adjacent contact and a return-toward-origin decision. The shared tick emits `npcMoved`, `npcFacingChanged`, detection/loss and contact/damage events.

Three creates a controller per loaded NPC character and calls `sync({ moving: !visualStep.done, defeated: defeatedIds.has(id) })`. Thus stationary/waiting NPCs use Idle, wander/patrol/chase steps all use Walk, and facing is applied to the wrapper. There is no separate chase animation, NPC combat stance, attack wind-up or hit reaction.

**Hostile contact currently has no visible attack animation path**, even for a Patchbeard NPC with an attack mapping. The player alone is triggered by `attackStarted`. Contact could present the source NPC's compatible Attack when actual `playerDamaged` arrives, without inventing a second damage transaction.

`npcDefeated` does request the existing defeated state, but `npcRemoved` immediately disposes that controller. Retaining only a short-lived dying visual would be presentation work: the NPC must remain removed from targeting, movement, collision, quest progress and saves immediately. It must never be put back into `area.npcs` just to play an animation.

Phaser still uses circle/initial containers and movement tweens, removing the NPC marker on defeat. Shared gameplay events remain usable by either adapter; Three art does not require a 2D animation system.

## 9. Asset / Compiler Pipeline

There are two separate current pipelines.

**Animation:** immutable Mixamo FBX + source/licence/hash records -> pair-specific rest-delta profile -> headless Blender sampling/bake -> Golden-target GLB + metadata/diagnostics -> Three round trip and deterministic comparison -> stable animation-source registry entry -> cached clip -> per-instance action/mixer.

**Character:** editable CharacterRecipe -> preview/full compiler -> canonical authored `.blend` + fitted clothing -> baked identity GLB **without animations or runtime morph targets** -> Golden rest/bind/Idle/Walk round trip -> full determinism validation -> immutable `public/assets/project-characters/<content-id>/` promotion -> project `characterAssets` reference -> ordinary visual resolver/loader/skeleton clone.

[generate_authored_human.py](tools/blender-character/generate_authored_human.py) explicitly sets `export_animations=False`. [authored-human-roundtrip.mjs](tools/blender-character/authored-human-roundtrip.mjs) asserts zero embedded clips, then loads external Golden Idle/Walk to validate actual deformation, clone independence and rest restoration. The source human and clothing meshes do not need to absorb every new animation.

The compiler's animation-set value is `golden-reference-v0`; imported `CharacterGameAsset.animationSet` is `golden-idle-walk-v1`, with `rigProfile: golden-humanoid-v0`. [characterAssets.ts](src/data/characterAssets.ts) currently accepts only that imported pair. Dynamic game definitions inherit Idle/Walk mappings from `PROCEDURAL_MANNEQUIN_V0_ASSET`; they do not select arbitrary clip libraries from a saved manifest.

**Can additional compatible clips be added without regenerating all character GLBs? Yes.** Export/version the new clip source, register it, and resolve its exact clip names in the compatible character definitions. Existing bytes, geometry, skinning, content IDs and saved assignments can stay intact. Preserve acceptance of existing `golden-idle-walk-v1` records as the compatible baseline if mappings gain optional actions. If a later product deliberately introduces a new selectable saved animation-set version, update the importer/validator/migration explicitly; changing only that string would currently make old/new records unavailable. No schema change is inherently needed for the small presentation expansion.

The shared loader caches by definition ID (URL fallback), retaining the parsed scene, analysis and clips. `requestThreeVisualAssetAnimationClip` retrieves a named clip without cloning the source character. Character instantiation uses `SkeletonUtils.clone`; geometry/materials are shared, while bones/skeletons are independent. The controller's prepared clip cache is keyed by source asset ID plus clip name; actions/mixers belong to each instance. Revisions therefore need immutable IDs, not different bytes silently substituted under the same cache key.

The existing `animationOnly: true` field is **registry presentation metadata**. The two Golden source GLBs physically contain full meshes/materials/textures. Neither a stripped skeleton-only library nor a new combined action library has been accepted merely by that flag. The loader can select multiple named clips from one asset; the exact exported action-library packaging still needs its own round trip.

Studio defaults to baked Rest/Idle/Walk preview and only loads retarget comparison JSON in explicit diagnostic mode. Finalisation and restoration remain in `App.tsx`; preview resource lifetime remains in `HumanoidPreview.tsx`. No runtime Blender, compilation or retarget work is needed.

Sources: [animation bake](tools/blender-character/golden-animation-bake.mjs), [Blender retarget](tools/blender-character/retarget_golden_reference.py), [character compiler](tools/blender-character/procedural-mannequin-compiler.mjs), [game import](tools/blender-character/game-character-import.mjs), [shared cache](packages/three-asset-preview/src/index.ts), [Studio source definitions](apps/asset-studio/src/previewSources.ts).

## 10. Existing Unused Assets

| Asset family | Finding | Recorded provenance / reuse boundary |
| --- | --- | --- |
| Pirate Running, Run_03, Triple Combo; base static clip | Actual extra motions/static sample, unregistered | Filenames identify Meshy AI Captain Patchbeard. The tracked directory contains seven GLBs and no licence/source sidecars. No sufficient acquisition/account/redistribution record was found elsewhere in the searched repository. Do not treat them as cleared new production inputs. |
| Pirate Attack and Dead | Already registered and structurally usable on Patchbeard | Existing use is not new proof of provenance or Golden compatibility. |
| `pirate-demo/crate.glb` | Actually a chest with a lid and three animations | [world-kit manifest](public/assets/world-kit/manifest.json) identifies this exact source/hash for `world-chest`; [provenance](public/assets/world-kit/PROVENANCE.md) records Kenney Pirate Kit / CC0. Current world-kit chest is static and has no clips. These are useful future prop motions, not human actions. |
| Golden V2 JSON | Same two motions as the accepted offline bakes, different representation | Derived from the recorded Mixamo sources. Diagnostic/reference only. |
| Golden failed V1 JSON | Two distorted baseline clips | Rejected quality; names and many tracks do not make them acceptable. |
| Quaternius male/female bodies and hair, FBX/glTF variants | No animation clips in the inspected sources | Bundled `License_Standard.txt` declares CC0 1.0. Female/component rest data differs from canonical male Golden despite matching names in some files. |
| Canonical, V2, V4/V5 and outfit `.blend` packages | Zero saved Actions | Canonical derives from recorded Quaternius sources. Outfit is project-authored with recorded body-derived fitting. Static diagnostic poses and six shape keys are not animation clips. |
| Generated character artifacts and permanent imported characters | No embedded clips | Expected compiler design. The 264 additional unique local artifacts contained none either. |
| `public/assets/pirate-demo/barrel.glb` | PNG signature, not a GLB | Inventory anomaly, not an uninspected animation library. Left unchanged. |

Mixamo `idle/source.fbx` and `walk/source.fbx` have project-maintained `SOURCE.md` and `LICENSE.txt`, provider **Adobe Mixamo**, download date **15 July 2026**, original names `Idle.fbx`/`Walking.fbx`, Binary/With Skin/30 FPS/no key reduction, and pinned hashes. Their licence sidecars refer to Adobe's terms and explicitly say they were not supplied by Adobe. **They are not labelled CC0.** This audit reports recorded provenance; it does not establish a new legal permission or certify redistribution of raw vendor files.

The existing validator checks known provider, file signature, hashes and required sidecar text; that is an integrity/provenance check, not an automated licence adjudication. No external pack was downloaded or investigated as a substitute for inspecting owned files.

## 11. Retargeting

**Retargeting already exists and is usable for the established pair; arbitrary external clips are not a turnkey supported input.**

[profiles/mixamo-to-quaternius-v2.json](tools/blender-character/profiles/mixamo-to-quaternius-v2.json) defines the exact 67-joint Mixamo source and 65-joint Golden target, pinned source/target hashes, 22 principal bone mappings, ignored fingers/helpers, scale and in-place policies. The bake performs world-space rest-delta rotation:

```text
sourceAnimatedWorldRotation * inverse(sourceRestWorldRotation) * targetRestWorldRotation
```

It resolves target local motion through the animated parent, preserves target rest translations/scale for the chains, scales hips displacement using the target/source rest height ratio, and samples at 30 FPS. Horizontal travel is removed; vertical pelvis motion survives. Blender and Three world-axis conventions are handled separately.

The earlier name-map/`SkeletonUtils.retargetClip` V1 path was rejected for shoulder/torso deformation. V2 JSON is retained as an experimental comparison; the runtime game does not retarget every actor or load FBX. The [retargeting report](docs/assets/golden-reference-animation-retargeting-spike.md) records approximately 9.69 degrees / 1.46 cm maximum offline-vs-V2 sample discrepancy under its feasibility tolerance. That historical tolerance is not automatic production-quality acceptance for a new strike or fall.

Specific current limits:

- Both the JavaScript bake entrypoint and Python `--clip` choices support only `idle`/`walk`; output names and validation assumptions are fixed accordingly.
- New source records, hashes, clip selection and compatible rest signatures must be added deliberately. A different export of a nominally similar Mixamo rig is not validated by its provider name alone.
- There is no Patchbeard-to-Golden profile and no general BVH pipeline. Similar-looking names do not solve the 24-versus-65-joint hierarchy/rest differences.
- Accepted mapping omits fingers. Source Mixamo finger curves exist, but the rejected wider V1 mapping is not a safe shortcut to animated fists/grips.
- Current authored identities retain Golden bone proportions; height is uniform. This is favorable for reuse. Broad/Fuller surface volume, armpit/elbow/knee creases and the outfit's clearance still need action-specific inspection. No IK/foot-plant/hand-contact solver fixes these automatically.
- Golden-native authoring avoids source-rig retargeting, but still needs a narrow action-export path and the same rest/bind/root/clone/round-trip evidence. The current character compiler is deliberately not that exporter.

A future compatible external clip is feasible with the existing math and offline validation pattern. It needs a reviewed source-specific extension, not a general retarget-system rewrite or an assumption of safety from joint names.

## 12. Root Motion

**Verified convention: gameplay moves characters; skeletal animation is in-place.** Shared grid/traversal state drives the wrapper, grounding and collision. No controller reads animated root displacement back into the session.

For Golden, offline baking freezes horizontal world pelvis travel while retaining vertical motion. A fresh 61-sample evaluation per accepted clip on the dressed canonical output found maximum horizontal coordinate ranges below **4e-8 m**. Vertical pelvis range was approximately **0.001429 m Idle** and **0.069855 m Walk**. These are fresh CPU pose samples, not new visual acceptance.

The exported Golden clips use **CUBICSPLINE** samplers. Raw output arrays include in/out tangents alongside values. The generic source inspector's raw-vector excursion heuristic does not separate those triples and can misleadingly flag horizontal motion. The figures above use the actual Three interpolant and world transforms; they do not interpret tangents as poses. No inspector behavior was changed.

For Patchbeard, `prepareThreeCharacterAnimationClip` clones the clip and freezes only X/Z in tracks named exactly **`Hips.position`**, retaining Y. Original cached/source data is preserved. This is not a generic root-name/retarget policy. It will not strip an arbitrary `root`, `pelvis`, armature-object or differently named root track.

| Existing source | Raw horizontal evidence before preparation | Required policy |
| --- | --- | --- |
| Mixamo Walk | Strong forward travel; the recorded bake reports about 1.65 m after target scaling | Already stripped during the accepted Golden bake. Do not play raw FBX directly. |
| Mixamo Idle | Small horizontal sway with return to start | Existing bake freezes horizontal pelvis motion. |
| Pirate Walk / Running / Run_03 | Horizontal Hips excursion; near-returning cycles | Existing Hips preparation freezes X/Z. Small numerical endpoint residuals alone should not be called locomotion. |
| Pirate Attack | Approximately 49.39 source-local units of horizontal excursion | Existing Hips stripping applies to registered Attack. Raw units are not metres. |
| Pirate Dead | Approximately 64.71 source-local units net horizontal displacement | Existing preparation removes horizontal travel and retains the vertical fall. Foot/ground appearance on another body still needs authoring. |
| Pirate Triple Combo | Approximately 157.95 source-local units net horizontal displacement | Unused; would need explicit in-place treatment and review if ever adopted. |
| Golden V2 / rejected V1 JSON | Intended in-place retarget outputs | V2 is a reference; root policy does not rescue V1's anatomical errors. |

Keep new actions in place, with reviewed vertical pelvis motion and consistent world-facing conventions. Do not alter the gameplay position, collision or traversal path from clip data.

## 13. Required Animation Set

| Priority | Set | Reason |
| --- | --- | --- |
| **Must have now** | Existing Idle and Walk | Already accepted, mapped and shared. Reuse them. Do not restart locomotion authoring. |
| **Must have now** | One short unarmed Attack | Existing Space combat and a shared accepted-attack event need visible feedback. No weapon system is required. Fit the cue/recovery to current immediate damage and the default 500 ms cooldown. |
| **Must have now** | One restrained Hit reaction | Both player and NPC damage already occur. Use positive nonlethal damage, allow Death to override, and return to the latest locomotion state without adding gameplay stun. |
| **Must have now** | One Death | Actual zero-health/defeat exists. Requires player success/death separation and a short NPC presentation lifetime before cleanup. |
| **Useful next** | One reusable Interact/Pickup reach | Accepted container/pickup semantics exist. Resolve repeatable-pickup identity, duplicate events, object removal/rebuild timing and spatial intent first. |
| **Useful next, if needed** | Short talk gesture | Cosmetic only; requires trustworthy speaker/actor association. No lip-sync system is justified. |
| **Defer** | Run | No sprint/Run gameplay state. Numeric speed is not proof one is wanted; define the criterion before choosing among existing non-Golden run clips or sourcing another. |
| **Defer** | Jump start, airborne loop, Land | Requires movement mechanics that do not exist. Excluded from an animation-only expansion. |
| **Defer** | Turn-in-place, combos, weapon-specific attacks, strafing, directional hit/death sets, root-motion actions | No current acceptance criterion requires this scope. |

The first production target is **five motions total, of which only three are missing**. This is a bounded action-adventure set for current mechanics, not a nine-state system added because the clip list sounds familiar.

## 14. Recommended Source Strategy

**Choose Option D, with a precise composition: reuse accepted Golden Idle/Walk; author Attack, Hit and Death directly against the unchanged Golden rig in a separate animation source package.** Keep immutable canonical body/clothing sources as references. No modification was made in this audit.

| Route | Quality / compatibility | Implementation risk / cleanliness | Repeatability / verdict |
| --- | --- | --- | --- |
| A: reuse existing unused clips | Pirate actions are real, but not Golden-ready; prop clips do not animate a human | Requires a new retarget pair and pirate provenance evidence; long attack/combo timing does not match current simple combat | Reuse Golden locomotion immediately; unused assets do not cover the missing Golden combat set. |
| B: author everything on Golden | Exact rig control and intentional hands/grounding | Avoids retarget mismatch but wastes proven Idle/Walk and expands art work | Use only for the three missing actions. Production quality still requires competent pose/timing review. |
| C: retarget external/CC0 clips | Can provide strong motion, but quality on this body is not established | Existing Mixamo pair is a good foundation, yet source clearance, clip gates, hands and action-specific deformation remain work | Suitable later when a specific documented source offers a clear quality/time benefit; not the shortest verified path from the assets already here. |
| D: selected hybrid | Preserves accepted locomotion and makes missing actions match Golden/body/cooldown | Small new action source/export extension; no new skeleton or broad controller design | Best bounded route: versioned inputs, deterministic export, shared clips and focused acceptance. |

This recommendation follows the inventory; it does not assume all art must start from scratch or that the current controller is inadequate. The alternative of retargeting an owned pirate action should be revisited only with clear provenance and an explicit comparison showing it is less work than three simple Golden-native actions.

## 15. Required Runtime Changes

Only the following changes are necessary for the recommended first set. They are **not implemented** here.

1. **Map compatible actions through existing definitions.** Add stable source IDs and exact clip names for Attack, Hit and Defeated; keep existing saved character references and the baseline animation-set ID loadable. Use the shared loader/cache and existing marker/clone path. Attack and Defeated already have state slots.
2. **Add one Hit semantic/trigger and explicit arbitration.** The minimum model is `Defeated > Hit > Attack > Walk > Idle`, implemented in the existing small controller rather than a generic priority framework. Hit interrupts a cosmetic attack; on completion it resolves current locomotion. An accepted attack while a higher-priority Hit is active should not replay later from an unbounded queue. Damage/cooldown remain shared and immediate. Preserve missing/unloaded action fallback.
3. **Wire existing damage/contact events.** Trigger victim Hit on positive nonlethal `npcDamaged`/`playerDamaged`; Death wins on lethal damage. Use source `npcId` for optional hostile-contact Attack feedback. Keep the existing player `attackStarted` path, including misses and cooldown rejection.
4. **Separate player defeat presentation from successful terminal UI.** The RAF's defeated context must reflect actual defeat, not every `gameOverRef`/end-of-game state. Existing progression, input blocking, health and save semantics remain authoritative.
5. **Retain dying NPC visuals locally for a bounded duration.** Remove gameplay/collision immediately as today, retain only that actor's group/controller through its Death action, then dispose exactly once. Add a narrow completion signal/query or equivalent safe deadline; current controller exposes neither. Missing/load-failed Death should use immediate existing removal. Scene/area teardown must cancel the retained presentation; no corpse state is saved or restored.
6. **Verify action return blending.** The existing finished-attack path starts locomotion without the usual crossfade. Author a compatible recovery pose and add only the small return-blend behavior needed if visible discontinuity remains. Do not introduce layers/IK/locomotion warping by default.

Offline companion work is necessary: a versioned Golden-native action source/export path, declared expected tracks (including reviewed finger channels if used), provenance/hashes, deterministic bake and round-trip tests. Current bake/validator hardcoding of two names and 23 tracks cannot certify a new finger-animated action unchanged. Extend those exact contracts, rather than disabling skeleton/track checks.

Studio only needs a narrow way to inspect the new actions if it is used for their acceptance; it does not need a redesigned creator or compile/finalisation flow. Phaser does not need skeletal playback to preserve shared gameplay parity. No Run/Jump mechanics, shared animation gameplay state, new project schema, broad refactor or general retargeter is required.

## 16. Risks

### Rig, deformation and semantics

- **Name-only compatibility is insufficient.** Runtime preparation checks names, not inverse binds, rest frames, anatomical correspondence or scale. Exact offline contract/round-trip checks remain essential.
- **Hands and contacts need actual art review.** Golden has usable fingers, but accepted clips leave open hands. A strike may need deliberate finger keys. Broad/Fuller clothing and deep elbow/knee/armpit compression have only the earlier bounded acceptance; static crouch/raised-arm diagnostics are not completed action animations.
- **Long existing pirate attacks do not fit simple combat automatically.** Their 2.833 s Attack and 4.367 s Combo are much longer than the 500 ms default cooldown; accepted attacks can restart them. There are no hit-frame damage events or three-strike rules.
- **Death has lifecycle consequences.** Retain only presentation, never a combat target or collider. Defeat flags, quest/reward-once behavior, Save/Continue and authored defaults must remain unchanged. Successful completion must not play Death.
- **New export success is not acceptance.** Check actual GLTFLoader playback, independent clones, finite deformation, rest restoration, full-clip root behavior and final pose; then inspect appearance in the real renderer. The recent reports do not constitute new-art acceptance.

### Performance boundary

The historical [Three performance result](THREE_RUNTIME_PERFORMANCE_RESULT.md) measured roughly **0.2 ms per frame for six/seven controllers** in its animation phase on hardware Chrome. That phase includes controller/diagnostic work; it is not an isolated cost for one `mixer.update`, a universal budget, or a measurement made during this audit. The report's old claim that defeat still rebuilds the scene is superseded by [COMBAT_HITCH_RESULT.md](COMBAT_HITCH_RESULT.md).

The latter measured lethal input-to-next-RAF improving from **430.7-1414.5 ms to 5.3-7.8 ms** by avoiding whole-scene reconstruction. It did not establish that the user's originally reported recurring nonlethal hitch was reproduced/resolved. The new animation pass must preserve zero settled-combat scene rebuilds/new clones/controller recreation, with only the defeated actor eventually disposed. Do not rerun retargeting, parsing, compilation, traversal reconstruction or quest synchronization per hit/frame.

Fresh parsed payload measurements:

| Existing source | File bytes | Sum of per-track time/value array bytes |
| --- | ---: | ---: |
| Golden Idle | 15,828,832 | 297,184 |
| Golden Walk | 15,588,768 | 37,888 |
| Pirate Attack | 6,454,876 | 43,664 |
| Pirate Death | 6,456,844 | 46,144 |

The Golden pair totals **31,417,600 file bytes** versus **335,072 bytes summed across clip track arrays**. Source tracks share time accessors: counting each distinct array view once gives 275,096 bytes for Idle and 35,072 for Walk. Preparation clones each track once per source/name, adding 297,184 and 37,888 bytes respectively. Loaded plus prepared array-view payload therefore totals **645,240 bytes**, before object/action/binding overhead. This is neither total JS heap nor GPU memory, and array views are not a measurement of underlying allocation lifetime. Each full source GLB also retains its model/material/texture resources; embedded/compressed file size is not decoded texture memory.

A one-second clip with the same 23 CUBICSPLINE tracks and 31 samples is approximately **36,704 typed-array bytes**; LINEAR encoding with the same samples would be about 14,136. Three such curves are roughly 0.11 MB before the prepared copies and overhead. More animated fingers and longer duration scale that amount upward. These are arithmetic estimates, not promised export sizes. Copying a full 15.6 MB Golden model/texture payload into each of three new clip files would instead add roughly **47 MB of transfer/storage**, plus decoded resources. Packaging dominates curve memory.

Use stable shared clip sources, one prepared clip per source/name and per-actor actions/mixers. A normal full-body one-shot replaces locomotion rather than creating another mixer. Brief crossfades evaluate overlapping actions; more tracks/fingers and a temporarily retained dying actor add real work, but there is no evidence that the mere one-shot state requires a large per-frame cost. Measure the final result rather than asserting zero cost. Reuse a multi-clip source where its round trip is proven; do not call `animationOnly` a stripping optimization. No general rendering optimization is recommended by this audit.

Fresh checks used the real GLTFLoader with the repository's one-pixel Node texture stand-in. The old animated chest source logged its known relative `Textures/colormap.png` warning. Numeric binding is not fresh browser texture/material or perceived-smoothness evidence.

## 17. Exact Next Implementation Pass

**Proposed task: Golden Combat Animation V1 for the canonical authored human, using the current combat mechanics.** This is a proposal for later work, not an implementation performed by this audit.

1. Preserve both accepted Golden locomotion clips and all character/body/clothing exports. Create a separate versioned Golden-native action source containing exactly **one short unarmed Attack, one nonlethal Hit and one Death**. Keep the 65-joint rest rig and in-place convention. Establish deliberate hand pose, grounded fall and recovery before expanding variations.
2. Extend the existing offline tooling narrowly to export those named actions and publish the actual validated artifact set. Retain source hashes/licence/provenance, two-build determinism, declared channel contracts, unchanged Golden binds and no horizontal root drift. Validate through the production GLTFLoader/clone path; character regeneration is not a dependency. Try one shared action GLB through the existing multi-clip lookup, and approve its actual packaging by round trip rather than assuming skeleton-only support.
3. Make only the six runtime integration changes in section 15. Keep damage immediate and shared, existing cooldown/targeting/contact values unchanged, and NPC collision removal immediate. Keep player success distinct from death. Retained dying visuals must finish/clean up locally and survive neither teardown nor Continue.
4. Use focused controller tests for missing/loading clips, Attack/Hit recovery, interruptions/restarts, death clamp/completion and independent clones. Extend existing adapter tests for event wiring, success-versus-death, exactly-once delayed visual cleanup, immediate freed collision and stable surviving scene/controller identities. Retain shared defeat/quest/reward/Save/Continue regression coverage. No new broad suite or snapshot matrix.
5. Inspect a small explicit selection on existing dressed Athletic/Broad/Fuller outputs: complete actions at gameplay framing, strike/contact pose, deep elbow/knee/shoulder cloth, feet/ground and final dead pose. Include supported height endpoints where absolute contact/grounding matters. Review selection before any build/render; no historical character matrix.
6. Extend the existing real-input combat/parity route to cover accepted miss, nonlethal hit, incoming contact, cooldown rejection, lethal removal, player death and successful completion. Keep the hitch lifecycle assertions and authored-project equality. Compare settled per-hit frame intervals and first runtime-render completion using the existing combat diagnostic; use a profiler-free measurement window. Then run the required CI once and `git diff --check`.

**Out of scope for that pass:** new combat mechanics, weapons/combos, animation-timed damage, Run/sprint, Jump/Land, turn-in-place, interaction clips, facial animation, broad retarget tooling, rig replacement, general renderer optimization and character re-export migrations.

### Audit validation completed

- Fresh content inventory of all tracked FBX/GLTF/GLB files and the additional unique local interchange artifacts; serialized clip inventory; 28 Blender source/study/backup files read without saving.
- Real Golden Idle/Walk resolved through the current controller on six installed character GLBs, with zero mapped missing/incompatible clips; missing Attack retained Walk. Fresh Patchbeard Attack returned to Walk; Defeated held its final pose. All seven pirate clips reject Golden preparation and accept the pirate target. All three prop clips bind to their actual lid.
- Raw Golden bone hierarchy/rest comparisons and 61 actual Three-interpolated root-motion samples per Golden clip. No new clip, character export, browser suite or performance benchmark was created.
- Required **`npm.cmd run ci` invoked once: PASS, exit 0**. **95 Vitest files / 754 tests**, type-safe root and Studio builds, all three package builds/typechecks, and **63 cheap Node compiler/asset tests** passed. Existing Vite large-chunk advisories were emitted; PowerShell rendered stderr as `NativeCommandError` text in the log, but the command returned exit 0.
- **`git diff --check`: PASS.** The new untracked Markdown file was also checked explicitly with `git diff --no-index --check`; no whitespace errors. All 17 requested sections and local source links were checked.

Local reproducibility evidence is in `test-results/animation-capability-audit/`: `inventory.json`, `local-assets.json`, `json-clips.json`, `blender-actions.json`, `rest-compatibility.json`, `runtime-binding.json` and `ci.log`. These are ignored audit captures, not new shipping assets. The inventory uses `inspectAnimationSource`/`parseFbxAnimationSource`; the binding check uses a temporary bundle of the current controller and the existing `loadGlb` with a local-file loader adapter. No HTTP/browser claim is inferred from it. The conclusions and complete clip tables above do not depend on these local files being distributed.
