"""Compile Oswin's clinker-built skiff with the Merewatch timber and iron palette."""
import json
import math
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import author as kit


# Station offsets measured across one side of the hull. The bow points down
# Blender Y, which exports to +Z in glTF. The keel rests at height zero.
STATIONS = [
    (-1.69, 0.025, 0.28, 0.83), (-1.4, 0.30, 0.14, 0.66),
    (-1.03, 0.52, 0.05, 0.57), (-0.49, 0.65, 0.00, 0.54),
    (0.15, 0.66, 0.00, 0.53), (0.77, 0.58, 0.025, 0.55),
    (1.21, 0.44, 0.08, 0.59), (1.48, 0.29, 0.15, 0.64),
]
WIDTHS = [0.065, 0.47, 0.72, 0.88, 1.0]


def plank_point(station, side, strake, inset=0):
    y, width, keel, gunwale = station
    return (side * max(0.008, width * WIDTHS[strake] - inset),
            y, keel + (gunwale - keel) * strake / 4)


def timbers():
    for side in (-1, 1):
        for start, end in zip(STATIONS, STATIONS[1:]):
            for band in range(4):
                # Individual lapstrakes overlap, leaving the seams in relief.
                low_a, low_b = [plank_point(s, side, band) for s in (start, end)]
                upper_a, upper_b = [plank_point(s, side, band + 1)
                                    for s in (start, end)]
                low_a, low_b = [(x + side * 0.012, y, max(0, z - .014))
                                for x, y, z in (low_a, low_b)]
                outer = [low_a, low_b, upper_b, upper_a]
                inner = [(x - side * 0.022, y, z) for x, y, z in outer]
                kit.mesh.solid([outer, inner], "hewn oak", 0.59 + 0.075 * band)
            kit.beam(plank_point(start, side, 4), plank_point(end, side, 4),
                     0.052, 0.058, tint=0.71)
        for station in STATIONS[1:-1]:
            for band in range(4):
                kit.beam(plank_point(station, side, band, .036),
                         plank_point(station, side, band + 1, .036),
                         .044, .05, tint=.67)
    for start, end in zip(STATIONS, STATIONS[1:]):
        kit.beam((0, start[0], start[2] + .035), (0, end[0], end[2] + .035),
                 .09, .065, tint=.52)
    stern = STATIONS[-1]
    contour = [plank_point(stern, -1, i) for i in range(4, -1, -1)]
    contour.extend(plank_point(stern, 1, i) for i in range(5))
    kit.mesh.solid([contour, [(x, y - .04, z) for x, y, z in contour]],
                   "hewn oak", .71)
    for x in (-.20, -.067, .067, .20):
        kit.block(x, .08, .20, .127, 1.91 if abs(x) < .1 else 1.66,
                  .035, tint=.74)
    for y, width, top in [(-.81, .94, .5), (0, 1.21, .49), (.83, 1.0, .50)]:
        for offset in (-.068, .068):
            kit.block(0, y + offset, top - .038, width, .132, .038,
                      tint=.85 if offset < 0 else .78)
    # Stowed oars run with the gunwales, clear of the rider and both berths.
    for side in (-1, 1):
        kit.beam((side * .48, -1.02, .53), (side * .51, .98, .56),
                 .041, sides=8, tint=.88)
        blade = [(side * .48 + x, y, z) for x, y, z in
                 [(-.021, -.71, .532), (-.087, -1.1, .55), (-.072, -1.30, .565),
                  (.061, -1.31, .565), (.083, -1.10, .55), (.021, -.71, .532)]]
        kit.mesh.solid([blade, [(x, y, z + .024) for x, y, z in blade]],
                       "hewn oak", .88)
    # A mooring line rests in coils on the after thwart.
    for turn in range(3):
        radius = .068 + turn * .020
        for i in range(18):
            angles = (i * math.tau / 18, (i + 1) * math.tau / 18)
            a, b = [(.11 + radius * math.cos(t), .84 + radius * math.sin(t),
                     .519) for t in angles]
            kit.beam(a, b, .017, sides=5, mat="hemp")
    # A shielded storm lantern sits at the prow, where it lights the water.
    kit.beam((0, -1.40, .48), (0, -1.41, .72), .049, mat="iron")
    kit.cylinder(0, -1.40, .69, [(0, .095), (.035, .103)], "iron", 8)
    kit.cylinder(0, -1.40, .724, [(0, .064), (.145, .072)], "lamplight", 8)
    kit.cylinder(0, -1.40, .865, [(0, .093), (.035, .094), (.095, .025)],
                 "iron", 8)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        x, y = .07 * math.cos(a), -1.40 + .07 * math.sin(a)
        kit.beam((x, y, .72), (x, y, .87), .012, mat="iron")
    kit.pointlight("Skiff storm lantern", (0, -1.25, .83), 5.5)


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.palette()
    kit.material("hemp", rgb=(.31, .22, .13))
    kit.BUILDERS["skiff"] = timbers
    kit.export("skiff")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(kit.OUT / "skiff.glb"))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    materials = sorted({slot.material.name for obj in meshes for slot in obj.material_slots})
    assert len(meshes) == 1 and {"hewn oak", "lamplight", "iron", "hemp"} <= set(materials)
    assert any(img.packed_file for img in bpy.data.images)
    lamps = [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]
    assert len(lamps) == 1 and lamps[0].data.type == "POINT"
    dimensions = list(meshes[0].dimensions)
    assert 1.2 < dimensions[0] < 1.5 and 3.0 < dimensions[1] < 3.4
    metadata = {"assetId": "mere-skiff", "source": "tools/hollow-kingdom/skiff.py",
                "forward": "+Z", "waterlineMetres": .19, "seatHeightMetres": .49,
                "lights": [lamp.name for lamp in lamps],
                "blender": bpy.app.version_string, "materials": materials,
                "dimensionsBlenderXYZ": [round(v, 3) for v in dimensions]}
    (kit.OUT / "skiff.json").write_text(json.dumps(metadata, indent=2) + "\n")
