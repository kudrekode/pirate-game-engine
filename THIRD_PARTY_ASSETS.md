# Third-Party Assets

## Pirate Demo GLB Assets

- Folder: `public/assets/pirate-demo/`
- Source/licence: user-provided pirate demo GLB assets. Licence/source must be confirmed by the project owner before redistribution.
- Current asset audit notes:
  - Valid pirate GLB files reference `Textures/colormap.png`, which is not present under `public/assets/pirate-demo/`.
  - `public/assets/pirate-demo/barrel.glb` exists but currently has a PNG file header, so it is expected to use the runtime placeholder fallback if selected until the asset file is corrected.
