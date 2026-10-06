"""Surface-plane measurements independent of Blender and mesh tessellation."""
import math


def central_slice_width(vertices, faces, z):
    # Intersect edges, then follow connected contours. Raised arms can occupy the
    # same height as the neck; their separate contours must not widen the torso.
    points, neighbours = {}, {}
    for face in faces:
        crossings = []
        for a, b in zip(face, face[1:] + face[:1]):
            va, vb = vertices[a], vertices[b]
            if (va[2] <= z < vb[2]) or (vb[2] <= z < va[2]):
                edge = tuple(sorted((a, b)))
                t = (z - va[2]) / (vb[2] - va[2])
                points[edge] = tuple(va[i] + t * (vb[i] - va[i]) for i in range(3))
                crossings.append(edge)
        for edge in crossings:
            neighbours.setdefault(edge, set()).update(crossings)
    remaining = set(points)
    central = []
    while remaining:
        pending, contour = [min(remaining)], []
        while pending:
            edge = pending.pop()
            if edge not in remaining:
                continue
            remaining.remove(edge)
            contour.append(points[edge])
            pending.extend(neighbours[edge] & remaining)
        xs = [point[0] for point in contour]
        if len(xs) >= 3 and min(xs) < 0 < max(xs):
            central.append(max(xs) - min(xs))
    if len(central) != 1:
        raise RuntimeError("Human foundation has no unique central surface contour.")
    return central[0]


def validate_surface_anatomy(neck, head, shoulder, waist, ribcage):
    values = (neck, head, shoulder, waist, ribcage)
    if not all(math.isfinite(v) and v > 0 for v in values):
        raise RuntimeError("Human foundation has invalid surface measurements.")
    ratios = {"neckToHead": neck / head, "neckToShoulder": neck / shoulder,
              "waistToRibcage": waist / ribcage}
    # A readable neck has substance but is narrower than skull and shoulders.
    # At least 5% waist narrowing rejects cylindrical/block torso regressions.
    if not (0.30 < ratios["neckToHead"] < 0.85 and
            ratios["neckToShoulder"] < 0.65 and ratios["waistToRibcage"] < 0.95):
        raise RuntimeError(f"Human foundation lost its neck or waist taper: {ratios}.")
    return ratios
