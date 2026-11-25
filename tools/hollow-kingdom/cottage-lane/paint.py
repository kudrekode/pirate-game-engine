"""Seeded brushwork for Merewatch. Run with Python, Pillow and NumPy.
Atlas cells use four-pixel edge gutters and are packed per asset to limit residency.
Output lives beside this script as an intermediate; the editable .blend packs it.
"""
from settings import LAYOUT, SEED, SIZE
from pathlib import Path
import math
import random
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "maps"

PAPER = {"plaster": (181, 166, 135), "oak": (110, 89, 68), "stone": (114, 115, 106),
         "slate": (91, 103, 109), "iron": (70, 64, 57), "clay": (126, 85, 63),
         "lichen": (104, 109, 101), "grain": (153, 119, 83), "bark": (103, 102, 96),
         "leaf": (107, 125, 73), "grass": (144, 139, 90)}


def field(rng, width, height):
    small = Image.fromarray(rng.normal(127, 36, (height, width)).clip(0, 255).astype("uint8"))
    return (np.asarray(small.resize((SIZE, SIZE), Image.Resampling.BICUBIC)).astype(float)-127)/36


def pigment(name, index):
    rng = np.random.default_rng(SEED + index)
    brush = random.Random(SEED + index)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    coarse = field(rng, 5, 5)
    fine = rng.normal(0, 2.8, (SIZE, SIZE))
    variation = coarse*5 + field(rng, 32, 32)*4 + fine
    color = np.zeros((SIZE, SIZE, 3)) + PAPER[name]
    if name == "plaster":
        damp = np.clip((y/SIZE-.57)*1.8 + field(rng, 12, 3)*.20, 0, 1)
        variation -= damp*29
        color += damp[:, :, None]*np.array([-5, 0, -7])
        scab = field(rng, 9, 11)*.7 + field(rng, 58, 43)*.28
        variation -= np.clip((scab-.75)*40, 0, 24)
    elif name in ("oak", "bark"):
        warp = field(rng, 5, 7)*2 + np.sin(x/46)*1.8
        wave = np.cos((y+warp)*1.8 + field(rng, 8, 34))
        variation += field(rng, 5, 100)*9 - (wave > .82)*11
        for _ in range(4):
            cx, cy = brush.uniform(0, SIZE), brush.uniform(0, SIZE)
            ell = np.hypot((x-cx)/3.0, y-cy)
            variation += np.sin(ell*1.95)*np.maximum(0, 1-ell/17)*17
        if name == "bark":
            variation += field(rng, 16, 85)*11
    elif name in ("slate", "stone", "lichen"):
        seams = np.sin(y/6 + x/28 + coarse*1.4)
        variation += field(rng, 18, 73)*5 - np.maximum(seams-.78, 0)*28
        freckles = field(rng, 42, 49)+coarse*.5
        colony = np.clip((freckles-.74)*1.3, 0, 1)*(.95 if name == "lichen" else .22)
        color += colony[:, :, None]*np.array([23, 25, -3])
    elif name == "grain":
        rings = np.hypot(x-134+coarse*1.8, (y-117)*.86)
        variation += np.sin(rings*.65 + field(rng, 6, 6))*5
        variation -= ((rings*.088 + .05*coarse) % 1 > .85)*15
    elif name in ("grass", "leaf"):
        variation += (1-np.abs(x/SIZE-.5)*2)*17 - y/SIZE*10
        variation += np.cos(x*.34 + np.abs(y-128)*.06)*3
    im = Image.fromarray(np.clip(color + variation[:, :, None], 0, 255).astype("uint8"))
    pen = ImageDraw.Draw(im, "RGBA")
    if name in ("plaster", "oak", "bark", "stone", "slate"):
        for _ in range(34 if name in ("oak", "bark") else 8):
            px, py = brush.randrange(SIZE), brush.randrange(SIZE)
            for _ in range(brush.randrange(2, 8)):
                dx = brush.randrange(2, 11)
                dy = brush.randrange(-2, 3) if name != "plaster" else brush.randrange(3, 10)
                if name == "plaster":
                    dx = brush.randrange(-5, 5)
                pen.line((px, py, px+dx, py+dy), fill=(45, 39, 32, brush.randrange(36, 115)), width=1)
                px, py = px+dx, py+dy
    return im


def canopy():
    # One pinnate terminal spray plus six side rachises; silhouette is carried by
    # paired leaflets with a lighter near half and an ochre midrib.
    rng = random.Random(SEED)
    im = Image.new("RGBA", (SIZE, SIZE))
    pen = ImageDraw.Draw(im)

    def twig(x, y, dx, dy, pairs, width):
        norm = math.hypot(dx, dy)
        ux, uy = dx/norm, dy/norm
        pen.line((x, y, x+dx, y+dy), fill=(106, 102, 68, 255), width=2)
        for i in range(pairs):
            t = (i+.4)/pairs
            bx, by = x+dx*t, y+dy*t
            for side in (-1, 1):
                length = width*(1-.42*t)*rng.uniform(.73, 1.24)
                ax, ay = ux*.46-uy*side*.89, uy*.46+ux*side*.89
                tx, ty = bx+ax*length, by+ay*length
                mx, my = bx+ax*length*.48, by+ay*length*.48
                breadth = length*rng.uniform(.16, .25)
                c = rng.uniform(.72, 1.18)
                green = tuple(int(c*k) for k in (100, 119, 73))+(255,)
                pen.polygon([(bx, by), (mx-ay*breadth, my+ax*breadth), (tx, ty),
                            (mx+ay*breadth, my-ax*breadth)], fill=green)
                pen.polygon([(bx, by), (mx+ay*breadth, my-ax*breadth), (tx, ty)],
                            fill=tuple(int(c*k) for k in (127, 137, 79))+(255,))
    pen.line((127, 250, 129, 34), fill=(102, 94, 67, 255), width=3)
    for i, (height, reach) in enumerate(((217, 88), (176, 90), (136, 78), (100, 59))):
        for side in (-1, 1):
            twig(128, height+side*5, side*reach, -49-i*1.7, 5, 28-i*2)
    twig(128, 93, -1, -75, 5, 25)
    # Overlapping near and far leaflets create masses that survive mipmapping.
    # Keep the margins open around the outer terminals rather than covering the card.
    for layer in range(2):
        for j in range(285 if layer == 0 else 205):
            group = rng.choice([(-47, -43), (36, -60), (-51, 18), (46, 11), (0, 51), (2, -7)])
            x = rng.gauss(128+group[0], 17.7)
            y = rng.gauss(124+group[1], 23.6)
            if not 13 < x < 243 or not 13 < y < 238:
                continue
            a = rng.uniform(-2.8, 2.8)
            ux, uy = math.cos(a), math.sin(a)
            reach = rng.uniform(10, 22)
            w = reach*rng.uniform(.33, .49)
            shade = rng.uniform(.77, 1.12)+layer*.07
            tone = (64, 83, 60) if layer == 0 else (96, 114, 75)
            c = tuple(int(k*shade) for k in tone)+(255,)
            tip = (x+reach*ux, y+reach*uy)
            l = (x+reach*.5*ux-w*uy, y+reach*.5*uy+w*ux)
            r = (x+reach*.5*ux+w*uy, y+reach*.5*uy-w*ux)
            pen.polygon([(x, y), l, tip, r], fill=c)
            pen.polygon([(x, y), r, tip], fill=tuple(min(255, v+7) for v in c[:3])+(255,))
    im.save(OUT/"ash-spray.png")


def glazing():
    # Glass lit by an off-centre fire. Wavy cylinder-glass bands, bubble trails
    # and varying diamond transmission remain visible even without a point light.
    rng = np.random.default_rng(SEED+214)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    s, t = x/(SIZE-1), y/(SIZE-1)
    pool = np.exp(-(((s-.33)/.49)**2 + ((t-.70)/.52)**2))
    d1 = np.floor((s*4 + t*4.6))
    d2 = np.floor((s*4 - t*4.6))
    pane = np.mod(np.sin(d1*88.71+d2*21.37)*3417.11, 1)
    smear = field(rng, 24, 6)*.027 + np.sin(x*.16 + np.sin(y*.043))*.018
    value = np.clip(.10 + .72*pool + pane*.22 + smear, 0, 1)
    rgb = np.array([106, 61, 38]) + value[:, :, None]*np.array([146, 138, 85])
    Image.fromarray(rgb.clip(0, 255).astype("uint8")).save(OUT/"hearth-glass.jpg", quality=92)


def main():
    OUT.mkdir(exist_ok=True)
    cells = {k: pigment(k, i) for i, k in enumerate(PAPER)}
    for asset, names in LAYOUT.items():
        cols = min(4, len(names))
        atlas = Image.new("RGB", (SIZE*cols, SIZE*math.ceil(len(names)/cols)), PAPER[names[0]])
        for i, name in enumerate(names):
            atlas.paste(cells[name], (i % cols*SIZE, i//cols*SIZE))
        atlas.save(OUT/(asset+".jpg"), quality=91, subsampling=0)
    canopy()
    glazing()


if __name__ == "__main__":
    main()
