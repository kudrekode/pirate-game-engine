# The Hollow Kingdom — Complete Editor Design Handoff

This bundle is intended to accompany **five successive implementation PRs**, not one giant rewrite.

## Start here

1. Open `hollow_kingdom_complete_editor.html` in a desktop browser. No server needed.
2. Visit **Projects → The Hollow Kingdom**, then click each of the **four quadrants**.
3. In Asset Creator, switch between **Assets / Animations / Effects**. In Cinematics, toggle **Simple / Advanced**. In Map, try tools/drawers. In Story, try adding/connecting nodes.
4. Read `MASTER_IMPLEMENTATION_PLAN.md` for architecture, boundaries, branch strategy and agent instructions.
5. Hand **only the current PR** to Codex alongside this master and HTML. Use `specs/PR_01_...md` first, then 02 → 03 → 04 → 05 after integration.

## File index

| File | Purpose |
|---|---|
| `hollow_kingdom_complete_editor.html` | One self-contained interactive prototype with all four workspaces |
| `MASTER_IMPLEMENTATION_PLAN.md` | Programme roadmap, data ownership, PR sequencing, branch strategy, Sol High execution prompts |
| `specs/PR_01_PROJECT_HOME.md` | Project List, New Project, stable local persistence, four-quadrant home and shell |
| `specs/PR_02_ASSET_CREATOR.md` | Asset library, dual real-GLB previews, rig/pose, variations, attachments, animations and effects |
| `specs/PR_03_CINEMATICS.md` | Storyboard-first Simple mode plus Advanced controls, actual 3D cinema integration |
| `specs/PR_04_MAP_EDITOR.md` | Three drawers, Three.js editor navigation, terrain/foliage/water, world details and object inspector |
| `specs/PR_05_STORY_EDITOR.md` | Executable node graph with entry/wait/action/condition/flow, references, save-safe progression |
| `refs/*.png` | Five layout reference screenshots including Simple and Advanced Cinema |

## Critical limitation of the HTML reference

**The HTML is an interactive UX specification, not a production engine.** Its SVG drawings and mock scene map are placeholders. It does not load the actual Three.js game, write `GameProject`, generate GLBs, launch Blender, persist your projects, or make AI API calls. Some HTML prototype controls operate only in browser memory. Use it to reproduce visual layouts and workflows; **the existing repository is the source of truth for functionality**.

## Recommendation on branches and agents

Use **one master spec + five sequential PRs**. Branch each PR from the latest *merged main*, not concurrently from an old main snapshot. GPT-6.2 Sol High is a reasonable lead model for each focused milestone. Subagents may own 2–3 non-overlapping tasks but not shared project schema, central app navigation or runtime code simultaneously. Don't merge untested partial work or fake success. Preserve and commit the already-working Merewatch game before starting PR 01.
