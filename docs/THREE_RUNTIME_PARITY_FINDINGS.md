# Three Runtime Parity Findings

## Test Project

- Project/preset:
- Date:
- Phaser baseline tested:
- Three runtime tested:
- Overall result:

## Severity Definitions

- Blocker: cannot continue the test/game flow
- Major: gameplay semantics differ between runtimes
- Minor: behaviour works but presentation or feedback differs
- Visual: rendering/camera/animation only

## Parity Checklist

| System | 2D Result | 3D Result | Parity | Severity | Notes |
| --- | --- | --- | --- | --- | --- |
| game start |  |  |  |  |  |
| initial progression |  |  |  |  |  |
| spawn |  |  |  |  |  |
| player movement |  |  |  |  |  |
| collision |  |  |  |  |  |
| terrain height |  |  |  |  |  |
| interaction discovery |  |  |  |  |  |
| NPC direct interaction |  |  |  |  |  |
| on_interact rules |  |  |  |  |  |
| flags |  |  |  |  |  |
| variables |  |  |  |  |  |
| cutscenes |  |  |  |  |  |
| dialogue |  |  |  |  |  |
| quest activation |  |  |  |  |  |
| quest objective sync |  |  |  |  |  |
| quest completion |  |  |  |  |  |
| quest rewards |  |  |  |  |  |
| inventory |  |  |  |  |  |
| pickups |  |  |  |  |  |
| shop open |  |  |  |  |  |
| shop purchase |  |  |  |  |  |
| insufficient currency |  |  |  |  |  |
| area links |  |  |  |  |  |
| teleport |  |  |  |  |  |
| area enter rules |  |  |  |  |  |
| NPC patrol |  |  |  |  |  |
| NPC wander |  |  |  |  |  |
| enemy chase |  |  |  |  |  |
| enemy contact damage |  |  |  |  |  |
| player attack |  |  |  |  |  |
| NPC damage |  |  |  |  |  |
| NPC defeat |  |  |  |  |  |
| defeat flags/triggers |  |  |  |  |  |
| boat boarding |  |  |  |  |  |
| boat movement |  |  |  |  |  |
| boat dismount |  |  |  |  |  |
| game over |  |  |  |  |  |
| end game |  |  |  |  |  |

## Findings

### Finding P-001

System:
Severity:
2D behaviour:
3D behaviour:
Expected shared-runtime behaviour:
Flow log evidence:
Reproduction steps:
Suspected layer:
- shared runtime
- Phaser adapter
- Three adapter
- presentation only
Status:

### Finding P-002

System:
Severity:
2D behaviour:
3D behaviour:
Expected shared-runtime behaviour:
Flow log evidence:
Reproduction steps:
Suspected layer:
- shared runtime
- Phaser adapter
- Three adapter
- presentation only
Status:

### Finding P-003

System:
Severity:
2D behaviour:
3D behaviour:
Expected shared-runtime behaviour:
Flow log evidence:
Reproduction steps:
Suspected layer:
- shared runtime
- Phaser adapter
- Three adapter
- presentation only
Status:

## Visual/Presentation Backlog

Visual findings should not be treated as runtime parity failures unless they change gameplay semantics.

- [ ] camera follow
- [ ] camera smoothing
- [ ] movement interpolation
- [ ] NPC interpolation
- [ ] attack feedback
- [ ] damage feedback
- [ ] object meshes
- [ ] NPC meshes
- [ ] terrain materials
- [ ] lighting
- [ ] runtime HUD layout
- [ ] cutscene presentation
- [ ] dialogue presentation
- [ ] shop presentation

## Exit Criteria For Three Runtime Parity V1

- No Blocker parity findings.
- No unresolved Major shared-runtime semantic differences.
- Movement, collision, and interactions work.
- Quest, inventory, and shop flow works.
- Area transitions work.
- NPC and combat flow works.
- Vehicle flow works where supported.
- Remaining issues are Minor or Visual.
