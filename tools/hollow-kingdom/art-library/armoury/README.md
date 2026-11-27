# Heron Hanger

Oswin's hanger carries the same scallop emblem as the well. The new silhouette has a swept, broad-tipped blade, open side rails and a chased knuckle bow. A continuous strip of leather winds around the oval grip. The blade's surface follows its centreline so the ferry mark and engraved river pattern stay inside the fuller.

| Deliverable | File |
| --- | --- |
| Editable source | [heron-hanger.blend](heron-hanger.blend) |
| Game export | [heron-hanger.glb](../../../../public/assets/hollow-kingdom/art-library/armoury/heron-hanger.glb) |
| Full-length comparison | [Bell Court hanger](../../../../docs/assets/art-library/armoury/whole-before.jpg) · [Heron Hanger](../../../../docs/assets/art-library/armoury/whole-after.jpg) |
| Hilt comparison | [Bell Court hanger](../../../../docs/assets/art-library/armoury/hilt-before.jpg) · [Heron Hanger](../../../../docs/assets/art-library/armoury/hilt-after.jpg) |
| Packed-source round trip | [Dimensions, triangle count and hashes](../../../../docs/assets/art-library/armoury/hanger.json) |

The mesh is rigid and uses the game's existing right-hand attachment and sword action. The grip is the local origin and the blade points along glTF +Y. The exported game file has one primitive and three embedded PBR maps. In the playable study, the inventory contains the hanger at spawn. Press **I**, equip **Ferryman's Hanger**, close the inventory and press **F** to swing.

The whole and hilt plates share a fixed camera, backdrop, exposure and light setup for both exports. The first pass exposed a grip that read as separate rings around a smooth core. Giving it a continuous broad leather wrap made the overlaps read at hand distance. The maker's mark is small at normal Play distance. The hand pose still comes from the equipped actor's existing rig, so the fingers retain that pose's spacing around the side rails.

## Rebuild

Run from the repository root with Python, NumPy, Pillow and Blender 5.2. The artist can edit the three named parts in the packed Blender file and publish it directly with the export-only command.

```powershell
$art = 'tools/hollow-kingdom/art-library/armoury'
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
python "$art/engraver.py"
& $blender -b -t 3 --python-exit-code 1 -P "$art/hanger.py"
& $blender -b -t 3 --python-exit-code 1 -P "$art/hanger.py" -- --export-only
& $blender -b -t 3 --python-exit-code 1 -P "$art/plates.py"
```
