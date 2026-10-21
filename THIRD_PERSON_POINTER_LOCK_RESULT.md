# Third-Person Pointer Lock Input Pass

21 October 2026.

## 1. Executive Result

**PASS for implementation and targeted Chromium acceptance.**
Active third-person Follow gameplay now uses browser pointer lock and unlimited
relative mouse look. Inventory and dialogue release the cursor; closing Inventory automatically restores a previously active camera lock.
Dialogue retains click-to-resume behaviour. Camera, traversal and
combat tuning remain unchanged.

## 2. Previous Input Model

`ThreeRuntimePanel.tsx` installed `pointerdown` on the renderer canvas (accessible
name `Three runtime viewport`) and `pointermove` on window. A left pointer-down
set a software active flag and focused the canvas. Movement preferred nonzero
`movementX/Y`, falling back to differences in `clientX/Y`. No browser lock was
requested, so the visible cursor could reach the browser boundary. Escape only
cleared that software flag. Scene cleanup removed the pointer listeners.

The deltas fed `updateThirdPersonMouseLookTarget`, then existing RAF damping and
Follow rig calculation. Inventory, dialogue, shops, cutscenes and terminal states
already had input suspension/release seams; those now release real pointer lock.
Inventory was also added to the explicit mouse-look eligibility gate.

## 3. Pointer Lock Lifecycle

Entering Play leaves the cursor free. An ordinary left pointer-down on the Follow
canvas requests its standard `requestPointerLock()`. The browser's
`document.pointerLockElement` and `pointerlockchange` establish actual ownership;
a request alone does not activate mouse look. The acquisition click neither
attacks nor interacts: F and E keep those bindings.

Escape, window blur, blocking UI, switching to Inspect, session reset and scene
teardown release owned lock. Browser-driven loss stops input without recapture.
A new eligible viewport click reacquires it. Inventory close also reacquires a
previously active lock directly within its close click/keypress. Request exceptions, promise rejection
and `pointerlockerror` leave gameplay available with a free cursor. A canceled
pending request cannot capture after inventory closes; a late promise completion
after disposal releases its old canvas if necessary.

## 4. Mouse Look

A document `mousemove` listener reads only `movementX` and `movementY` while this
canvas owns lock and Follow mouse look is eligible. It does not use absolute
coordinates or HUD hit testing. Inspect retains its separate pointer drag path.

Sensitivity remains **0.22 degrees/pixel yaw, 0.18 degrees/pixel pitch**. Existing
Follow pitch bounds remain **-5 to 65 degrees**. Yaw accumulates continuously;
there is no edge test or angle wrapping. Existing orbit damping, camera-relative
movement basis, obstruction and character facing smoothing are preserved.

## 5. Inventory / Dialogue / UI

I opens Inventory and releases lock; inventory buttons work with the free cursor.
Close, I or Escape dismisses it and automatically restores camera lock if it was
active on entry. An initially free cursor stays free. Browser focus loss while
Inventory is open cancels restoration. Dialogue/inline messages, shops,
cutscenes and game-over/completion use the same owned-lock release helper.
Existing dialogue/cutscene Escape priority remains intact. Quest feedback has no
separate blocking modal, and no pause framework was introduced.

## 6. Follow vs Inspect

Only Follow + third-person style + enabled runtime orbit + no blocking overlay
can request lock. Inspect keeps Alt-drag orbit/pan and wheel zoom. Returning to
Follow leaves the cursor free. Editor, Asset Studio and Phaser are unchanged.

## 7. Movement / Combat Regression

The browser route exercised W/S/A/D, diagonal input, sprint and jump/landing with
relative camera movement. Focused component coverage retains camera-relative
steering while holding/repressing W and verifies equipped F sword attack while
locked. The Chromium route collected/equipped the sword through E/Inventory,
observed `GoldenSword_Attack_V1`, and continued mouse look after the attack.
Chest interaction retained lock; mouse-usable dialogue released it.

Shared traversal, jump/air steering, attack facing/cooldown, physical interaction
animation and authored defaults were not changed.

## 8. Browser Acceptance

Fresh selected case in the existing movement suite:

```powershell
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts --grep '@pointer-lock' --list
node node_modules/@playwright/test/cli.js test e2e/movement-v2.spec.ts --grep '@pointer-lock'
```

**1 passed, 53.0 seconds** (approximately one minute including server startup).
Chrome used real browser lock and Playwright mouse/keyboard input, without a fake
lock API or injected gameplay state. Measured yaw changed by more than **1080
degrees in each direction** while mouse coordinates traveled outside the viewport.
The original route also passed free initial cursor, movement/jump, Inventory Close
button, repeated Escape/reacquire, Inspect, physical sword pickup/equip/F,
chest E, dialogue E/unlock/close/reacquire and keyboard activation of Back to Edit
while locked. No page errors occurred. RAF loop starts stayed unchanged.

An initial run reached the final navigation step but waited for an incorrect
`Edit` selector; it was stopped and corrected to `Back to Edit`. The complete
corrected route passed. This is automated real-browser acceptance, not a claim
of a separate hands-on subjective play session or a multi-browser certification.

## 9. Performance / Cleanup

Mouse deltas update the existing presentation ref, never React state per delta.
Only lock transitions update the HUD state. No controller, scene or traversal
recreation is introduced. The existing single runtime RAF remains authoritative.
Scene lifetime installs/removes document mousemove, pointerlockchange and
pointerlockerror plus window blur; original Inspect listeners retain cleanup.
Focused tests cover teardown, late completion and remount without duplicate
request handling. All lock/request/canvas state is transient; no schema or save
migration is involved.

## 10. Validation

- Initial focused runtime/camera suite: **89 tests passed**.
- Final component suite including pending-request/remount and locked sword checks:
  **72 tests passed**; camera helper suite previously passed **18 tests**.
- Selected real Chrome browser route: **1 passed**.
- `npm.cmd run ci` ran once: **102 files / 837 tests passed**. Its root build
  then caught two test-helper TypeScript errors (an overly broad event target
  type and deletion of a readonly DOM property). Both were corrected with a
  narrower DOM union and `Reflect.deleteProperty`; gameplay code was unaffected.
- Reran the failed root typecheck/build: **passed**. Then executed the unreached
  CI stages in order: both contract builds, preview package build, Studio
  typecheck/build and **75/75 cheap Node compiler/asset checks passed**. Full CI
  was not repeated. Vite emitted its existing large-chunk advisory.
- Logs: `test-results/pointer-lock-ci.log` (initial gate) and
  `test-results/pointer-lock-build.log` (successful build/remainder).
- Final `git diff --check`: **passed**.

## 11. Remaining Limitations

Real-browser acceptance covered Chrome on this Windows environment. Other browser
permission policies and hardware mouse sensitivity have not had hands-on review.
If pointer lock is unavailable/denied, gameplay remains usable and a later click
can retry; unlocked Follow mouse motion intentionally does not rotate the camera.
No general camera polish or movement retuning was included.

## 12. Recommended Next Feature

**Input polish.** A future bounded pass could improve capture/release guidance.
No follow-up feature is implemented here.


## Inventory return and Biome follow-up

The user subsequently requested automatic camera return after Inventory, replacing
the original deliberate click-to-recapture requirement for that UI. A transient
ref remembers whether Inventory interrupted locked mouse look. Close, I and Escape
reuse the scene-owned lock request inside the closing user gesture. Browser focus
loss and teardown clear this intent. Dialogue, explicit gameplay Escape, Inspect
and entering Play retain their previous lifecycle.

The two blocking Biome hook dependency errors are fixed with a stable
`useCallback` and explicit effect dependencies. `biome check --write` on the three
staged TypeScript files succeeds; existing nonblocking style warnings remain.
Focused component tests: **74 passed**, covering all three Inventory close paths,
an initially free cursor and browser focus loss. Updated real Chrome acceptance: **1 passed in 53.3 seconds**, including automatic
lock restoration after the Inventory Close button and Escape after equipping.
Full CI ran once: **102 files / 839 tests passed**, root/Studio builds and all
three package builds passed, and **75/75 Node compiler/asset tests passed**.
The PowerShell wrapper reported exit 1 after treating Vite's existing chunk-size
warning on stderr as `NativeCommandError`; the log shows every CI stage completed
successfully. See `test-results/pointer-lock-inventory-ci.log`.
Final `git diff --check`: **passed**.
