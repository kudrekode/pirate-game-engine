# The Heron's Well

Seven selectable game assets for Merewatch. The [playable study](../../merewatch-art-study.project.json) opens near Oswin's well in the blue-hour village. Import it from Home and choose **Play → Play 3D Experimental**. Oswin stands beside the well, the Wyrm rests on the bank, Edric waits by the cottage, and Bracken grazes south-east of the well at **(28, 52)**. Press **I** to equip the hanger, **F** to swing and **E** beside Bracken to mount.

[Matched studio comparisons](../assets/art-library/comparison.jpg) · [File and hash index](../assets/art-library/checkpoint.json)

## Finished batches

Each Blender source opens independently with its required textures packed. The GLBs use separate registry IDs, so a saved project can select either edition. The table counts triangles and glTF primitives from the game files. A primitive count describes the mesh groups in the asset. A scene can submit more draws for shadows or multiple instances.

| Library asset | Files | Triangles, old → new | Primitives, old → new | Game contract and close-range limitation |
| --- | --- | ---: | ---: | --- |
| [Oswin, Ferry Warden](../../tools/hollow-kingdom/art-library/humans/README.md) | [Blender](../../tools/hollow-kingdom/art-library/humans/oswin.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/humans/oswin.glb) | 15,832 → 38,492 | 11 → 7 | A posed, fitted cape, reefer coat, deck cap and belt gear on the 65-joint Golden rig. The beard remains rigid and a small ochre patch shows at one shoulder on the walking step. |
| [Edric, Bell Court Keeper](../../tools/hollow-kingdom/art-library/humans/keeper/README.md) | [Blender](../../tools/hollow-kingdom/art-library/humans/keeper/keeper.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/humans/keeper/keeper.glb) | 18,936 → 38,980 | 14 → 5 | Sallet, bevor, articulated harness and court badge. The shipped ward and sword strike retain the right-hand socket and fingertip positions. The fingers remain slightly open in ward, and raising the arm exposes the pauldrons' dark lining. |
| [Blackwater Wyrm](../../tools/hollow-kingdom/art-library/creatures/BLACKWATER.md) | [Blender](../../tools/hollow-kingdom/art-library/creatures/blackwater-wyrm.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/creatures/blackwater-wyrm.glb) | 14,118 → 37,834 | 10 → 7 | Joined shoulders and hips, articulated jaw, keratin horns and pleated gills. All 23 joints and eight clips survived re-import. The hind ankle is angular and the shield plates repeat along the back. |
| [Bracken, Road Mare](../../tools/hollow-kingdom/art-library/creatures/BRACKEN.md) | [Blender](../../tools/hollow-kingdom/art-library/creatures/bracken-road-mare.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/creatures/bracken-road-mare.glb) | 34,888 → 48,556 | 11 → 13 | Bay coat, woven saddlecloth, fitted tack and moving seat on the 20-joint rig. Idle, walk and canter preserve saddle travel. The unmounted reins sit high and the forelock planes show in a close side view. |
| [Heron Well](../../tools/hollow-kingdom/art-library/waterworks/README.md) | [Blender](../../tools/hollow-kingdom/art-library/waterworks/heron-well.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/waterworks/heron-well.glb) | 1,946 → 18,464 | 6 → 1 | Static, metre-scale scenery with the original traversal profile. The slates, coiled line, coopered pail and mussel tablet carry the close view. Slate repetition and the folded ivy leaves are visible up close. |
| [Tide Lantern](../../tools/hollow-kingdom/art-library/waterworks/README.md) | [Blender](../../tools/hollow-kingdom/art-library/waterworks/tide-lantern.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/waterworks/tide-lantern.glb) | 272 → 4,484 | 4 → 2 | Static scenery with the original traversal profile and a warm punctual light. Eight horn panes sit under a ventilated copper hood. Their brightness stays steady and the finer tracery recedes with distance. |
| [Heron Hanger](../../tools/hollow-kingdom/art-library/armoury/README.md) | [Blender](../../tools/hollow-kingdom/art-library/armoury/heron-hanger.blend) · [GLB](../../public/assets/hollow-kingdom/art-library/armoury/heron-hanger.glb) | 920 → 9,018 | 3 → 1 | Rigid, grip-centred sword on the existing right-hand socket. The side rails, wrapped grip, pommel and shell emblem change the silhouette. The engraved ferry mark needs a close view. |

The new models use more geometry. Oswin, Edric, the Wyrm, the well, lantern and hanger each use fewer mesh primitives. Bracken adds two. These measurements cover the individual game files and the small playable study. Large-world crowd and frame-time measurements are still open.

## Play evidence

The study and the comparison control use the same placements, camera poses, lighting, gameplay rules and renderer. The control substitutes the shipped models at import. Studio comparisons fix the animation frame as well as the camera. In Play, actors advance their ordinary independent idle clocks.

| View | Shipped | Library edition |
| --- | --- | --- |
| The well court | [Before](../assets/art-library/play/well-court-before.png) | [After](../assets/art-library/play/well-court-after.png) |
| Oswin by the well | [Before](../assets/art-library/play/ferryman-before.png) | [After](../assets/art-library/play/ferryman-after.png) |
| Edric at the cottage | [Before](../assets/art-library/play/keeper-before.png) | [After](../assets/art-library/play/keeper-after.png) |
| Wyrm at the shoreline | [Before](../assets/art-library/play/wyrm-before.png) | [After](../assets/art-library/play/wyrm-after.png) |
| Bracken with the Wayfarer mounted | [Before](../assets/art-library/play/bracken-before.png) | [After](../assets/art-library/play/bracken-after.png) |

The browser imported the project through Home, opened 3D Play, loaded all seven models, equipped the hanger and played the sword attack. The player walked to Bracken, mounted through the normal interaction and played the external rider clip. The receipts include the exact GLB hashes, character clips, camera poses and asset fallback counts. [Shipped run](../assets/art-library/play/before.json) · [Library run](../assets/art-library/play/after.json)

The existing Bell Court guard case also ran against Edric and the Heron Hanger. It used a temporary copy of the arena with `bell-keeper` mapped to `bell-tide-keeper` and `bell-hanger` to `mere-heron-hanger`. The first run reached victory with 90 of 112 health and missed the full-health assertion. The isolated repeat passed the original check at 112 of 112. Both characters carried their weapons, and the repeat recorded zero missing or incompatible clips. [Windup](../assets/art-library/play/duel/guard-01-windup.jpg) · [Riposte](../assets/art-library/play/duel/guard-03-riposte.jpg) · [Duel trace](../assets/art-library/play/duel/guard.json)

## Checkpoint and repository checks

On 27 November 2026 the seven packed Blender sources, seven final GLBs, 34 matched studio renders and ten matched village views were saved in the working tree. Git denied creation of the feature-branch lock, so the checkpoints are recorded by file and SHA-256 in the index. The complete procedural rebuilds use the original Merewatch and Bell Court assets in this checkout. Each packed source can be re-exported independently.

The full CI invocation passed 1,148 of 1,151 Vitest tests. Three editor smoke cases exceeded their existing 15-second limit. All three passed on a focused rerun with the same limits. The root app, both contract packages, Three preview package and Asset Studio builds passed when run after the stopped gate. All 78 Node compiler checks passed. Biome and `git diff --check` also passed.

## Reproduce the study

Each family guide above has separate Blender rebuild, re-export and render commands. The demonstration project is authored from the existing Merewatch field study. These optional commands rebuild its JSON and recapture the in-game plates. They run from the repository root.

```powershell
node tools/hollow-kingdom/art-library/showcase.mjs
npx.cmd biome format --write merewatch-art-study.project.json
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/art-library-build',copyPublicDir:false}})"
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/hollow-kingdom/art-library/capture.mjs test-results/art-library-build before
node tools/hollow-kingdom/art-library/capture.mjs test-results/art-library-build after
python tools/hollow-kingdom/art-library/catalogue.py --check-play
```

The last command makes the thumbnails and comparison sheet from the Blender photographs. It also checks that each finished GLB matches the in-game receipt before writing the checkpoint index. A single asset's thumbnail can be rebuilt with `--asset`, for example `--asset waterworks/heron-well`.
