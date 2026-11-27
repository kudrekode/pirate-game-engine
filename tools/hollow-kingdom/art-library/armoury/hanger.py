"""Author the Heron Hanger, a grip-centred prop for the existing Golden hand socket."""
import hashlib
import json
from math import cos, pi, sin, tau
from pathlib import Path
import struct
import sys
import bpy
from mathutils import Vector as V

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
OUT=ROOT/"public/assets/hollow-kingdom/art-library/armoury/heron-hanger.glb"
DOC=ROOT/"docs/assets/art-library/armoury"
SOURCE=HERE/"heron-hanger.blend"


def material():
    mat=bpy.data.materials.new("Engraved steel, dark hide and aged latten")
    mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bs=nodes.get("Principled BSDF")
    def image(name,x,y,linear):
        node=nodes.new("ShaderNodeTexImage")
        node.image=bpy.data.images.load(str(HERE/"maps"/(name+".jpg")))
        if linear: node.image.colorspace_settings.name="Non-Color"
        node.location=(x,y)
        return node.outputs["Color"]
    links.new(image("pigment",-670,320,False),bs.inputs["Base Color"])
    normal=nodes.new("ShaderNodeNormalMap")
    normal.location=(-230,-290)
    normal.inputs["Strength"].default_value=.68
    links.new(image("grain",-670,-290,True),normal.inputs["Color"])
    links.new(normal.outputs[0],bs.inputs["Normal"])
    channels=nodes.new("ShaderNodeSeparateColor")
    channels.location=(-215,20)
    links.new(image("polish",-670,20,True),channels.inputs[0])
    links.new(channels.outputs[1],bs.inputs["Roughness"])
    links.new(channels.outputs[2],bs.inputs["Metallic"])
    return mat


class Piece:
    def __init__(self,surf):
        self.surf=surf
        self.verts,self.faces,self.uv,self.smooth=[],[],[],[]

    def face(self,indices,style,smooth=False):
        self.faces.append(indices)
        self.smooth.append(smooth)
        cell=("steel","latten","iron","hide").index(style)
        for i in indices:
            x,y,z=self.verts[i]
            if style=="steel":
                # Follow the centreline so the maker's mark stays inside the fuller.
                left,right=blade_edges(z)
                u=.03+.94*(x-left)/max(.003,right-left)
                v=.025+.95*(z-.098)/.834
            else:
                u=.45+2.25*x+1.3*y
                v=.50+1.84*z+1.42*y
            self.uv.append(((cell%2+max(.005,min(.995,u)))/2,
                            (1-cell//2+max(.005,min(.995,v)))/2))

    def loft(self,rings,style,smooth=False,caps=True):
        n=len(rings[0])
        start=len(self.verts)
        for ring in rings:
            self.verts.extend(map(V,ring))
        if caps:
            self.face([start+i for i in reversed(range(n))],style)
        for j in range(len(rings)-1):
            lo=start+j*n
            for i in range(n):
                k=(i+1)%n
                self.face([lo+i,lo+k,lo+k+n,lo+i+n],style,smooth)
        if caps:
            self.face([start+(len(rings)-1)*n+i for i in range(n)],style)

    def curve(self,path,radius,style,width=1,sides=9):
        path=list(map(V,path))
        radii=radius if isinstance(radius,list) else [radius]*len(path)
        rings=[]
        for i,(p,r) in enumerate(zip(path,radii)):
            axis=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
            # Use a stable normal on the open-work guard lying in its X/Z plane.
            ref=V((0,1,0)) if abs(axis.y)<.85 else V((0,0,1))
            a=ref.cross(axis).normalized()
            b=axis.cross(a)
            rings.append([p+r*(cos(k*tau/sides)*a+sin(k*tau/sides)*b*width) for k in range(sides)])
        self.loft(rings,style,True)

    def turn(self,profiles,style,count=28):
        rings=[[(cx+rx*cos(k*tau/count),ry*sin(k*tau/count),z) for k in range(count)]
               for z,rx,ry,cx in profiles]
        self.loft(rings,style,True)

    def finish(self,name):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts,[],self.faces)
        mesh.materials.append(self.surf)
        mesh.update()
        uv=mesh.uv_layers.new(name="Painter UV")
        uv.data.foreach_set("uv",[f for pair in self.uv for f in pair])
        for face,smooth in zip(mesh.polygons,self.smooth): face.use_smooth=smooth
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        self.verts,self.faces,self.uv,self.smooth=[],[],[],[]


def cubic(a,b,c,d,n=10):
    a,b,c,d=map(V,(a,b,c,d))
    return [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in (i/n for i in range(n+1))]


PROFILE=[(.098,-.028,.025,.006),(.151,-.029,.025,.0065),
         (.176,-.030,.030,.0068),(.40,-.020,.034,.0057),
         (.63,-.007,.049,.005),(.733,.000,.064,.0048),
         (.791,.011,.070,.004),(.846,.025,.072,.003),(.905,.052,.073,.002),(.932,.071,.074,.001)]


def blade_edges(z):
    for lo,hi in zip(PROFILE,PROFILE[1:]):
        if z<=hi[0]:
            t=max(0,(z-lo[0])/(hi[0]-lo[0]))
            return (lo[1]+(hi[1]-lo[1])*t,lo[2]+(hi[2]-lo[2])*t)
    return PROFILE[-1][1:3]


def blade(p):
    rings=[]
    # The fuller has a shallow floor between two raised shoulders. Long bevels
    # carry reflected light through the tip even when the stamp is too small to read.
    for z,left,right,d in PROFILE:
        xs=[0,.16,.28,.40,.56,.67,.76,1]
        ys=[0,.58,1,.65,.66,.98,.78,0]
        front=[(left+(right-left)*x,-y*d,z) for x,y in zip(xs,ys)]
        back=[(x,-y,z) for x,y,z in front[1:-1][::-1]]
        rings.append(front+back)
    p.loft(rings,"steel")
    p.finish("01 • watermarked blade and twin fuller shoulders")


def furniture(p):
    p.turn([(.071,.027,.020,0),(.083,.031,.023,0),(.091,.030,.022,0),
            (.098,.041,.027,0),(.113,.040,.025,0),(.12,.030,.016,0)],"latten")
    # The counterguard and knuckle bow sweep around the hand. Their shared tip
    # is shaped into the long bill of the bird that marks Oswin's ferry.
    guard=cubic((-.121,0,.146),(-.133,0,.167),(-.094,0,.155),(-.076,0,.124))
    guard+=cubic(guard[-1],(-.037,0,.089),(.040,0,.112),(.076,0,.101))[1:]
    guard+=cubic(guard[-1],(.156,0,.088),(.152,0,-.010),(.12,0,-.064))[1:]
    guard+=cubic(guard[-1],(.095,0,-.099),(.056,0,-.126),(.007,0,-.124))[1:]
    sizes=[.008+.0037*sin(pi*i/(len(guard)-1)) for i in range(len(guard))]
    p.curve(guard,sizes,"latten",1.32,10)
    # Raised chased bead on both faces of the flattened guard.
    for side in (-1,1):
        p.curve([v+V((0,side*r*1.24,0)) for v,r in zip(guard,sizes)],.0015,"iron",1,5)
        branch=cubic((.018,side*.010,.102),(.087,side*.094,.122),(.121,side*.067,.032),(.134,side*.005,.006))
        p.curve(branch,[.003+.003*sin(i*pi/(len(branch)-1)) for i in range(len(branch))],"iron",1.24)
        curl=cubic((.090,side*.061,.082),(.071,side*.072,.034),(.038,side*.046,.049),(.052,side*.044,.063))
        p.curve(curl,[.0044-.002*i/(len(curl)-1) for i in range(len(curl))],"latten",1,8)
        # Shell langet sits over the ricasso.
        for k in range(9):
            a=(k-4)*.19
            end=(.042*sin(a),side*.012,.119+.044*cos(a))
            stem=cubic((0,side*.025,.106),(.008*sin(a),side*.027,.122),
                       (end[0],side*.017,end[2]-.010),end,8)
            p.curve(stem,[.002,.003,.004,.004,.004,.004,.003,.002,.001],"latten",1,7)
    p.finish("02 • chased knuckle bow, side rails and scallop langets")


def handle(p):
    p.turn([(-.113,.021,.016,.002),(-.088,.023,.018,.001),(-.046,.025,.019,-.001),
            (.023,.022,.018,0),(.075,.023,.019,0),(.086,.024,.019,0)],"hide",26)
    # One broad leather tape with a folded lip, continuous around the oval grip.
    rings=[]
    for j in range(161):
        turn=j/16
        a=turn*tau
        z=-.104+turn*.0175
        rad=.024+.0014*cos((z+.045)*34)
        rings.append([((rad+dr)*cos(a),(.019+dr)*sin(a),z+dz) for dz,dr in
                      [(.018,-.0012),(.018,.0004),(.003,.0023),(.0008,.0026),(-.001,.0002)]])
    p.loft(rings,"hide",True)
    for z in (-.111,-.099,.071,.080):
        p.turn([(z,.025,.021,0),(z+.003,.026,.0212,0),(z+.006,.025,.021,0)],"latten",32)
    p.turn([(-.165,.008,.009,.009),(-.161,.021,.014,.008),(-.151,.035,.024,.006),
            (-.133,.042,.027,.002),(-.119,.033,.025,.001),(-.111,.022,.017,0)],"iron",24)
    for side in (-1,1):
        c=V((.004,side*.027,-.135))
        rim=[c+V((.016*cos(i*tau/24),0,.013*sin(i*tau/24))) for i in range(25)]
        p.curve(rim,.0021,"latten",.8,8)
        badge=[c+V((x,side*.002,z)) for x,z in [(-.009,-.004),(0,.009),(.009,-.004),(0,-.007),(-.009,-.004)]]
        p.curve(badge,.0014,"latten",1,6)
    p.finish("03 • wrapped grip, collared ferrules and ferry-mark pommel")


def bounds(objects):
    points=[obj.matrix_world@V(p) for obj in objects if obj.type=="MESH" for p in obj.bound_box]
    return [[round(fn(p[i] for p in points),5) for i in range(3)] for fn in (min,max)]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    if "--export-only" not in sys.argv:
        p=Piece(material())
        blade(p)
        furniture(p)
        handle(p)
        bpy.context.scene.name="Heron Hanger"
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    assert all(im.packed_file for im in bpy.data.images if im.source=="FILE" and im.users)
    source_bounds=bounds(bpy.context.scene.objects)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active=next(iter(bpy.context.selected_objects))
    bpy.ops.object.join()
    bpy.context.object.name="Heron Hanger | grip origin"
    OUT.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT),export_format="GLB",export_animations=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    assert bpy.ops.import_scene.gltf(filepath=str(OUT))=={"FINISHED"}
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    assert len(meshes)==1 and meshes[0].data.uv_layers and bounds(meshes)==source_bounds
    assert source_bounds[0][2]<0<source_bounds[1][2] and .920<source_bounds[1][2]<.950
    meshes[0].data.calc_loop_triangles()
    raw=OUT.read_bytes()
    gltf=json.loads(raw[20:20+struct.unpack_from("<I",raw,12)[0]])
    assert len(gltf["meshes"][0]["primitives"])==1 and not gltf.get("skins") and not gltf.get("animations")
    assert len(gltf["images"])==3 and all("bufferView" in im for im in gltf["images"])
    receipt={"blender":bpy.app.version_string,"sourceSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
             "glbSha256":hashlib.sha256(raw).hexdigest(),"triangles":len(meshes[0].data.loop_triangles),
             "primitives":1,"images":3,"sourceAndImportedBoundsBlenderXYZ":source_bounds}
    DOC.mkdir(parents=True,exist_ok=True)
    (DOC/"hanger.json").write_text(json.dumps(receipt,indent="\t")+"\n",encoding="utf-8")
    print("VERIFIED",receipt)


if __name__=="__main__":
    main()
