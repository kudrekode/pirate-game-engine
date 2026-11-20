# Merewatch, The Hollow Kingdom

Import [hollow-kingdom.project.json](../../hollow-kingdom.project.json) into the game editor, select **3D View**, then **Play**. Walk up the cobbled lane to the well and speak to Oswin. His daughter's beacon has burned for three nights. Ask about the light and take his blade to begin **The Last Watch**.

| Action | Control |
| --- | --- |
| Move | WASD or arrow keys |
| Talk, search a box, mount, board or dismount | E near the target |
| Equip the Ferryman's Hanger | I, then Equip |
| Strike | Face a poacher and press F |
| Canter | Hold Shift while riding |
| Resume | Use Save Game during Play, then choose Continue the next time you play this project |

The dirt track branches east from the cottage end of the lane. The poachers keep their coffer under a lamp. Bracken grazes east of the well and can carry you part of the way to camp. Once you have the beacon key, return to the original dock. Board Oswin's skiff along its right edge and sail to the lamplit jetty opposite. Step ashore, follow the keeper's path to the dispatch box and bring the letter back to Oswin.

In-game views: [the woodland encounter](../../docs/assets/hollow-kingdom/pine-lookout.png), [riding Bracken](../../docs/assets/hollow-kingdom/riding-bracken.png) and [Oswin's skiff at the watchtower](../../docs/assets/hollow-kingdom/oswins-skiff.png).

## Rebuild the kit

In-game views from the production build are available for the [cottage lane](../../docs/assets/hollow-kingdom/cottage-lane.png) and the [watchtower from the dock](../../docs/assets/hollow-kingdom/watchtower-from-dock.png).

From the repository root, run the following with Python (Pillow and NumPy), Blender 5.2 and Node. On Windows, use the full path to `blender.exe` if Blender is outside PATH.

```sh
python tools/hollow-kingdom/textures.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/author.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/wardrobe.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/skiff.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/horse.py
node tools/hollow-kingdom/village.mjs
npx biome format --write hollow-kingdom.project.json
```

To rebuild a single prop, append its key to the environment command, for example `-- cottage` or `-- dock`. The scripts regenerate the bundled kit and demo in place. Save edited projects under their own filenames.

| Source | Output |
| --- | --- |
| `textures.py` | Seeded timber, stone, slate, plaster, wool, spruce sprays and night panorama |
| `author.py` and `shore.py` | Ten metre-scale environment GLBs, including a modular four-metre dock. Cottage and lantern GLBs carry punctual lights. |
| `wardrobe.py` | Wayfarer, ferryman and hooded poacher with skinned clothing on the Golden skeleton |
| `skiff.py` | Oak rowing boat, embedded texture, waterline and seat measurements |
| `horse.py` | Rigged bay mare, three gait clips, animated saddle, Golden rider clip and round-trip measurements |
| `village.mjs`, `encounter.mjs`, `lake.mjs` | Village layout, woodland encounter, lake crossing, watchtower landing and quest in the standard project JSON |

Mesh textures are embedded in the GLBs. The moonlit atmosphere loads the panorama from the same public asset directory. The player and ferryman use the engine's existing Golden animation clips. Keep the public assets and registry entries with the importable JSON when moving it to another engine checkout.

The environment geometry, horse, material maps, outerwear and layout were generated for this project. The human characters use the checked-in canonical humanoid derived from the Quaternius Universal Base Characters Kit. [Source licence](../../public/assets/source/quaternius/License_Standard.txt).
