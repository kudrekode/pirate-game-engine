# Phase 2 — Core Correctness & Runtime Parity Result

## 1. Summary

Phase 2 fixes recovery precedence and storage failure reporting, implements authored
Three dialogue through the existing dialogue engine, makes movement deadlines
session-owned, aligns gameplay blocking across both adapters, and establishes a
shared startup sequence that records the actual gameplay area before automatic
quest evaluation. Editor defaults remain isolated from play state.

This is a focused correctness change. No large component extraction, asset
packaging, dependency change, framework, schema redesign or new gameplay system
was introduced. Phase 1 validation routing remains in place.

## 2. Behaviour Before / After

| Issue | Previous behaviour | Required and implemented behaviour |
| --- | --- | --- |
| Save A / draft B | Startup preferred any manual save; autosave could replace a newer draft with that older project. A corrupt manual save also prevented valid-draft fallback. | Independently parse/migrate both records. Different valid copies require an explicit choice. Loading or waiting never writes either slot. One valid copy loads despite corruption in the other. |
| Storage failures | A write could escape as an exception; recovery status did not reliably distinguish a failed write. | Catch manual/autosave failure, retain in-tab edits, show a short status message. Do not mark a failed save clean or show a failed autosave timestamp. |
| Three dialogue | Direct dialogue requests produced status text. | Display authored text/choice/end nodes, condition-filter choices, run reached-node actions through shared rule context, and clear session dialogue on completion. Invalid paths fail safely. |
| Movement cadence | Shared movement returned duration without enforcing it; Three accepted immediate repeats. Phaser also waited for tween completion. | A successful grid step commits a shared session deadline. Inputs before it are ignored; inputs exactly at it are eligible. Rendering completion cannot delay/release eligibility. |
| Blocked gameplay | Three attack handling bypassed cutscene/end checks. Shop blocking and NPC pauses differed. | Both adapters block movement, interaction and attack during startup, cutscene, dialogue, shop and end states. NPC ticking also pauses in those states. Attack cooldown remains enforced. |
| Startup | The editor-active area could be marked entered and rewarded before game-start rules/progression selected the real spawn. | Finish game-start rules and initial progression, commit the actual area, synchronize automatic quests/rewards, then dispatch its initial area-entry rules once. Intro cutscenes suspend this sequence. |

Two closely related defects found while testing were also corrected: Phaser now
allows exiting a choice node with no available choices, and Three rule/node
cutscenes fire `on_cutscene_end` before their action continuation, matching Phaser.

## 3. Tests Added

Regression tests were added before the initial production fixes. The initial
pre-fix run recorded 18 failures and an uncaught storage-write error across the
recovery/movement/Three files. Phaser boundary failures separately exposed timing
and shop gating. Test-fixture mistakes found during iteration were corrected;
those are not counted as engine defects. Additional targeted red tests exposed
empty-choice dead ends, missing NPC pauses and startup wait initialization order.

- `src/test/projectRecovery.test.tsx` — nine scenarios: distinct save/draft choice
  and preservation, unrelated draft, both valid/corrupt directions, identical raw
  copies, both invalid, manual/autosave failure, retry after edit, and historical
  single-map storage compatibility.
- `src/runtime/playerMovementTransaction.test.ts` — immediate repeat, exact
  deadline, four player speeds, and collision attempts not consuming a deadline.
- `src/runtime/AdventureScene.test.ts` — nine adapter tests: clock eligibility
  without tween completion; one touch/trigger dispatch per accepted step;
  cutscene/dialogue/end/shop blocking; real spawn area, reward and once-only entry
  rule; rendered dialogue nodes/choice effect/resume; empty choices; attack
  cooldown and shop-close resume. Phaser drawing/input primitives are stubbed,
  while session, progression, dialogue and combat logic execute normally.
- `src/runtime/three/ThreeRuntimePanel.test.tsx` — fifteen added cases: visible
  dialogue and filtered choices, selected-node effects, completion and invalid
  references/paths, node cutscene continuation and end rules, repeated keydowns,
  cutscene/end/shop blocking, cooldown, startup reward/area ordering and intro
  resume, plus NPC pause/resume for dialogue and shop. Existing boat tests now
  advance a controlled clock to the deadline before dismounting.
- `src/runtime/runtimeProgression.test.ts` — three cases: deferred game-start
  effects and intro cutscene before real spawn, once-only automatic rewards and
  entry dispatch, fallback area without a spawn, and initialized trigger-wait
  state visible to entry callbacks.

Existing dialogue-engine, combat, session, dispatcher, progression and editor
smoke suites remain part of verification. New assertions use observable state,
rendered content, presentation callbacks, storage or controlled clocks.

## 4. Runtime Semantics Established

### Recovery precedence

Raw browser slots are retained. There is no invented timestamp, identity or
version envelope: legacy records cannot reliably establish relative age. If both
migrated projects are valid and differ, ask which to open. Identical copies prefer
the save without a prompt. Otherwise use the valid copy; with neither valid, show
the starter chooser without autosaving. Reading a copy is not an edit. A later
edit replaces the draft after the existing debounce; Save replaces the manual
slot. The unresolved/unchosen draft survives opening the saved copy. Draft-only
recovery remains dirty until manual Save succeeds. Export/import is unchanged.

### Startup order

Create isolated session/presentation → run `on_game_start` to completion → process
initial progression, including suspended cutscenes → establish a playable wait,
completion or end boundary → mark the actual current area entered → first
automatic quest sync/rewards → dispatch initial `on_area_enter` once. Provisional
areas are not visits. Without a spawn, the active/fallback area is the real area.
Explicit authored quest actions still execute in their normal order. Subsequent
area transitions keep their existing semantics.

### Movement and blocking

On acceptance, position changes immediately and `nextMoveAt` becomes current
monotonic adapter time plus the existing speed/vehicle duration. Collision failure
does not consume an interval. Inputs at or after the deadline are eligible when
no startup/modal/end blocker remains. Teleport/spawn resets the movement deadline.
Phaser touch/trigger dispatch now accompanies the authoritative step instead of
waiting for its tween. Tween/RAF interpolation remains adapter presentation.

The small `runtimeInput` predicate handles session startup/shop/dialogue plus
adapter cutscene/end flags. Movement, interaction and attack share this policy
and the movement deadline. Combat also checks its own attack cooldown. NPC ticks
pause for blocked gameplay states, but continue during ordinary player movement.

### Dialogue ownership

`RuntimeSession.dialogue` contains the existing engine's dialogue id, node id and
entered-node set. `dialogueEngine` owns advancement, availability and once-per-
conversation node effects. Effects on the node selected by a choice use the shared
rule dispatcher; the schema has no separate choice-action field. The adapter
presents a node after its actions finish, including asynchronous cutscenes.
Ending dialogue clears its session state; other blockers still apply.

## 5. Phaser / Three Parity

Tested equivalence now covers movement eligibility/deadlines, blocked-state player
input, attack cooldown, actual-area startup and once-only rewards, modal NPC
pausing, authored dialogue transitions/effects, and empty-choice escape.

Deliberate presentation differences remain: Phaser uses canvas dialogue/portrait
presets and tweens; Three uses React text/choice overlays and RAF interpolation.
Phaser polls held directions, while Three consumes keyboard events; both enforce
the same earliest eligible gameplay time. OS key-repeat cadence is not made into
a new input subsystem. This report does not claim exhaustive adapter parity.

## 6. Compatibility

No persisted `GameProject` fields or export shape changed. Current raw saves and
historical single-map saves still use existing migration. Added deadline,
startup and dialogue fields exist only in the isolated runtime session. Legacy
direct interactions remain supported. Inventory, quests, NPC state and rewards
continue to use the existing shared helpers. Assets and compiler inputs are
untouched.

## 7. Validation Results

- Focused verification: **148 tests passed across 10 files**; after the final NPC
  pause/startup additions, the affected three runtime files passed **59 tests**.
- Root TypeScript check passed.
- Existing targeted browser animation smoke: **1 passed, 21.0 seconds**. It
  exercised real input, movement acceptance and walk/idle/attack transitions.
- **`npm run ci` passed, run once**: 613 Vitest tests across 73 files (73.78 s),
  root type-safe build, both contract builds, shared-preview build, Asset Studio
  type-safe build, and all 40 cheap Node compiler/retarget tests. This is **42 new
  tests** relative to Phase 1's 571. Existing large-chunk build warnings remain.
- **`git diff --check` passed**. Git's Windows LF/CRLF notices are informational.

Local logs are under `test-results/phase2-*.log` (ignored validation artifacts).
No broad browser sweep, performance benchmark, Blender rebuild or compiler gallery
was run. The ordinary cheap compiler tests are owned by CI.

## 8. Deferred Findings

- **P2, existing interaction combination:** code review shows Three's handled-touch
  path does not always continue a co-located progression `wait_for_trigger`, whereas
  Phaser supplies a continuation. This was not changed as part of dialogue/input/
  startup fixes; authored maps combining those mechanisms need a focused follow-up
  regression and an explicit ordering decision. Broader legacy interaction parity
  is not proven by this phase.
- **P2, presentation:** Three dialogue portrait/layout polish and broader
  camera/model normalization remain outside this correctness pass.
- **P2, persistence limitation:** browser storage is still one manual slot and one
  draft slot. Different untimestamped copies may prompt again on restart until
  later editing/saving makes them agree. Multi-project history and multi-tab
  conflict resolution were not introduced.
- Large-file extraction, asset packaging and later audit phases remain deferred.

## 9. Recommendation

The audited recovery, dialogue, cadence, blocked-input and startup issues have
focused regression coverage and full CI passes. Normal incremental feature
development can resume on these contracts. Three remains experimental;
verify authored games that combine touch interactions and progression waits, and
do not infer complete parity from this bounded pass. No large-file refactoring
or subsequent phase is started here.
