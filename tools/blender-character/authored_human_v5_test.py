"""Focused V5 preservation, ring connectivity, locality, seam and pose checks."""
import hashlib
import json
from pathlib import Path
import sys
import unittest
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from authored_human_v5 import OUT, SOURCE, source_data, weights, protected_state, pose, legacy_pose
from authored_human_v5_weights import RINGS,ALIASES,PATCHES,left_paint
REPORT={}

def opened(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    return (next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male')),
            next(o for o in bpy.context.scene.objects if o.type=='ARMATURE'))

def images():
    return {i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}

class ElbowGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        body,rig=opened(SOURCE/'candidate.blend')
        cls.before=weights(body);cls.protected=protected_state();cls.textures=images()
        cls.coordinates=[v.co.copy() for v in body.data.vertices]
        cls.body,cls.rig=opened(OUT/'final/candidate.blend');cls.after=weights(cls.body)

    def test_protected_source_and_rest(self):
        self.assertEqual(self.protected,protected_state());self.assertEqual(self.textures,images())
        self.assertEqual(len(self.rig.data.bones),65)
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.data.shape_keys:
                self.assertEqual(len(obj.data.shape_keys.key_blocks),7)
                self.assertTrue(all(k.value==0 for k in obj.data.shape_keys.key_blocks))
        REPORT['protectedSourcePreserved']=True

    def test_actual_closed_ring_edges(self):
        data=source_data();canonical={v:k for k,v in ALIASES.items()}
        edges={tuple(sorted(canonical.get(i,i) for i in edge)) for edge in data['edges']}
        for name,ids in RINGS.items():
            self.assertEqual(len(ids),len(set(ids)))
            for a,b in zip(ids,ids[1:]+ids[:1]):self.assertIn(tuple(sorted([a,b])),edges,name)
        for a,b in ALIASES.items():self.assertLess((self.coordinates[a]-self.coordinates[b]).length,1e-6)
        REPORT['closedMeshRings']=len(RINGS)

    def test_elbow_only_integrity_and_exact_outside_weights(self):
        left=set(left_paint('final'));right=set();errors=[];changed={'l':0,'r':0}
        for i in left:
            point=self.coordinates[i]
            right.update(j for j,q in enumerate(self.coordinates) if (q-Vector((-point.x,point.y,point.z))).length<1e-6)
        self.assertEqual(len(left),len(right))
        for i,(before,after) in enumerate(zip(self.before,self.after)):
            errors.append(abs(sum(after.values())-1));self.assertLessEqual(len(after),4)
            self.assertTrue(all(0<=w<=1 for w in after.values()))
            if i not in left|right:self.assertEqual(before,after)
            else:
                suffix='l' if i in left else 'r';changed[suffix]+=1
                self.assertEqual(set(after),{'upperarm_'+suffix,'lowerarm_'+suffix})
                pivot=self.rig.data.bones['lowerarm_'+suffix].head_local
                self.assertLess(abs(self.coordinates[i].x-pivot.x),.08)
                self.assertNotEqual(before,after)
        self.assertLess(max(errors),1e-6)
        REPORT['changedBySide']=changed;REPORT['maximumWeightSumError']=max(errors)
        REPORT['allNonElbowWeightsExact']=True

    def test_mirror_and_seam_continuity(self):
        maximum=0;left=left_paint('final')
        for i in left:
            p=self.coordinates[i];matches=[j for j,q in enumerate(self.coordinates) if (q-Vector((-p.x,p.y,p.z))).length<1e-6]
            self.assertTrue(matches)
            for j in matches:
                for bone,value in self.after[i].items():maximum=max(maximum,abs(value-self.after[j][bone[:-2]+'_r']))
        self.assertLess(maximum,1e-7)
        for a,b in ALIASES.items():
            if a in left:self.assertEqual(self.after[a],self.after[b])
        REPORT['maximumMirrorWeightDifference']=maximum;REPORT['paintedSeamPairsMatch']=True

    def test_preserved_poses_and_new_intermediate(self):
        # Use fresh GLB imports, as the renderer does, rather than mutable source actions.
        def matrices(name,function):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.gltf(filepath=str(OUT/'baseline/dressed-neutral.glb'))
            rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');function(rig,name)
            return {b.name:[list(row) for row in b.matrix] for b in rig.pose.bones}
        for name in ('rest','idle','walk','elbow'):
            self.assertEqual(matrices(name,pose),matrices(name,legacy_pose))
        matrices('intermediate',pose)
        rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
        import math
        self.assertAlmostEqual(math.degrees(rig.pose.bones['lowerarm_l'].rotation_quaternion.angle),70,places=4)
        REPORT['exactExistingPoses']=['rest','idle','walk','elbow'];REPORT['intermediateDegrees']=70

if __name__=='__main__':
    # Pose import test must run last, because it resets the Blender scene.
    names=[n for n in unittest.defaultTestLoader.getTestCaseNames(ElbowGate) if n!='test_preserved_poses_and_new_intermediate']+['test_preserved_poses_and_new_intermediate']
    result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(ElbowGate(n) for n in names))
    REPORT['testsRun']=result.testsRun;REPORT['passed']=result.wasSuccessful()
    (OUT/'source-tests.json').write_text(json.dumps(REPORT,indent=2))
    if not result.wasSuccessful():raise RuntimeError('V5 elbow gate structural check failed')
