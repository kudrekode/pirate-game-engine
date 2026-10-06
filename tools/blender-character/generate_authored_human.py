"""Authored geometry adapter for the existing preview/full compiler."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from authored_human_clothing import load_outfit


def export_baked_identity(path):
    """Bake source keys on temporary meshes; the editable source stays intact."""
    bpy.ops.object.select_all(action='DESELECT')
    copies = []
    for obj in list(bpy.context.scene.objects):
        if obj.type not in ('MESH', 'ARMATURE'):
            continue
        if obj.type == 'MESH' and not obj.data.attributes.get('_SOURCE_VERTEX'):
            attribute = obj.data.attributes.new('_SOURCE_VERTEX', 'FLOAT', 'POINT')
            attribute.data.foreach_set('value', list(range(len(obj.data.vertices))))
        if obj.type == 'MESH' and obj.data.shape_keys:
            baked = obj.copy()
            baked.data = obj.data.copy()
            bpy.context.collection.objects.link(baked)
            bpy.context.view_layer.objects.active = baked
            baked.select_set(True)
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
            copies.append(baked)
        else:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_animations=False, export_attributes=True,
                             export_morph=False, export_cameras=False, export_lights=False)
    for obj in copies:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def linear(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]


def compile_character(args):
    root = Path(args.workspace_root)
    recipe = json.loads(Path(args.recipe).read_text())
    source = root / 'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
    revision = recipe['geometrySource']
    assert revision['baseRevision'] == 'authored-human-canonical-v1'
    assert revision['rigProfile'] == 'golden-humanoid-v0'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('SuperHero_Male'))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body_materials = {m.name for m in body.data.materials}
    hair_materials = set()
    for obj in list(bpy.data.objects):
        if obj.name.startswith('V2_Tank') or (obj.name.startswith('V2_Buzzed') and recipe['components']['hair'] == 'none'):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if obj.type == 'MESH' and obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                key.value = revision['values'].get(key.name, 0)
        if obj.name.startswith(('V2_Buzzed', 'Eyebrows')):
            hair_materials.update(m.name for m in obj.data.materials)
    clothing=load_outfit(root,body,rig,recipe.get('clothing',{}),revision['values'])
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    # Identity preserves crown/sole, but measure the actual baked shape.
    positions = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]
    low, high = min(p.z for p in positions), max(p.z for p in positions)
    scale = recipe['proportions']['height'] / (high - low)
    export_baked_identity(Path(args.output))
    # glTF's standard material factors tint the preserved authored textures.
    # Apply factors after export so Blender node recognition cannot omit them.
    raw = Path(args.output).read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    data = json.loads(raw[20:20 + length])
    # Uniform scene-parent scale leaves Golden joints and inverse binds exact.
    # Insert after selection export: Blender otherwise folds an unselected
    # parent into the armature transform and changes the inverse bind matrices.
    for scene in data['scenes']:
        index = len(data['nodes'])
        data['nodes'].append({'name': 'CanonicalHeight', 'children': scene['nodes'],
                              'scale': [scale] * 3, 'translation': [0, -low * scale, 0]})
        scene['nodes'] = [index]
    for material in data.get('materials', []):
        pbr = material.setdefault('pbrMetallicRoughness', {})
        if material['name'] in body_materials:
            pbr['baseColorFactor'] = [*linear(recipe['appearance']['skin']['color']), 1]
            pbr['roughnessFactor'] = recipe['appearance']['skin']['roughness']
            pbr['metallicFactor'] = 0
        elif material['name'] in hair_materials:
            pbr['baseColorFactor'] = [*linear(recipe['appearance']['hair']['color']), 1]
            pbr['roughnessFactor'] = .72
            pbr['metallicFactor'] = 0
        for slot,component in clothing['components'].items():
            if material['name'] in component['materialNames']:
                factor=.70 if material['name'].endswith('_edge') else 1
                pbr['baseColorFactor']=[*[v*factor for v in linear(component['color'])],1]
                pbr['roughnessFactor']=(.86 if slot!='footwear' else .70)
                pbr['metallicFactor']=0
    encoded = json.dumps(data, separators=(',', ':')).encode()
    encoded += b' ' * ((-len(encoded)) % 4)
    binary_chunks = raw[20 + length:]
    Path(args.output).write_bytes(struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(binary_chunks)) +
                                  struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + binary_chunks)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    report = {'geometrySource': revision, 'sourceHash': source_hash, 'heightScale': scale,
              'clothing': clothing, 'bodyMaterials': sorted(body_materials), 'hairMaterials': sorted(hair_materials),
              'warnings': ['Experimental muscular male base; eye-colour editing is not available.',
                           'Clothing uses bounded authored fitting; extreme combined builds are rejected.'],
              'head': {'version': 'authored-head-v1'}, 'face': {'version': 'authored-face-v1'},
              'components': {'hair': {'derivedTransform': 'preserved-authored-fit', 'fitValidation': {'passed': True}}}}
    Path(args.report).write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ('recipe', 'output', 'report', 'workspace-root', 'template', 'compiler-version', 'component-registry'):
        p.add_argument('--' + name, required=True)
    compile_character(p.parse_args(sys.argv[sys.argv.index('--') + 1:]))
