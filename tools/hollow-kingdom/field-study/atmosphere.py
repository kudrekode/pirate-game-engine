"""Bake the seamless blue-hour panorama and metre-scale ground detail.

Run with Python, NumPy and Pillow from any directory. The sky's vertical axis
is direction.y + 0.1 and the gravel tile covers four world metres per repeat.
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[3] / "public/assets/hollow-kingdom"


def noise(rng, width, height, nx, ny):
    """Bicubic periodic value noise with samples from beyond all four edges."""
    grid = rng.random((ny, nx), dtype=np.float32)
    padding = 2
    grid = np.pad(grid, padding, mode="wrap")
    return np.asarray(Image.fromarray(grid).resize(
        (width, height), Image.Resampling.BICUBIC,
        box=(padding, padding, nx + padding, ny + padding)
    ))


def mix(layer, color, weight):
    return layer + (color - layer) * weight[..., None]


def panorama():
    rng = np.random.default_rng(7623)
    w, h = 3072, 640
    y = (0.9 - (np.arange(h)[:, None] + 0.5) / h).astype(np.float32)
    # Azimuth increases from -pi to pi. The moon hangs above the north shore.
    a = 2 * np.pi * ((np.arange(w)[None, :] + 0.5) / w - 0.5)
    high = np.clip(y / 0.74, 0, 1) ** 0.59
    layer = mix(np.array([140., 134., 155.]), np.array([23., 34., 58.]), high)
    afterglow = np.exp(-((y - 0.12) / 0.19)**2) * (0.5 + 0.5*np.cos(a-2.3))**3
    layer = layer + afterglow[..., None] * [22., 9., -1.]
    wide = noise(rng, w, h, 18, 15)
    fold = noise(rng, w, h, 44, 33)
    broken = noise(rng, w, h, 96, 73)
    grain = noise(rng, w, h, 276, 215)
    # Upper cloud sheets catch the last light through gaps in a lower bank.
    high_cloud = np.clip((wide*0.38 + fold*0.36 + broken*0.19 + grain*0.07 - 0.42)*2.8, 0, 1)
    layer = mix(layer, np.array([137., 132., 154.]), high_cloud * np.clip((0.8-y)*0.9,0,0.42))
    moon_az = np.arctan2(-1, 0.28)
    moon_y = 0.232
    moon_dist = np.sqrt(((a-moon_az)*np.sqrt(1-moon_y**2))**2 + ((y-moon_y)/np.sqrt(1-moon_y**2))**2)
    layer += np.exp(-moon_dist[...,None] * 15) * [51., 52., 50.]
    moon = np.clip((0.013 - moon_dist)*850, 0, 1)
    layer = mix(layer, np.array([243., 236., 214.]) - (broken[...,None]-.5)*20, moon)

    warp = 0.028*np.sin(3*a) + 0.024*np.cos(7*a-0.3) + 0.065*(wide-0.5)
    weather = np.exp(-((y-0.24-warp)/0.072)**2) + 0.65*np.exp(-((y-0.42+warp)/0.09)**2)
    cloud = np.clip((wide*.39 + fold*.30 + broken*.20 + grain*.11 + weather*.35 - 0.49)*3.2, 0, 1)
    cloud *= np.clip((y-0.045)*8, 0, 1) * np.clip((0.9-y)*10, 0, 1)
    # Receding cloud banks lose their contrast; a thinner break to the north
    # lets light scatter around the moon rather than obscuring its entire face.
    thin = 1 - 0.81*np.exp(-(moon_dist/0.076)**2)
    density = cloud*thin
    lit_edges = np.clip(0.52 + (np.roll(wide, -8, axis=0)-wide)*0.9
                        - density*.35 + .26*afterglow, 0, 1)
    cloud_color = np.array([40., 49., 73.]) + lit_edges[...,None]*[65., 53., 57.]
    layer = mix(layer, cloud_color, density*0.73)

    # Three independent horizons. The nearest ridge includes individual conifer
    # crowns; atmospheric perspective dissolves their bases into the water haze.
    for level, (height, amplitude, color) in enumerate([
        (.095, .058, [99, 102, 125]), (.065, .044, [79, 89, 106]), (.038, .034, [57, 73, 86])
    ]):
        ridge = height + amplitude*(.48*np.sin((3+level)*a-level) + .33*np.sin((9+level)*a+level)
                + .16*np.cos((23+level)*a) + .1*np.sin(47*a+3*level))
        if level:
            crowns = np.zeros(w)
            for x in range(0, w, 2):
                radius = rng.integers(1, 5)
                peak = rng.uniform(.001, .012) * (0.55+.45*np.cos(14*a[0,x])**2)
                span = np.arange(-radius, radius+1)
                ids = (x+span) % w
                crowns[ids] = np.maximum(crowns[ids], peak*(1-abs(span)/(radius+0.5)))
            ridge += crowns
        coverage = np.clip((ridge-y)*h+0.5, 0, 1)
        layer = mix(layer, np.array(color)+(broken[...,None]-.5)*4, coverage)
    horizon = np.array([70., 84., 98.])
    mist = np.clip((0.027-y)/0.04, 0, 1)
    layer = mix(layer, horizon, mist*mist*(3-2*mist))
    layer += rng.uniform(-0.65, 0.65, size=(h,w,1))
    return Image.fromarray(np.uint8(np.clip(layer, 0, 255)))


def gravel():
    rng = np.random.default_rng(84032)
    n = 512
    humus = noise(rng, n, n, 11, 11) - 0.5
    grit = noise(rng, n, n, 108, 108) - 0.5
    grain = rng.normal(0, 1, (n, n))
    tone = 126 + 27*humus + 39*grit + 9*grain
    layer = np.stack([tone + 3*humus, tone, tone - 5*humus], axis=-1)
    image = Image.fromarray(np.uint8(np.clip(layer, 0, 255)))
    draw = ImageDraw.Draw(image)

    def wrapped_polygon(points, color):
        for dx in (-n, 0, n):
            for dy in (-n, 0, n):
                draw.polygon([(x+dx,y+dy) for x,y in points], fill=color)

    for _ in range(2800):
        x, y = rng.uniform(0, n, 2)
        r = 0.7 + rng.exponential(1.2)
        theta = rng.uniform(0, 2*np.pi)
        points = []
        for angle in np.arange(5)*2*np.pi/5:
            u, v = r*np.cos(angle)*rng.uniform(.7, 1.3), r*np.sin(angle)*.54
            points.append((x+u*np.cos(theta)-v*np.sin(theta), y+u*np.sin(theta)+v*np.cos(theta)))
        dark = int(rng.integers(71,112))
        wrapped_polygon([(px+0.65, py+0.95) for px,py in points], (dark,dark,dark))
        lit = int(rng.integers(128,192))
        wrapped_polygon(points, (lit+2, lit, lit-3))
    # Short fibres of dead grass, leaf fragments and mineral chips, all periodic.
    for _ in range(500):
        x, y = rng.uniform(0,n,2)
        angle = rng.uniform(0, 2*np.pi)
        length = rng.uniform(2, 9)
        dx,dy = length*np.cos(angle),length*np.sin(angle)
        lit = int(rng.integers(96,157))
        wrapped_polygon([(x,y),(x+dx*.45-dy*.1,y+dy*.45+dx*.1),(x+dx,y+dy)],
                        (lit+12,lit+3,lit-10))
    return image


if __name__ == "__main__":
    panorama().save(OUTPUT / "blue-hour-sky.jpg", quality=91, subsampling=0, optimize=True)
    gravel().save(OUTPUT / "blue-hour-ground.jpg", quality=94, subsampling=0, optimize=True)
