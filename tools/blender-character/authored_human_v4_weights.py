"""Local, mirrored rest-space skin weights for the V4 body-only experiment."""
import math

REVISION = 'joint-centred-v1'
REGIONS = {
    'elbow': {'parent': 'upperarm', 'child': 'lowerarm', 'core': .090, 'limit': .125,
              'inner_half_width': .038, 'outer_half_width': .080},
    'knee': {'parent': 'thigh', 'child': 'calf', 'core': .090, 'limit': .125,
             'inner_half_width': .040, 'outer_half_width': .095},
}


def smoothstep(a, b, value):
    t = min(1., max(0., (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def joint_coordinates(point, joint, pivot, side):
    x, y, z = point
    if joint == 'elbow':
        # Positive length goes towards the wrist; front is the flexion surface.
        longitudinal = side * (x - pivot[0])
        outward = y - pivot[1]
        transverse = z - pivot[2]
    else:
        # Positive length goes towards the ankle; front is the extension surface.
        longitudinal = pivot[2] - z
        outward = pivot[1] - y
        transverse = side * (x - pivot[0])
    return longitudinal, outward, transverse


def correction(point, original, pivots):
    """Return a two-bone local redistribution, or the exact input elsewhere."""
    side = 1 if point[0] > 0 else -1
    suffix = 'l' if side > 0 else 'r'
    for joint, settings in REGIONS.items():
        parent, child = settings['parent'] + '_' + suffix, settings['child'] + '_' + suffix
        # Never acquire weights from another chain or paint through the torso.
        if not original or any(b not in (parent, child) for b in original):
            continue
        pivot = pivots[child]
        length, outward, transverse = joint_coordinates(point, joint, pivot, side)
        if abs(length) >= settings['limit']:
            continue
        radius = math.hypot(outward, transverse)
        extension = .5 if radius < 1e-8 else .5 + .5 * outward / radius
        width = settings['inner_half_width'] + extension * (settings['outer_half_width'] - settings['inner_half_width'])
        target = smoothstep(-width, width, length)
        falloff = 1 - smoothstep(settings['core'], settings['limit'], abs(length))
        child_weight = original.get(child, 0) + falloff * (target - original.get(child, 0))
        corrected = {parent: 1 - child_weight, child: child_weight}
        corrected = {bone: weight for bone, weight in corrected.items() if weight > 0}
        return corrected, joint + '_' + suffix
    return dict(original), None
