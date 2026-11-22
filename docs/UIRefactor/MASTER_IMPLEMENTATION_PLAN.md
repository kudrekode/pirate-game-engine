# The Hollow Kingdom — Editor Replacement Programme

**Status:** Implementation handoff / five planned PRs  
**Target agent:** GPT-6.2 Sol High (one lead integration agent, bounded subagents)  
**Design reference:** `hollow_kingdom_complete_editor.html` (standalone, illustrative UX only)  
**Source of truth:** the *actual game-engine repository* and its working `GameProject`, editor store, Three.js runtime, Blender/GLB pipeline, dialogue, quests, and cinematics.

## One-sentence mission

**Replace the editor experience, not the engine.** Build a minimal project list, a four-quadrant project home, and cohesive Asset Creator, Cinematics, Map, and Story workspaces whose controls actually modify, preview, validate, save, and reload real game content.

## How to view the reference

Open `hollow_kingdom_complete_editor.html` in a desktop browser. Follow `Projects → The Hollow Kingdom → [workspace]`. The prototypes are deliberately self-contained: the Asset Creator uses illustrative SVG stand-ins, the Map Editor uses an illustrative 2D map, Cinematics uses an illustrated shot preview, and Story exports illustrative graph JSON. **Do not ship these mock implementations in production; use their structure, interaction patterns, spacing, density, sidebars, tabs and styling.** The project's actual Three.js game and existing authoring data are the implementation substrate.

## Fixed product structure

```
Projects
 ├── Open existing project
 └── New project
          ↓
Project Home — exactly four large quadrants
 ├── Asset Creator: Assets | Animations | Effects
 ├── Cinematics: Simple (default) | Advanced
 ├── Map Editor: Asset Drawer | Tools Drawer | World Details
 └── Story: executable node graph, state, quest and dialogue references

Across the app: project name, breadcrumbs/home, save state, Play/Preview where relevant.
```

Do not add a fifth main quadrant for HUD, settings or Play. Map World Details can link to HUD/defaults/settings and Play remains a global/contextual action. A full HUD layout designer is **out of scope**, but its entry point should remain possible. No production AI model/API integration in these PRs: leave typed/validated operation seams, not decorative generate buttons that imply working generation.

## Cross-workspace ownership and contracts

| Data / action | Owner | Other workspace interaction |
|---|---|---|
| Asset archetype, GLB, rig, materials, effects, animation clips | Asset Creator / existing asset pipeline | Map places references; Cinema binds compatible clips/props; Story points to asset-backed entities |
| Scene area, transform, collision, foliage, terrain, camera markers, NPC placement | Map Editor | Asset base edits deep-link to Assets; Story references placed entity IDs; Cinema frames scene objects |
| Dialogue/quest events, flags, conditions, triggers, state machines | Story | References Maps/NPC IDs and cinematic sequence IDs; **does not** own facial tracks or camera positions |
| Sequence shots, actors, subtitles, motion, voice, audio timing | Cinematics | Story triggers sequences by ID and owns resulting quest actions/flags; cinematic preview is isolated |
| Current health, inventory, active objectives, completed events | RuntimeSession/save-game | Authored project defines defaults; editing/previewing must not mutate live play state |
| HUD appearance and visibility rules | Existing HUD/display layer | Receives runtime data; does not own inventory or quest state |

- Keep **`GameProject` = authored definitions**, **`RuntimeSession` = mutable play session** and editor UI selection/panel states distinct.
- All cross-workspace links use **stable IDs**, never display names or generated file paths as primary keys.
- Asset base vs variant vs instance vs attachment are different concepts; editing a placed instance must not silently rewrite the base.
- Preserve original project migration/import and save-game compatibility. The prior integrity fixes must not regress. Avoid rehashing gameplay identity when only an editor accordion collapses.
- Persist meaningful edits across refresh, switching projects, and JSON export/import. A successful UI click is not enough: verify published project data and rendered result.
- A single validated domain mutation should power manual edits; leave an API-friendly typed action boundary for future coding agents. Undo/redo must be coherent and bounded.
- **Story graph validation:** bad references, invalid port types, unbounded synchronous loops, and duplicate one-shot effects must be diagnosed. A "wait for interaction" node must subscribe to gameplay rather than automatically initiating a conversation.
- **Cinema skip semantics:** complete or skip exactly once, release camera/input ownership, halt audio/animation and preserve correct quest actions.

## Five PRs and why this order

| Order | Branch / PR title | Scope and required outcome | Dependencies |
|---|---|---|---|
| **PR 01** | `feat/editor-01-project-home` — Project selector & shell | Real project list/new-project flow, persistent project identity and four-quadrant Project Home; legacy editor destinations still work | existing editor/persistence |
| **PR 02** | `feat/editor-02-assets` — Asset Creator replacement | New library + dual real model preview, category inspector, variant/save workflow, compatible animation browsing/editing and small supported effects surface | PR 01 |
| **PR 03** | `feat/editor-03-cinematics` — Cinematics replacement | Storyboard-first editor, shot presets, advanced timeline/settings and real preview wired to existing 3D cinematic system | PR 01–02 |
| **PR 04** | `feat/editor-04-map` — Map Editor replacement | Real Three.js scene, fast editor-camera navigation, 3 drawers, object inspector, brushes, foliage, water/world settings and scene hierarchy | PR 01–03 |
| **PR 05** | `feat/editor-05-story` — Story graph replacement | Unified visual node editor, types, typed references and actual runtime event/action/condition execution with save-safe branching | PR 01–04 |

The per-PR specs are in `specs/PR_01_...md` through `PR_05_...md`. Each is a self-contained engineering handoff plus acceptance criteria. PR 01 establishes the component/layout primitives all later PRs reuse. Existing Cinematics, Map and Story remain reachable in PR 01–04; a single feature PR must not remove old editing controls until parity is established.

## Branch strategy — NOT one giant PR

**Recommended:** one master spec (this file) + **five sequential, separately reviewable PRs**. After each PR is tested and merged, branch the next PR from the updated main branch. That avoids simultaneous edits to `src/App.tsx`, the section registry, `GameProject`, and Zustand store.

```
# First, save all existing Merewatch work in a normal commit.
git status
# Review changes, then commit from a workspace with .git write permissions.

# For each milestone, after prior PR is merged:
git switch main
git pull --ff-only origin main
git switch -c feat/editor-01-project-home
# implement, test, commit, open PR, merge
# Repeat with feat/editor-02-assets, then -03-cinematics, -04-map, -05-story.
```

If independent development must overlap, use **stacked branches from the previous feature branch** and keep one integration owner. Do **not** ask five agents to create five branches off main and independently rewrite the same navigation files. Use subagents inside a PR only for disjoint modules/tests. Agents must not claim commits succeeded if `.git/index.lock` is blocked: report the diff and exact manual commands.

## Sol High execution protocol

1. **One lead agent owns integration.** Start each PR with the corresponding spec and this master; do a focused repository inspection, not a repeated whole-repo audit. Use existing audit as a hypothesis and verify actual current code.
2. Assign at most **two or three parallel subagents** for work with non-overlapping files/ownership (for example, UI shell visual components vs persistence regression tests). Do not parallelise changes to shared `App.tsx`, project schema or runtime transactions.
3. Build real functionality before adding decorative controls. A nonfunctional prototype control must be disabled or explicitly labelled future, not presented as implemented.
4. Validate in increasing scope: focused unit tests → typecheck/build → relevant Playwright/browser scenarios → full CI. In later PRs replay the same Merewatch gameplay path: talk to Oswin, complete/skip cinematic, fight, boat, ride, save/continue.
5. Visually compare real screenshots at ~1440×900 with `refs/*.png`, checking **layout and density**, not pixel-perfect illustrative scenes. Test narrower desktop/laptop sizes and keyboard focus.
6. Preserve working feature implementations and old project content. Ensure import/export/migrations when schemas change.
7. Commit tested milestones when permitted. Produce screenshots, evidence table and remaining limitations. Stop expanding a PR when its acceptance criteria are met.

### Required PR report format

- Files/modules changed and why; reused systems vs new adapters.
- Each acceptance criterion: passed / partial / failed, with browser or test evidence.
- Tests run, totals, failures/flakes and follow-up reruns; do not claim flaky failures equal a clean suite.
- Screenshot(s) of working UI, plus minimal click path to reproduce.
- Data migration and saved-game/project compatibility.
- Explicit gaps, mocks, deferred functionality, performance observations.
- Git commit/branch status and outstanding worktree changes.

## Integration smoke journeys (run after EVERY PR where relevant)

1. **Project survival:** import existing `hollow-kingdom.project.json` → open → edit → save → reload → reopen → resume play; duplicate named projects stay separate.
2. **Asset round trip:** select Oswin → preview real GLB / animation → save a variant → use in world → reload → retains visual and attachment refs.
3. **Cinematic round trip:** open The Light Across the Mere → edit shot → preview isolated session → return to scene → skip and full completion behave once; no stuck camera or audio.
4. **Map round trip:** place a cottage/forest brush → numeric transform → undo/redo → reload → real scene reflects saved data; editor camera WASD does not move runtime character.
5. **Story round trip:** new-game spawn → wait for Oswin interaction → play cinematic → objective → Has Item branch → wait/recheck loop → save/continue; branches and one-time rewards are correct.

## Explicit non-goals for this programme

- Do not port TypeScript/Three.js to C++ or rewrite the engine.
- Do not build accounts, collaboration, a cloud database, hosted Blender workers, API key vault or paid AI orchestration.
- Do not require AI to edit ordinary game content; manual controls must work end-to-end.
- Do not replace real rendered GLBs/scenes with SVGs/iframes from this reference document.
- Do not implement an entirely new quest-runtime engine where existing runtime helpers can be adapted.
- Do not undertake full facial motion capture, professional animation compositing, advanced rig retargeting or a new physics engine; keep extension points for later.

## Lead-agent launch prompt

> Implement **PR 01** according to `MASTER_IMPLEMENTATION_PLAN.md` and `specs/PR_01_PROJECT_HOME.md`. The HTML reference specifies layout and interaction, not production logic. Inspect the current repository first, then implement and integrate the smallest complete functional milestone on a feature branch. Reuse all existing project, runtime and editor systems. Do not start PR 02 or replace other editors in this run. Use bounded, non-overlapping subagents only where helpful. Test in browser, run relevant automated checks, and show evidence and known gaps. **Do not stop at a plan.**

For each subsequent PR, substitute its number/spec, explicitly point to the latest merged baseline, and keep all other requirements intact.
