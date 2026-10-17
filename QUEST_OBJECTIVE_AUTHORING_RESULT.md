# Quest & Objective Authoring Pass

## 1. Executive Result

**PASS.** A user can author and play a simple directed objective chain without
JSON or code. The real Tidewatch browser workflow completed twice, including
Save/reload, fresh-session reset and unchanged editor data. Every Vitest test has
a passing result and all build/compiler stages passed. The aggregate CI command
exited on one existing editor-test timeout; its targeted recovery is recorded
in section 13.

## 2. Existing Systems Reused

Reused `Quest`, `Objective`, the Quests tab, flags, item definitions/inventory,
NPC definition/instance resolution, inline and referenced dialogue, event blocks,
containers, keyed doors, shared transitions, `activate_quest`, completion actions,
project migration/storage and isolated `RuntimeSession` state. Both renderers
consume the same progression helper and objective presentation. No second quest
model, scripting language, graph or workflow engine was added.

## 3. Quest Model

Existing id, name, description, status and objectives remain authoritative.
Additive `objectiveMode: "sequence"` enables ordered steps; missing mode preserves
legacy independent objectives. New quests start inactive. An optional completion
message accompanies the existing completion actions. Objectives retain their
stable id, player-facing description and typed condition.

Runtime views distinguish inactive, active and complete steps. Completing a step
latches it, activates the next, and immediately checks already-satisfied facts.
The final step completes the quest. Existing failed/default-completed states and
legacy variable comparisons remain compatible; no new failure/repeat system was
introduced. A completed sequential quest cannot be restarted by repeated dialogue.

## 4. Objective Conditions

- Talk to NPC / Examine object: observes a closed message or conversation.
- Obtain Item: current item quantity meets the authored minimum.
- Open Container: successful opening recorded by the existing transaction.
- Enter Area / Arrival point: enter the selected event cell, including a successful
  transition to that event. Another valid route to the same point also counts.
- Use Door: successful use of a door with a valid destination.
- Set Flag: existing flag equals the authored value.
- Existing whole-area entry and variable comparisons remain available.

Targets use human-readable area/entity/item selectors and stable stored IDs.
Missing or incompatible targets produce validation warnings. Locked doors and
failed container rewards do not create successful progression facts.

## 5. Editor Authoring UX

In **Quests**, Add quest, edit its name/description, add objectives, choose each
condition and named target, and edit the player-facing text. Move up/down changes
the order; objectives and quests can be deleted. Quest start defaults to an
interaction/action, with an explicit At Play start option. Completion text and
the existing completion-action controls remain in the same editor.

The mounted editor test authors the three-step chain, reorders and restores it,
sets the Keeper start action through the real Map Inspector, saves/reloads via
the store, and deletes objectives/quests. Project loading does not recreate
deleted quests or infer quests from interactions.

## 6. Quest Start

Select the Keeper in Map, expand **Properties & gameplay**, and select
**Start Quest: Harbour Trouble** in Interaction. The existing dialogue is
unchanged. The action runs when the conversation closes, so the same completed
interaction satisfies the first objective. Message triggers and flag interactions
can use the same field; referenced dialogue and existing rules also retain the
shared activation action. Merely defining a new quest does not start it.

## 7. Objective HUD

Phaser and Three share a compact current-objective component: quest title and
current step. Future steps are not shown as current. Existing tracked-quest
selection remains authoritative, with first-active fallback when none is selected.
The existing Phaser quest list remains; no larger journal was built.

## 8. Progression Feedback

Quest-view changes feed the existing non-blocking notification queue:
New Quest, Objective Complete and New Objective. For the chest, the player sees
the existing Harbour Key acquisition feedback alongside completion of Find the
Harbour Key and activation of Enter the shack. Duplicate snapshots/interactions
do not repeat quest progress feedback. Notifications expire automatically.

## 9. Quest Completion

The last step produces **Quest Complete: Harbour Trouble** and the authored
completion message. Existing completion actions now execute through the shared
rule dispatcher with a session-only once guard; this closes a pre-existing gap
between their editor/helper support and gameplay dispatch. Item/flag effects use
the same transactions as rules, including overflow feedback.

## 10. Runtime State

Quest progress, completed objective IDs, observed target facts and reward/action
guards belong to the Play session. Facts are bounded target sets, not an event
log. Item and flag conditions read current state on activation; previously
observed conversations, arrivals and openings are remembered. Progress settles
after gameplay transactions and new arrival facts, never in a render-frame loop.

Project authoring persists through Save/Load. Returning to Edit preserves the
authored data; fresh Play resets progression. No save-game persistence was added.

## 11. Tidewatch Harbour Quest

Import [the browser-authored quest showcase](docs/assets/quest-objectives/tidewatch-harbour.project.json).
**Harbour Trouble** has three steps: Talk to the Harbour Keeper, Find the Harbour
Key, Enter the shack. It starts after the Keeper's existing two-line conversation.
The existing chest grants the key; the existing door still checks and retains it.
The arrival-point objective observes actual successful entry. No chest-specific
quest code, door bypass, collision changes or extra objectives were added.

The original world-kit and interaction showcase files remain unchanged.

## 12. Browser Workflow

The opt-in `@quest-objectives` case in `e2e/gameplay-interactions.spec.ts` imports
the existing interaction showcase, creates all three objectives and the Keeper
start action through controls, saves, then uses real keyboard movement and E.
It checks no active quest initially or during dialogue, key objective activation,
chest feedback, the next objective, keyed entry and quest completion. It compares
the entire saved project after Edit and reload, then completes a fresh Play route.
The harness reads positions/storage only; it does not inject gameplay progress.

Browser result on 17 October 2026: **1 passed in 7.9 minutes**, including both
complete playthroughs, full saved-project equality and zero browser errors.
Inspected evidence:
[objective update](docs/assets/quest-objectives/objective-update.png) and
[quest completion](docs/assets/quest-objectives/quest-complete.png).
The [checkpoint record](docs/assets/quest-objectives/observations.json) contains
the authoring, start, progress, completion, isolation and replay assertions.

## 13. Validation

- Focused quest, migration, interaction/door, rule/progression, editor, persistence
  and adapter tests passed. The mounted authoring test restores its store state
  and verifies that assigning Start Quest preserves the dialogue text.
- Root TypeScript check passed.
- Browser: **1 passed**, as detailed above.
- Final startup edge checks: **3 files / 27 tests passed**. These cover immediate
  completion feedback at explicit Play start, suppression of provisional startup
  arrivals, once-only item completion actions and actual container/door facts.
  These narrow startup corrections were made after the browser route and checked
  deterministically; the interaction-start route remains unchanged.
- Required `npm.cmd run ci`: **invoked once**. Its Vitest stage passed 722 tests
  and hit the unchanged five-second timeout in the existing character-placement
  editor test. That exact test subsequently **passed at its original timeout**
  (4.70 seconds) after keeping the new Start Quest selector out of projects with
  no quests. No timeout threshold was raised. All **723 tests across 94 files**
  therefore have passing results; the initial aggregate command exited 1 and was
  not rerun.
- The stages prevented by that early exit were run in their original order:
  root type-safe build, both contract builds, shared preview package build,
  Studio type-safe build and **63/63 cheap Node compiler tests**. All passed.
  Vite's existing bundle-size advisories remain non-blocking.
- Targeted Biome check: **21 files, zero errors**; non-blocking warnings remain.
- Final `git diff --check`: **passed**. No files were staged or committed.

No Blender matrices or environment visual/performance benchmarks were run.

## 14. Remaining Limitations

- Progress resets on new Play; no save games.
- Entry targets are existing event cells/arrival points, not arbitrary volumes.
- Interaction completion observes message/conversation closure; no new branching
  dialogue or cinematic semantics.
- Existing HUD tracks one quest at a time. No waypoints, markers or expanded journal.
- Browser acceptance targets Three; deterministic tests cover shared gameplay and
  both adapter boundaries. No hardware performance claim is made.

## 15. Recommended Next Feature

**Save-game persistence.** The engine can now author a tiny adventure with useful
session progress. Persist that existing runtime state so players can return to
their inventory, completed steps and current objective. This recommendation is
not implemented in this pass.
