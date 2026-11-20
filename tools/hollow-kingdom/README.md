# Merewatch, The Hollow Kingdom

Import [hollow-kingdom.project.json](../../hollow-kingdom.project.json) into the game editor, select **3D View**, then **Play**. Follow the cobbled lane past the cottage. Oswin stands beside the winding well. Face him and press **E** to talk, then follow the lanterns onto the dock to see the beacon across the mere.

## Rebuild the kit

In-game views from the production build are available for the [cottage lane](../../docs/assets/hollow-kingdom/cottage-lane.png) and the [watchtower from the dock](../../docs/assets/hollow-kingdom/watchtower-from-dock.png).

From the repository root, run the following with Python (Pillow and NumPy), Blender 5.2 and Node. On Windows, use the full path to `blender.exe` if Blender is outside PATH.

```sh
python tools/hollow-kingdom/textures.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/author.py
blender -b --python-exit-code 1 -P tools/hollow-kingdom/wardrobe.py
node tools/hollow-kingdom/village.mjs
```

To rebuild a single prop, append its key to the environment command, for example `-- cottage` or `-- dock`. The scripts regenerate the bundled kit and demo in place. Save edited projects under their own filenames.

| Source | Output |
| --- | --- |
| `textures.py` | Seeded timber, stone, slate, plaster, wool, spruce sprays and night panorama |
| `author.py` and `shore.py` | Ten metre-scale environment GLBs, including a modular four-metre dock. Cottage and lantern GLBs carry punctual lights. |
| `wardrobe.py` | Hooded wayfarer and capped ferryman with skinned clothing, each on the existing 65-bone Golden skeleton |
| `village.mjs` | Area, shore, spawn, object placements and Oswin's interaction in the standard project JSON |

Mesh textures are embedded in the GLBs. The moonlit atmosphere loads the panorama from the same public asset directory. The player and ferryman use the engine's existing Golden animation clips. Keep the public assets and registry entries with the importable JSON when moving it to another engine checkout.

The environment geometry, material maps, outerwear and layout were generated for this project. The two characters use the checked-in canonical humanoid derived from the Quaternius Universal Base Characters Kit. [Source licence](../../public/assets/source/quaternius/License_Standard.txt).
