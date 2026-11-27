"""Fit Bell Court equipment to the shipped Golden rest skeleton, in metres."""
from math import cos, pi, sin
from pathlib import Path
import sys
import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import author as kit

OUT = kit.OUT / "bell-court"
OUT.mkdir(exist_ok=True)


def finish_metal(name, rgb, metallic, rough):
    kit.material(name, rgb=rgb)
    shader = kit.MATERIALS[name].node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = rough


def palette():
    finish_metal("Blackened steel", (.15, .185, .21), .7, .41)
    finish_metal("Burnished edges", (.43, .44, .42), .72, .34)
    finish_metal("Old latten", (.48, .32, .13), .65, .39)
    finish_metal("Oxide red wool", (.25, .047, .034), .01, .92)
    finish_metal("Flax embroidery", (.51, .36, .16), .03, .83)
    finish_metal("Grip hide", (.058, .022, .012), .04, .76)


def ring(rx, ry, z, cx=0, cy=.025, count=32):
    return [(cx+rx*cos(i*2*pi/count), cy+ry*sin(i*2*pi/count), z) for i in range(count)]


def armour(role, source):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(kit.OUT / (source+".glb")))
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    kit.mesh = mesh = kit.Mesh()
    palette()
    weights = []

    def section(bone, profiles, material):
        mesh.solid(profiles, material)
        weights.extend([bone]*(len(mesh.points)-len(weights)))

    # Articulated cuirass with overlapping waist lames and a rolled collar.
    for z, rx, ry in [(1.08,.201,.176), (1.13,.217,.18), (1.18,.233,.189)]:
        section("spine_02", [ring(rx,ry,z),ring(rx*.93,ry*.95,z+.069)], "Blackened steel")
        section("spine_02", [ring(rx+.002,ry+.002,z),ring(rx,ry,z+.008)], "Burnished edges")
    section("spine_03", [ring(.221,.187,1.225), ring(.252,.204,1.36),
                         ring(.264,.18,1.455), ring(.144,.142,1.505)], "Blackened steel")
    section("spine_03", [ring(.161,.153,1.49),ring(.15,.147,1.51)], "Old latten")
    for side, suffix in [(1,"l"),(-1,"r")]:
        # Curved, open-bottom shells wrap the upper arm in its rest axis.
        # The rounded outer lame hangs down when the arm comes to the side.
        def shoulder(x, ry, rz, bottom):
            return [(side*x, .061+ry*cos(a*pi/20), 1.466+rz*sin(a*pi/20))
                    for a in range(bottom, 21-bottom)]
        for x,ry,rz in [(.311,.111,.104),(.277,.132,.128),(.242,.142,.145)]:
            start = shoulder(x-.045,ry*.93,rz*.96,-3)
            middle = shoulder(x,ry,rz,-3)
            lip = shoulder(x+.042,ry*.90,rz*.89,-3)
            for row,next_row,mat in [(start,middle,"Blackened steel"),(middle,lip,"Blackened steel"),
                                     (lip,shoulder(x+.047,ry*.88,rz*.87,-3),"Burnished edges")]:
                for i in range(len(row)-1):
                    pts=[row[i],row[i+1],next_row[i+1],next_row[i]]
                    mesh.face(pts if side>0 else pts[::-1],mat)
            weights.extend(["upperarm_"+suffix]*(len(mesh.points)-len(weights)))
        # Tapered vambrace follows the forearm axis (X in the rest pose).
        def sleeve(x, radius):
            return [(side*x, .065+radius*cos(i*pi/10), 1.465+radius*sin(i*pi/10)) for i in range(20)]
        section("lowerarm_"+suffix,[sleeve(.498,.065),sleeve(.652,.054),sleeve(.693,.043)], "Blackened steel")
        for x,rad in [(.503,.067),(.657,.055)]:
            section("lowerarm_"+suffix,[sleeve(x,rad),sleeve(x+.012,rad)],"Old latten")
        for z in [1.28,1.36,1.43]:
            kit.block(side*.14,-.14,z,.014,.015,.014,"Old latten")
            weights.extend(["spine_03"]*(len(mesh.points)-len(weights)))
    if role == "challenger":
        # A short embroidered back panel, cut to the flare of the existing cloak.
        def rear(x,z):
            return (x,.288-(z-1.01)*.16-x*x*.96,z)
        def cloth(poly,mat,raise_by=0):
            mesh.face([(x,y+raise_by,z) for x,y,z in [rear(*p) for p in poly]],mat)
            weights.extend(["spine_02"]*len(poly))
        cloth([(-.104,1.43),(.104,1.43),(.083,1.14),(0,1.07),(-.083,1.14)],"Oxide red wool")
        for side in [-1,1]:
            cloth([(side*.094,1.422),(side*.086,1.422),(side*.068,1.151),(0,1.091),
                   (side*.077,1.146)],"Flax embroidery",.003)
        # The court's bell and clapper, in pale thread.
        cloth([(-.049,1.222),(-.033,1.238),(-.028,1.30),(0,1.32),
               (.028,1.30),(.033,1.238),(.049,1.222)],"Flax embroidery",.004)
        cloth([(-.012,1.217),(.012,1.217),(0,1.198)],"Flax embroidery",.004)
    if role == "keeper":
        # A sallet with a low back and raised brow, leaving the face exposed.
        brim = [(x,y,z-.065*max(0,(y-.02)/.16)) for x,y,z in ring(.154,.17,1.765)]
        section("Head",[brim,ring(.142,.157,1.795),ring(.116,.135,1.854),
                        ring(.054,.078,1.889),ring(.01,.025,1.896)],"Blackened steel")
        section("Head",[brim,[(x,y,z+.012) for x,y,z in brim]],"Old latten")
    outfit = mesh.finish("Riveted harness")
    outfit.parent = arm
    outfit.matrix_parent_inverse = arm.matrix_world.inverted()
    groups = {name: outfit.vertex_groups.new(name=name) for name in sorted(set(weights))}
    for i, bone in enumerate(weights):
        groups[bone].add([i], 1, "REPLACE")
    outfit.modifiers.new("Golden skin","ARMATURE").object = arm
    export(role)


def export(name):
    path = OUT / (name+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",export_animations=False,
                              export_yup=True,export_all_vertex_colors=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    if name != "hanger":
        outfit = next(o for o in bpy.context.scene.objects if o.name.startswith("Riveted harness") and o.type=="MESH")
        assert outfit.find_armature() and all(v.groups for v in outfit.data.vertices)
        assert outfit.find_armature().data.bones.get("hand_r")
    else:
        sword = next(o for o in bpy.context.scene.objects if o.type=="MESH")
        assert .98 < sword.dimensions.z < 1.2


def hanger():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.mesh = mesh = kit.Mesh()
    palette()
    # Lenticular blade and ricasso, slightly swept on the cutting edge.
    mesh.solid([[(x-w,0,z),(x,-d,z),(x+w,0,z),(x,d,z)]
                for z,w,d,x in [(.104,.031,.009,0),(.2,.031,.009,0),
                                 (.64,.028,.006,.009),(.87,.018,.004,.024),
                                 (.944,.001,.001,.039)]],"Burnished edges")
    kit.cylinder(0,0,0,[(-.105,.022),(-.071,.026),(.059,.023),(.102,.022)],"Grip hide",16)
    for i in range(9):
        z = -.092+i*.021
        kit.cylinder(0,0,0,[(z,.025),(z+.004,.025)],"Old latten",16)
    kit.cylinder(0,0,0,[(-.155,.014),(-.142,.036),(-.118,.038),(-.103,.023)],"Old latten",16)
    # Swept knuckle bow, short back quillon and guard shoulders.
    curve = [(-.112,0,.127),(-.068,0,.105),(0,0,.105),(.09,0,.10),
             (.111,0,.07),(.113,0,.004),(.095,0,-.062),(.046,0,-.116),(0,0,-.127)]
    for a,b in zip(curve,curve[1:]):
        kit.beam(a,b,.018,.014,"Old latten")
    mesh.finish("Bell hanger grip origin")
    export("hanger")


if __name__ == "__main__":
    for role,source in [("challenger","wayfarer"),("keeper","ferryman"),("freeblade","poacher")]:
        armour(role,source)
    hanger()
