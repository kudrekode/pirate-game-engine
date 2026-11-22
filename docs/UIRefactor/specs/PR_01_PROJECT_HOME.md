# PR 01 — Project List, Four-Quadrant Home & Shared UI Shell

**Branch:** `feat/editor-01-project-home`  
**Dependency:** existing current main branch after Merewatch gameplay/asset/cinematic work committed.  
**Visual source:** `hollow_kingdom_complete_editor.html` → Projects → The Hollow Kingdom → Project Home.

## Objective

**Replace the application navigation UI** with a minimal project list and a project-specific home screen containing exactly four large equally weighted destinations: **Asset Creator**, **Cinematics**, **Map Editor**, **Story**. Build a consistent shared shell for later workspaces **without removing any existing editor functionality**.

## Experience / layout

- App opens to Projects (not directly into a giant 14-tab editor). Main body: existing project cards/list and **New Project**. Project name, last modified, optional thumbnail; keyboard accessible. No statistics dashboard or onboarding wizard.
- Click a project to enter its Project Home. Header shows Home/Back, current project name, save state, access to project list, Play where relevant. Four quadrants form a responsive 2×2 grid, each with large icon, title and short description.
- Clicking a quadrant routes to an existing functioning section at first. The other sections remain accessible through an organised secondary route/menu while later PRs replace their UI. Do not delete specialised panels yet.
- Each workspace can return to the Project Home or project list without unsaved work loss. On project switching, warn on unsaved changes and finish/save/cancel gracefully.
- Style: professional dark editor slate/forest, restrained accent, consistent type scale, controls, separators and focus indications. Not a fantasy HUD.

## Real multi-project behaviour (not mock cards)

- Inspect `src/App.tsx`, the store, autosave/recovery, `migrateProject` and `gameSaveProjectId` before implementation. Audit described a manual storage slot and autosave draft; verify the currently merged implementation.
- Add a lightweight project index and durable selection using the existing local-first persistence system; localStorage or IndexedDB is an implementation choice based on existing conventions and size. **Do not accidentally overwrite one project when opening another.**
- Each project has a stable identity distinct from display name and editor-only UI state. Persist name, last modified, schema version and underlying authored `GameProject` reference/content.
- Migrate existing single-project/manual/autosave data into the new navigation **non-destructively**, with recovery choice retained if a draft differs.
- New Project creates valid defaults through existing constructors/migrations and opens the home; import/export continue to work. Support rename and delete/archive only if easy to implement safely; if delete is available require confirmation.
- Opening a different project must not expose unrelated RuntimeSession saves or silently replace them. Existing save identity compatibility must be retained.

## Reuse / likely touched code

- `src/App.tsx`, `src/editor/sections/index.ts`, project store and persistence helpers, migration/recovery utilities, current navigation and keyboard handlers. Create new shell/home/list components as needed.
- One integration owner must control shared navigation files; independent tests/styling tasks can be delegated.
- Prefer route/workspace registry over hard-coded links in all components; expose stable `openWorkspace()`, `openEntity()` navigation contract for PRs 02–05.

## Acceptance criteria / proof

1. Legacy Merewatch project opens correctly from Projects and shows four quadrants.
2. Create Project B, save a change; switch to Merewatch and back; edits are isolated and survive reload.
3. Legacy autosave recovery still works, as does JSON import/export; invalid import cannot destroy a valid open project.
4. Open each quadrant, reach existing editor, return home without project reset or runtime session corruption.
5. Play/Continue works for Merewatch and does not change after a UI-only navigation change.
6. No duplicate project IDs when two projects share the same name; project last-modified metadata is accurate.
7. Keyboard focus, active route, responsive 1440×900 and smaller laptop layout all usable.
8. Relevant recovery, migration, project save, UI navigation tests pass; browser smoke test covers real project switching.

## Out of scope / guardrails

No Asset, Cinema, Map or Story internal rewrite here. No cloud accounts/backend, no new gameplay systems, no AI API. Keep existing hidden/legacy destinations accessible until replaced. Don't claim multiple projects work if only the UI list exists.

## Done report

Screenshots of Projects and Home; test names and results; migration strategy; file touch list; Git branch/commit status; a paragraph describing compatibility with existing projects and saves.
