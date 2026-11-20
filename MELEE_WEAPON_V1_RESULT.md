# Melee Weapon V1 — One Sword

20 October 2026. Weapon/animation source: `sword-v1` / `golden-sword-v1`.

## 1. Executive Result

**PARTIAL for the requested final validation gate; the complete real-input weapon
loop passed.** The engine supports the bounded sword loop below. Full CI encountered
two timeouts in unchanged editor tests; one remains over its normal 5-second limit.
All assertions in that case pass with a diagnostic 15-second limit. Repository
timeouts and unrelated editor code were left unchanged.
The player acquires an ordinary physical sword pickup, explicitly equips it in
Inventory, carries it on the actual Golden right hand, walks/runs/jumps, attacks
with a separate sword cut, damages/defeats the existing enemy, and restores the
equipped sword through Save/Continue. Unequip restores the original unarmed path.

The selected dressed-body views and actual gameplay frames show a readable
shoulder-led cut, stable grip and controlled recovery. This is the agent's visual
assessment; the user has not yet reviewed the motion. The bounded review and
remaining limits are recorded below.

## 2. Existing Systems Reused

The pre-change audit found authored `ItemDefinition` records and quantity-only
inventory, existing physical `collect_item`/pickup transactions, base player combat
damage/range/cooldown, `attackStarted` as the Three attack presentation seam,
Golden's `hand_r` bone, per-instance character mixers, and semantic version-1 game
saves. There was no player equipment slot or reusable hand attachment.

Reused `collectRuntimeObjectPickup`/the ordinary inventory grant and notification
path, `attemptRuntimeCombatAttack`, existing cardinal target selection, immediate
damage, NPC Hit/Death/removal, defeat flags, quest synchronization, RuntimeSession
isolation, GLTF cache/clone/marker rendering, and the existing save flow. Shared
gameplay still imports no React, Phaser or Three. No character GLB was rebuilt.

## 3. Sword Asset

Original project-authored [geometry source](tools/blender-character/build-sword.mjs):
one bevelled diamond-section blade, simple guard, grip and pommel. The
[GLB](public/assets/weapons/sword-v1.glb) is **10,660 bytes, 90 triangles, one mesh,
one vertex-colour material and no textures**. Its grip-centred origin has +Y along
the blade and +Z across its flat face. Total length is approximately 1.02 m.

Registry asset `weapon-sword-v1` owns the URL, unit scale, orientation and shadow
defaults. The world pickup and held sword use the existing registry/marker path.
The installed GLTFLoader round trip checks finite geometry, counts and bounds.
[Asset notes](public/assets/weapons/README.md).

## 4. Weapon Definition

[`data/sword.ts`](src/data/sword.ts) contains one behaviour and one stable starter
item (`sword`). An item optionally references `weapon: "sword"`; ordinary items
gain no combat fields. The authored schema adds the Weapon category and this
bounded optional reference, with migration tests and no injected default items.

| Attack | Damage | Reach | Cooldown |
| --- | ---: | ---: | ---: |
| Demo's original unarmed | 25 | 1 cell | 500 ms |
| Equipped Sword | 35 | 2 cells | 750 ms |

Reach uses the existing rounded-cell/cardinal targeting convention. The sword's
longer reach is useful, while its slower cadence avoids an excessive damage-rate
increase. Definition data also references the visual, right-hand socket, one local
grip and external attack clip. There is no second weapon registry or combat engine.

## 5. Equip Model

One optional session-owned `equippedWeaponId` stores the **inventory item ID**.
Pickup grants ownership without auto-equipping. Inventory detail supplies Equip
and Unequip. Equipping requires an owned sword item, a living grounded player and
the existing session modal/startup gates. Unequip clears the slot. A weapon no
longer owned cannot provide combat parameters or a held visual.

Equip/unequip never resets an accepted attack's cooldown. New Game starts unarmed;
authored player combat defaults and initial inventory remain unchanged by Play.
Both adapters use the same equipment/combat helpers; Phaser keeps its existing
sprite presentation and Space attack control.

## 6. Hand Attachment

[`threeWeaponAttachment`](src/runtime/three/threeWeaponAttachment.ts) resolves the
actual instance **`hand_r` Bone**, then parents the sword to that bone. Animation
and the hierarchy supply its position and rotation; no frame loop moves the sword.

The single hand-local grip is position **(-0.035, 0.095, 0.008)**, Euler rotation
**(90°, 0°, -22.5°)** and scale **1**. The outward angle improves the blade silhouette
from the rear camera. The marker factory's narrow `preserveAssetOrigin` option
retains the grip origin instead of grounding the held model by its bounds.

The source attack's right-finger opening pose supplies a small fixed grip overlay
after the existing mixer. It changes only right fingers; arm/body animation stays
authoritative. One cloned sword is retained on unequip and reused on re-equip.
Cleanup detaches it, cancels late attachment through a disposal guard, and preserves
shared cached geometry/materials. Missing/non-Golden hand bones attach nothing.

## 7. Sword Attack Animation

[Editable source, author and exporter](tools/blender-character/animations/golden-sword-v1/README.md)
produce `GoldenSword_Attack_V1`, **0.75 s** at 60 Hz. Shoulder/torso load at 0.15 s,
hip lead at 0.217 s, delivery at 0.30 s, follow-through at 0.40 s, and recovery to
the opening pose by 0.70 s make it suitable for the 750 ms repeat cadence. The
initial unpublished candidate's overly upright finish was refined before acceptance.

Two isolated final exports produced the identical **71,156-byte**
[mesh-free library](public/assets/derived/humanoid-animations/golden-sword-v1/actions.glb),
SHA-256 `bcea515ab14a22a26439e87dc594c57930c25db4e698a8080fb54c42ee0852d4`.
[Metadata](public/assets/derived/humanoid-animations/golden-sword-v1/metadata.json)
records source/reference hashes. [Round trip](public/assets/derived/humanoid-animations/golden-sword-v1/roundtrip.json)
checks Golden rest/hierarchy, all 53 finite channels, exact timing, no horizontal
root motion, recovered endpoint, independent clones and rest restoration.

[Timed four-view motion](docs/assets/melee-weapon-v1/sword-attack.gif) and the
[actual gameplay cut](docs/assets/melee-weapon-v1/sword-attack.png) were inspected.
The latter is a frame captured during a real F attack, with no pose/state injection.

## 8. Combat Integration

`getRuntimeAttackStats` supplies effective parameters to the existing transaction;
the base `playerCombat` remains unchanged. The accepted event captures the sword
variant for presentation. Immediate damage, cooldown, one target, NPC Hit/Death,
defeat flags, quest synchronization and immediate gameplay removal remain shared.
The visual blade never enters collision/traversal or performs sweep tests.

The existing controller prepares the optional sword action once, using its normal
source/prepared-clip caches and independent mixer. It retains semantic **Attack**:
**Defeated > Hit > Attack > Interact/Pickup > Jump/Fall/Land > Run > Walk > Idle**.
The latest movement context resumes after recovery. No new weapon-state graph,
hit-frame damage, combo, stun or aerial attack was introduced. Missing optional
sword animation safely uses the existing Attack fallback.

## 9. Movement / Interaction Integration

The real-input route observed equipped Idle, Walk, Run, Jump, Fall, Land, attacks
from Idle and after Walk/Run, and recovery to the current locomotion. Airborne F
and inventory-modal F did not trigger attacks. The same attachment instance stayed
parented throughout movement, attacks and interactions.

The [locomotion sheet](docs/assets/melee-weapon-v1/locomotion.png) and
[reaction/interaction sheet](docs/assets/melee-weapon-v1/reactions-interactions.png)
show selected poses. Hit and Death retain the sword in the hand. Interact/Pickup
temporarily hide it in Play, preserving the existing reach/bend and avoiding a
blade through the container. It returns on normal recovery. The art sheet leaves
it visible deliberately to inspect those poses. Sign and NPC dialogue are unchanged.

## 10. Inventory UX

Inventory detail shows **Sword**, **Weapon**, **Equipped / Unequipped**, and one
Equip/Unequip button. Existing keyboard focus and modal input capture remain.
No drag/drop equipment slots, hotbar, weapon wheel or equipment editor was added.

Authors can choose **Items → Add Sword**, then place an ordinary object with a
**Collect Item** interaction selecting Sword and the registry's **Sword** visual.
Existing object/Inspector authoring owns placement and item selection. Add Sword
selects the existing stable item when already present; it does not duplicate it.

## 11. Save / Continue

Version-1 saves retain inventory ownership and optionally
`player.equippedWeaponId: "sword"`. Parsing requires the referenced item to be a
known owned sword. Older saves with no field restore unarmed. Invalid/unowned
equipment references are rejected; migrations never restore deleted user items.

The browser saved and continued an equipped sword, verified its hand attachment
and zero replayed one-shots, then unequipped, saved and continued again. Ownership
remained one sword while the hand stayed empty. Collected pickup absence, opened
chest state and enemy defeat remain ordinary semantic progress. No Three objects,
bone references, grip pose, animation clock or equip animation is saved/replayed.

## 12. Golden / Clothing Review

Existing dressed [Athletic](docs/assets/melee-weapon-v1/athletic.png),
[Broad](docs/assets/melee-weapon-v1/broad.png) and
[Fuller](docs/assets/melee-weapon-v1/fuller.png) were reviewed at six phases in
gameplay-scale, side, front-quarter and rear-quarter views, with timed motion.
Shoulder/torso lead, elbow bend, wrist angle, grip, blade arc, body balance and
recovery remain readable. No severe new shoulder/elbow/hand, shirt/trouser or
blade/body intersection was observed in these selected views. Existing stylised
hands and close joint creases remain.

A fresh [61-sample-per-body deformation record](docs/assets/melee-weapon-v1/deformation.json)
records body hashes, finite bounds, exact Golden compatibility and zero horizontal
root drift. Lowest sampled body geometry was **9.92 mm above the floor** on all
three existing outputs. Numerical validity was evaluated separately from appearance.
No character, outfit or historical fitting matrix was rebuilt.

## 13. Demo Project

Import [melee-weapon-v1-demo.project.json](melee-weapon-v1-demo.project.json), select
**3D View**, then **Play**. Everything is ordinary project data with the existing
authored player/character asset and a 28 × 18 practice yard.

- Start (3, 8); hostile-aligned stationary Sparring Guard (4, 8), health 100.
- Sword pickup (6, 8); animated chest (10, 8); Rope pickup (13, 8).
- Sign (15, 8); passive Keeper (17, 8); open lower lane for Walk/Run/Jump.
- Existing **Save Game / Continue** toolbar flow supplies saving.

Face the guard and press F for the original 25-damage attack. Walk around it using
the lower lane, collect the sword with E, open Inventory with I and Equip. Return
to face the guard from two cells away to compare sword damage. Its AI is disabled
through the existing placed override for repeatable range/cooldown inspection;
hostile alignment, damage, Hit/Death and defeat semantics are unchanged. Walk around
the chest/sign footprints when moving along the course. Use Inspect for direct
world-relative routing or Follow Player and the existing mouse-look control.

## 14. Browser Acceptance

**Final route: 1 passed, 3.9-minute test / 4.2-minute run**, installed Chrome.
It uses real keyboard, mouse and inventory controls. The harness reads DOM,
diagnostics and saves; it never mutates equip/combat state or invokes transactions.

Verified unarmed 25 damage, ordinary once-only pickup and notification, explicit
equip, actual `hand_r` attachment, locomotion/airborne stability, sword clip,
35 damage at two-cell reach, cooldown rejection, enemy defeat/local Death removal,
chest and pickup use, neutral sign/NPC dialogue, equipped Continue with no replay,
unequip/unarmed fallback, unequipped Continue, and complete editor-project equality.
There were **zero page exceptions**. [Acceptance record](docs/assets/melee-weapon-v1/acceptance.json),
[equipped gameplay](docs/assets/melee-weapon-v1/equipped.png),
[real sword cut](docs/assets/melee-weapon-v1/sword-attack.png),
[defeat](docs/assets/melee-weapon-v1/defeat.png).

```powershell
node node_modules/@playwright/test/cli.js test e2e/melee-weapon-v1.spec.ts --grep @melee-weapon-v1 --list
node node_modules/@playwright/test/cli.js test e2e/melee-weapon-v1.spec.ts --grep @melee-weapon-v1 --output=test-results/melee-weapon-v1/browser-final
```

## 15. Performance

Across pickup/equip and the settled action window: scene builds **2 → 2**, cleanups
**1 → 1**, asset load starts **6 → 6**, and one active runtime RAF with unchanged
loop-start count. Initial setup precedes this window. First equip adds exactly
one held clone (**14 → 15**); movement, repeated attacks, chest and pickup then
retain **15**, with **zero new GLB requests** and the same attachment instance ID.
The defeated NPC's mixer is disposed locally, reducing character mixers 3 → 2.

Mounted tests preserve scene/controller identity through equip/unequip; attachment
tests reuse the same sword on re-equip and verify shared-resource cleanup. Controller
tests prepare the sword clip once across repeated attacks and independent actors.
Equipment only changes the session item ID and bone attachment; it does not rebuild
traversal, terrain, character or scene. These are lifecycle/cache observations,
not a GPU/FPS benchmark. No second mixer or RAF was added for the sword.

## 16. Validation

- Focused deterministic checks: **136 tests in five files passed**, covering
  ownership, pickup duplication, equip/unequip, migration, save/restore/rejection,
  fallback, parameters, cooldown/range, modal/airborne gates, defeat regression,
  animation selection/cache/independence, hand lifecycle, cleanup and scene identity.
- Focused installed sword/action Node checks: **2 passed**.
- Two isolated final animation exports: byte-identical; production GLTFLoader
  round trips and the selected body/locomotion art review passed.
- Final real-input browser route: **1 passed**.
- Full `npm.cmd run ci`: invoked **once**, exited in its Vitest stage with
  **819 passing tests and two 5-second timeouts across 101 files**. The unchanged
  `characterGameIntegration` placement/save test and `questAuthoring` sequence
  authoring test timed out. No assertion failure was reported. Log:
  `test-results/melee-weapon-v1/ci.log`.
- Only those two cases were retried with normal limits: the quest case passed;
  character integration again timed out. Its isolated diagnostic run with CLI
  `--testTimeout 15000` then passed all assertions in **13.04 s**. This diagnostic
  is **not a passing 5-second CI gate**. Neither test nor repository timeout
  settings were edited. Logs: `ci-timeout-recheck.log` and
  `character-diagnostic.log` under `test-results/melee-weapon-v1/`.
- All stages not reached by CI were then executed **once in their original
  order and passed**: type-safe root and Studio production builds, all three
  package builds/typechecks, and **75 passing cheap Node compiler/asset tests**.
  Existing Vite large-chunk advisories remain. Log:
  `test-results/melee-weapon-v1/ci-remaining.log`.
- Final `git diff --check` passed. All 18 requested report sections and local
  report links were checked. No unrelated timeout setting or test was changed.

## 17. Remaining Limitations

One sword, one slot and Golden right-hand presentation only. The fixed hand grip
does not provide per-identity IK fitting. Direct rear views can still partly hide
the forward blade; the outward grip and quarter camera improve readability.
Selected bodies/outfits and flat-ground views do not establish every identity,
outfit, slope or obstacle combination. Interactions hide/reveal the held sword;
there is no sheath. Combat retains its existing grid/cardinal target convention
and immediate damage. There is no blade collision, enemy equipment or expanded
RPG equipment system.

The normal full CI gate is not green because the unchanged character placement/
save integration case exceeds its 5-second limit on this host. Its assertions
passed under the explicitly separate diagnostic limit; no baseline timing or
performance cause is claimed. This is the reason for the overall PARTIAL label.

## 18. Recommended Next Feature

**Weapon polish.** Refine carry/guard silhouettes and camera readability using this
same single sword and existing controller. No follow-up feature was implemented.
