"""Small deterministic sculpt-constraint checks; run with Python + NumPy."""
import unittest
import numpy as np
from authored_human_v2_shapes import SculptField, TARGETS, SOCKETS


class SculptConstraints(unittest.TestCase):
    def test_face_identity_keeps_lips_and_eye_landmarks_coherent(self):
        sockets = np.array([p for _, p, _ in SOCKETS])
        for name in ("jaw", "nose"):
            delta = SculptField(name).evaluate(sockets)
            self.assertLess(np.abs(delta).max(), 1e-9)
        wide = SculptField("headWidth").evaluate(sockets)
        np.testing.assert_allclose(wide, np.tile([.0015, 0, 0], (len(sockets), 1)), atol=1e-9)

    def test_body_sculpts_leave_articulation_centres_fixed(self):
        pins = [[.212, .0654, 1.4555], [.463, .073, 1.4555], [.1143, .0361, .5424]]
        for name in ("mass", "athletic", "broadFrame"):
            np.testing.assert_allclose(SculptField(name, pins).evaluate(pins), 0, atol=1e-9)

    def test_no_asymmetry_or_remote_face_deformation(self):
        points = np.random.default_rng(20).uniform([0, -.13, .2], [.8, .16, 1.81], (350, 3))
        reflected = points * [-1, 1, 1]
        for name in TARGETS:
            field = SculptField(name)
            np.testing.assert_allclose(field.evaluate(reflected), field.evaluate(points) * [-1, 1, 1], atol=1e-9)
            self.assertTrue(np.isfinite(field.evaluate(points)).all())
        for name in ("headWidth", "jaw", "nose"):
            np.testing.assert_array_equal(SculptField(name).evaluate([[0, 0, 1.0], [.5, 0, 1.45]]), 0)


if __name__ == "__main__":
    unittest.main()
