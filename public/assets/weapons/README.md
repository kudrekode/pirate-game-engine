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
