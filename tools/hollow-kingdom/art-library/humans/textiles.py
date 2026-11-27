"""Original swatches baked into a portable colour atlas. All dimensions are in texels."""
import struct
import zlib

import numpy as np

# sRGB dye colours. Each mesh panel has its own UV island inside a swatch.
SWATCHES = {
    "coat": ((92, 64, 39), "twill"),
    "lapel": ((125, 85, 50), "twill"),
    "mantle": ((29, 58, 54), "twill"),
    "binding": ((123, 103, 68), "braid"),
    "cap": ((69, 77, 63), "check"),
    "trouser": ((62, 66, 67), "twill"),
    "leather": ((67, 43, 31), "hide"),
    "welt": ((105, 73, 46), "hide"),
    "linen": ((163, 147, 117), "twill"),
    "cord": ((156, 126, 82), "rope"),
    "beard": ((63, 53, 46), "hair"),
    "silver": ((84, 75, 65), "hair"),
}
SIZE = 256


def uv(name, u, v):
    i = list(SWATCHES).index(name)
    # Eight pixels of repeat padding isolate islands under mipmapping.
    return ((i % 4 + .032 + .936 * u) / 4, (2 - i // 4 + .032 + .936 * v) / 3)


def atlas_png(path):
    rng = np.random.default_rng(32501)
    atlas = np.empty((SIZE * 3, SIZE * 4, 3), dtype=np.uint8)
    y, x = np.mgrid[:SIZE, :SIZE]
    for i, (base, weave) in enumerate(SWATCHES.values()):
        cloud = 3 * np.sin(x / 23 + np.sin(y / 45)) + 2 * np.cos(y / 31 - x / 47)
        noise = rng.normal(0, 3.7, (SIZE, SIZE))
        if weave in ("twill", "check"):
            direction = np.where((x // 14) % 2, -1, 1)
            grain = 6 * np.sin((x + y * direction) * 1.57) + 3 * np.cos(y * 2.1)
            if weave == "check":
                grain += 8 * ((x % 39 < 4) | (y % 40 < 4)) - 6 * ((x % 39 < 8) & (y % 40 < 8))
        elif weave == "braid":
            grain = 15 * np.cos(x * .65 + abs(y % 18 - 9) * .7) + 8 * np.cos(y * .6)
        elif weave == "rope":
            grain = 17 * np.cos(x * .45 + y * .31) + 7 * np.sin(y * 1.1)
        elif weave == "hair":
            grain = 4 * np.sin(x * 1.7 + np.sin(y / 16 + x / 22)) + noise
        else:
            grain = 3 * np.sin(y / 6 + np.sin(x / 14)) + noise
        tile = np.array(base) + (cloud + noise + grain)[:, :, None]
        row, col = divmod(i, 4)
        atlas[row * SIZE:(row + 1) * SIZE, col * SIZE:(col + 1) * SIZE] = np.clip(tile, 0, 255)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    h, w = atlas.shape[:2]
    rows = b"".join(b"\0" + row.tobytes() for row in atlas)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
