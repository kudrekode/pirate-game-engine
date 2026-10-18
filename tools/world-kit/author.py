"""Offline authoring of the bounded Harbour v1 kit. Blender 5.2, no add-ons.

Y-up GLBs, metre scale, ground-contact origins; Blender source coordinates Z-up.
Reused source paths are deliberately explicit because the old names are wrong.
"""
import bpy
import colorsys
import hashlib
import json
import math
from pathlib import Path
import random
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/world-kit'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
M = {}
RECORDS = []


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def material(name, hexcolor, roughness=.86, metal=0, grain=False):
    rgb = [int(hexcolor[i:i+2], 16)/255 for i in (0, 2, 4)]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*map(linear, rgb), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    if grain:
        image = bpy.data.images.new(name + '-grain', width=128, height=128)
        pixels = []
        for y in range(128):
            for x in range(128):
                # Low contrast longitudinal weathering, seamless and intentionally modest.
                stripe = .95 + .035*math.sin(x*.55 + .4*math.sin(y*math.tau/128)) + .018*math.sin(x*1.7)
                pixels.extend([min(1, c*stripe) for c in rgb] + [1])
        image.pixels[:] = pixels
        image.filepath_raw = str(OUT / (name + '-128.png'))
        image.file_format = 'PNG'
        image.save()
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    M[name] = mat
    return mat


material('weathered-wood', '806344', grain=True)
material('structural-wood', '514535', grain=True)
material('cut-wood', 'a18b65')
material('iron', '42484a', .62, .55)
material('stone', '787a70', .95)
material('canvas', 'b7ac89', .97)
material('canvas-blue', '526e76', .94)
material('leaf', '536d45', .94)
material('leaf-light', '728253', .94)
material('lantern-glass', 'd5ac62', .4)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(M[mat])
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normal = obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj


def box(name, loc, size, mat='weathered-wood', bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = size
    return finish(obj, name, mat, bevel)


def cylinder(name, loc, radius, depth, mat='structural-wood', vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat, .006)


def beam(name, a, b, width=.09, mat='structural-wood'):
    a, b = Vector(a), Vector(b)
    obj = box(name, (a+b)/2, (width, width, (b-a).length), mat, .009)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def curve(name, coords, radius=.02, mat='canvas'):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 1
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new('POLY')
    spline.points.add(len(coords)-1)
    for p, co in zip(spline.points, coords):
        p.co = (*co, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(M[mat])
    return obj


def uv(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')


def export(slug, name, category, tags, source=None, pivot='bottom-centre'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type in {'MESH', 'CURVE'})
    bpy.ops.object.convert(target='MESH')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in meshes:
        uv(obj)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    # Construction pieces and props rotate around their footprint centre. Trees
    # retain the imported trunk-base axis rather than their asymmetric canopy.
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    offset = Vector((0, 0, lo.z)) if pivot == 'trunk-base' else Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
    for vertex, point in zip(obj.data.vertices, points):
        vertex.co = point - offset
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    bpy.context.view_layer.update()
    obj['assetId'] = 'world-' + slug
    obj['revision'] = '1'
    obj['provenance'] = 'Kenney Pirate Kit CC0, adapted' if source else 'Original project-authored geometry'
    obj['pivot'] = pivot
    obj['metresPerUnit'] = 1
    path = OUT / (slug + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_extras=True, export_animations=False, export_yup=True)
    # Fresh exported-file measurement, not Blender's pre-export polygon count.
    raw = path.read_bytes()
    n = int.from_bytes(raw[12:16], 'little')
    doc = json.loads(raw[20:20+n])
    triangles = sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    size = [round(max(p[i] for p in points)-min(p[i] for p in points), 4) for i in (0, 2, 1)]
    RECORDS.append(dict(id='world-'+slug, name=name, category=category, tags=tags, revision='1', url='/assets/world-kit/'+slug+'.glb', thumbnailUrl='/assets/world-kit/thumbnails/'+slug+'.png', source=source or 'tools/world-kit/author.py', sourceSha256=hashlib.sha256((ROOT / (source or 'tools/world-kit/author.py')).read_bytes()).hexdigest(), license='CC0-1.0' if source else 'Project-authored', sha256=hashlib.sha256(raw).hexdigest(), triangles=triangles, bytes=len(raw), dimensions=size, materials=[m['name'] for m in doc['materials']], pivot=pivot))


def reuse(slug, name, category, filename, height, tags, pivot='bottom-centre'):
    clear()
    source = 'public/assets/pirate-demo/' + filename + '.glb'
    bpy.ops.import_scene.gltf(filepath=str(ROOT / source))
    # Source props can carry lid/paddle actions. This kit is deliberately static;
    # imported actions must not overwrite metre-space transforms during export.
    for obj in bpy.context.scene.objects:
        obj.animation_data_clear()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    factor = height/(max(p.z for p in points)-min(p.z for p in points))
    # Flatten imported hierarchy to real metre-space before applying edge wear.
    matrices = {obj: obj.matrix_world.copy() for obj in meshes}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.parent = None
        obj.matrix_world = matrices[obj]
    for obj in meshes:
        matrix = matrices[obj]
        obj.parent = None
        obj.matrix_world = matrix
        obj.location *= factor
        obj.scale *= factor
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        tex = next((n.image for m in obj.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
        pixels = list(tex.pixels) if tex else []
        assignments = []
        for poly in obj.data.polygons:
            if tex and obj.data.uv_layers.active:
                texuv = obj.data.uv_layers.active.data[poly.loop_start].uv
                x = min(tex.size[0]-1, max(0, int(texuv.x*tex.size[0])))
                y = min(tex.size[1]-1, max(0, int(texuv.y*tex.size[1])))
                c = pixels[(y*tex.size[0]+x)*4:][:3]
                h, s, v = colorsys.rgb_to_hsv(*c)
                mat = ('leaf-light' if v > .5 else 'leaf') if .2 < h < .48 and s > .2 else ('iron' if s < .17 else ('canvas' if s < .4 and v > .65 else ('structural-wood' if v < .45 else 'weathered-wood')))
            else:
                mat = 'weathered-wood'
            if slug in {'barrel', 'chest'} and mat == 'canvas':
                mat = 'iron'
            assignments.append(list(M).index(mat))
        obj.data.materials.clear()
        for mat in M.values():
            obj.data.materials.append(mat)
        for poly, index in zip(obj.data.polygons, assignments):
            poly.material_index = index
        if category != 'Nature':
            mod = obj.modifiers.new('Edge wear', 'BEVEL')
            mod.width = .008
            mod.segments = 2
            bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    if slug == 'dock':
        for obj in meshes:
            obj.location.x *= 1.615
            obj.location.y *= 1.615
            obj.scale.x *= 1.615
            obj.scale.y *= 1.615
    export(slug, name, category, tags, source, pivot)


reuse('barrel', 'Wooden Barrel', 'Props', 'boat-row-large', 1, ['barrel','wood','container','pirate'])
reuse('crate', 'Supply Crate', 'Props', 'crate-bottles', .7, ['crate','wood','cargo','storage'])
reuse('chest', 'Treasure Chest', 'Props', 'crate', .65, ['chest','treasure','container','iron'])
reuse('dock', 'Dock Section', 'Buildings', 'structure-platform-dock-small', .65, ['dock','pier','wood','platform'])
reuse('floor', 'Wooden Floor', 'Buildings', 'platform-planks', .18, ['floor','platform','wood','deck'])
reuse('palm', 'Coastal Palm', 'Nature', 'palm-detailed-straight', 3.8, ['palm','tree','tropical','foliage'], 'trunk-base')
reuse('bush', 'Coastal Bush', 'Nature', 'hole', .65, ['bush','plant','foliage'])
reuse('grass', 'Grass Clump', 'Nature', 'grass-plant', .3, ['grass','plant','foliage'])
reuse('rowboat', 'Rowboat', 'Props', 'bottle', .6, ['boat','harbour','wood','shore'])

clear()
for x in (-.92, .92):
    box('Rail post', (x, 0, .55), (.13,.15,1.1), 'structural-wood')
for z in (.4,.88):
    box('Rail', (0,0,z), (2,.075,.12))
beam('Brace', (-.86,0,.3), (.86,0,.94), .06)
export('railing','Wooden Railing','Buildings',['fence','rail','wood','dock'])

clear()
for i in range(10):
    box('Wall plank', (-.9+i*.2, 0, 1.2), (.193,.075,2.4))
for x in (-.93,.93):
    box('End post',(x,.05,1.2),(.14,.18,2.4),'structural-wood')
for z in (.22,2.17):
    box('Cross batten',(0,.1,z),(1.9,.08,.1),'structural-wood')
export('wall','Timber Wall','Buildings',['wall','wood','modular','structure'])

clear()
box('Post',(0,0,1.2),(.18,.18,2.4),'structural-wood')
for z in (.16,2.24):
    box('Iron strap',(0,0,z),(.195,.195,.055),'iron',.006)
export('post','Timber Post','Buildings',['post','pillar','wood','support'])

clear()
for i in range(3):
    box('Tread',(0,-.35+i*.35,.09+i*.18),(1.2,.35,.18))
for x in (-.48,.48):
    beam('Stringer',(x,-.44,.05),(x,.44,.48),.1)
export('stairs','Wooden Steps','Buildings',['stairs','steps','wood','dock'])

clear()
for x in (-.55,.55):
    for y in (-.32,.32):
        box('Leg',(x,y,.36),(.1,.1,.72),'structural-wood')
for i in range(4):
    box('Table plank',(0,-.3375+i*.225,.735),(1.4,.219,.08))
for y in (-.31,.31):
    box('Apron',(0,y,.62),(1.22,.075,.16),'structural-wood')
beam('Stretcher',(-.55,0,.2),(.55,0,.2),.08)
export('table','Tavern Table','Props',['table','furniture','wood','tavern'])

clear()
cylinder('Seat',(0,0,.435),.24,.07,'weathered-wood',24)
for angle in (0,120,240):
    a=math.radians(angle)
    beam('Splayed leg',(.22*math.cos(a),.22*math.sin(a),.035),(.14*math.cos(a),.14*math.sin(a),.41),.07)
export('stool','Wooden Stool','Props',['stool','chair','furniture','wood'])

clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=(0,0,.32))
sack=bpy.context.object
sack.scale=(.3,.24,.34)
finish(sack,'Sack','canvas')
for v in sack.data.vertices:
    v.co.x *= 1 + .035*math.sin(v.co.z*29)
    if v.co.z > .17:
        v.co.x *= .66
        v.co.y *= .66
for z in (.56,.59):
    curve('Tie',[(.105*math.cos(i*math.tau/32),.085*math.sin(i*math.tau/32),z) for i in range(33)],.012,'structural-wood')
export('sack','Grain Sack','Props',['sack','fabric','cargo','supplies'])

clear()
box('Lantern body',(0,0,.2),(.19,.19,.26),'lantern-glass')
for z in (.04,.36):
    box('Lantern cap',(0,0,z),(.24,.24,.065),'iron')
for x in (-.105,.105):
    for y in (-.105,.105):
        beam('Frame',(x,y,.06),(x,y,.36),.022,'iron')
curve('Handle',[(.09*math.cos(i*math.pi/16),0,.39+.10*math.sin(i*math.pi/16)) for i in range(17)],.013,'iron')
export('lantern','Harbour Lantern','Props',['lantern','lamp','iron','decoration'])

clear()
box('Sign post',(0,0,.72),(.11,.11,1.44),'structural-wood')
for z in (.97,1.23):
    box('Sign board',(.13,-.035,z),(.85,.065,.21))
for x in (-.17,.36):
    for z in (.97,1.23):
        pin=cylinder('Nail',(x,-.075,z),.012,.025,'iron',8)
        pin.rotation_euler.x=math.pi/2
export('sign','Harbour Signpost','Props',['sign','post','wood','wayfinding'])

clear()
curve('Coiled rope',[(r*math.cos(t),r*math.sin(t),.045+.008*math.sin(t*3)) for i in range(301) for t,r in [(i*math.tau/60,.12+i*.0009)]],.024)
export('rope','Rope Coil','Props',['rope','dock','nautical','cargo'])

for slug,name,size in [('rock-small','Small Rock',(.7,.55,.45)),('rock-large','Large Rock',(1.75,1.4,1.3))]:
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(0,0,0))
    obj=bpy.context.object
    for v in obj.data.vertices:
        v.co *= 1 + random.uniform(-.14,.14)
        v.co.z=max(v.co.z,-.68)
    obj.scale=tuple(s/2 for s in size)
    finish(obj,name,'stone',.02)
    export(slug,name,'Nature',['rock','stone','shore'])

clear()
# A compact storehouse with a genuine 1.05 x 2.1 m doorway and timber shingles.
for x in (-1.4,1.4):
    for y in (-1.1,1.1):
        box('Corner post',(x,y,1.2),(.15,.15,2.4),'structural-wood')
for i in range(13):
    x=-1.3+i*.2167
    box('Back boards',(x,1.1,1.2),(.21,.075,2.4))
    if abs(x)>.53:
        box('Front boards',(x,-1.1,1.2),(.21,.075,2.4))
    else:
        box('Door lintel boards',(x,-1.1,2.27),(.21,.075,.26))
for side in (-1,1):
    for i in range(11):
        box('Side boards',(side*1.4,-1+i*.2,1.2),(.075,.193,2.4))
    beam('Door jamb',(side*.55,-1.15,0),(side*.55,-1.15,2.16),.1)
    for row in range(6):
        x=side*(.14+row*.265)
        z=3.05-abs(x)*.46
        for j in range(7):
            shingle=box('Overlapping roof board',(x,-1.18+j*.395,z),(.31,.388,.05),'structural-wood' if row%3==0 else 'weathered-wood',.007)
            shingle.rotation_euler.y=side*math.atan(.46)
beam('Lintel',(-.6,-1.15,2.15),(.6,-1.15,2.15),.12)
beam('Roof ridge',(0,-1.43,3.10),(0,1.43,3.10),.1)
for side in (-1,1):
    beam('Eave',(side*1.65,-1.4,2.30),(side*1.65,1.4,2.30),.09)
export('shack','Small Shack','Buildings',['shack','hut','building','wood','harbour'])

clear()
for x in (-1.05,1.05):
    for y in (-.55,.55):
        box('Stall post',(x,y,1.1),(.09,.09,2.2),'structural-wood')
for i in range(5):
    box('Counter plank',(0,-.44+i*.22,.87),(2.3,.213,.07))
for i in range(9):
    box('Counter front',(-1+i*.25,-.54,.44),(.244,.07,.82))
for i in range(8):
    x=-1.12+i*.32
    canopy=box('Canvas awning',(x,0,2.26),(.318,1.65,.035),'canvas' if i%2==0 else 'canvas-blue',.005)
    canopy.rotation_euler.x=.13
    box('Scallop valance',(x,-.81,2.04),(.318,.03,.22),'canvas' if i%2==0 else 'canvas-blue',.015)
for x in (-1,1):
    beam('Canopy brace',(x,.53,1.7),(x,-.68,2.22),.055)
export('stall','Market Stall','Buildings',['market','stall','shelter','canvas','shop'])

(OUT / 'manifest.json').write_text(json.dumps({'revision':'1','metresPerUnit':1,'assets':RECORDS},indent=2)+'\n')
print('WORLD_KIT_EXPORTED',len(RECORDS),'assets',sum(r['triangles'] for r in RECORDS),'triangles')
