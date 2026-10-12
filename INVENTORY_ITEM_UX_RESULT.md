# Inventory & Item UX — Result

## 1. Executive Result

**PASS.** Players can inspect acquired items in both Play modes, see immediate
quantity feedback, and understand item-gated doors before interaction. The real
Tidewatch acceptance route passed, including retained-key behavior and authored
project isolation. All CI stages passed after the targeted timeout recovery
described below; Biome has no errors.

## 2. Existing Inventory Model

Reused `ItemDefinition`, `InventoryState.items`, `RuntimeSession`, existing
inventory snapshots, pickup/container transactions, rule actions, quest rewards
and door requirements. No parallel inventory, authored schema change or save-game
system was introduced.

## 3. Inventory UI

Both Phaser and Three Play have an **Inventory · I** button. I opens/closes;
Escape or Close closes. A simple selectable list sits beside an inspection panel.
Arrow keys select items; Tab cycles buttons; focus returns on close. Empty
inventory has a readable empty state. Inventory blocks movement, interactions,
attacks and NPC simulation. Dialogue, cutscenes, shops and startup prevent opening
it. Three clears held movement and mouse look. Opening inventory does not rebuild
the scene, load models or create asset previews.

## 4. Item Definitions

Existing name, description, category, icon id, stackable and maximum stack fields
remain authoritative. Player labels are Key Item, General, Currency and Quest
Item. Existing Consumable definitions round-trip as a legacy label; no new
consumable behavior or category creation option was added. Existing unknown icon
ids are preserved with a category fallback. Missing definitions never expose raw
ids in the inventory panel.

## 5. Pickup Feedback

Non-blocking notifications announce actual increases, such as **Harbour Key
acquired** and **Rope ×3 acquired**. Rapid changes of the same item/direction merge;
three notices are visible at a time and the queue expires automatically. Authored
starting quantities and unchanged snapshots do not produce acquisition spam.
Actual decreases produce neutral **removed** feedback, without claiming a use
effect that the transaction did not perform.

Pickups and containers now preflight the complete reward, including duplicate
entries for the same item. If it will overflow, nothing is granted or marked
collected/opened; feedback identifies the stack limit and leaves the reward
available. Missing definitions also leave the source available. Legacy quantities
above a subsequently lowered limit are not silently reduced by a grant.

Existing rule/quest grants retain their capped-quantity semantics and report the
actual added and rejected amounts through the same notification queue. This is
explicit feedback, not a new pending-reward storage system.

## 6. Item Inspection

Selection shows the authored name, symbol, description, category, quantity and
stack limit. Missing descriptions use “No description provided.” No lore or
automatic use effect is inferred. Category symbols provide a small, reliable icon
strategy without image generation or 3D thumbnail rendering.

## 7. Key Items

The showcase Harbour Key is a Key Item, limit one, with a key symbol and an
authored description explaining the shack and retention. The chest still grants
exactly one key. Inventory inspection does not equip or consume anything.

## 8. Door / Requirement Feedback

The shared prompt says **Requires Harbour Key** before input when locked. An
attempt explains the same requirement. After acquisition it says **E — Enter
Shack · Harbour Key retained**; successful entry also reports retention. The
underlying door transaction continues to check possession without removal.
Authored removal actions still remove their actual quantities and produce removal
feedback. No consumption toggle or new requirement language was introduced.

## 9. Runtime State

Actual quantities, collected IDs and opened containers belong to the existing
isolated Play session. UI selection and notifications are transient presentation.
Back to Edit preserves authored defaults. New Play starts from project defaults;
the showcase starts empty. There is no cross-session gameplay persistence.

## 10. Editor Authoring

Items exposes Name, Description, readable Category, a small Icon selector,
Stackable and Stack limit. Clearing the stack limit restores Unlimited. IDs remain
automatic and are absent from the normal item form. Existing Map Inspector reward
and requirement selectors continue to use item names; a door hint states that the
required item is retained. Tests cover item editing, reward creation, requirement
selection and migration round trips.

## 11. Tidewatch Harbour Flow

Use [the interaction showcase](docs/assets/gameplay-interactions/tidewatch-harbour.project.json).
The chest gives Harbour Key ×1 and the shack still requires it. Only the key's
player-facing definition/stack policy and the door prompt were polished; scene
placement, traversal and the original world-kit fixture are unchanged.

## 12. Browser Acceptance

The opt-in `@inventory-items` case in the existing gameplay interaction suite
imports the showcase and uses real controls and arrow/E/I/Escape input. It checks
empty inventory, movement/interaction blocking, locked-door feedback, the chest
toast, duplicate prevention, key details, entry and retention, complete authored
project equality after Edit/Save/reload, and empty inventory in fresh Play.
The harness only reads diagnostics and saved project data; it never writes player
position, inventory or interaction state.

Final run on 7 October 2026: **1 passed in 4.1 minutes**, with zero browser errors.
An earlier attempt reached the locked-door check but was invalidated by
development hot reload while implementation work continued. The complete final
route ran against frozen sources and passed every checkpoint.

Evidence: [locked door](docs/assets/inventory-items/locked-door.png),
[pickup toast](docs/assets/inventory-items/pickup.png),
[item inspection](docs/assets/inventory-items/inventory.png),
[checkpoint results](docs/assets/inventory-items/observations.json).

## 13. Validation

- Latest focused run: **10 files / 113 tests passed**, including editor, inventory
  presentation, rules, quests, interaction transactions and both adapter boundaries.
- Earlier focused checks also passed inventory, container, migration and interaction
  discovery/duplicate-prevention coverage.
- Required full `npm.cmd run ci`: **invoked once**. Its test stage passed 700
  tests and timed out on eight existing editor tests while the software-rendered
  browser was running. Only the affected two suites were rerun afterward:
  **54/54 passed**, without source changes or timeout increases. Every one of the
  **708 tests across 92 files** therefore has a passing result. The initial
  aggregate command exited 1; it was not rerun wholesale.
- The stages that this early exit prevented were then run in their original
  order: root type-safe build, both contract builds, shared preview build,
  Studio type-safe build and **63/63 Node compiler tests**. All passed. Vite's
  existing bundle-size advisories remain non-blocking.
- Full `biome ci . --reporter=summary --colors=off`: **passed**, exit 0,
  **373 files checked, zero errors**. The existing 44 warnings and seven
  informational diagnostics are non-blocking. Safe formatting/import
  fixes address existing failures; `.gitattributes` keeps Biome text endings
  consistent on Windows/Linux and retains the existing hashed-artifact exceptions.
  Other compiler/Studio changes are mechanical import sorting/formatting only.
- Final `git diff --check`: **passed**. No file content was staged or committed.

No Blender matrices or environment visual/performance benchmarks were run.

## 14. Remaining Limitations

- No save games, item-use effects, equipment, crafting, trading or inventory grid.
- Symbols are lightweight icons; custom bitmap/asset thumbnail authoring is absent.
- A whole world reward must fit its existing item stack limits; there is no partial
  chest collection or discard UI. Rule/quest overflow remains capped with explicit
  rejection feedback, without deferred rewards.
- Browser acceptance targets the 3D showcase; Phaser modal behavior is covered by
  deterministic adapter tests and uses the same inventory UI/transactions.

## 15. Recommended Next Feature

**Gameplay event chaining / simple quest authoring.** Build on the existing event,
flag and quest helpers so an author can connect this now-visible key-and-door loop
to a clear next objective. This recommendation is not implemented here.
