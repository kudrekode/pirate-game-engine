"""Build the Ashen Chapel and Wyrm's Hollow modular environment kit in Blender."""

from math import atan2, cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import author as kit


OUT = kit.OUT / "chapter-one"
block, cylinder, beam, stone, rng = kit.block, kit.cylinder, kit.beam, kit.stone, kit.rng
TAU = 2 * pi


def palette():
    kit.palette()
    kit.material("weathered bronze", rgb=(0.16, 0.102, 0.048))
    kit.material("verdigris", rgb=(0.06, 0.15, 0.115))
    kit.material("wax", rgb=(0.68, 0.46, 0.22))
    kit.material("cinder ore", rgb=(0.09, 0.13, 0.16))
    kit.material("glimmer", rgb=(0.108, 0.47, 0.40), glow=(0.046, 0.16, 0.115))
    kit.material("wick", rgb=(0.9, 0.44, 0.09), glow=(1, 0.47, 0.076))


def masonry_row(left, right, y, z, height, depth, material="quarry stone"):
    while left < right - 0.08:
        rest = right - left
        width = rest if rest < 0.8 else min(rng.uniform(0.37, 0.68), rest - 0.2)
        stone(left + width / 2, y, z, width * 0.97, depth, height * 0.97, material)
        left += width


def extruded_profile(outline, y_front, y_back, material, tint=1):
    # Profile is counter-clockwise in the Blender X/Z plane, whose normal is -Y.
    front = [(x, y_front, z) for x, z in outline]
    back = [(x, y_back, z) for x, z in outline]
    kit.mesh.face(front, material, tint=tint)
    kit.mesh.face(back[::-1], material, tint=tint)
    for index, a in enumerate(front):
        b = (index + 1) % len(front)
        kit.mesh.face([front[b], a, back[index], back[b]], material, tint=tint * 0.82)


def pointed_arch(cx, spring, half_opening, rise, bands):
    """Use intersecting circular arcs to lay the pointed Gothic voussoirs."""
    radius = (half_opening ** 2 + rise ** 2) / (2 * half_opening)
    center = half_opening - radius
    end = atan2(rise, -center)

    def xz(side, t, offset):
        a = end * t
        return (cx + side * (center + cos(a) * (radius + offset)),
                spring + sin(a) * (radius + offset))

    for inner, outer, y_front, y_back, material, count in bands:
        for side in (-1, 1):
            for index in range(count):
                low, high = (index + 0.012) / count, (index + 0.988) / count
                corners = [xz(side, low, inner), xz(side, low, outer),
                           xz(side, high, outer), xz(side, high, inner)]
                if side == -1:
                    corners.reverse()
                extruded_profile(corners, y_front, y_back, material, rng.uniform(0.72, 1.04))


def stone_rubble(cx, cy, count, reach=0.6):
    for _ in range(count):
        x, y = cx + rng.uniform(-reach, reach), cy + rng.uniform(-reach, reach)
        w = rng.uniform(0.13, 0.40)
        stone(x, y, 0, w, w * rng.uniform(0.53, 1.05), w * 0.52,
              rng.choice(["fieldstone", "quarry stone", "slate"]))


def chapel_arch():
    spring, half_opening = 2.45, 1.47
    for side in (-1, 1):
        x = side * 2.07
        for z, w, d, h in [(0, 1.42, 1.60, 0.19), (0.18, 1.3, 1.46, 0.18),
                            (0.35, 1.21, 1.24, 0.13), (2.25, 1.31, 1.38, 0.20)]:
            stone(x, 0, z, w, d, h)
        block(x, 0, 0.46, 1.10, 1.03, 1.82, "fieldstone", 0.86)
        for row in range(6):
            z = 0.46 + row * 0.30
            masonry_row(x - 0.55, x + 0.55, -0.46, z, 0.29, 0.20)
            masonry_row(x - 0.55, x + 0.55, 0.46, z, 0.29, 0.20)
        for y in (-0.59, 0.59):
            cylinder(side * 1.64, y, 0.48, [(0, 0.15), (0.18, 0.12), (1.58, 0.10),
                                          (1.67, 0.16), (1.77, 0.17)], "quarry stone", 8)
            cylinder(side * 1.99, y, 0.48, [(0, 0.11), (1.76, 0.085)], "quarry stone", 8, 0.78)
        for row in range(4):
            z = 2.45 + row * 0.34
            stone(side * (2.30 - row * 0.17), 0.04, z, 0.72, 0.93, 0.34, "fieldstone")
        stone_rubble(side * 2.47, -0.81, 12, 0.32)

    pointed_arch(0, spring, half_opening, 2.45, [
        (0.02, 0.60, -0.47, 0.47, "fieldstone", 10),
        (0, 0.20, -0.65, -0.42, "quarry stone", 10),
        (0.25, 0.43, -0.59, -0.43, "quarry stone", 10),
        (0.02, 0.31, 0.43, 0.57, "quarry stone", 10),
    ])
    stone(0, -0.12, 4.89, 0.61, 0.93, 0.54)
    relief_ring(0, -0.66, 4.80, 0.21, "weathered bronze")
    beam((0, -0.67, 4.65), (0, -0.67, 5.03), 0.027, mat="weathered bronze")


def chapel_wall():
    # The lancet opening is real and has a broken tracery instead of a flat window decal.
    for z, h, d in [(0, 0.18, 0.94), (0.17, 0.17, 0.85)]:
        masonry_row(-3, 3, 0, z, h, d)
    for row in range(11):
        z = 0.32 + row * 0.28
        if row < 3 or row >= 9:
            segments = [(-2.97 + row % 2 * 0.13, 2.96 - row % 3 * 0.18)]
        else:
            inner = 0.69 - max(0, row - 6) * 0.17
            segments = [(-2.99, -inner), (inner, 2.82 + row % 2 * 0.12)]
        if row == 9:
            segments = [(-2.83, 1.76)]
        if row == 10:
            segments = [(-2.57, -0.73), (-0.42, 0.52)]
        for left, right in segments:
            masonry_row(left, right, 0, z, 0.28, 0.68 + rng.random() * 0.11, "fieldstone")
    stone(0, -0.015, 1.08, 1.65, 0.93, 0.16)
    for x in (-0.65, 0.65):
        for row in range(4):
            stone(x, -0.37, 1.24 + row * 0.27, 0.19, 0.23, 0.28)
    pointed_arch(0, 2.21, 0.60, 0.68, [(0, 0.16, -0.51, -0.32, "quarry stone", 6)])
    for y in (-0.42, 0.39):
        beam((0, y, 1.22), (0.028, y, 1.98), 0.075, mat="quarry stone")
        beam((0.028, y, 1.98), (-0.46, y, 2.37), 0.064, mat="quarry stone")
        beam((0.028, y, 1.98), (0.28, y, 2.17), 0.053, mat="quarry stone")
    for x in (-2.44, 2.53):
        for row in range(7):
            stone(x, -0.36, row * 0.31, 0.60 - row * 0.02, 0.95 - row * 0.050, 0.32)
        stone(x, -0.27, 2.16, 0.55, 0.53, 0.20)
        stone_rubble(x, -0.64, 9)


def relief_ring(x, y, z, r, material):
    for index in range(14):
        a, b = index * TAU / 14, (index + 1) * TAU / 14
        beam((x + r * cos(a), y, z + r * sin(a)),
             (x + r * cos(b), y, z + r * sin(b)), r * 0.16, mat=material, sides=6)


def vigil_altar():
    for z, w, d, h in [(0, 3.21, 1.40, 0.13), (0.13, 3.04, 1.27, 0.13),
                       (0.26, 2.86, 1.12, 0.09), (1.10, 2.94, 1.25, 0.13),
                       (1.23, 3.12, 1.37, 0.13)]:
        stone(0, 0, z, w, d, h)
    block(0, 0, 0.34, 2.67, 0.92, 0.76, "fieldstone", 0.84)
    for x in (-1.18, -0.40, 0.40, 1.18):
        cylinder(x, -0.5, 0.36, [(0, 0.105), (0.12, 0.10), (0.58, 0.07),
                                  (0.67, 0.13), (0.73, 0.125)], "quarry stone", 8)
    for x in (-0.78, 0, 0.78):
        # Three recurrences of the ward symbol, in separate panels.
        extruded_profile([(x - 0.21, 0.45), (x + 0.21, 0.45), (x + 0.21, 0.78),
                          (x, 1.01), (x - 0.21, 0.78)], -0.48, -0.40, "slate", 0.67)
        pointed_arch(x, 0.79, 0.24, 0.20, [(0, 0.042, -0.54, -0.45, "quarry stone", 4)])
        relief_ring(x, -0.498, 0.69, 0.107, "verdigris")
        beam((x, -0.50, 0.51), (x, -0.50, 0.84), 0.026, mat="weathered bronze", sides=6)
    for x, y, height in [(-1.13, -0.16, 0.32), (-0.87, 0.07, 0.23),
                         (0.94, -0.14, 0.27), (1.15, 0.14, 0.36)]:
        cylinder(x, y, 1.35, [(0, 0.13), (0.03, 0.13), (0.055, 0.08)], "weathered bronze", 12)
        cylinder(x, y, 1.39, [(0, 0.067), (height, 0.058)], "wax", 9)
        cylinder(x, y, 1.39 + height, [(0, 0.026), (0.045, 0.032), (0.10, 0.004)], "wick", 7)
    for r, material in [(0.42, "weathered bronze"), (0.29, "verdigris")]:
        for i in range(18):
            a, b = i * TAU / 18, (i + 1) * TAU / 18
            beam((r * cos(a), r * sin(a), 1.372), (r * cos(b), r * sin(b), 1.372),
                 0.021, mat=material)
    kit.pointlight("Vigil candle bounce", (0.10, -0.45, 2.07), 14)


def fractured_stone(x, y, w, depth, z, height, lean=0.0):
    corner_count = 8
    outlines = []
    drift = rng.uniform(-0.22, 0.22)
    for level, flare in ((0, 1), (0.27, 0.96), (0.68, 0.72), (1, 0.44)):
        ring = []
        for i in range(corner_count):
            a = i * TAU / corner_count
            radius = rng.uniform(0.82, 1.11) * flare
            ring.append((x + (lean * level + cos(a) * radius * w / 2),
                         y + (drift * level + sin(a) * radius * depth / 2),
                         z + level * height + (rng.uniform(-0.09, 0.09) if level else 0)))
        outlines.append(ring)
    kit.mesh.solid(outlines, "slate", rng.uniform(0.56, 1.02))
    for index in range(2):
        # Multiple smaller tilted planes create exposed schist cleavage.
        a = outlines[index][6]
        b = outlines[index + 1][7]
        beam((a[0], a[1] - 0.013, a[2]), (b[0], b[1] - 0.013, b[2]), 0.055,
             mat="fieldstone", tint=rng.uniform(0.57, 0.80))


def mere_mouth():
    for side in (-1, 1):
        for x, y, w, depth, height, lean in [(3.10, 0, 2.05, 2.28, 4.21, -0.40),
                                              (3.35, 0.55, 1.18, 1.12, 2.71, 0.23),
                                              (3.41, -0.47, 1.32, 1.24, 2.42, -0.21),
                                              (3.62, -0.75, 0.67, 0.85, 1.43, 0.08)]:
            fractured_stone(x * side, y, w, depth, 0, height, lean * side)
        stone_rubble(side * 2.65, -1.04, 10, 0.45)

    # A continuous jagged crown with a fully open traversal volume under it.
    inner = [(x, z) for x, z in [(-2.78, 2.48), (-2.19, 3.36), (-1.11, 4.03),
                                  (0.04, 3.95), (1.21, 4.09), (2.06, 3.59), (2.73, 2.57)]]
    outer = [(-3.36, 3.59), (-2.59, 4.67), (-1.50, 5.19), (-0.09, 4.90),
             (1.16, 5.04), (2.20, 4.53), (3.32, 3.49)]
    for i in range(len(inner) - 1):
        extruded_profile([inner[i], inner[i + 1], outer[i + 1], outer[i]],
                         rng.uniform(-1.03, -0.77), rng.uniform(0.72, 1.04), "slate",
                         rng.uniform(0.56, 0.94))
    for side in (-1, 1):
        for i in range(5):
            x = side * (2.15 + rng.uniform(0.15, 0.7))
            mineral_point(x, -0.92 + i * 0.086, 0.12 + i * 0.14, 0.14, 0.43,
                          side * rng.uniform(-0.12, 0.16), -0.11, i)


def mineral_point(x, y, z, radius, height, lean_x, lean_y, variation):
    n = 6
    phase = variation * 0.83
    material = "cinder ore"
    rings = []
    for level, scale in [(0.0, 0.83), (0.68, 1.0), (0.89, 0.70)]:
        ring = []
        for i in range(n):
            a = i * TAU / n + phase
            ring.append((x + lean_x * level + cos(a) * radius * scale,
                         y + lean_y * level + sin(a) * radius * scale,
                         z + height * (level + (0.036 * sin(phase + i) if level else 0))))
        rings.append(ring)
    tip = (x + lean_x * 1.04, y + lean_y * 1.04, z + height)
    kit.mesh.face(rings[0][::-1], material)
    for i in range(n):
        j = (i + 1) % n
        kit.mesh.face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], material,
                      tint=0.66 + 0.3 * abs(sin(j + phase)))
        kit.mesh.face([rings[1][i], rings[1][j], rings[2][j], rings[2][i]],
                      "glimmer" if i == variation % n else material, tint=0.76)
        kit.mesh.face([rings[2][i], rings[2][j], tip], material)


def cinder_crystal():
    for x, y, w, depth, height, lean in [(0.08, 0, 1.69, 1.27, 0.67, 0.12),
                                          (-0.48, -0.20, 0.96, 0.87, 0.47, 0.1),
                                          (0.56, 0.27, 0.78, 0.67, 0.52, -0.06)]:
        fractured_stone(x, y, w, depth, 0, height, lean)
    crystals = [(0.03, 0.12, 0.37, 0.34, 2.14, -0.24, 0.17),
                (0.29, -0.13, 0.23, 0.23, 1.70, 0.40, -0.22),
                (-0.27, 0.22, 0.30, 0.17, 1.51, -0.58, -0.10),
                (0.04, -0.30, 0.13, 0.23, 1.25, -0.09, -0.35),
                (0.30, 0.37, 0.20, 0.18, 1.31, 0.15, 0.29),
                (-0.47, -0.05, 0.13, 0.16, 0.89, -0.27, -0.04),
                (0.64, 0.09, 0.13, 0.12, 0.64, 0.23, 0.07)]
    for i, crystal in enumerate(crystals):
        mineral_point(*crystal, i)


def cave_vault():
    """Battered, inward-facing schist over the caves, with the lip below the floor."""
    sides = 48
    rings = []
    for index, (radius, height) in enumerate([
        (1.03, -0.55), (1.00, 3.25), (0.88, 6.05),
        (0.67, 8.7), (0.44, 10.15), (0.18, 10.6),
    ]):
        ring = []
        for side in range(sides):
            angle = TAU * side / sides + (index % 2) * 0.036
            ridge = sin(7 * angle + index * 0.81) * 0.034 + rng.uniform(-0.02, 0.02)
            z = height if index == 0 else height + sin(13 * angle + index) * 0.61
            ring.append((22.6 * (radius + ridge) * cos(angle),
                         23.9 * (radius + ridge) * sin(angle), z))
        rings.append(ring)

    layers = ["slate", "fieldstone", "slate", "quarry stone", "slate"]
    for index, (below, above) in enumerate(zip(rings, rings[1:])):
        for a in range(sides):
            b = (a + 1) % sides
            face = [below[a], above[a], above[b], below[b]]
            material = layers[index] if rng.random() > 0.18 else "fieldstone"
            tint = rng.uniform(0.50, 0.82)
            kit.mesh.face(face[:3], material, tint=tint)
            kit.mesh.face([face[0], *face[2:]], material, tint=tint * 0.9)
    for a in range(sides):
        kit.mesh.face([rings[-1][a], (0, 0, 10.9), rings[-1][(a + 1) % sides]],
                      "slate", tint=0.65)


BUILDERS = {
    "chapel-arch": chapel_arch,
    "chapel-wall": chapel_wall,
    "vigil-altar": vigil_altar,
    "mere-mouth": mere_mouth,
    "cinder-crystal": cinder_crystal,
    "cave-vault": cave_vault,
}


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    rng.seed(f"The Wyrm Beneath the Mere/environment/v1/{name}")
    kit.mesh = kit.Mesh()
    BUILDERS[name]()
    kit.mesh.finish(name)
    destination = OUT / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB",
                              export_lights=True, export_vertex_color="ACTIVE",
                              export_animations=False, export_yup=True)

    # Round-trip through Blender's glTF importer to check materials, geometry and origins.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    assert len(meshes) == 1, f"{name}: expected one material-batched mesh"
    mesh = meshes[0]
    assert len(mesh.data.materials) >= 3 and mesh.data.uv_layers, f"{name}: lost materials or UVs"
    assert max(abs(value) for value in mesh.location) < 0.001, f"{name}: changed authored pivot"
    assert 0 < mesh.dimensions.z <= (12 if name == "cave-vault" else 6), f"{name}: height outside kit bounds"
    if name == "cave-vault":
        shape = BVHTree.FromObject(mesh, bpy.context.evaluated_depsgraph_get())
        for x, y in [(-12, -14), (0, -17), (12, 9), (0, 16), (0, 0)]:
            hit, _, _, _ = shape.ray_cast((x, y, 4.0), (0, 0, 1), 12)
            assert hit is not None and hit.z >= 4.0, f"{name}: open above {x}, {y}"
    clearance = {"chapel-arch": 1.2, "mere-mouth": 1.65}.get(name)
    if clearance:
        shape = BVHTree.FromObject(mesh, bpy.context.evaluated_depsgraph_get())
        for x in (-clearance, 0, clearance):
            for height in (0.3, 1.1, 2.1):
                hit, _, _, _ = shape.ray_cast((x, -4, height), (0, 1, 0), 8)
                assert hit is None, f"{name}: mesh blocks its passage at x={x}, height={height}"
    mesh.data.calc_loop_triangles()
    print(f"Round-trip {name}: {len(mesh.data.loop_triangles)} tris, "
          f"{len(mesh.data.materials)} materials, W/D/H {tuple(round(d, 2) for d in mesh.dimensions)} m")


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(exist_ok=True)
    palette()
    for asset in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else BUILDERS):
        export(asset)
