"""Bake the two Merewatch far foliage meshes. Run with Python, NumPy, Numba,
SciPy and Pillow. Reads the actual exported GLBs, including their vertex tint
and alpha-masked textures. No GPU, Blender project or scene state is required.
"""
from argparse import ArgumentParser
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from numba import njit
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

ASSETS = Path(__file__).resolve().parents[3] / "public/assets/hollow-kingdom"
TILE = 256
SUPERSAMPLE = 3
YAWS = (0, 60, 120)
TYPES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
DTYPES = {5126: "<f4", 5123: "<u2", 5121: "u1"}


def open_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + size]), data[28 + size:]


def buffer_view(doc, binary, index):
    view = doc["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def accessor(doc, binary, index):
    item = doc["accessors"][index]
    dtype = np.dtype(DTYPES[item["componentType"]])
    width = TYPES[item["type"]]
    view = doc["bufferViews"][item["bufferView"]]
    values = np.ndarray((item["count"], width), dtype,
                        buffer_view(doc, binary, item["bufferView"]),
                        offset=item.get("byteOffset", 0),
                        strides=(view.get("byteStride", width * dtype.itemsize), dtype.itemsize))
    if item.get("normalized"):
        return values.astype(float) / np.iinfo(dtype).max
    return values


def load_tree(path):
    doc, binary = open_glb(path)
    # These authored roots have no transform. Fail if a replacement changes that.
    assert len(doc["nodes"]) == 1 and set(doc["nodes"][0]) == {"name", "mesh"}
    primitives = []
    for primitive in doc["meshes"][0]["primitives"]:
        attr = primitive["attributes"]
        material = doc["materials"][primitive["material"]]
        pbr = material["pbrMetallicRoughness"]
        texture = doc["textures"][pbr["baseColorTexture"]["index"]]
        image = doc["images"][texture["source"]]
        pixels = np.asarray(Image.open(BytesIO(buffer_view(doc, binary, image["bufferView"]))).convert("RGBA"))
        vertices = accessor(doc, binary, attr["POSITION"])
        uv = accessor(doc, binary, attr["TEXCOORD_0"])
        color = (accessor(doc, binary, attr["COLOR_0"]) if "COLOR_0" in attr
                 else np.ones((len(vertices), 4))) * pbr.get("baseColorFactor", [1] * 4)
        indices = accessor(doc, binary, primitive["indices"]).reshape(-1, 3)
        cutoff = material.get("alphaCutoff", 0.5) if material.get("alphaMode") == "MASK" else 0
        primitives.append((vertices, uv, color, indices, pixels, cutoff))
    return primitives


def axes(yaw):
    angle = np.radians(yaw)
    return np.array([np.cos(angle), 0, -np.sin(angle)]), np.array([np.sin(angle), 0, np.cos(angle)])


@njit
def rasterize(points, uv, color, indices, texture, cutoff, depth, rgba):
    height, width = depth.shape
    th, tw = texture.shape[:2]
    for a, b, c in indices:
        ax, ay, az = points[a]
        bx, by, bz = points[b]
        cx, cy, cz = points[c]
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-8:
            continue
        for y in range(max(0, int(np.ceil(min(ay, by, cy)))), min(height, int(max(ay, by, cy)) + 1)):
            for x in range(max(0, int(np.ceil(min(ax, bx, cx)))), min(width, int(max(ax, bx, cx)) + 1)):
                wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det
                wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det
                wc = 1 - wa - wb
                if min(wa, wb, wc) < 0:
                    continue
                z = wa * az + wb * bz + wc * cz
                if z <= depth[y, x]:
                    continue
                u = (uv[a, 0] * wa + uv[b, 0] * wb + uv[c, 0] * wc) * tw - .5
                v = (uv[a, 1] * wa + uv[b, 1] * wb + uv[c, 1] * wc) * th - .5
                ix, iy = int(np.floor(u)), int(np.floor(v))
                fu, fv = u - ix, v - iy
                for k in (3, 0, 1, 2):
                    texel = ((1-fv) * ((1-fu) * texture[iy % th, ix % tw, k] + fu * texture[iy % th, (ix+1) % tw, k]) +
                             fv * ((1-fu) * texture[(iy+1) % th, ix % tw, k] + fu * texture[(iy+1) % th, (ix+1) % tw, k])) / 255.
                    tint = wa * color[a, k] + wb * color[b, k] + wc * color[c, k]
                    if k == 3:
                        if texel * tint < cutoff:
                            break
                        depth[y, x] = z
                        rgba[y, x, 3] = 255
                    else:
                        # glTF baseColor is sRGB, vertex color is linear.
                        linear = (texel / 12.92 if texel <= .04045 else ((texel + .055) / 1.055) ** 2.4) * tint
                        srgb = linear * 12.92 if linear <= .0031308 else 1.055 * linear ** (1/2.4) - .055
                        rgba[y, x, k] = min(255, round(255 * srgb))


def capture(primitives, yaw, width, low, high):
    right, forward = axes(yaw)
    size = TILE * SUPERSAMPLE
    depth = np.full((size, size), -np.inf)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    for pos, uv, color, indices, pixels, cutoff in primitives:
        x = (pos @ right / width + .5) * size - .5
        y = (high - pos[:, 1]) / (high - low) * size - .5
        rasterize(np.column_stack((x, y, pos @ forward)), uv, color, indices, pixels, cutoff, depth, rgba)
    return Image.fromarray(rgba).resize((TILE, TILE), Image.Resampling.BOX)


def bleed_color(tile):
    rgba = np.array(tile)
    # GPU mip generation averages all four channels. Carry color over transparent
    # edges to avoid black halos without changing silhouette coverage.
    hidden = rgba[:, :, 3] == 0
    nearest = distance_transform_edt(hidden, return_distances=False, return_indices=True)
    rgba[hidden, :3] = rgba[tuple(nearest[:, hidden])][:, :3]
    return Image.fromarray(rgba)


def mip_cutoff(tiles):
    levels = [256, 128, 64, 32, 16]
    alphas = [[np.array(tile.getchannel("A").resize((size, size), Image.Resampling.BOX)) / 255
               for tile in tiles] for size in levels]
    coverage = np.array([np.mean(alpha) for alpha in alphas[0]])
    # Fit ordinary trilinear WebGL alpha testing to area coverage at actual
    # distant tree sizes. A standard PNG stays compatible with the GLTF cache.
    def error(cut):
        return np.mean([np.mean(np.abs([np.mean(alpha >= cut) / ref - 1
                                        for alpha, ref in zip(level, coverage)])) for level in alphas[1:]])
    cutoff = min(np.arange(.22, .56, .01), key=error)
    print("alpha cutoff", round(cutoff, 2), "covered pixels % at 256/128/64/32/16",
          [round(100 * np.mean([np.mean(a >= cutoff) for a in level]), 2) for level in alphas])
    return round(cutoff, 2)


def export(path, tiles, cutoff, width, low, high):
    # 2x2 POT atlas with one unused tile. Each tile has its own transparent margin.
    atlas = Image.new("RGBA", (TILE * 2, TILE * 2))
    pos, normals, uv, indices = [], [], [], []
    for i, (yaw, tile) in enumerate(zip(YAWS, tiles)):
        right, forward = axes(yaw)
        col, row = i % 2, i // 2
        atlas.paste(bleed_color(tile), (col * TILE, row * TILE))
        # Duplicate the back face to keep the crown's upward-biased diffuse
        # normal pointing toward skylight when viewed from either side.
        for side in [1, -1]:
            base = len(pos)
            normal = forward * side + np.array([0, .65, 0])
            normal /= np.linalg.norm(normal)
            for u, v in [(0, 1), (1, 1), (1, 0), (0, 0)]:
                pos.append(right * (u - .5) * width + [0, low if v else high, 0])
                normals.append(normal)
                uv.append([(col + u) / 2, (row + v) / 2])
            order = [0, 1, 2, 0, 2, 3] if side == 1 else [2, 1, 0, 3, 2, 0]
            indices.extend(base + n for n in order)
    png = BytesIO()
    atlas.save(png, "PNG", optimize=True)
    blob = bytearray()
    views, accessors = [], []

    def append_view(data):
        blob.extend(bytes(-len(blob) % 4))
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)})
        blob.extend(data)
        return len(views) - 1

    for values, dtype, shape in [(pos, "<f4", "VEC3"), (normals, "<f4", "VEC3"),
                                 (uv, "<f4", "VEC2"), (indices, "<u2", "SCALAR")]:
        arr = np.asarray(values, dtype=dtype)
        entry = {"bufferView": append_view(arr.tobytes()), "count": len(arr), "type": shape,
                 "componentType": 5123 if shape == "SCALAR" else 5126}
        if not accessors:
            entry.update(min=arr.min(axis=0).tolist(), max=arr.max(axis=0).tolist())
        accessors.append(entry)
    png_view = append_view(png.getvalue())
    doc = {"asset": {"version": "2.0", "generator": "Merewatch foliage bake"}, "scene": 0,
           "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": path.stem}],
           "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                                       "indices": 3, "material": 0}]}],
           "materials": [{"alphaMode": "MASK", "alphaCutoff": cutoff, "pbrMetallicRoughness": {
               "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": .85}}],
           "textures": [{"sampler": 0, "source": 0}], "images": [{"bufferView": png_view, "mimeType": "image/png"}],
           "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
           "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(blob)}]}
    head = json.dumps(doc, separators=(",", ":")).encode()
    head += b" " * (-len(head) % 4)
    blob.extend(bytes(-len(blob) % 4))
    path.write_bytes(struct.pack("<4sIII4s", b"glTF", 2, 28 + len(head) + len(blob), len(head), b"JSON") +
                     head + struct.pack("<I4s", len(blob), b"BIN\0") + blob)


def process(name, source, review):
    primitives = load_tree(ASSETS / source)
    points = np.concatenate([p[0] for p in primitives])
    width = 2 * max(np.max(np.abs(points @ axes(yaw)[0])) for yaw in YAWS) * 1.045
    low, high = np.min(points[:, 1]), np.max(points[:, 1])
    margin = (high - low) * .02
    out = ASSETS / "cottage-lane" / f"{name}-far.glb"
    if review:
        # Render the exported crossed planes themselves from intermediate angles,
        # where extra crown density and projected card width are most visible.
        far = load_tree(out)
        sheet = Image.new("RGB", (6 * 144, 2 * 158), "#78818a")
        labels = ImageDraw.Draw(sheet)
        scores = []
        for i, yaw in enumerate(range(0, 180, 30)):
            masks = []
            for row, tree in enumerate([primitives, far]):
                view = capture(tree, yaw, width, low - margin, high + margin)
                thumbnail = view.resize((144, 144), Image.Resampling.LANCZOS)
                sheet.paste(thumbnail, (i * 144, row * 158), thumbnail)
                labels.text((i*144+3, row*158+142), f"{name} {['source', 'far'][row]} {yaw}", fill="white")
                masks.append(np.array(view.getchannel("A").resize((64,64), Image.Resampling.BOX)) >= 128)
            scores.append(np.count_nonzero(masks[0] & masks[1]) / np.count_nonzero(masks[0] | masks[1]))
        review.mkdir(parents=True, exist_ok=True)
        sheet.save(review / f"{name}-foliage-review.png")
        print(name, "source/far silhouette IoU, 64px, 0/30/60/90/120/150 degrees:", np.round(scores, 3))
        return
    tiles = [capture(primitives, yaw, width, low - margin, high + margin) for yaw in YAWS]
    print(name, sum(len(p[3]) for p in primitives), "source triangles")
    export(out, tiles, mip_cutoff(tiles), width, low - margin, high + margin)
    # Round-trip both the geometry framing and the atlas through the actual GLB.
    doc, binary = open_glb(out)
    geometry = accessor(doc, binary, 0)
    encoded = Image.open(BytesIO(buffer_view(doc, binary, doc["images"][0]["bufferView"])))
    for i, tile in enumerate(tiles):
        x, y = (i % 2) * TILE, (i // 2) * TILE
        decoded = encoded.crop((x, y, x + TILE, y + TILE))
        assert np.array_equal(np.array(decoded.getchannel("A")), np.array(tile.getchannel("A")))
        assert np.allclose(geometry[i * 8] @ axes(YAWS[i])[0], -width / 2)
    print(out.name, out.stat().st_size, "bytes; width, bottom, top", np.round([width, low-margin, high+margin], 4))


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--review", type=Path, metavar="DIRECTORY",
                        help="Compare exported far GLBs to source geometry and write two review strips.")
    args = parser.parse_args()
    process("spruce", "spruce.glb", args.review)
    process("ash", "cottage-lane/ash.glb", args.review)
