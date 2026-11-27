# The Heron's Well and Tide Lantern

The two props share an original painted atlas for limestone, adzed timber, slate, oxidised copper, iron, hemp, ivy and brass. Each source scene contains named construction groups and packed images. The GLBs can be copied individually. The light travels with the lantern.

| Game asset | Editable source | Round-trip record |
| --- | --- | --- |
| [Heron Well](../../../../public/assets/hollow-kingdom/art-library/waterworks/heron-well.glb) | [heron-well.blend](heron-well.blend) | [Bounds, maps and hashes](../../../../docs/assets/art-library/waterworks/heron-well.json) |
| [Tide Lantern](../../../../public/assets/hollow-kingdom/art-library/waterworks/tide-lantern.glb) | [tide-lantern.blend](tide-lantern.blend) | [Bounds, light and hashes](../../../../docs/assets/art-library/waterworks/tide-lantern.json) |

The well has individually coursed slates, a copper heron vane, a mussel tablet, a continuous winding of rope and an open, coopered bucket. The lantern's iron scrollwork suspends eight horn panes beneath a ventilated hood. Its embedded point light keeps the original warm colour, intensity and range. Both props use stationary geometry. The game uses the existing well and lamp collision profiles.

## Reproduce or edit

Run from the repository root with Blender 5.2. Rebuilding the pigment sheets uses Python, Pillow and NumPy. Re-exporting an edited packed scene only requires Blender. Each command selects a single asset.

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
$art = 'tools/hollow-kingdom/art-library/waterworks'
python "$art/paint.py"
& $blender -b -t 3 --python-exit-code 1 -P "$art/build.py" -- heron-well
& $blender -b -t 3 --python-exit-code 1 -P "$art/build.py" -- tide-lantern
# After editing and saving a source scene
& $blender -b -t 3 --python-exit-code 1 -P "$art/build.py" -- heron-well --export-only
& $blender -b -t 3 --python-exit-code 1 -P "$art/plates.py" -- heron-well
```

The builder opens the saved source, checks its packed maps, exports the combined geometry and imports the resulting GLB into an empty Blender scene. It checks scale, bounds, draw groups, indexed triangles, UVs, normals, colours, PBR maps, punctual lights and absence of unintended rigs or animation.

| View | Shipped | Library edition |
| --- | --- | --- |
| Well | [Whole](../../../../docs/assets/art-library/waterworks/heron-well-before.jpg) · [Detail](../../../../docs/assets/art-library/waterworks/heron-well-detail-before.jpg) | [Whole](../../../../docs/assets/art-library/waterworks/heron-well-after.jpg) · [Detail](../../../../docs/assets/art-library/waterworks/heron-well-detail-after.jpg) |
| Lantern | [Whole](../../../../docs/assets/art-library/waterworks/tide-lantern-before.jpg) · [Detail](../../../../docs/assets/art-library/waterworks/tide-lantern-detail-before.jpg) | [Whole](../../../../docs/assets/art-library/waterworks/tide-lantern-after.jpg) · [Detail](../../../../docs/assets/art-library/waterworks/tide-lantern-detail-after.jpg) |

The matched photographs use the re-imported game files. The first plates exposed intersecting rafters and discontinuous weathering across the copper work. Lowering the trusses and mapping the metal patina continuously across adjoining faces corrected both. At close range the tapered slate courses still repeat, and the ivy has a planar fold. The lantern's flame is painted into opaque horn panes and stays steady. Its slender tracery recedes at the ordinary third-person distance.
