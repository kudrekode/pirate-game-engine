# Bracken, road mare

Bracken has a continuous bay coat, a narrower blaze, a pale hind coronet, brow and muzzle detail, and a layered winter mane, forelock and tail. Her pack harness adds a rust-coloured heron saddlecloth with a woven diamond hem, leather wallets, snaffle rings, a raised knee block and a pair of reins running through the original rider hand position. The heron, weave, coat and guard-hair maps are generated locally.

The editable source is `bracken-road-mare.blend`. The coat, groom, saddlecloth, eyes, ears and harness are separate skinned objects there. The runtime GLB is `public/assets/hollow-kingdom/art-library/creatures/bracken-road-mare.glb`. Both files carry their textures.

From the repository root, run the applicable command in PowerShell.

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
# Generate the packed .blend, reopen it, export the mare and compare both GLBs.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/bracken.py
# Export artist edits to the saved .blend and repeat the checks.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/bracken.py -- --export-only
# Replay and measure the GLBs already on disk.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/bracken.py -- --check-only
# Use the two released game models and the same external Wayfarer skin and Ride clip.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/render.py -- bracken-before bracken-after
```

| View | Original | Road mare |
| --- | --- | --- |
| Walk frame 9 | [Whole horse](../../../../docs/assets/art-library/creatures/bracken-before-whole.jpg) | [Whole horse](../../../../docs/assets/art-library/creatures/bracken-after-whole.jpg) |
| Idle frame 17 | [Head and bridle](../../../../docs/assets/art-library/creatures/bracken-before-head.jpg) | [Head and bridle](../../../../docs/assets/art-library/creatures/bracken-after-head.jpg) |
| Walk frame 9 with Wayfarer | [Mounted fit](../../../../docs/assets/art-library/creatures/bracken-before-mounted.jpg) | [Mounted fit](../../../../docs/assets/art-library/creatures/bracken-after-mounted.jpg) |

All 20 imported joint rest matrices match the original. Each GLB was re-imported and sampled at 21 points per gait. Both horses' saddle excursions measured 4 mm at idle, 26.6 mm at walk and 78 mm at canter. The walk and canter fore-fetlock excursions measured 104.8 mm and 191.5 mm. The mounted render binds the external `Ride` clip to the original `wayfarer.glb` by joint name and seats its pelvis 9 cm above the animated `Saddle` joint. [Round-trip measurements](../../../../docs/assets/art-library/creatures/bracken-roundtrip.json)

The contact point for the rider gives the empty reins a tall profile when the mare is shown alone. The thick tail is built from masked locks and moves on two joints. At close range the forelock planes and the low-poly pocket flaps remain visible. The stock rider's hood, shoulder seams and hand pose remain visible in the mounted comparison.
