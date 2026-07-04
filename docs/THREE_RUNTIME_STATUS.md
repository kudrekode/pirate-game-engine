# Three Runtime Status

## What Currently Works

- `Play 3D Experimental` starts from the play/runtime UI while `Play 2D` remains the default Phaser path.
- The Three runtime creates a shared `RuntimeSession` from the cloned `GameProject`.
- The current runtime area renders in Three.js using block terrain and placeholder entity markers.
- Player spawn and area state come from shared runtime progression/session helpers.
- WASD/arrow movement uses `playerMovementTransaction`.
- Touch targets and trigger targets are processed through shared interaction/progression helpers.
- E/Enter interaction uses shared interaction discovery, rule dispatch, object behaviour, pickup, shop, and transition helpers where available.
- Runtime events update simple React overlays for status, flow log, inventory summary, quest summary, shop requests, cutscene requests, health, and session end.
- Area transition/teleport requests update `RuntimeSession` and rebuild the Three scene.
- NPC ticking and enemy contact damage use `runtimeNpcTick`.
- Space attack uses `runtimeCombat`.

## What Is Experimental

- The 3D runtime is an adapter proof, not a production-quality runtime.
- Phaser remains the reference runtime until parity is tested.
- UI parity is intentionally limited.
- Rendering uses simple block/marker placeholders.
- Movement is grid based and visually immediate rather than smoothly animated.
- NPC movement and combat presentation are functional but visually basic.
- Camera follow/framing is basic and needs tuning.

## Known Visual Limitations

- Terrain, structures, objects, NPCs, pickups, event blocks, vehicles, and the player use placeholder meshes.
- There are no imported 3D character/object assets.
- There are no skeletal animations or polished attack/contact effects.
- Movement lacks interpolation/smoothing.
- Camera follow needs smoothing, collision/framing polish, and better defaults across map sizes.
- Cutscene, dialogue, shop, quest, inventory, and combat overlays are simple React panels.

## Known Gameplay Parity Risks

- Phaser remains the tested reference for visible behavior.
- Three runtime direct interaction presentation is simpler than Phaser presentation.
- Cutscene/dialogue/shop UX is not at Phaser parity.
- NPC movement ticks are timer based in the adapter and need parity checks against Phaser timing.
- Combat/contact events need manual and contract test comparison against Phaser.
- Boat boarding/dismounting should be tested carefully in both adapters.
- Area transition order, area-enter rules, trigger waits, and quest sync need cross-adapter contract tests.

## Manual Test Checklist

- Spawn: start both Play 2D and Play 3D Experimental from the same project and confirm initial area/player position.
- Movement: walk on allowed terrain, attempt blocked terrain, verify facing and status.
- Interaction: interact with a simple NPC/object/event block and confirm rules/actions fire.
- Quest: activate/progress/complete a quest and confirm reward-once behavior.
- Inventory: collect a pickup and confirm inventory changes without mutating editor defaults.
- Shop: open a shop, buy with enough currency, fail with insufficient currency, and verify stock.
- Area transition: use a door/teleport/event link and confirm area/player position and area-enter effects.
- NPC movement: confirm stationary, patrol, wander, and hostile chase behavior.
- Combat: attack hostile NPCs, verify damage, cooldown, defeat, flags, and removed collision.
- Boat: board, sail on allowed terrain, dismount on allowed terrain, and verify failure when no dismount is available.

## Next Recommended Commits

1. Add runtime contract tests for movement, interaction, progression, object/pickup/shop, NPC tick, combat, and vehicle semantics independent of adapters.
2. Add parity-focused adapter tests that prove Phaser and Three invoke the same shared helper paths for key workflows.
3. Improve Three camera follow/framing and add smoothing without changing movement semantics.
4. Add visual interpolation for Three player/NPC movement while keeping grid state authoritative.
5. Improve placeholder meshes for common terrain/entity types.
6. Polish Three cutscene, dialogue, shop, inventory, quest, and combat overlays.
7. Manually parity-test boat and combat workflows against Phaser and capture any helper gaps.
8. Plan GLB/GLTF asset import and animation work only after runtime parity is stable.
