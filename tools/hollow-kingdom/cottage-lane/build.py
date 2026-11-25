"""Build five original Merewatch props, retain Blender scenes, and verify GLBs.
Run paint.py first. Then blender -b --python-exit-code 1 -P <this file>.
"""
from pathlib import Path
import math
import random
import struct
import json
import sys
import bpy
from mathutils import Vector as V

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path[:0] = [str(HERE), str(HERE.parent)]
import author as kit
from settings import ASH, BANK, COTTAGE, GUTTER, LAYOUT, SEED, SIZE, WALL

OUT = HERE.parents[2] / "public/assets/hollow-kingdom/cottage-lane"
TAU = math.tau
rng = random.Random()
beam, cube = kit.beam, kit.block


class AtlasMesh(kit.Mesh):
    """Keep each triangle on its own atlas swatch, including clipped stone corners."""

    def __init__(self, asset):
        super().__init__()
        self.asset = asset

    def face(self, pts, mat, uv=None, tint=1):
        pts = [V(p) for p in pts]
        if mat in ("glazing", "foliage"):
            super().face(pts, mat, uv, tint)
            return
        if uv is None:
            normal = (pts[1]-pts[0]).cross(pts[2]-pts[0])
            axis = max(range(3), key=lambda i: abs(normal[i]))
            a, b = ((1, 2), (0, 2), (0, 1))[axis]
            uv = [(p[a], p[b]) for p in pts]
        u, v = zip(*uv)

        def normalized(values):
            low, high = min(values), max(values)
            return [(value-low)/max(high-low, .00001) for value in values]
        names = LAYOUT[self.asset]
        cols, rows = min(4, len(names)), math.ceil(len(names)/4)
        index = names.index(mat)
        inset = GUTTER/SIZE
        mapped = [((index % cols + inset + s*(1-2*inset))/cols,
                   (rows-1-index//cols + inset + t*(1-2*inset))/rows)
                  for s, t in zip(normalized(u), normalized(v))]
        super().face(pts, self.asset+" atlas", mapped, tint)


def section(name, asset):
    """Source components are individually editable and export as joined material batches."""
    if kit.mesh.points:
        kit.mesh.finish(name)
    kit.mesh = AtlasMesh(asset)


def setup_materials(asset):
    mat_id = asset+" atlas"
    kit.material(mat_id, str(HERE/"maps"/(asset+".jpg")))
    if asset == "ash":
        kit.material("foliage", str(HERE/"maps/ash-spray.png"), cutout=True)
    if asset == "cottage":
        kit.material("glazing", str(HERE/"maps/hearth-glass.jpg"), glow=(.77, .289, .052))
        bs = kit.MATERIALS["glazing"].node_tree.nodes.get("Principled BSDF")
        tree = kit.MATERIALS["glazing"].node_tree
        tex = next(n for n in tree.nodes if n.type == "TEX_IMAGE")
        tree.links.new(tex.outputs["Color"], bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = 1.03
        bs.inputs["Roughness"].default_value = .31


def lintel(a, b, width, depth=None, tint=1):
    beam(a, b, width, depth, mat="oak", tint=tint)


def taper(a, b, r0, r1, mat, n=7, tint=1, cap=None):
    a, b = V(a), V(b)
    axis = (b-a).normalized()
    ref = V((0, 0, 1)) if abs(axis.z) < .86 else V((0, 1, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    rings = [[p+(u*math.cos(i*TAU/n)+v*math.sin(i*TAU/n))*r for i in range(n)]
             for p, r in ((a, r0), (b, r1))]
    for i in range(n):
        j = (i+1) % n
        kit.mesh.face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], mat,
                      [(0, 0), (0, 1), (1, 1), (1, 0)], tint)
    for ring in (rings[0][::-1], rings[1]):
        kit.mesh.face(ring, cap or mat, tint=tint)


def limb(points, radii, sides, tint=1):
    """Shared cross-sections keep the elbows closed as a woody stem changes direction."""
    points = [V(p) for p in points]
    rings = []
    reference = V((0, 1, 0))
    for i, (p, r) in enumerate(zip(points, radii)):
        tangent = (points[min(i+1, len(points)-1)]-points[max(0, i-1)]).normalized()
        u = tangent.cross(reference).normalized()
        v = tangent.cross(u)
        rings.append([p+(u*math.cos(k*TAU/sides)+v*math.sin(k*TAU/sides))*r for k in range(sides)])
    kit.mesh.face(rings[0][::-1], "bark", tint=tint)
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i+1) % sides
            kit.mesh.face([a[i], a[j], b[j], b[i]], "bark", [(0, 0), (0, 1), (1, 1), (1, 0)], tint)
    kit.mesh.face(rings[-1], "bark", tint=tint)


def schist(x, y, z, w, d, h, mat="stone"):
    """Interlocking schist bed stone with a tipped crown and a battered foot."""
    corners = [(-.49, -.28), (-.29, -.48), (.35, -.50), (.51, -.24),
               (.48, .36), (.25, .49), (-.35, .48), (-.50, .26)]
    shape = [(a+rng.uniform(-.035, .035), b+rng.uniform(-.035, .035)) for a, b in corners]
    slope = rng.uniform(-.14, .12)
    rings = [[(x+a*w*s+off*w, y+b*d*s, z+h*(t+a*slope if t else 0))
              for a, b in shape] for t, s, off in [(0, .92, 0), (.74, 1, .015), (1, .86, -.02)]]
    kit.mesh.solid(rings, mat, rng.uniform(.72, 1.13))


def roof(cx, cy, half, depth, eave, peak, lean, rows):
    """Sag the ridge between end frames and kick up the worn tips at the eaves."""
    for side in (-1, 1):
        def roof_pt(t, y, z=0):
            center = math.cos(math.pi*y/depth)
            return V((cx+lean*t+side*half*(1-t), cy+y,
                      eave+(peak-eave)*t-.22*math.sin(t*math.pi)-.16*center*t + z))
        for row in range(rows):
            start = -depth/2
            while start < depth/2-.025:
                end = min(depth/2, start+rng.uniform(.33, .52) *
                          (.61 if row % 2 and start == -depth/2 else 1))
                low = row/rows + rng.uniform(-.009, .009)
                high = min(1, (row+1.22)/rows)
                a, b = start+.003, end-.003
                p = [roof_pt(low+.013, a, .035), roof_pt(low, a+.025, .035),
                     roof_pt(low, b-.02, .035), roof_pt(low+.012, b, .035),
                     roof_pt(high, b, .008), roof_pt(high, a, .008)]
                if end-start > .055:
                    kit.mesh.face(p if side > 0 else p[::-1], "slate", tint=rng.uniform(.67, 1.16))
                    kit.mesh.face([p[1]-V((0, 0, .026)), p[2]-V((0, 0, .026)),
                                  p[2], p[1]], "slate", tint=.55)
                start = end
        for y in (-depth/2, depth/2):
            for i in range(3):
                lintel(roof_pt(i/3, y, -.045), roof_pt((i+1)/3, y, -.045), .115)
        lintel(roof_pt(0, -depth/2, -.065), roof_pt(0, depth/2, -.065), .11)
    # Clay half-round ridge coping with overlaps, following the sag.
    count = max(2, math.ceil(depth/.51))

    def crest(y):
        return (cx+lean, cy+y, peak-.16*math.cos(math.pi*y/depth)+.014)
    for i in range(count):
        y = -depth/2+i*depth/count
        taper(crest(y), crest(y+depth/count+.018), .094, .10, "clay", 8, rng.uniform(.70, .95))


def casement(x, y, z, w, h, lit=True):
    cube(x, y, z-.05, w+.14, .13, h+.13, "oak", .53)
    kit.mesh.face([(x-w/2, y-.106, z), (x+w/2, y-.106, z),
                   (x+w/2, y-.106, z+h), (x-w/2, y-.106, z+h)],
                  "glazing" if lit else "iron", [(0, 0), (1, 0), (1, 1), (0, 1)], .88)
    for xx in (x-w/2, x, x+w/2):
        lintel((xx, y-.109, z-.045), (xx, y-.109, z+h+.045), .052, .065)
    for pos in (0, .66, 1):
        cube(x, y-.113, z+pos*h-.02, w+.06, .06, .041, "oak", .74)
    for pane in range(2):
        left = x-w/2+pane*w/2
        for sign in (-1, 1):
            start = -h
            while start < w/2:
                lo = max(0, -start)
                hi = min(h, w/2-start)
                if hi > lo+.013:
                    def corner(v):
                        s = start+v
                        return (left+(s if sign > 0 else w/2-s), y-.114, z+v)
                    beam(corner(lo), corner(hi), .018, mat="iron")
                start += .24
    cube(x, y-.13, z-.09, w+.27, .24, .084, "stone")
    # Shutters are planked, iron-strapped and hung at slightly different angles.
    sw = w*.30
    for side in (-1, 1):
        cx = x+side*(w*.5+sw*.5+.08)
        for p in range(3):
            cube(cx+(p-1)*sw/3, y-.005, z+.016, sw/3-.008, .077, h*.97, "oak", .68+p*.045)
        for f in (.17, .81):
            cube(cx, y-.060, z+f*h, sw*.95, .033, .048, "iron")


def cottage():
    w, d = COTTAGE["width"], COTTAGE["depth"]
    sill, eave, peak = COTTAGE["sill"], COTTAGE["eave"], COTTAGE["ridge"]
    cube(0, 0, .03, w+.06, d+.06, sill, "stone", .62)
    for side in (-1, 1):
        # Distinct rubble courses turn the corners at alternating lengths.
        for row in range(3):
            for along, length in ((True, w), (False, d)):
                pos = -length/2
                while pos < length/2-.035:
                    end = min(length/2, pos+rng.uniform(.36, .78))
                    if end-pos > .09:
                        center = (end+pos)/2
                        if along:
                            schist(center, side*d/2, row*.215, end-pos, .22, .23)
                        else:
                            schist(side*w/2, center, row*.215, .21, end-pos, .23)
                    pos = end
    section("01 Rubble plinth and quoins", "cottage")
    for sign in (-1, 1):
        y = sign*d/2
        xs = [-w/2, -1.88, -.72, .27, 1.49, w/2]
        for x0, x1 in zip(xs, xs[1:]):
            kit.mesh.face([(x0, y, sill), (x1, y, sill), (x1+.045, y, eave), (x0+.045, y, eave)], "plaster",
                          tint=rng.uniform(.87, 1.06))
        for x in (-w/2, -.66, 1.5, w/2):
            lintel((x, y, sill-.02), (x+.05, y, eave+.1), .165, .172)
        for z in (sill, eave-.02):
            cube(0, y, z, w+.22, .20, .147, "oak")
        for xx, dx in ((-2.28, .55), (-.60, -.53), (1.55, .67)):
            lintel((xx, y, eave-.03), (xx+dx, y, eave-.70), .10)
        # The slightly projecting loft puts the lower elevation into relief.
        gy = y+sign*.105
        kit.mesh.face([(-w/2-.08, gy, eave+.12), (w/2+.08, gy, eave+.12),
                      (-.25, gy, peak-.02)], "plaster", tint=.98)
        for xx in (-1.65, -.92, 0, .94, 1.72):
            top = eave+(peak-eave)*(1-abs(xx+.25)/(w/2+.2))
            lintel((xx, gy, eave+.12), (xx-.035, gy, max(eave+.20, top)), .104)
        for x in (-2.1, 1.98):
            lintel((x, gy, eave+.17), (x*.50, gy, eave+.89), .12)
        # Shaded end grain under the overhanging floor beam.
        for i in range(9):
            cube(-2.12+i*.52, y+sign*.08, eave-.11, .12, .34, .20, "oak", .79)
        xx = sign*w/2
        for a, b in ((-d*.5, -.82), (-.82, .81), (.81, d*.5)):
            kit.mesh.face([(xx, a, sill), (xx, b, sill), (xx, b, eave+.11), (xx, a, eave+.11)], "plaster")
            lintel((xx, a, sill), (xx, a+.06, eave+.16), .16)
            lintel((xx, a, sill+.1), (xx, b-.05, eave-.04), .12)
        for z in (sill, eave-.02):
            cube(xx, 0, z, .18, d+.14, .14, "oak")
    section("02 Limewashed timber frame", "cottage")
    roof(-.015, 0, 2.76, 5.19, eave+.08, peak+.15, -.25, 9)
    # Twin battered flues share a sandstone cap above the slate.
    cube(1.28, .86, 3.91, .64, .82, 1.78, "stone")
    for i in range(4):
        for n in range(2):
            schist(1.10+n*.33, .86, 5.15+i*.14, .36, .85, .15, "stone")
    cube(1.28, .86, 5.69, .83, .99, .13, "stone")
    for x in (1.10, 1.47):
        kit.cylinder(x, .86, 5.80, [(0, .148), (.19, .13), (.49, .145), (.54, .17), (.61, .17)], "clay", 9)
        kit.cylinder(x, .86, 6.411, [(0, .105), (.009, .104)], "iron", 9, .53)
    section("03 Weathered slate and twin chimney", "cottage")
    y = -d/2
    casement(-1.48, y-.047, 1.23, .91, 1.09)
    casement(.03, y-.16, 3.42, .59, .72)
    # Recess, door jambs and hood supports are jointed into the facade.
    cube(.83, y-.055, .10, 1.24, .18, 2.13, "oak", .36)
    for i in range(6):
        cube(.385+i*.178, y-.152, .15, .168, .052, 1.96, "oak", .88+i*.019)
    for x in (.22, 1.43):
        lintel((x, y-.17, .09), (x+.016, y-.17, 2.25), .137, .165)
    for z in (.53, 1.59):
        cube(.71, y-.200, z, .74, .032, .062, "iron")
        for x in (.41, .61, .83):
            cube(x, y-.222, z+.014, .023, .016, .024, "iron", 1.3)
    cube(1.18, y-.22, 1.12, .094, .055, .12, "iron")
    for x in (.05, 1.60):
        lintel((x, y-.10, 1.96), (x, y-.71, 2.34), .085)
    roof(.83, y-.41, .95, 1.01, 2.29, 2.95, -.025, 4)
    schist(.82, y-.41, .015, 1.65, .71, .15)
    section("04 Street door and shuttered casements", "cottage")
    # The three-sided projecting oriel is authored facing front, then rotated east.
    cube(0, 0, .85, 1.53, .67, .28, "stone")
    cube(0, 0, 1.1, 1.57, .69, 2.0, "plaster")
    for x in (-.78, .78):
        lintel((x, -.34, 1.05), (x, -.34, 3.29), .13)
        lintel((x, -.36, 1.0), (x, .21, .65), .13)
    casement(0, -.36, 1.58, .90, 1.01)
    kit.mesh.face([(-.79, -.34, 3.10), (.79, -.34, 3.10), (-.08, -.34, 4.12)], "plaster")
    lintel((-.78, -.36, 3.10), (.80, -.36, 3.10), .11)
    roof(0, .24, .98, 1.61, 3.17, 4.33, -.10, 5)
    for i, p in enumerate(kit.mesh.points):
        kit.mesh.points[i] = V((2.36-p.y, p.x-.36, p.z))
    section("05 Projecting east oriel", "cottage")
    # A sparse climbing vine traces the wet eastern wall. Leaf blades angle out
    # of the wall plane and sit clear of the trimmed oriel, glass and roofline.
    for stem, sign in ((-.96, -1), (.70, 1)):
        root = V((2.47, stem, .20))
        for j in range(10):
            t = (j+1)/10
            end = V((2.47+.028*math.sin(j*2.1), stem+sign*(.43*t+.11*math.sin(j*.77)),
                     .21+2.47*t))
            taper(root, end, .017*(1-.57*t), .014*(1-.6*t), "oak", 5, .64)
            for k in (-1, 1):
                shoot = end+V((.019, k*rng.uniform(.09, .26), rng.uniform(.035, .13)))
                taper(end, shoot, .006, .003, "oak", 4, .75)
                for n in range(3):
                    a = shoot+V((.008, .035*k*n, .027*n))
                    L = rng.uniform(.076, .127)
                    tip = a+V((.021, k*L*.55, -L*.81))
                    mid = (a+tip)*.50
                    kit.mesh.face([a, mid+V((.003, -.037, -.021*k)), tip, mid+V((.004, .032, .018*k))],
                                  "lichen", tint=rng.uniform(.70, 1.03))
            root = end
    section("06 Old climbing vine", "cottage")
    kit.pointlight("Hearth behind the shutter", (-1.40, y-.54, 1.81), 12)


def ash():
    """Pollard-like forked ash with a wind-shorn crown, open skylights and dead spur."""
    h = ASH["height"]
    radius = ASH["trunk_radius"]
    for i in range(7):
        a = i*TAU/7
        taper((math.cos(a)*.43, math.sin(a)*.41, .022), (0, 0, .40), .028, .122, "bark", 6, .68)
    trunk = [(0, 0, 0), (.052, -.036, .54), (-.10, -.015, 1.43), (.025, .018, 2.28), (.17, .09, 3.03)]
    limb(trunk, [radius*s for s in (1.29, 1.06, .88, .82, .63)], 10)

    def spray(start, direction, length, width, shade):
        axis = V(direction).normalized()
        flat = V((-axis.y, axis.x, 0)).normalized()
        tilt = rng.uniform(-1.06, 1.06)
        cross = (flat*math.cos(tilt)+axis.cross(flat)*math.sin(tilt))*width*.5
        start = V(start)
        tip = start+axis*length
        mid = (start+tip)*.5+V((0, 0, .09))
        # Two bent quads give each spray volume at grazing angles.
        for side in (-1, 1):
            p = [start, start+cross*side, mid+cross*side, mid]
            q = [mid, mid+cross*side, tip+cross*side*.56, tip]
            kit.mesh.face(p, "foliage", [(.5, 0), (.5+.5*side, 0), (.5+.5*side, .5), (.5, .5)], shade)
            kit.mesh.face(q, "foliage", [(.5, .5), (.5+.5*side, .5), (.5+.5*side, 1), (.5, 1)], shade)
    for i in range(11):
        angle = i*2.40+rng.uniform(-.24, .24)
        radial = V((math.cos(angle), math.sin(angle), 0))
        tangent = V((-radial.y, radial.x, 0))
        upper = i >= 7
        if upper:
            start = V(trunk[3]).lerp(V(trunk[4]), rng.uniform(.68, .96))
        else:
            start = V(trunk[2]).lerp(V(trunk[3]), rng.uniform(.31, .99))
        # Outer limbs arc out, then fork up and back toward the light.
        reach = ASH["crown_radius"]*(.27 if upper else rng.uniform(.54, .77))
        elbow = start+radial*reach*.54+tangent*rng.uniform(-.29, .26)+V((0, 0, .83 if upper else .47))
        fork = start+radial*reach+tangent*rng.uniform(-.27, .24)+V((0, 0, 1.81 if upper else .89))
        limb([start, elbow, fork], [.139 if upper else .112, .089, .057], 7)
        for j in range(4):
            fan = radial*(.37 if upper else .56)+tangent*(j-1.5)*.31
            joint = elbow.lerp(fork, .48+j*.16)
            b = joint+fan+V((0, 0, rng.uniform(.43, 1.03)))
            c = b+fan*.41+V((0, 0, (h-b.z)*.64 if upper else rng.uniform(.23, .64)))
            limb([joint, b, c], [.047, .026, .006], 6, .85)
            # Gaps between clumps keep the fork visible from the lane.
            for k in range(5):
                phi = angle+k*2.40
                direction = V((math.cos(phi), math.sin(phi), rng.uniform(-.29, .84)))
                root = b.lerp(c, k/5)
                shoot = root+direction*.23
                spray(shoot, direction, rng.uniform(.91, 1.20),
                      rng.uniform(.84, 1.13), rng.uniform(.74, 1.17))
    taper((-.02, 0, 1.70), (-.44, -.22, 2.10), .079, .033, "bark", 6, .76)
    section("Forked ash and terminal leaf sprays", "ash")


def wall():
    length, width = WALL["length"], WALL["width"]
    # A wall has two faces and a rubble heart. The heart shows through weathered
    # joints, keeps the cap supported and stops daylight leaking between courses.
    cube(0, 0, .008, length-.03, width*.73, .586, "stone", .67)
    for course in range(WALL["courses"]):
        start = -length/2
        while start < length/2-.04:
            end = min(length/2, start+rng.uniform(.34, .63) *
                      (.72 if course % 2 and start == -length/2 else 1))
            if end-start > .08:
                depth = width*(1-.045*course)*rng.uniform(.96, 1.06)
                schist((start+end)/2, rng.uniform(-.045, .045), course*.149,
                       end-start+.073, depth, .174+rng.uniform(-.011, .012),
                       "lichen" if rng.random() < .09+course*.065 else "stone")
            start = end
    # Coping stones are thin slabs laid broadside across the two wall faces.
    for i in range(7):
        x = -1.18+i*.386
        schist(x, 0, .578, .432+rng.uniform(-.017, .025), width*.96, .094+rng.uniform(0, .024),
               "lichen" if i in (1, 4) else "stone")
    section("Dry-laid schist with lichen capstones", "wall")


def blade(p, direction, length, width, rise, mat, shade):
    p = V(p)
    direction = V(direction).normalized()
    cross = V((-direction.y, direction.x, 0)).normalized()*width
    mid = p+direction*length*.41+V((0, 0, rise*.75))
    tip = p+direction*length+V((0, 0, rise))
    kit.mesh.face([p-cross*.28, mid-cross*.50, tip, mid+cross*.52, p+cross*.27], mat, tint=shade)


def bank():
    for x, y, w, h in ((-.48, .05, .63, .18), (.17, .19, .45, .16), (.67, -.12, .60, .21), (-.81, -.32, .28, .10)):
        schist(x, y, 0, w, w*.55, h, "lichen" if x > 0 else "stone")
    for _ in range(BANK["tussocks"]):
        x = rng.uniform(-.87, .87)
        y = rng.uniform(-.43, .43)
        for j in range(11):
            a = j*2.4+rng.uniform(-.25, .25)
            blade((x+math.cos(a)*.024, y+math.sin(a)*.024, 0), (math.cos(a), math.sin(a), 0),
                  rng.uniform(.09, .22), rng.uniform(.015, .027), rng.uniform(.11, .37), "grass", rng.uniform(.69, 1.15))
    for j in range(BANK["ferns"]):
        x = (j-2)*BANK["width"]*.16
        y = rng.uniform(-.31, .31)
        for k in range(7):
            a = k*TAU/7+j*.75
            d = V((math.cos(a), math.sin(a), 0))
            side = V((-d.y, d.x, 0))
            length = rng.uniform(.25, .44)
            height = rng.uniform(.24, .48)

            def rachis(t):
                return V((x, y, 0))+d*length*t+V((0, 0, height*math.sin(t*2.20)))
            for n in range(8):
                lo, hi = n/8, (n+1)/8
                u, v = rachis(lo), rachis(hi)
                w0 = .006*(1-.77*lo)
                w1 = .006*(1-.77*hi)
                kit.mesh.face([u-side*w0, v-side*w1, v+side*w1, u+side*w0], "leaf", tint=.72)
            for n in range(7):
                t = (n+.8)/8
                for s in (-1, 1):
                    base = rachis(t)
                    axis = (d*.50+side*s).normalized()
                    blade(base, axis, length*(1-t*.77)*.36, .057*(1-t*.49),
                          .022 if n > 3 else -.022, "leaf", .83+.31*t)
    section("Schist bank, arching ferns and bent grass", "bank")


def woodpile():
    # Variable riven sections have planar cut faces, rough bark on the uncut edge.
    for row in range(4):
        for i in range(6-row):
            r = rng.uniform(.095, .125)
            x = (i-(5-row)/2)*.211+rng.uniform(-.018, .018)
            z = .112+row*.17
            y = rng.uniform(-.035, .025)
            phase = rng.uniform(0, TAU)
            outline = [(x+r*math.cos(phi), z+r*math.sin(phi)) for phi in (phase+j*TAU/7 for j in range(7))]
            outline[0] = (x+r*.12, z+r*.09)
            a, b = [[(xx, y+f+rng.uniform(-.012, .012), zz) for xx, zz in outline] for f in (-.32, .32)]
            kit.mesh.face(a, "grain", tint=rng.uniform(.83, 1.1))
            kit.mesh.face(b[::-1], "grain", tint=.75)
            for k in range(7):
                n = (k+1) % 7
                kit.mesh.face([a[k], b[k], b[n], a[n]], "oak" if k in (0, 6)
                              else "bark", [(0, 0), (1, 0), (1, 1), (0, 1)])
    for x in (-.63, .63):
        taper((x, -.16, 0), (x*1.11, -.13, .83), .053, .043, "bark", 6, cap="grain")
    section("Riven cordwood between ash stakes", "woodpile")


BUILDERS = {"cottage": cottage, "ash": ash, "bank": bank, "wall": wall, "woodpile": woodpile}


def bounds(objects):
    pts = [o.matrix_world @ V(corner) for o in objects if o.type == "MESH" for corner in o.bound_box]
    return [[min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]]


def export_asset(asset, scene):
    bpy.context.window.scene = scene
    setup_materials(asset)
    rng.seed(SEED+list(BUILDERS).index(asset))
    kit.mesh = AtlasMesh(asset)
    BUILDERS[asset]()
    # Leave the labelled parts in the source, join copies into a single render mesh.
    parts = [o for o in scene.objects if o.type == "MESH"]
    copies = []
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        clone = part.copy()
        clone.data = part.data.copy()
        scene.collection.objects.link(clone)
        clone.select_set(True)
        copies.append(clone)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "Merewatch "+asset
    for o in scene.objects:
        if o.type == "LIGHT":
            o.select_set(True)
    bpy.context.view_layer.update()
    expected = bounds([joined])
    bpy.ops.export_scene.gltf(filepath=str(OUT/(asset+".glb")), export_format="GLB", use_selection=True, use_active_scene=True,
                              export_lights=True, export_animations=False, export_vertex_color="ACTIVE", export_yup=True)
    bpy.data.objects.remove(joined, do_unlink=True)
    return expected


def roundtrip(asset, expected):
    path = OUT/(asset+".glb")
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20+length])
    assert len(gltf["scenes"]) == 1 and len(gltf["meshes"]) == 1
    prims = gltf["meshes"][0]["primitives"]
    draws = len(prims)
    assert draws == (2 if asset in ("ash", "cottage") else 1), (asset, draws)
    assert all("bufferView" in im for im in gltf["images"])
    if asset == "ash":
        assert any(m.get("alphaMode") == "MASK" for m in gltf["materials"]), "Canopy must depth-write"
    triangles = sum(gltf["accessors"][p["indices"]]["count"]//3 for p in prims)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    assert bpy.ops.import_scene.gltf(filepath=str(path)) == {"FINISHED"}
    objects = list(bpy.context.scene.objects)
    meshes = [o for o in objects if o.type == "MESH"]
    assert len(meshes) == 1
    meshes[0].data.calc_loop_triangles()
    assert len(meshes[0].data.loop_triangles) == triangles
    assert len(meshes[0].data.materials) == draws
    assert len([o for o in objects if o.type == "LIGHT"]) == int(asset == "cottage")
    assert meshes[0].data.uv_layers and meshes[0].data.color_attributes
    actual = bounds(objects)
    assert max(abs(a-b) for aa, bb in zip(actual, expected) for a, b in zip(aa, bb)) < .002
    dims = [round(b-a, 3) for a, b in zip(*actual)]
    print(f"ROUNDTRIP {asset}: {triangles} triangles, {draws} primitives, {len(data)} bytes, "
          f"X/Y/Z-up dimensions {dims}, embedded images {len(gltf['images'])}", flush=True)


def main():
    OUT.mkdir(exist_ok=True, parents=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = "NONE"
    expected = {}
    for i, asset in enumerate(BUILDERS):
        scene = bpy.context.scene if i == 0 else bpy.data.scenes.new(asset)
        scene.name = asset
        expected[asset] = export_asset(asset, scene)
    bpy.context.window.scene = bpy.data.scenes["cottage"]
    bpy.ops.file.pack_all()
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"merewatch-lane.blend"), compress=True)
    for asset in BUILDERS:
        roundtrip(asset, expected[asset])


if __name__ == "__main__":
    main()
