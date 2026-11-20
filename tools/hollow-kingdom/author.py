"""Blender background compiler for the original Merewatch environment kit."""
from pathlib import Path
from math import sin, cos, pi, ceil
import random
import sys
import bpy
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from shore import build_shore

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/hollow-kingdom"
rng = random.Random()
V = Vector
TAU = 2*pi
MATERIALS = {}


def material(name, texture=None, rgb=(.14,.11,.08), glow=None, cutout=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    tree = m.node_tree
    bs = tree.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = .85
    bs.inputs["Base Color"].default_value = (*rgb,1)
    if texture:
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(OUT/texture),check_existing=True)
        tree.links.new(tex.outputs["Color"],bs.inputs["Base Color"])
        if cutout:
            tree.links.new(tex.outputs["Alpha"],bs.inputs["Alpha"])
            # Explicit alpha cutoff exports as MASK, with depth writes on the cards.
            clip = tree.nodes.new("ShaderNodeMath")
            clip.operation = "GREATER_THAN"
            clip.inputs[1].default_value = .42
            tree.links.new(tex.outputs["Alpha"],clip.inputs[0])
            tree.links.new(clip.outputs[0],bs.inputs["Alpha"])
    if glow:
        bs.inputs["Emission Color"].default_value = (*glow,1)
        bs.inputs["Emission Strength"].default_value = 1.7
    MATERIALS[name] = m


def palette():
    for name,tex in [("hewn oak","oak.jpg"),("quarry stone","limestone.jpg"),
                     ("slate","slate.jpg"),("fieldstone","fieldstone.jpg"),("lime plaster","limewash.jpg")]:
        material(name,tex)
    material("iron",rgb=(.047,.043,.042))
    material("recess",rgb=(.037,.027,.025))
    material("reed brass",rgb=(.34,.19,.057))
    material("lamplight",rgb=(.80,.27,.035),glow=(1,.255,.028))
    material("deep moss",rgb=(.085,.12,.054))
    material("heath",rgb=(.23,.12,.26))
    material("spruce needles","spruce.png",cutout=True)


class Mesh:
    """One indexed Blender mesh per asset, batched by material on export."""
    def __init__(self):
        self.points, self.faces, self.styles, self.uv, self.tint = [],[],[],[],[]

    def face(self, pts, mat, uv=None, tint=1):
        pts = [V(p) for p in pts]
        self.faces.append(tuple(range(len(self.points),len(self.points)+len(pts))))
        self.points.extend(pts)
        self.styles.append(mat)
        if uv is None:
            n = (pts[1]-pts[0]).cross(pts[2]-pts[0])
            axis = max(range(3), key=lambda a: abs(n[a]))
            axes = [(1,2),(0,2),(0,1)][axis]
            scale = 2.4 if mat=="fieldstone" else 1.7
            uv = [(p[axes[0]]/scale,p[axes[1]]/scale) for p in pts]
        self.uv.extend(uv)
        self.tint.extend([tint]*len(pts))

    def solid(self, rings, mat, tint=1):
        self.face(list(reversed(rings[0])),mat,tint=tint)
        for lo, hi in zip(rings,rings[1:]):
            for i in range(len(lo)):
                j=(i+1)%len(lo)
                self.face([lo[i],lo[j],hi[j],hi[i]],mat,tint=tint)
        self.face(rings[-1],mat,tint=tint)

    def finish(self,name):
        me=bpy.data.meshes.new(name)
        me.from_pydata(self.points,[],self.faces)
        me.update()
        used=list(dict.fromkeys(self.styles))
        for mat in used: me.materials.append(MATERIALS[mat])
        for p,mat in zip(me.polygons,self.styles): p.material_index=used.index(mat)
        layer=me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv",[v for uv in self.uv for v in uv])
        col=me.color_attributes.new(name="Weathering",type="FLOAT_COLOR",domain="CORNER")
        col.data.foreach_set("color",[v for t in self.tint for v in (t,t,t,1)])
        me.color_attributes.active_color=col
        obj=bpy.data.objects.new(name,me)
        bpy.context.collection.objects.link(obj)
        return obj


def block(x,y,z,w,d,h,mat="hewn oak",tint=1):
    ring=[(x+a*w/2,y+b*d/2) for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    mesh.solid([[(u,v,k) for u,v in ring] for k in (z,z+h)],mat,tint)


def beam(a,b,w,d=None,mat="hewn oak",sides=4,tint=1):
    a,b=V(a),V(b)
    axis=(b-a).normalized()
    ref=V((0,1,0)) if abs(axis.y)<.9 else V((0,0,1))
    u=axis.cross(ref).normalized()
    v=axis.cross(u)
    rings=[]
    for p in (a,b):
        rings.append([p + (u*cos((i+.5)*TAU/sides)*w+v*sin((i+.5)*TAU/sides)*(d or w))/
                      (2*cos(pi/sides)) for i in range(sides)])
    mesh.face(rings[0][::-1],mat,tint=tint)
    for i in range(sides):
        j=(i+1)%sides
        mesh.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat,
                  [(0,i*.19),(0,(i+1)*.19),((b-a).length/2,(i+1)*.19),((b-a).length/2,i*.19)],tint)
    mesh.face(rings[1],mat,tint=tint)


def cylinder(x,y,z,levels,mat,n=12,tint=1):
    rings=[[(x+r*cos(i*TAU/n),y+r*sin(i*TAU/n),z+h) for i in range(n)] for h,r in levels]
    mesh.solid(rings,mat,tint)


def stone(x,y,z,w,d,h,mat="quarry stone"):
    # Clipped, uneven corners and a light-catching crown.
    corners=[(-.50,-.30),(-.34,-.50),(.34,-.50),(.50,-.31),(.50,.32),(.32,.50),(-.34,.50),(-.50,.32)]
    outline=[(a+rng.uniform(-.04,.04),b+rng.uniform(-.035,.035)) for a,b in corners]
    mesh.solid([[(x+a*w*s,y+b*d*s,z+f*h) for a,b in outline] for f,s in [(0,.91),(.23,1),(.78,1),(1,.89)]],
               mat,rng.uniform(.62,1.10))


def roof(cx,cy,half,depth,eave,peak,lean=.12):
    """Timbered gable ends with two individually coursed, sagging slate slopes."""
    for side in (-1,1):
        def pt(t,y,lift=0):
            sag=.12*cos(y*pi/depth)*sin(t*pi)
            return V((cx+side*half*(1-t)+lean*t,cy+y,eave+(peak-eave)*t-sag+lift))
        winding=lambda pts: pts if side<0 else pts[::-1]
        mesh.face(winding([pt(0,-depth/2,-.15),pt(1,-depth/2,-.15),
                            pt(1,depth/2,-.15),pt(0,depth/2,-.15)]),"recess")
        rows=max(4,ceil((peak-eave)/.29))
        for row in range(rows):
            t=row/rows
            y=-depth/2
            while y<depth/2-.025:
                width=rng.uniform(.31,.48)*(.56 if row%2 and y==-depth/2 else 1)
                end=min(depth/2,y+width)
                r=min(1,(row+1.22)/rows)
                low=t+rng.uniform(-.006,.006)
                verts=[pt(low+.009,y+.007,.039),pt(low,y+.043,.039),pt(low,end-.047,.039),
                       pt(low+.013,end-.006,.039),pt(r,end-.006,.014),pt(r,y+.007,.014)]
                # Top normal and a chipped, exposed dark lower lip.
                mesh.face(verts if side>0 else verts[::-1],"slate",tint=rng.uniform(.58,1.19))
                mesh.face([verts[1]-V((0,0,.037)),verts[2]-V((0,0,.037)),verts[2],verts[1]],
                          "slate",tint=.48)
                y=end
        for y in (-depth/2,depth/2):
            beam(pt(0,y,-.08),pt(1,y,-.08),.15)
        beam(pt(0,-depth/2,-.08),pt(0,depth/2,-.08),.16)
    beam((cx+lean,cy-depth/2-.05,peak+.04),(cx+lean,cy+depth/2+.05,peak+.04),.16,mat="slate",sides=8)


def gable(cx,cy,w,d,eave,peak,lean):
    for y in (cy-d/2,cy+d/2):
        mesh.face([(cx-w/2,y,eave),(cx+w/2,y,eave),(cx+lean,y,peak)],"lime plaster")
        for x in (-w*.47,0,w*.47):
            beam((cx+x,y,eave),(cx+lean,y,peak),.14)
    roof(cx,cy,w/2+.34,d+.73,eave-.16,peak+.25,lean)


def window(x,y,z,w=.75,h=1.12):
    # Amber leaded glass, timber reveal and diamond cames on the street elevation.
    block(x,y,z-.085,w+.20,.16,h+.18,"recess")
    block(x,y-.09,z,w,.042,h,"lamplight")
    for s in (-1,1):
        beam((x+s*w/2,y-.14,z-.08),(x+s*w/2,y-.14,z+h+.045),.082)
    for k in (z-.04,z+h+.025): block(x,y-.12,k,w+.22,.21,.09)
    for sign in (-1,1):
        start=-h-.25
        while start<w:
            lo=max(0,-start); hi=min(h,w-start)
            if hi>lo:
                def at(v): return (x+sign*(start+v-w/2),y-.13,z+v)
                beam(at(lo),at(hi),.025,mat="iron")
            start+=.30


def pointlight(name,xyz,candela):
    light=bpy.data.lights.new(name,"POINT")
    light.energy=candela*4*pi/683
    light.use_custom_distance=True
    light.cutoff_distance=7
    light.color=(1,.51,.20)
    obj=bpy.data.objects.new(name,light)
    bpy.context.collection.objects.link(obj)
    obj.location=xyz


def cottage():
    w,d=4.7,4.4
    block(0,0,.03,w+.12,d+.12,.89,"fieldstone")
    for row in range(3):
        for i in range(7):
            stone(-2.12+i*.70+(row%2)*.12,-2.22,.03+row*.27,.7,.24,.27)
    block(.03,0,.9,w,d,2.15,"lime plaster")
    block(.10,-.06,3.05,w+.18,d+.16,.28)
    gable(.10,-.05,w+.15,d+.15,3.33,5.66,-.27)
    for side in (-1,1):
        y=side*2.24
        for i,xx in enumerate((-2.27,-.97,.58,2.29)):
            beam((xx,y,.81),(xx+(-.08 if i%2 else .1),y,3.22),.18)
        for xx in (-2.19,.68):
            beam((xx,y,2.98),(xx+.79,y,2.22),.126)
        for k in (.87,2.99): block(0,y,k,4.8,.18,.13)
        xx=side*2.37
        for yy in (-2.0,-.35,2.05): beam((xx,yy,.83),(xx,yy+.09,3.07),.19)
        beam((xx,-1.94,1.03),(xx,-.39,2.96),.15)
        beam((xx,-.26,2.96),(xx,1.99,1.07),.15)
    window(-1.42,-2.27,1.37,1.06,1.22)
    window(.05,-2.36,3.51,.72,.91)
    # Recessed plank door with strap hinges and a pitched rain hood.
    block(.82,-2.25,.12,1.2,.23,2.09,"recess")
    for i in range(6): block(.39+i*.17,-2.39,.15,.159,.10,1.97,"hewn oak",.72+i*.035)
    for x in (.23,1.42): beam((x,-2.43,.11),(x,-2.43,2.34),.16)
    for z in (.57,1.72): block(.65,-2.46,z,.77,.045,.07,"iron")
    block(1.12,-2.48,1.08,.09,.06,.10,"reed brass")
    roof(.83,-2.51,1.01,1.12,2.33,2.99,.02)
    for x in (.08,1.55): beam((x,-2.30,1.98),(x,-2.99,2.31),.11)
    stone(.82,-2.63,.0,1.70,.78,.16)
    # Tall battered chimney with projecting collar and double clay flue.
    block(1.44,.82,3.22,.71,.78,2.47,"fieldstone")
    for k in (5.24,5.60): block(1.44,.82,k,.88,.96,.14,"quarry stone")
    for yy in (.61,1.04): cylinder(1.44,yy,5.72,[(0,.15),(.34,.13),(.4,.17)],"hewn oak",9)
    # Cross-gable over the projecting leaded oriel. Build in elevation, then turn east.
    start=len(mesh.points)
    block(0,0,1.02,1.8,.79,.25,"fieldstone")
    block(0,0,1.27,1.67,.68,2.43,"lime plaster")
    window(0,-.36,1.56,1.33,1.03)
    for x in (-.79,.79): beam((x,-.34,1.25),(x,-.34,3.78),.13)
    block(0,-.35,2.85,1.8,.17,.16)
    gable(0,.47,1.74,1.75,3.71,4.83,.09)
    window(0,-.43,3.06,.55,.61)
    for i in range(start,len(mesh.points)):
        p=mesh.points[i]
        mesh.points[i]=V((2.36-p.y,p.x-.43,p.z))
    pointlight("Light through shutters",(-1.4,-2.88,1.98),16)


def cobbles():
    for row in range(15):
        y=-2.0+(row+.5)*4/15
        x=-1.49+rng.uniform(-.09,.09)
        while x<1.46:
            w=min(rng.uniform(.34,.64),1.51-x)
            if w>.12: stone(x+w/2,y,.0,w-.009,.265,.045+rng.random()*.025)
            x+=w


BUILDERS={"cottage":cottage,"cobbles":cobbles}
BUILDERS.update(build_shore(sys.modules[__name__]))


def export(name):
    global mesh
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    rng.seed("Merewatch 1/"+name)
    mesh=Mesh()
    BUILDERS[name]()
    mesh.finish(name)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+".glb")),export_format="GLB",
                              export_lights=True,export_vertex_color="ACTIVE",
                              export_animations=False,export_yup=True)


if __name__=="__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    palette()
    for asset in (sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else BUILDERS):
        export(asset)
