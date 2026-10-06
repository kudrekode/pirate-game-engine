"""Curated displacement handles, in metres in the immutable source's rest space.

Each handle moves an anatomical landmark, with explicit stationary landmarks.
Compact interpolation preserves the source detail between handles. It does not
inflate along normals or scale coordinate bands. These are experimental art
targets, not approved anatomy; approval comes from the rendered evidence.
"""

import numpy as np


def mirrored(handles):
    result = []
    for label, point, delta in handles:
        result.append((label, point, delta))
        if point[0] != 0:
            result.append((label + "_opposite", [-point[0], *point[1:]], [-delta[0], *delta[1:]]))
    return result


SOCKETS = []
for x in (.020, .034, .050):
    for z in (1.682, 1.698, 1.718):
        SOCKETS.append(("socket", [x, -.072, z], [0, 0, 0]))

FACE_GUARDS = [
    ("neck_root", [0, .025, 1.52], [0, 0, 0]),
    ("throat", [0, -.04, 1.57], [0, 0, 0]),
    ("occiput", [0, .105, 1.68], [0, 0, 0]),
    ("crown", [0, .015, 1.81], [0, 0, 0]),
]

TARGETS = {
    "headWidth": (.13, mirrored([
        ("temple", [.075, -.015, 1.735], [.005, 0, 0]),
        ("parietal", [.07, .04, 1.77], [.006, .001, 0]),
        ("cheek", [.060, -.056, 1.670], [.003, 0, 0]),
        ("ear_root", [.079, .008, 1.675], [.005, 0, 0]),
        ("ear_rim", [.096, .013, 1.69], [.005, 0, 0]),
        ("jaw_pin", [.051, -.031, 1.607], [0, 0, 0]),
        ("chin_pin", [0, -.066, 1.577], [0, 0, 0]),
        ("nose_pin", [0, -.111, 1.67], [0, 0, 0]),
        ("lip_pin", [.021, -.078, 1.624], [0, 0, 0]),
    ] + [(label, p, [.0015, 0, 0]) for label, p, _ in SOCKETS] + FACE_GUARDS)),
    "jaw": (.10, mirrored([
        ("chin_tip", [0, -.073, 1.587], [0, -.004, -.003]),
        ("chin_side", [.024, -.064, 1.596], [.002, -.003, -.002]),
        ("mandible_angle", [.054, -.009, 1.614], [.004, -.001, -.001]),
        ("mandible_body", [.049, -.044, 1.622], [.003, -.0015, -.001]),
        ("lower_lip", [0, -.08, 1.630], [0, -.001, -.0005]),
        ("lip_corner", [.024, -.073, 1.637], [.0007, -.0005, 0]),
        ("upper_lip_pin", [0, -.085, 1.645], [0, 0, 0]),
        ("cheek_pin", [.06, -.052, 1.67], [0, 0, 0]),
        ("nose_pin", [0, -.105, 1.674], [0, 0, 0]),
        ("ear_pin", [.085, .01, 1.673], [0, 0, 0]),
    ] + SOCKETS + FACE_GUARDS)),
    "nose": (.067, mirrored([
        ("tip", [0, -.121, 1.671], [0, -.004, .001]),
        ("bridge", [0, -.097, 1.695], [0, -.0015, 0]),
        ("alar_wing", [.018, -.105, 1.665], [.0015, -.001, 0]),
        ("columella", [0, -.106, 1.655], [0, -.002, 0]),
        ("philtrum", [0, -.087, 1.649], [0, -.0005, 0]),
        ("upper_lip_pin", [0, -.084, 1.638], [0, 0, 0]),
        ("lip_corner_pin", [.025, -.074, 1.637], [0, 0, 0]),
        ("nasolabial_pin", [.034, -.075, 1.66], [0, 0, 0]),
        ("brow_pin", [0, -.08, 1.73], [0, 0, 0]),
    ] + SOCKETS + FACE_GUARDS)),
    "mass": (.32, mirrored([
        ("abdomen", [0, -.077, 1.12], [0, -.025, 0]),
        ("lower_abdomen", [0, -.060, 1.02], [0, -.016, 0]),
        ("oblique", [.136, -.014, 1.13], [.017, -.003, 0]),
        ("lower_ribs", [.17, .027, 1.26], [.010, 0, 0]),
        ("chest", [.107, -.091, 1.37], [0, -.008, 0]),
        ("back", [.10, .13, 1.24], [0, .010, 0]),
        ("hip", [.169, .037, .98], [.012, 0, 0]),
        ("seat", [.11, .139, .97], [0, .012, 0]),
        ("thigh_front", [.124, -.041, .78], [.003, -.012, 0]),
        ("thigh_outer", [.204, .039, .80], [.009, 0, 0]),
        ("thigh_back", [.123, .12, .8], [0, .008, 0]),
        ("upper_arm_front", [.34, .007, 1.45], [0, -.005, 0]),
        ("upper_arm_back", [.34, .135, 1.45], [0, .006, 0]),
        ("upper_arm_under", [.34, .07, 1.401], [0, 0, -.004]),
        ("neck_side", [.049, .035, 1.56], [.003, 0, 0]),
        ("neck_back", [0, .071, 1.565], [0, .002, 0]),
    ])),
    "athletic": (.23, mirrored([
        ("pectoral", [.105, -.095, 1.365], [0, -.007, .001]),
        ("upper_pectoral", [.13, -.065, 1.43], [0, -.005, .002]),
        ("deltoid_cap", [.265, .068, 1.515], [0, 0, .004]),
        ("deltoid_front", [.26, -.005, 1.47], [0, -.004, 0]),
        ("biceps_belly", [.35, .016, 1.46], [0, -.003, .001]),
        ("triceps_long", [.34, .11, 1.425], [0, .003, -.002]),
        ("latissimus", [.17, .101, 1.32], [.004, .003, 0]),
        ("quadriceps", [.127, -.052, .79], [0, -.006, 0]),
        ("vastus_lateral", [.195, .021, .75], [.004, -.002, 0]),
        ("hamstring", [.13, .115, .79], [0, .004, 0]),
        ("waist_pin", [.135, .013, 1.13], [0, 0, 0]),
    ])),
    "broadFrame": (.27, mirrored([
        ("upper_ribs", [.185, .035, 1.35], [.009, 0, 0]),
        ("scapular_frame", [.152, .113, 1.40], [.006, .001, 0]),
        ("pectoral_frame", [.13, -.09, 1.39], [.005, 0, 0]),
        ("outer_deltoid", [.27, .066, 1.48], [.004, 0, 0]),
        ("clavicle_surface", [.135, -.03, 1.486], [.003, 0, 0]),
        ("waist_pin", [.133, .02, 1.14], [0, 0, 0]),
        ("sternum_pin", [0, -.082, 1.40], [0, 0, 0]),
        ("neck_pin", [.043, .02, 1.55], [0, 0, 0]),
    ])),
}


def kernel(distance):
    t = np.maximum(1.0 - distance, 0.0)
    return t ** 4 * (4.0 * distance + 1.0)


class SculptField:
    def __init__(self, name, rig_pins=()):
        self.radius, handles = TARGETS[name]
        handles = list(handles)
        if name in ("mass", "athletic", "broadFrame"):
            handles += [("rig_pin", p, [0, 0, 0]) for p in rig_pins]
            handles += mirrored(SOCKETS + FACE_GUARDS)
        # Reject conflicting duplicate handles rather than silently changing the sculpt.
        unique = {}
        for label, point, delta in handles:
            key = tuple(point)
            if key in unique:
                assert unique[key][1] == delta, label
            unique[key] = (label, delta)
        self.points = np.array(list(unique), dtype=float)
        self.deltas = np.array([v[1] for v in unique.values()], dtype=float)
        matrix = self.weights(self.points)
        self.coefficients = np.linalg.solve(matrix, self.deltas)
        assert np.max(np.abs(matrix @ self.coefficients - self.deltas)) < 1e-9

    def weights(self, points):
        return kernel(np.linalg.norm(np.asarray(points)[:, None, :] - self.points[None, :, :], axis=2) / self.radius)

    def evaluate(self, points):
        points = np.asarray(points)
        result = np.zeros_like(points, dtype=float)
        for start in range(0, len(points), 1024):
            result[start:start + 1024] = self.weights(points[start:start + 1024]) @ self.coefficients
        return result
