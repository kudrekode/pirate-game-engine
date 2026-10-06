import unittest
from anatomy_invariants import central_slice_width, validate_surface_anatomy


class AnatomyTests(unittest.TestCase):
    def test_separate_arms_do_not_widen_the_neck(self):
        vertices, faces = [], []
        for centre, radius in [(0, .05), (-.3, .09), (.3, .09)]:
            start = len(vertices)
            vertices.extend([(centre+x*radius, y*radius, z) for z in (0, 1)
                             for x, y in [(-1,-1), (1,-1), (1,1), (-1,1)]])
            faces.extend([[start+i, start+(i+1)%4, start+(i+1)%4+4, start+i+4] for i in range(4)])
        self.assertAlmostEqual(central_slice_width(vertices, faces, .5), .1)
        self.assertAlmostEqual(central_slice_width(vertices, faces, .01), .1)

    def test_proportions_are_scale_independent(self):
        for scale in (.5, 1, 2):
            validate_surface_anatomy(*[v*scale for v in (.1,.18,.4,.28,.35)])

    def test_missing_blocky_or_invalid_anatomy_fails(self):
        for values in [(0,.18,.4,.28,.35), (.18,.18,.4,.28,.35),
                       (.1,.18,.14,.28,.35), (.1,.18,.4,.35,.35),
                       (float('nan'),.18,.4,.28,.35)]:
            with self.assertRaises(RuntimeError):
                validate_surface_anatomy(*values)
        with self.assertRaises(RuntimeError):
            central_slice_width([], [], .5)


if __name__ == '__main__':
    unittest.main()
