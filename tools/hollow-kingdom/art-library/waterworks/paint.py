"""Paint one portable colour / normal / metallic-roughness atlas for the well and lamp."""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent / "maps"
SIZE = 512
CELLS = ("stone", "oak", "slate", "copper", "iron", "rope", "moss", "brass")


def paint(index, name):
    rng = np.random.default_rng(4131 + index)
    y, x = np.mgrid[0:SIZE, 0:SIZE]

    def grain(nx, ny):
        pixels = rng.normal(127, 38, (ny, nx)).clip(0, 255).astype("uint8")
        image = Image.fromarray(pixels).resize((SIZE, SIZE), Image.Resampling.BICUBIC)
        return (np.asarray(image).astype(float) - 127) / 38

    cloud = grain(6, 6)
    mid = grain(37, 31)
    dust = rng.normal(0, 1, (SIZE, SIZE))
    h = dust * .5 + mid
    base = np.zeros((SIZE, SIZE, 3))
    rough, metal = .85, 0
    if name == "stone":
        layer = np.sin(y * .097 + x * .024 + cloud * 1.8 + mid * .13)
        inclusion = np.clip((grain(80, 90) + cloud * .4 - .95) * .9, 0, 1)
        vein = np.exp(-((layer + .17 * grain(70, 43)) / .08) ** 2)
        base[:] = (134, 131, 113)
        base += (cloud * 11 + mid * 7 + inclusion * 26 + dust * 4 - vein * 10)[:, :, None]
        base += np.clip(grain(8, 7) - .5, 0, 1)[:, :, None] * [-11, -5, -15]
        h += mid * 2 + inclusion * 5 - vein * 3
    elif name == "oak":
        warp = 4 * cloud + 3 * np.sin(x / 90)
        # Long fibres deviate around the compressed rings of two pin knots.
        for cx, cy in ((142, 117), (369, 350)):
            warp += 15 * np.exp(-(((x-cx)/61)**2 + ((y-cy)/15)**2))
        annual = np.sin((y + warp) * .29 + grain(3, 22) * .9)
        fibre = grain(11, 245)
        split = np.maximum(0, annual - .70) ** .65
        base[:] = (111, 83, 58)
        base += (fibre * 12 + cloud * 7 - split * 36 + dust * 3)[:, :, None]
        base += np.clip(grain(6, 35) - .4, 0, 1)[:, :, None] * [17, 19, 21]
        h += fibre * 2 - split * 7
    elif name == "slate":
        seam = np.maximum(0, np.sin(y/11 + x/35 + cloud * 1.1) - .78)
        base[:] = (70, 85, 91)
        base += (cloud * 9 + mid * 4 + grain(55, 12)*5 + dust*2 - seam*33)[:, :, None]
        base += np.maximum(0, cloud - .5)[:, :, None] * [9, 4, 0]
        h += 2 * mid - seam * 6
        rough = .70
    elif name in ("copper", "iron", "brass"):
        patina = np.clip((cloud * .66 + mid * .30 + grain(12, 14)*.4 + .18) * 1.9, 0, 1)
        colours = {"copper": ((117, 85, 61), (72, 99, 90)),
                   "iron": ((85, 85, 79), (108, 73, 50)),
                   "brass": ((178, 140, 78), (112, 103, 67))}
        clean, aged = map(np.array, colours[name])
        base[:] = clean + patina[:, :, None] * (aged - clean)
        base += (mid * 5 + dust * 2 + grain(83, 9)*2)[:, :, None]
        h += grain(28, 34) * 1.8
        metal = .76 - patina * (.67 if name == "copper" else .34)
        rough = .37 + patina * .43
    elif name == "rope":
        twist = np.cos(x * .41 + y * .69 + cloud * .6)
        base[:] = (142, 119, 82)
        base += (twist * 11 + cloud * 9 + grain(8, 100) * 8)[:, :, None]
        h += twist * 2.7
    else:
        base[:] = (88, 103, 58)
        base += (cloud * 11 + mid * 9 + dust * 7)[:, :, None]
        h += grain(110, 120) * 4
    dy, dx = np.gradient(h)
    normal = np.stack((-dx * .085, dy * .085, np.ones_like(h)), axis=-1)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    orm = np.empty_like(base)
    orm[:, :, 0] = 255
    orm[:, :, 1] = np.clip(rough + mid * .035, .15, 1) * 255
    orm[:, :, 2] = metal * 255
    return [Image.fromarray(arr.clip(0, 255).astype("uint8")) for arr in (base, (normal*.5+.5)*255, orm)]


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    atlases = [Image.new("RGB", (4*SIZE, 2*SIZE)) for _ in range(3)]
    for i, name in enumerate(CELLS):
        for sheet, tile in zip(atlases, paint(i, name)):
            sheet.paste(tile, (i % 4 * SIZE, i // 4 * SIZE))
    for sheet, name in zip(atlases, ("colour", "normal", "surface")):
        sheet.save(OUT / (name + ".jpg"), quality=92, subsampling=0)
    # Translucent horn has fine parallel striations and a warm, off-centre wick.
    y, x = np.mgrid[0:256, 0:256]/255
    filaments = .04*np.sin(x*112 + np.sin(y*8)*.8) + .025*np.sin(y*34 + x*12)
    pool = .22 + .70*np.exp(-(((x-.45)/.43)**2 + ((y-.66)/.37)**2))
    amber = np.array((109,58,29)) + (filaments+pool)[:,:,None]*np.array((143,126,77))
    Image.fromarray(amber.clip(0,255).astype("uint8")).save(OUT/"horn.jpg",quality=94)
