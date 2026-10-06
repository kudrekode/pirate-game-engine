"""Focused V3 pose/weight diagnostics. Run with Blender --python-exit-code 1."""
import json
import math
from pathlib import Path
import sys
import unittest

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v3 import OUT, pose, local_evidence, digest

REPORT = {}


def open_case():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT / 'dressed-neutral.glb'))
    return next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')


def mesh(prefix):
    return next(o for o in bpy.context.scene.objects if o.name.startswith(prefix))


def weights(obj, index):
    return {obj.vertex_groups[g.group].name: g.weight for g in obj.data.vertices[index].groups}


def skinned(obj, rig, index, influences):
    point = rig.matrix_world.inverted() @ obj.matrix_world @ obj.data.vertices[index].co
    result = Vector()
    for bone, weight in influences.items():
        p = rig.pose.bones[bone]
        result += (p.matrix @ p.bone.matrix_local.inverted() @ point) * weight
    return obj.matrix_world.inverted() @ rig.matrix_world @ result


class LocalDiagnosis(unittest.TestCase):
    def test_assisted_raise_keeps_reach_and_moves_clavicle(self):
        rig = open_case()
        rest = {b.name: [list(row) for row in b.matrix_local] for b in rig.data.bones}
        head = rig.pose.bones['upperarm_l'].head.copy()
        pose(rig, 'raised-arm-old')
        old_direction = (rig.pose.bones['upperarm_l'].tail - rig.pose.bones['upperarm_l'].head).normalized()
        old_pivot = rig.pose.bones['upperarm_l'].head.copy()
        rig = open_case()
        pose(rig, 'raised-arm')
        direction = (rig.pose.bones['upperarm_l'].tail - rig.pose.bones['upperarm_l'].head).normalized()
        difference = math.degrees(direction.angle(old_direction))
        self.assertLess(difference, .01)
        self.assertLess((old_pivot - head).length, 1e-6)
        moved = (rig.pose.bones['upperarm_l'].head - head).length
        self.assertGreater(moved, .05)
        self.assertEqual(rest, {b.name: [list(row) for row in b.matrix_local] for b in rig.data.bones})
        REPORT['raise'] = {'upperarmDirectionDifferenceDegrees': difference,
            'assistedShoulderPivotTravelMm': moved * 1000, 'oldShoulderPivotTravelMm': (old_pivot - head).length * 1000,
            'clavicleDegrees': 20, 'upperarmDegrees': 40, 'forearmDegrees': 15, 'restRigUnchanged': True}

    def test_diagnostic_bends_match_requested_angles(self):
        rows = []
        for name, parent, child, expected in [('elbow', 'upperarm_l', 'lowerarm_l', 115), ('crouch', 'thigh_l', 'calf_l', 125)]:
            rig = open_case()
            def angle():
                a, b = rig.pose.bones[parent], rig.pose.bones[child]
                return math.degrees((a.tail - a.head).angle(b.tail - b.head))
            rest_angle = angle()
            pose(rig, name)
            bent_angle = angle()
            self.assertAlmostEqual(bent_angle - rest_angle, expected, delta=.02)
            rows.append({'pose': name, 'restSegmentAngleDegrees': rest_angle,
                'posedSegmentAngleDegrees': bent_angle, 'addedFlexionDegrees': bent_angle - rest_angle})
        REPORT['bendConstruction'] = rows

    def test_body_weight_gradient_at_failed_joints(self):
        rows = []
        for name, region in [('idle', 'shoulder'), ('elbow', 'elbow'), ('crouch', 'knee'), ('crouch', 'groin')]:
            rig = open_case()
            body = mesh('SuperHero_Male')
            before = [(tuple(v.co), weights(body, v.index)) for v in body.data.vertices]
            pose(rig, name)
            record = local_evidence(rig)[body.name][region]['top'][0]
            a, b = record['vertices']
            wa, wb = weights(body, a), weights(body, b)
            average = {bone: (wa.get(bone, 0) + wb.get(bone, 0)) / 2 for bone in wa.keys() | wb.keys()}
            evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            deformed = evaluated.to_mesh()
            error = max((skinned(body, rig, i, weights(body, i)) - deformed.vertices[i].co).length for i in (a, b))
            self.assertLess(error, 3e-6)
            rest_length = (body.data.vertices[a].co - body.data.vertices[b].co).length
            common_weight_ratio = (skinned(body, rig, a, average) - skinned(body, rig, b, average)).length / rest_length
            self.assertGreater(record['ratio'], 2)
            self.assertLessEqual(common_weight_ratio, 1.00001)
            self.assertEqual(before, [(tuple(v.co), weights(body, v.index)) for v in body.data.vertices])
            evaluated.to_mesh_clear()
            rows.append({'pose': name, 'region': region, **record,
                'manualSkinningErrorMm': error * 1000, 'sameEdgeMeanWeightRatio': common_weight_ratio})
        REPORT['bodyWeightAblation'] = {'note': 'Numeric two-vertex counterfactual only; no weights changed, no accepted body correction. It isolates the weight-gradient contribution, not a complete artistic repair.', 'edges': rows}

    def test_garment_local_transfer(self):
        rig = open_case()
        tank = mesh('V2_Tank')
        ids = next(a for a in tank.data.attributes if a.name.lower() == '_source_vertex')
        by_source = {}
        for v in tank.data.vertices:
            by_source.setdefault(round(ids.data[v.index].value), v.index)
        self.assertEqual(len(by_source), 8892)
        pairs = []
        for i in range(4446):
            a, b = by_source[i], by_source[i + 4446]
            pa, pb = tank.data.vertices[a].co, tank.data.vertices[b].co
            self.assertAlmostEqual((pa - pb).length, .0025, delta=.00015)
            wa, wb = weights(tank, a), weights(tank, b)
            self.assertLessEqual(max(len(wa), len(wb)), 4)
            self.assertAlmostEqual(sum(wa.values()), 1, places=6)
            self.assertAlmostEqual(sum(wb.values()), 1, places=6)
            difference = sum(abs(wa.get(b, 0) - wb.get(b, 0)) for b in wa.keys() | wb.keys())
            pairs.append({'sourceVertices': [i, i + 4446], 'weightL1Difference': difference,
                'position': list((pa + pb) / 2), 'weights': [wa, wb]})
        pose(rig, 'raised-arm')
        shoulder = local_evidence(rig)[tank.name]['shoulder']
        REPORT['garment'] = {'thicknessPairs': len(pairs),
            'pairsWithL1DifferenceAbovePoint1': sum(p['weightL1Difference'] > .1 for p in pairs),
            'largestShellWeightDifferences': sorted(pairs, key=lambda p: p['weightL1Difference'], reverse=True)[:3],
            'raisedShoulderEdges': shoulder}


if __name__ == '__main__':
    before = digest(OUT / 'dressed-neutral.glb')
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(LocalDiagnosis))
    assert digest(OUT / 'dressed-neutral.glb') == before
    (OUT / 'local-weight-diagnosis.json').write_text(json.dumps(REPORT, indent=2))
    if not result.wasSuccessful():
        raise RuntimeError('Focused V3 diagnostics failed')


