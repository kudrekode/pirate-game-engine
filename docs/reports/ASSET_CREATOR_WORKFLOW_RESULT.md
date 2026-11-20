# Asset Creator — Workflow, Navigation & Fast Preview Result

## 1. Anatomy Failure Root Cause

The previous gate was `0.07 < neck_width < 0.16` and
`waist_width < ribcage_width`. It measured every mesh vertex in a horizontal
band, including separate arms. The neck station was `Head.z - 0.04`, with a
6 mm half-band. Waist/chest used 12 mm half-bands. Measurements were made before
the final whole-body height scale.

For the supplied error, 0.1940299496 exceeds the 0.16 neck limit. The waist
condition passes: 0.2826765031 < 0.3374256492, about 16.2% narrower. Thus the
neck clause, not the waist clause, caused that exception.

The attachment contains measured widths but no recipe, seed or slider values.
The failed API removed its staging recipe, and the supplied values were not
found in retained local logs. The exact six inputs therefore cannot be recovered
or uniquely inferred from that message. This report does not invent them.

A concrete supported reproduction uses height 1.82, torsoLength 0, and
shoulders/arms/legs/hips 0.5. The old measurement reports
neck 0.3036461174, waist 0.2951146811 and ribcage 0.3659109473 and fails.
Surface probes show the band intersects the raised arm/shoulder contours.
At successive planes those unrelated extents fall from over a metre to
0.30/0.27/0.20 m before reaching approximately 0.10 m. The central neck exists;
the measurement is wrong. This establishes the failure mechanism on supported
inputs, although exact reproduction of the user's particular values remains
unverified without their recipe.

`anatomy_invariants.py` now intersects mesh edges with a plane, follows the
connected contours, and requires exactly one contour spanning the body centre.
Separate arms cannot inflate that measurement. The neck station is 55% of the
neck-to-head anchor interval, so torso changes move it proportionally.
Missing/ambiguous contours, nonfinite/nonpositive widths and invalid ratios fail.
The checks require:

- 0.30 < neck/head width < 0.85;
- neck/shoulder width < 0.65;
- waist/ribcage width < 0.95, retaining at least 5% taper.

These are explicit stylised-silhouette constraints, not a medical anatomy model.
The reproduced short torso measures neck 0.1139, waist 0.2943 and ribcage
0.3643 m with the corrected contour method. Geometry generation, rig, weights,
head/hair construction and authored parameter ranges were not changed.
The default GLB hash is identical before, after preview and after full validation:
`8dae96b198e48d31ef7881d65b3d69da9261afc3dbc6ba4088d027becd9d12d0`.

## 2. Supported Body Range

Existing recipe validation and coupled rig constraints remain. No slider is
silently clamped or narrowed. Both workflow modes execute the corrected surface
gate and an exported GLB round trip, including animation deformation.

Fresh full two-build results:

| Selected case | Neck / waist / ribcage width, metres | Result |
| --- | --- | --- |
| torsoLength-min | .1139 / .2943 / .3643 | Pass |
| torsoLength-max | .1023 / .2915 / .3636 | Pass |
| narrow-shoulders-wide-hips | .1099 / .2905 / .3076 | Pass |
| seed-topology-11 | .1094 / .2881 / .3497 | Pass |
| shoulderWidth-min | .1102 / .2640 / .2998 | Pass |
| hipWidth-max | .1087 / .3147 / .3653 | Pass |
| armLength-max | .1087 / .2904 / .3642 | Pass |
| legLength-max | .1087 / .2904 / .3642 | Pass |

Default and browser seed `body-e2e-11` also passed the new paths. Pure tests
cover separate arm contours, scale independence, missing contours, absent or
blocky necks, missing waist taper and nonfinite values. These representative
cases are not a claim of exhaustive proof over every continuous slider value.
No unrelated historical or complete hairstyle matrix was run.

## 3. Navigation

The persistent **← Back to Game Engine** link appears in Studio's header across
sections. Game Engine's existing launcher supplies its current URL in `returnTo`.
Studio resolves its destination in this order:

1. `VITE_GAME_ENGINE_URL` in Studio's `.env.local`;
2. the launching editor's `returnTo` URL;
3. the current host on port 5173.

HTTP(S) URLs are accepted; invalid schemes and embedded credentials are rejected.
The root's `VITE_ASSET_STUDIO_URL` continues to support alternate Studio origins.
The applications remain separate. The forward availability probe and setup help
remain; the back link uses ordinary browser navigation and has persistent
connection help if the engine is stopped. It does not require a cross-origin
health probe, start servers or create another navigation service.

The real round trip passed with root on 127.0.0.1:5173 and Studio on localhost:5174.
The first default-origin attempt correctly reported unavailable: the pre-existing
Studio listened on localhost rather than IPv4. Configuring its actual origin
resolved the connection. Component tests cover alternate return origins, full
editor paths/query/hash, standalone fallback and unsafe addresses.

## 4. Previous Compile Pipeline

Every click posted the captured recipe to the development compile endpoint,
validated and canonicalized it, discovered/versioned Blender, hashed source
inputs, created two isolated Blender builds, loaded and validated both GLBs,
compared binary and semantic determinism, verified immutable sources, and wrote
GLB/manifest/diagnostics/recipe/log files before publishing and switching preview.
Each Blender process imported the skeleton, generated/fused/weighted geometry,
fitted selected hair and exported the GLB. There was no interactive tier.

## 5. New Preview Pipeline

**Generate Preview** posts to `/__asset-studio/procedural-mannequin/preview`.
The same compiler receives `mode: "preview"`, runs **one** Blender pass and
**one** GLB round trip, checks the generation report and source immutability,
then atomically publishes the existing artifact set. It does not run a second
build, second round trip or determinism comparisons.

The one round trip retains topology, finite geometry, weights, skeleton, materials,
face/hair attachment, idle/walk deformation and clone checks. Measured cost was
0.429 s; retaining these checks avoids a separate weaker validator for little
benefit. No daemon, background service, automatic slider compilation or cache
was introduced.

Preview metadata has `validationLevel: "preview"`, `determinism: null` and
`deterministicBuild: false`. UI diagnostics say determinism was not tested,
rather than claiming a failed or successful determinism test.

## 6. Finalisation Pipeline

**Finalise Character** uses the existing `/compile` endpoint with `mode: "full"`.
Full is also the compiler CLI/programmatic default, so matrices and compiler
acceptance retain their existing assurance. Both isolated builds and round trips,
binary/semantic comparison, source/provenance hashes, complete manifests and
atomic publication remain. Nothing is promoted from an unverified preview cache.

Success offers downloads for the GLB, manifest and procedural compiler recipe.
The existing **Save Recipe JSON** preserves the editable CharacterRecipe.
Artifacts stay in the existing local creator output directories, and the ten
recent results are session-only. No permanent character library, automatic game
assignment or built-in asset registration was invented.

## 7. Performance

Measured locally on 4 October 2026 with Blender 5.2.0 LTS, default bald recipe.
These are individual runs, not medians or universal speedup claims.

| Stage | Previous full | New preview | New full |
| --- | ---: | ---: | ---: |
| Total | 7.186 s | 3.784 s | 8.786 s |
| First Blender process | 3.022 s | 3.125 s | 3.934 s |
| Second Blender process | 3.319 s | omitted | 3.887 s |
| GLB round trips | included in residual | .429 s | .722 s |
| Other / residual | .845 s | .229 s | .243 s |

The baseline residual includes version discovery (.134 s), round trips, comparisons,
hashing and file publication; those were not individually instrumented before.
Within the preview's Blender pass: scene/template setup and import .613 s,
geometry .354 s, hair/setup .006 s, export .242 s. The remaining approximately
1.91 s includes process startup, Python/module initialization, report work and
shutdown; it is not an independently measured pure startup time. New full's first
pass recorded .772/.481/.007/.291 s for those same internal stages.

Preview was 3.40 s shorter than the original full sample. Full timing varied
upward; no full-path speedup is claimed. The guaranteed structural saving is
one Blender process/export plus one duplicate round trip and comparison per edit.
Evidence: `test-results/workflow/before-timing.json`, `after-timing.json`, and
their artifact manifests/diagnostics. Performance samples preceded browser/CI load.

## 8. Error UX

States are Ready, Generating preview…, Preview ready, Generation failed,
Finalising…, and Character finalised. Draft edits are distinguished from the
captured result. Both actions are disabled during a generation; recent-result
restoration cannot replace the active request state. A failed request preserves
the previous working preview and result metadata.

Anatomy failures show a concise explanation of invalid torso proportions.
Other failures offer a short retry/details message. Expandable **Technical
details** contains the original compiler error, stdout/stderr and captured recipe.
Successful build logs also retain Blender output. Preview/full identity survives
recent-result restoration; edits hide stale finalised download links.

Browser acceptance caught a real layout issue where helper text intercepted the
Finalise button. The status grid now gives copy its own row, gives the actions
equal columns and scrolls long diagnostics. The corrected real workflow passed.

## 9. Validation Results

- Focused creator, request and navigation tests: 28 passed.
- Pure Python anatomy invariant tests: 3 passed.
- Focused compiler/API checks: preview one-build/full two-build counts, honest
  assurance metadata, actual GLB round trips, corrupt-output rejection,
  endpoint routing, concise errors/log preservation and atomic publication passed.
- Eight selected supported body cases: full two-build validation passed.
- Real Studio browser preview → finalisation → download availability → injected
  failure preserving the working result: passed after correcting the layout.
- Root launcher unavailable-target case: passed. Real configured-origin
  Game Engine → Studio → Game Engine: passed.
- Targeted minimum-torso visual check: passed, six images inspected (rest front,
  side, back; idle front; walk side/front). Neck and waist remain readable and
  the surface stays attached. Existing simple hands and pelvis ridge remain.
- `npm run ci` was run once. Initial result: 621 tests passed, with a timeout in
  unchanged `saves with Ctrl+S` and a follow-on preset test failure during
  concurrent browser load. Both failed tests passed in isolation without code
  or timeout changes. Overall: 623 Vitest tests across 76 files passed across
  the initial run and targeted retry.
- The remaining CI stages were then completed separately: root build, both
  contract typechecks, shared preview typecheck, Studio build and all 50 Node
  compiler/asset tests passed. Studio's first build caught a missing Vite
  `ImportMeta.env` declaration; adding `src/vite-env.d.ts` fixed it. Only the
  affected build and not-yet-run compiler stage were run afterward. This is
  completed gate coverage with targeted retries, not a claim that the initial
  monolithic CI invocation exited successfully.
- `git diff --check`: passed.

Logs: `ci.log`, `ci-retry.log`, `build.log`, `build-retry.log`,
`browser-retry.log`, `navigation-live.log`, `visual.log` under the evidence folder.

Local evidence is under `test-results/workflow/`; browser captures use the existing
Playwright output directories. These ignored files are local evidence, not
portable checked-in artifacts. Existing human-foundation workspace changes were
preserved; no fixture GLB was replaced by this workflow pass.

## 10. Recommended Next Asset Creator Feature

Add named recipe presets with durable reopen/edit support and clear separation
between the editable recipe and its last finalised artifact. This addresses the
remaining session-only history limit and aligns with the roadmap's asset
library workflow. It should precede automatic in-game assignment. This is a
recommendation only; no next feature was implemented.
