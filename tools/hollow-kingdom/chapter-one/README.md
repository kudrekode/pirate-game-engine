# Play The Wyrm Beneath the Mere

This standalone Chapter One project starts after the events of *The Last Watch*. Oswin has read Mara's letter and still has no word of her. The chapter and *The Last Watch* have independent project and game saves.

1. From the engine repository root, install dependencies with `npm.cmd ci` and start the app with `npm.cmd run dev` in Windows PowerShell. On macOS or Linux, use `npm` for both commands.
2. Open the URL printed by Vite. From **Projects**, select **Import JSON** and choose `hollow-kingdom-chapter-one.project.json` from the repository root.
3. Open **Map Editor**, select **3D View**, then **Play**. The **Test Flow** button in **Story** also starts 3D Play. Speak to Oswin at the winding well just ahead. Follow the current objective on screen.
4. Use **Save Game** when standing clear of enemies and outside conversations. To resume, open the same imported project, select **Play**, and choose **Continue**. Good places to save are the chapel steps and the first cavern chamber.

| Action | Control |
| --- | --- |
| Walk, sprint, jump | WASD or arrows, Shift, Space |
| Look around | Click the viewport to capture the mouse. Esc releases it. |
| Talk, inspect, board, mount and dismount | E near the target |
| Equip the Ferryman's Hanger | Open Inventory with I and select Equip |
| Sword or bow | Face the enemy and press F for the sword. With the bow equipped, hold F to draw and release F to fire. |
| Skip a cinematic | Esc or **Skip cinematic** |

## Rebuild

The game JSON is generated from `hollow-kingdom.project.json` and the chapter's `locations.mjs` and `story.mjs`. The build writes a separate project and the original horn cue. It leaves the Merewatch source project in place.

From the repository root with Node.js and Blender 5.2, run:

```powershell
node tools/hollow-kingdom/chapter-one/build.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 -P tools/hollow-kingdom/chapter-one/ruins.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 -P tools/hollow-kingdom/chapter-one/drake.py
```

The Blender scripts export to `public/assets/hollow-kingdom/chapter-one` and re-import their outputs to check the round trip. `ruins.py` uses the existing Merewatch materials. `drake.py` produces the skinned GLB, its embedded animations and a metadata record. The project uses the assets registered by this checkout.

The targeted Chromium scenario uses the existing Playwright harness. From PowerShell:

```powershell
node node_modules/@playwright/test/cli.js test e2e/hollow-kingdom-chapter-one.spec.ts --grep '@chapter-one' --workers=1
```

See the [engine reuse report](../../../docs/reports/CHAPTER_ONE_ENGINE_REUSE.md) for provenance and verification results.
