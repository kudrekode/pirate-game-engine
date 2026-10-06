"""V4 source-locality and preservation checks, executed with Blender."""
import json
from pathlib import Path
import sys
import unittest

import bpy
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v4 import OUT, SOURCE, protected_state, weights, digest
from authored_human_v4_weights import correction, REGIONS, REVISION, joint_coordinates

REPORT = {}


def opened(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    body = next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    return body, rig


class SkinningRepair(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        body, rig = opened(SOURCE / 'candidate.blend')
        cls.original = weights(body)
        cls.coordinates = [tuple(v.co) for v in body.data.vertices]
        cls.pivots = {b.name: tuple(b.head_local) for b in rig.data.bones}
        cls.protected = protected_state()
        cls.texture_hashes = {i.name: __import__('hashlib').sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
        cls.body, cls.rig = opened(OUT / REVISION / 'candidate.blend')
        cls.corrected = weights(cls.body)

    def test_only_body_weights_changed(self):
        self.assertEqual(self.protected, protected_state())
        self.assertEqual(self.coordinates, [tuple(v.co) for v in self.body.data.vertices])
        self.assertEqual(self.texture_hashes, {i.name: __import__('hashlib').sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file})
        self.assertEqual(len(self.rig.data.bones), 65)
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH' and obj.data.shape_keys:
                self.assertEqual(len(obj.data.shape_keys.key_blocks), 7)
                self.assertTrue(all(k.value == 0 for k in obj.data.shape_keys.key_blocks))
        REPORT['preserved'] = ['rest geometry', 'topology', 'UVs', 'six identity targets', 'packed textures', 'all non-body weights', '65-joint rest rig']

    def test_local_support_and_integrity(self):
        counts = {}
        largest_error = 0
        for i, (point, before, after) in enumerate(zip(self.coordinates, self.original, self.corrected)):
            expected, region = correction(point, before, self.pivots)
            self.assertLessEqual(len(after), 4)
            self.assertTrue(all(0 <= w <= 1 for w in after.values()))
            largest_error = max(largest_error, abs(sum(after.values()) - 1))
            self.assertLess(abs(sum(after.values()) - 1), 1e-6)
            self.assertTrue(all(abs(expected.get(b, 0) - after.get(b, 0)) < 1e-6 for b in expected.keys() | after.keys()))
            if any(abs(before.get(b, 0) - after.get(b, 0)) > 1e-7 for b in before.keys() | after.keys()):
                self.assertIsNotNone(region)
                joint, suffix = region.split('_')
                s = REGIONS[joint]
                self.assertTrue(set(after) <= {s['parent'] + '_' + suffix, s['child'] + '_' + suffix})
                length, _, _ = joint_coordinates(point, joint, self.pivots[s['child'] + '_' + suffix], 1 if suffix == 'l' else -1)
                self.assertLess(abs(length), s['limit'])
                counts[region] = counts.get(region, 0) + 1
            else:
                self.assertEqual(before, after)
        self.assertEqual(counts['elbow_l'], counts['elbow_r'])
        self.assertEqual(counts['knee_l'], counts['knee_r'])
        self.assertGreater(sum(counts.values()), 0)
        REPORT['changedByRegion'] = counts
        REPORT['maximumWeightSumError'] = largest_error

    def test_mirrored_circumference(self):
        tree = KDTree(len(self.coordinates))
        for i, point in enumerate(self.coordinates):
            tree.insert(point, i)
        tree.balance()
        differences = []
        for i, (point, before, after) in enumerate(zip(self.coordinates, self.original, self.corrected)):
            if point[0] <= 0 or before == after:
                continue
            _, mirror, distance = tree.find((-point[0], point[1], point[2]))
            self.assertLess(distance, 1e-5)
            paired = {bone[:-2] + '_r': value for bone, value in after.items()}
            difference = max(abs(value - self.corrected[mirror].get(bone, 0)) for bone, value in paired.items())
            self.assertLess(difference, 5e-5)
            differences.append(difference)
        REPORT['maximumMirrorWeightDifference'] = max(differences)

    def test_feather_boundary_and_unrelated_chain(self):
        for joint, settings in REGIONS.items():
            parent, child = settings['parent'] + '_l', settings['child'] + '_l'
            p = list(self.pivots[child])
            for sign in (-1, 1):
                point = p.copy()
                point[0 if joint == 'elbow' else 2] += sign * (settings['limit'] + .001)
                original = {parent: .4, child: .6}
                result, region = correction(point, original, self.pivots)
                self.assertEqual(result, original)
                self.assertIsNone(region)
            unrelated = {'Head': 1.}
            self.assertEqual(correction(p, unrelated, self.pivots), (unrelated, None))


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SkinningRepair))
    (OUT / 'source-tests.json').write_text(json.dumps(REPORT, indent=2))
    if not result.wasSuccessful():
        raise RuntimeError('V4 source integrity check failed')
