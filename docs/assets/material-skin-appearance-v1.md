# Material and Skin Appearance V1

Material and Skin Appearance V1 adds exactly two genuine compiled creator
controls: `skinColor` and `skinRoughness`. They use the existing source and
artifact boundary:

```text
CharacterRecipeV1 -> compile request -> procedural recipe -> Blender -> GLB
                  -> round-trip validation -> manifest -> shared Three loader
```

The browser never recolors or rescales the loaded model. Draft controls update
recipe data only. A successful Compile replaces the preview with a newly
generated GLB; a failure leaves the previous compiled preview active.

## Recipe contract

`palette.skin` remains the single authored source for skin color. It is a
canonical lowercase six-digit sRGB value. `appearance.skin.roughness` stores a
finite value from 0 through 1 and defaults to `0.72`. Old CharacterRecipeV1
files receive that roughness default during migration.

The narrow procedural recipe is V3 and records:

```json
{
  "appearance": {
    "skin": {
      "color": "#c98f65",
      "colorSpace": "srgb",
      "roughness": 0.72
    }
  }
}
```

V0-V2 procedural recipes remain accepted and migrate their legacy `material`
block to V3 in memory. Canonical recipe hashing includes both appearance
values, so either change produces a different recipe hash.

## Blender and color handling

The compiler converts each authored sRGB channel to scene-linear with the
standard piecewise sRGB transfer function before assigning the Principled BSDF
base color. Blender exports one `ProceduralSkinMaterial`, with the authored
roughness, metallic fixed to `0`, and no textures. The compiler version is
`procedural-mannequin-blender-v3`; the material schema is
`procedural-skin-material-v1`.

Round-trip validation loads the actual GLB through Three.js and requires:

- one `MeshStandardMaterial` named `ProceduralSkinMaterial`;
- finite linear color, roughness, and metallic values;
- exported linear color and roughness within `0.00001` of the recipe;
- metallic exactly `0`;
- unchanged skeleton, weights, topology, animation binding, and clone safety.

The manifest records authored sRGB color, canonical linear color, authored and
exported roughness, exported metallic, material count/name/schema version,
recipe/output hashes, and independent geometry/skinning and material semantic
hashes.

## Asset Studio

The Appearance panel provides a color picker, canonical numeric color display,
six neutral tone presets, roughness slider/numeric value, and independent
resets. It displays draft and compiled values separately. Recent Compilations
retain the complete recipe, including appearance, and restore the already
compiled GLB without invoking Blender again.

## Validation evidence

Run:

```bash
npm run validate:procedural-appearance-matrix
npm run test:blender-bake
npm run test:e2e:asset-studio
npm run ci
```

The four-case matrix is written to
`test-results/material-skin-appearance-v1/matrix/summary.json`. It proves that
color/roughness changes alter recipe, output, and material hashes while the
geometry/skinning hash and Golden 65-joint skeleton signature remain identical.
Playwright captures several tones at two roughness levels under the fixed Asset
Studio preview lighting and camera and rechecks Idle/Walk animation, recent
compilations, and game-engine runtime loading.

## Next milestone

The next creator milestone is Hairstyle Slot V1. Arbitrary textures, shader
graphs, eyes, hair geometry, subsurface controls, and extra appearance sliders
remain out of scope here.
