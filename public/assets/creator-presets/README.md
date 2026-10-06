# Creator preset portraits

These are renders of real compiled canonical-v1 characters, not illustrations or
runtime morph approximations. Numeric starting points live in
`packages/character-contract/src/authoredHumanPresets.ts`. Changing that table
requires refreshing the corresponding portrait; existing recipes retain their
resolved values.

From the repository root, inspect selections before building:

```powershell
node --experimental-strip-types tools/blender-character/verify-creator-presets.mjs --list
node --experimental-strip-types tools/blender-character/verify-creator-presets.mjs --build --case body-athletic,body-broad,body-fuller,face-balanced,face-narrow,face-square,face-angular,face-strong,hair-none,combined-broad,combined-fuller
$creatorBlender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $creatorBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/render_creator_presets.py -- --case body-athletic,body-broad,body-fuller,face-balanced,face-narrow,face-square,face-angular,face-strong,hair-none,combined-broad,combined-fuller --list
# Remove --list to render the 31 selected acceptance views and initial cards.
& $creatorBlender --background --factory-startup --threads 4 --python-exit-code 1 --python tools/blender-character/render_creator_presets.py -- --case body-athletic,body-broad,body-fuller --cards --list
# Remove --list for the three relaxed body portraits used by the UI.
```

The compiler uses the unchanged canonical source, its original CC0 provenance,
Golden rig and validated short hair. Short-hair and Balanced-face cards share a
render. Cards use the default source colours and height; they are visual starting
points, not live previews of the current draft. Builds and their full provenance
remain together under ignored `test-results/creator-product/`.
