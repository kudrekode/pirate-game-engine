# Asset Studio Height Authoring V0

> Historical milestone. Body Proportions V1 supersedes the height-only request
> and is documented in
> [`asset-studio-body-proportions-v1.md`](asset-studio-body-proportions-v1.md).

## Result

Height is the first Asset Studio parameter with a complete authoring loop:

```text
CharacterRecipeV1.body.parameters.height
  -> browser request validation
  -> development-only Vite compile endpoint
  -> ProceduralMannequinRecipeV0 snapshot
  -> two-pass headless Blender compilation
  -> geometry, skin, skeleton, animation, and determinism validation
  -> immutable generated job package
  -> shared Three.js loader and skeleton-safe preview
```

The browser does not scale or deform the mannequin. It sends the current
authored height to the local development endpoint and waits for Blender. The
compiler embeds the proportional scale in the GLB, grounds the result, and
validates its measured bounds before the preview is replaced.

## Authoring Contract

The UI reuses `CharacterRecipeV1.body.parameters.height`; there is no second
browser height state. The narrow adapter copies only that value into
`ProceduralMannequinRecipeV0.proportions.heightMetres`. Other CharacterRecipe
body, component, and palette fields remain source-only foundations and do not
claim to affect compilation.

The procedural compiler is authoritative for the current range:

- minimum: `1.50` metres;
- maximum: `2.10` metres;
- default/reset: `1.82` metres;
- step: `0.01` metres.

The browser performs an early range check for feedback. The server reconstructs
the procedural recipe from the checked-in base recipe and runs the canonical
recipe validator again. The canonical SHA-256 is computed server-side from the
validated, stably ordered recipe snapshot.

## Local Compiler Boundary

`apps/asset-studio/dev/procedural-mannequin-compile-api.mjs` is a Vite
development-server plugin. It is not bundled into browser code and is not a
production remote compiler.

`POST /__asset-studio/procedural-mannequin/compile` accepts the versioned narrow
request `{ version: 1, heightMetres }`. A request:

1. validates the payload and procedural recipe;
2. writes an isolated request recipe;
3. invokes the existing two-pass Blender compiler;
4. performs the complete Three.js round trip, Idle/Walk, root-motion, weight,
   joint, bounds, clone, and manifest checks;
5. publishes the job only after success;
6. returns immutable development asset and manifest URLs.

Only one job runs at a time. The endpoint responds to the original request when
the compile finishes; it does not poll. Temporary output lives below ignored
`test-results/asset-studio-creator/`. Failed staging directories are removed,
and the client leaves its previous successful preview unchanged.

## Preview Replacement And Disposal

Each successful job receives a new preview definition and React key, including
when an identical recipe produces an identical asset hash. This proves a real
reload while retaining deterministic identity.

On replacement, Asset Studio stops and uncaches the old animation mixer,
disposes clone skeleton state, removes the clone, disposes OrbitControls and the
renderer, and releases the transient shared loader cache entry. Shared canonical
Idle and Walk assets remain cached. The newly loaded mannequin starts in Idle;
Rest and Walk remain available through the same offline-baked animation path.

## Manifest And Determinism

The mannequin manifest now records:

- `recipeHash`;
- `heightMetres`;
- `compilerVersion` and compiler source hash;
- `outputHash` for the GLB;
- `generationDurationMs`;
- `validationVersion`;
- measured bounds and existing geometry, weight, skeleton, and determinism
  evidence.

`generationDurationMs` is observational execution metadata and is expected to
vary. It is not part of recipe or GLB identity. The generated timestamp is job
metadata returned by the local endpoint and displayed by Asset Studio; it is
not written into the deterministic GLB.

Measured browser-triggered builds from the acceptance run:

| Height | Recipe SHA-256 | GLB SHA-256 | Bounds Y | Generation |
| --- | --- | --- | ---: | ---: |
| 1.68 m | `7117ad6bdafd3cecd524c5dee949c78826b68310283c455cf35b64011369e511` | `7be9384cdfcd7f75dca0a595a694d025a3cb16bf2f0bc3e505ef82f5b003a7ef` | 1.6799999 m | 8,625 ms |
| 1.68 m repeated | same | same | 1.6799999 m | 10,739 ms |
| 1.96 m | `b6bdbc8afab0a1526d9f5cec9ca844390e4a2faf272de6717159d79df596d675` | `442ea5b4fd58016fe4bbad38b34c35cdd2e109b65481761f2a2eff6b62833c37` | 1.9599999 m | 8,649 ms |

The repeated 1.68 m builds are byte-identical despite different execution
durations. Changing only height changes recipe hash, GLB hash, embedded root
scale, all proportional limb/torso lengths in world space, skeleton placement,
and bounds while preserving 65 joints and Idle/Walk compatibility.

## Why Browser Scaling Is Rejected

Three.js scaling would change only presentation state. It would not create a
new recipe snapshot, GLB, asset hash, manifest, compiler diagnostic, or validated
runtime artifact, and it could diverge between editor and runtime consumers.
Height therefore remains authored source compiled by Blender. The registry and
preview apply only the existing orientation/default transform contract.

## Limitations And Next Step

- The endpoint exists only in the local Vite development server; deployment,
  authentication, cancellation, persistent job history, and remote workers are
  out of scope.
- Generated development jobs are retained until `test-results` is cleaned.
- Height is proportional whole-body generation so the proven Golden animations
  remain compatible; independent anatomical proportions are not implemented.
- The provisional `humanoid-v1` and current 65-joint Golden compatibility
  skeleton remain distinct contracts.

The next creator parameter should use this same request, compiler, validation,
publication, and preview lifecycle. Shoulder width or torso proportion is the
likely next experiment; it should not introduce another compiler architecture.
