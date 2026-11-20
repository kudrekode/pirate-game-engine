"""Paint repeatable material maps for the Merewatch kit. Python, Pillow, NumPy."""
from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/hollow-kingdom"
N = 512
rng = np.random.default_rng(1867)
brush = random.Random(719)
y, x = np.mgrid[0:N, 0:N]


def noise(w, h):
    # Periodic, smoothly interpolated value noise.
    lattice = rng.normal(0, 1, (h, w))
    xx, yy = x * w / N, y * h / N
    ix, iy = xx.astype(int), yy.astype(int)
    u, v = xx - ix, yy - iy
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    return ((1-u)*lattice[iy, ix] + u*lattice[iy, (ix+1)%w])*(1-v) + (
        (1-u)*lattice[(iy+1)%h, ix] + u*lattice[(iy+1)%h, (ix+1)%w])*v


def surface(name, base, value, moss=0):
    color = np.array(base) + value[..., None] + np.asarray(moss)[..., None]*[-4, 5, -7]
    Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(OUT / (name+".jpg"), quality=89)


def paint_surfaces():
    grain = rng.normal(0, 4, (N, N))
    mottling = noise(7, 7)*9 + noise(27, 27)*6 + noise(85, 85)*4 + grain
    surface("limestone", (134, 130, 123), mottling, np.maximum(0, noise(9, 9)))
    surface("limewash", (171, 157, 126), mottling*.86 - np.maximum(0, noise(12, 2))*15)
    split = np.sin(y*math.tau/11.13 + noise(3, 23)*2.2 + noise(8, 5))
    wood = noise(3, 61)*14 + noise(9, 147)*9 + split*4 - (split > .91)*14
    surface("oak", (108, 81, 61), wood + mottling*.5)
    cleavage = noise(8, 42)*6 + noise(42, 6)*4 + mottling*.7
    surface("slate", (92, 89, 113), cleavage)
    # Broken coursed masonry, offset courses, chipped edges and recessed joints.
    canvas = Image.new("RGB", (N, N), (64, 62, 60))
    pen = ImageDraw.Draw(canvas)
    for row in range(-1, 9):
        edges = [0]+sorted(brush.sample(range(35, N-34, 52), 5))+[N]
        for a, b in zip(edges, edges[1:]):
            tint = brush.randint(-20, 24)
            c = (129+tint, 125+tint, 117+tint)
            for shift in (-N, 0, N):
                l, r = a + (row%2)*43 + shift, b + (row%2)*43 + shift
                t, d = row*64+2, (row+1)*64-2
                pts = [(l+5,t+1),(r-8,t),(r-2,t+5),(r-4,d-8),(r-11,d),(l+5,d-2),(l+2,d-7),(l+1,t+9)]
                pen.polygon(pts, fill=c)
                pen.line(pts[:3], fill=tuple(i+16 for i in c), width=2)
                pen.line(pts[3:6], fill=tuple(i-25 for i in c), width=3)
    data = np.asarray(canvas).astype(float) + mottling[...,None]
    Image.fromarray(np.uint8(np.clip(data,0,255))).save(OUT/"fieldstone.jpg", quality=90)


def paint_bough():
    # A single drooping spruce spray. Three-dimensional whorls overlap these cards.
    im = Image.new("RGBA", (512,256))
    pen = ImageDraw.Draw(im)
    for sign in (-1,1):
        for i in range(1,24):
            t = (i+brush.uniform(-.4,.4))/25
            cx, cy = 255, 245-231*t
            reach = (1-t)**.53 * brush.uniform(124,220) + 10
            for j in range(36):
                u = j/36
                bx, by = cx+sign*reach*u, cy-67*u+20*u*u
                length = (1-u*.62)*(1-t*.22)*brush.uniform(7,19)
                shade = int(49+45*t+32*u+brush.uniform(-17,20))
                for side in (-1,1):
                    pen.line((bx,by,bx+sign*length*.65,by+side*length*.64-5),
                             fill=(int(shade*.68),shade,int(shade*.78),255), width=2)
            pen.line((cx,cy,cx+sign*reach,cy-47),fill=(61,78,54,255),width=2)
    pen.line((255,249,255,10), fill=(66,67,44,255), width=3)
    im.save(OUT/"spruce.png")


def paint_heavens():
    # Cylindrical band. The shader maps signed elevation to this image.
    w,h = 3072,768
    sky_rng = np.random.default_rng(411)
    u,v = np.meshgrid(np.arange(w)/w, np.arange(h)/(h-1))
    haze = np.clip(v**2.4,0,1)
    rgb = np.array([14,16,40]) + haze[...,None]*[109,71,83]
    clouds = np.zeros((h,w))
    def cloud(octave):
        a = sky_rng.normal(size=(4*octave,16*octave))
        xx,yy = u*16*octave, v*4*octave
        ix,iy = xx.astype(int), yy.astype(int)
        fx,fy = xx-ix, yy-iy
        fx,fy = fx*fx*(3-2*fx),fy*fy*(3-2*fy)
        return ((1-fx)*a[iy%len(a),ix%a.shape[1]]+fx*a[iy%len(a),(ix+1)%a.shape[1]])*(1-fy) + ((1-fx)*a[(iy+1)%len(a),ix%a.shape[1]]+fx*a[(iy+1)%len(a),(ix+1)%a.shape[1]])*fy
    for scale,weight in [(1,.56),(2,.30),(4,.16),(8,.09),(16,.045),(32,.021)]:
        clouds += cloud(scale)*weight
    band = np.exp(-((v-.49-.14*np.sin(u*math.tau*2))/.27)**2)
    rgb += np.maximum(0,clouds+.19)[...,None]*band[...,None]*[58,36,81]
    rgb -= np.maximum(0,-clouds-.05)[...,None]*[26,22,29]
    im = Image.fromarray(np.uint8(np.clip(rgb,0,255)))
    draw = ImageDraw.Draw(im)
    for _ in range(5100):
        sx, sy = brush.randrange(w), brush.randrange(h)
        if sy/h > brush.random()**.35: continue
        val = brush.randint(65,184)
        draw.point((sx,sy), fill=(val,val,min(255,val+20)))
    # Layered ridgelines soften the join between the local forest and the sky.
    for layer, color in enumerate([(80,69,99),(58,53,82),(38,42,64)]):
        line = np.ones(w)*(h-50+layer*17)
        for frequency, amp in [(4,21),(11,8),(27,5),(64,2),(117,1)]:
            line += np.sin(np.arange(w)*math.tau*frequency/w+brush.random()*5)*amp
        draw.polygon([(0,h),*list(zip(range(w),line)),(w,h)],fill=color)
    im.save(OUT/"mere-sky.jpg",quality=90)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True,parents=True)
    paint_surfaces()
    paint_bough()
    paint_heavens()
    surface("wool",(164,157,146),noise(38,38)*8 + rng.normal(0,5,(N,N))
            + 9*np.sin(x*math.pi/2)*np.cos(y*math.pi/2))
    wool = np.asarray(Image.open(OUT/"wool.jpg"),dtype=float)
    for name,tint in [("indigo",(.43,.45,.59)),("russet",(.68,.49,.32)),
                      ("charcoal",(.38,.36,.35)),("loden",(.42,.47,.35))]:
        Image.fromarray(np.uint8(wool*tint)).save(OUT/(name+".jpg"),quality=88)
