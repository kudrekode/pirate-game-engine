"""Pigmentation and exportable tile maps for the Blackwater Wyrm."""
import math

import bpy
import numpy as np


def linear(rgb):
    return tuple(((v / 255 + .055) / 1.055) ** 2.4 if v > 10 else v / 3294.6 for v in rgb)


def mix(a, b, t):
    t = min(1, max(0, t))
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def image(name, pixels, data=False):
    h, w = pixels.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=False, is_data=data)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    return im


def scale_maps():
    # Periodic jittered Voronoi. Raised plate centres meet at sunken,
    # darkened sutures. All three fringing samples tile across UV boundaries.
    size, rows, cols = 512, 23, 19
    y, x = np.mgrid[:size, :size] / size
    xx = (x + .0043 * np.sin(2 * np.pi * (y * 4 + x))) * cols
    yy = (y + .005 * np.sin(2 * np.pi * (x * 3 + y * 2))) * rows
    lattice_x, lattice_y = np.floor(xx).astype(int), np.floor(yy).astype(int)
    rng = np.random.default_rng(338)
    offsets = rng.uniform(.09, .91, (rows, cols, 3))
    nearest = np.full(x.shape, 9.)
    second = nearest.copy()
    cell_tone = np.zeros_like(x)
    for j in (-1, 0, 1):
        for i in (-1, 0, 1):
            tx, ty = lattice_x + i, lattice_y + j
            jitter = offsets[ty % rows, tx % cols]
            d = np.hypot(xx - tx - jitter[:, :, 0], yy - ty - jitter[:, :, 1])
            closer = d < nearest
            second = np.minimum(second, np.where(closer, nearest, d))
            nearest = np.where(closer, d, nearest)
            cell_tone = np.where(closer, jitter[:, :, 2], cell_tone)
    ridge = np.clip((second - nearest) / .25, 0, 1)
    ridge = ridge * ridge * (3 - 2 * ridge)
    grain = rng.normal(0, .018, x.shape)
    height = .63 * ridge + .21 * np.cos(nearest * 2.7) + grain
    dx = (np.roll(height, 1, 1) - np.roll(height, -1, 1)) * .92
    dy = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * .92
    norm = np.dstack((dx, dy, np.ones_like(x)))
    norm /= np.linalg.norm(norm, axis=2, keepdims=True)
    pigment = (.64 + .19 * ridge + .10 * cell_tone + grain).clip(0, 1)
    return (image("Wyrm interlocking scale pigment", pigment[:, :, None]),
            image("Wyrm interlocking scale relief", norm * .5 + .5, True))


def materials():
    surfaces = {}
    h, w = np.mgrid[:256, :256] / 256
    rings = np.cos(2 * np.pi * (11 * w + .43 * np.sin(2 * np.pi * h * 2) + .17 * np.sin(2 * np.pi * (h * 3 + w))))
    scratches = np.maximum(0, rings) ** 14
    pores = np.random.default_rng(817).normal(0, .029, w.shape)
    mottled = .5 + .5 * np.sin(2 * np.pi * (h * 3 + w * 2)) * np.cos(2 * np.pi * (w * 2 - h))
    wear = image("Lamellar worn keratin", np.clip(.77 + .12 * mottled - .20 * scratches + pores, 0, 1)[:, :, None])
    for name, rough in (("Hide", .57), ("Shield", .65), ("Horn", .58),
                        ("Gill", .52), ("Eye", .19), ("Teeth", .39), ("Mouth", .32)):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.use_backface_culling = name != "Gill"
        nt = m.node_tree
        shader = nt.nodes["Principled BSDF"]
        shader.inputs["Roughness"].default_value = rough
        col = nt.nodes.new("ShaderNodeVertexColor")
        col.layer_name = "Pigment"
        if name in ("Hide", "Horn", "Shield"):
            tex = nt.nodes.new("ShaderNodeTexImage")
            if name == "Hide":
                color_map, normal_map = scale_maps()
                tex.image = color_map
            else:
                tex.image = wear
            mult = nt.nodes.new("ShaderNodeMixRGB")
            mult.blend_type = "MULTIPLY"
            mult.inputs[0].default_value = 1
            nt.links.new(tex.outputs["Color"], mult.inputs[1])
            nt.links.new(col.outputs["Color"], mult.inputs[2])
            nt.links.new(mult.outputs[0], shader.inputs["Base Color"])
            if name == "Hide":
                uvnormal = nt.nodes.new("ShaderNodeTexImage")
                uvnormal.image = normal_map
                normal = nt.nodes.new("ShaderNodeNormalMap")
                normal.inputs["Strength"].default_value = .78
                nt.links.new(uvnormal.outputs[0], normal.inputs["Color"])
                nt.links.new(normal.outputs[0], shader.inputs["Normal"])
        else:
            nt.links.new(col.outputs[0], shader.inputs["Base Color"])
        surfaces[name] = m
    return surfaces


def skin_color(point):
    x, y, z = point
    # Broken bars flow around the flanks; the throat and tucked flank
    # warm towards a buff-grey. Use absolute metres so markings survive pose.
    wobble = .56 * math.sin(10 * z + .7 * y) + .30 * math.sin(16 * x + 3 * y)
    bands = max(0, math.sin(y * 17.8 - z * 4.2 + wobble)) ** 3
    moss = .5 + .5 * math.sin(y * 10.3 + 2.7 * z) * math.cos(x * 11 - 3 * z)
    color = mix((95, 108, 90), (129, 135, 108), moss * .72)
    color = mix(color, (42, 63, 61), bands * (.65 if y > -.8 else .48))
    belly_line = .90 if y > -.62 else 1.16 if y > -.97 else 1.38
    belly = min(1, max(0, (belly_line - z) * 4.4))
    color = mix(color, (158, 143, 110), belly * max(0, 1 - abs(x) * 3.0))
    if z < .5:
        color = mix(color, (53, 68, 63), (.5 - z) * 1.4)
    if y < -1.1:
        snout = max(0, 1 - abs(z - 1.46) * 9) * max(0, min(1, (-y - 1.10) * 8))
        color = mix(color, (57, 66, 57), snout * .47)
    # Relatively fine-scale mottles coexist with the large pattern.
    weather = 1 + .042 * math.cos(43 * y + 14 * z) * math.sin(37 * z - 13 * x)
    return linear(tuple(c * weather for c in color))
