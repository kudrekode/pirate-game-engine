# Sword V1

Original project-authored stylised sword. Regenerate with
`node tools/blender-character/build-sword.mjs`. No third-party art or textures.

`sword-v1.glb` is 10,660 bytes: one mesh, 90 triangles, one vertex-colour material,
zero animations/textures. Handle centre is the origin; +Y is the blade, +Z the
flat face. The blade reaches 0.88 m from the grip; total length is about 1.02 m.
The registry owns the URL and unit scale/orientation; the sword behaviour owns
the Golden right-hand local grip. The world pickup uses ordinary authored scale.

The cheap installed-asset test uses the production GLTFLoader, checks finite
geometry, triangle/material counts and bounds. The asset has no gameplay collider;
the equipped visual never enters the traversal world.

## Bow and Arrow V1

Original project-authored vertex-colour geometry, built and GLTFLoader round-tripped by
`node tools/blender-character/build-bow.mjs`. No third-party art, textures or animation payload.

- `bow-v1.glb`: 21,700 bytes, 192 triangles, one mesh/material. Grip-centred, +Y up,
  +Z forward; the static string is 0.2 m behind the grip. About 1.3 m tall.
- `arrow-v1.glb`: 8,312 bytes, 68 triangles, one mesh/material. Tip at origin,
  travels along +Z, shaft/fletching extends backward about 0.66 m.

The registry and existing marker/cache/clone path own presentation. The bow is
parented to Golden `hand_l`; three independent world-arrow groups are prewarmed
and reused. Shared projectile data, never mesh geometry, owns collision and damage.
