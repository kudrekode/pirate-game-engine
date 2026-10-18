# Gameplay Interaction Authoring — Result

## 1. Executive Result

**PASS.** Users can now select a scene
entity and author useful interactions in the Map Inspector without JSON or code.
The implementation reuses existing gameplay systems; no scripting platform,
quest editor, combat system or NPC AI was added.

## 2. Existing Systems Reused

The engine already provided E/Enter input, nearest/touch discovery, direct
interactions, rules and flags, dialogue nodes, inventory and item pickups,
containers, item-gated doors, event destinations and cloned RuntimeSessions.
The new controls write those contracts and shared transactions. Legacy settings
remain available under Advanced interaction / Advanced object behaviour.

## 3. Interaction Model

Profiled 3D areas use a default 1.75 m reach from continuous player position,
authored instance offsets, a roughly forward-facing filter, nearest distance
and stable ID tie-breaking. Existing oriented collision boxes block intervening
walls; the target's own collider is exempt so solid chests remain usable. Legacy
grid areas retain one-cell reach. Prompt and execution share discovery.

E or Enter interacts. No existing gamepad abstraction was found or introduced.
Additive `show_message`, `object_behaviour` and `collect_item` interaction types
connect inline text, explicit behaviour activation and prop collection to the
existing schema. Migration validates text arrays and pickup quantities.

## 4. Editor Authoring UX

Select an entity in the world or Scene list, expand **Properties & gameplay**,
then enable **Interaction**. Objects offer Examine / Message, Container,
Door / Transition and Pickup. NPCs offer ordered Dialogue; enabling it also
enables the existing Can interact attribute. Events offer message, flag and
transition triggers. Only relevant fields appear. Chest names suggest Container
when explicitly enabled; merely loading or placing existing scenery adds no
behaviour. Reward items can be created directly beside the chest fields.

The mounted Inspector test authors “Smells strongly of rum.” on a barrel, creates
a reward item, disables/re-enables a chest, writes two NPC lines, authors a prop
pickup and round-trips the configuration through project migration.

## 5. Examine / Messages

Inline text becomes temporary nodes for the existing dialogue engine. The
existing modal presents readable text with Continue / Close. E/Enter advances,
Escape closes, repeated held-key events are ignored in Three, and dialogue blocks
movement and NPC simulation. No portraits, branching authoring or new cutscenes.

## 6. NPC Dialogue

Speaker plus an ordered, editable list of lines. Add/remove controls work locally
on the selected instance. Definition/instance resolution and existing authored
dialogue references remain supported. Node advancement uses the existing engine.

## 7. Containers

New Container interactions open once and optionally grant one item and quantity.
Existing multi-reward/repeating containers remain editable in advanced settings.
Opening reports the reward name and quantity; repeated use reports an empty
container. The kit chest has one mesh and no separable lid. Three displays a small
**Opened** badge; Phaser fades its marker. The static mesh is retained, with no
remodelling, animation or collider change. The Three badge updates without a scene
rebuild.

## 8. Items / Pickups

Existing item definitions, stack limits, inventory and pickup transactions are
reused. A selected prop can become an Interact pickup: collection removes its
session visual source and collider, grants the configured quantity once, and
shows feedback. Missing item definitions produce a validation issue and leave the
prop uncollected. Existing placed item pickups retain touch/interact modes.
No inventory UI redesign was undertaken.

## 9. Doors / Transitions

Door controls select an area, arrival event point and optional required item.
The existing door transaction checks inventory and transitions through shared
progression. Keys are retained. The showcase shack enters its existing interior
at (5, 4). Physical door animation and new condition languages are out of scope;
existing advanced flag/rule conditions remain available.

## 10. Trigger Areas

Existing event blocks serve as one-cell entry zones. The Inspector can author a
message with Once per Play session, or existing flag/transition actions. Message
triggers fire on entry, not each frame or each subcell movement. Trigger helpers
are visible in Edit and hidden in Play. Arbitrary rectangular volumes and sizes
are not part of the existing event contract and were not added.

## 11. Runtime State

Project JSON stores interaction text, prompts, rewards and destinations.
RuntimeSession owns inventory, opened/collected IDs, temporary dialogue and fired
message-trigger IDs. Removing a collectible changes only the cloned Play scene.
Returning to Edit retains authored defaults. New Play starts fresh; no save-game
system or cross-session gameplay persistence was introduced.

## 12. Traversal Integration

Movement, sweep, floor and collision-profile code is unchanged. Targeting queries
existing solids without mesh raycasts. Solid chests remain solid when opened;
collectible props remove their session collider only after successful collection.
Focused traversal regressions cover stairs, docks, water, walls and transformed
props. The original Tidewatch fixture still hashes to
`8cf104b9e7d786b7890a3492a90b14bf9308c77f84366e09388c1ade46e6067b`.

## 13. Tidewatch Harbour Demo

Import [the interaction showcase](docs/assets/gameplay-interactions/tidewatch-harbour.project.json),
then choose 3D View → Play. It is a browser-authored copy of the existing harbour,
with its environment, character and 30 props retained.

- Sign: “Tidewatch Harbour — Traders, sailors and questionable cargo welcome.”
- Barrel: “Smells strongly of rum.”
- Chest: Open chest → Harbour Key ×1.
- Keeper: “Storm did a number on the pier.” / “If you're heading inland, keep hold of that key.”
- Shack: Harbour Key requirement → Shack interior arrival point.
- Quayside cell (9, 6): “The eastern quay. Mind the loose boards.”, once per Play.

The showcase chest was intentionally moved through ordinary Transform fields
from (5, 5.2) to (5.8, 6.8), clearing the shack doorway. The original project under
`docs/assets/world-kit/` is unchanged. No collision was weakened to permit entry.

## 14. Browser Workflow

**Passed on 7 October 2026, one case in 6.9 minutes.** The opt-in
`@gameplay-interactions` case imports
the original project, authors every showcase interaction through real controls,
saves, walks to the sign/chest/Keeper/trigger, checks modal input restriction and
one-time rewards, uses the keyed door, presses against the interior wall, returns
to Edit and verifies complete project equality after Save/reload. It then opens
the chest again in fresh Play. No runtime writes, teleports or direct interaction
method calls are used by the test to manufacture progress. The run recorded zero
browser errors. Earlier attempts corrected harness selectors, a checkpoint just
outside the trigger cell, and a transient HUD position read during transition;
the complete final route passed.

Evidence: [message](docs/assets/gameplay-interactions/message.png),
[opened chest](docs/assets/gameplay-interactions/opened-chest.png),
[checkpoint results](docs/assets/gameplay-interactions/observations.json).

## 15. Validation

- Focused interaction, Inspector, migration, runtime and traversal checks pass.
- Final real browser route: **1 passed**, including authoring, real input,
  trigger re-entry, door transition, collision, complete saved-project equality
  and fresh-session reward after reload.
- Required `npm.cmd run ci`: **passed, run once**. All 90 Vitest files / 695
  tests passed, followed by the root app build, both contract package builds,
  shared preview package build, Asset Studio build and all 63 cheap Node compiler
  checks. Vite reported its bundle-size advisory; builds completed successfully.
- Final `git diff --check`: **passed**.

No Blender matrices or environment screenshot comparisons were run.

## 16. Remaining Limitations

- Static Opened feedback, without a moving chest lid or physical door animation.
- Cell triggers; no arbitrary trigger volume or vertical interaction targeting.
- New-session reset, not gameplay save files.
- Legacy grid/Phaser targeting remains tile-based; browser acceptance targets 3D.
- Existing local software-rendered browser performance remains slow; this pass
  makes no performance or hardware frame-rate claim.

## 17. Recommended Next Feature

**Inventory/item UX.** The world now grants items and uses them to unlock access;
make acquired items and their purpose easy to inspect before adding more gameplay
systems. This recommendation is not implemented by this pass.
