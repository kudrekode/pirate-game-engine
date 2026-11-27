# Bell Court sword duels

25 November 2026

Import [the Bell Court project](../../hollow-kingdom-combat-arena.project.json), choose **Play**, select **Defensive Guard** or **Aggressive Swordsman**, then **Begin bout**. The two sword opponents each have 84 health. The challenger has 112.

| Control | In the court |
| --- | --- |
| WASD and mouse | Move and look. Face the opponent to intercept the incoming blow. |
| F | Commit to one cut. The hanger reaches 1.85 tiles through a 100° arc. Contact opens at 215 ms, stays live for 70 ms and can hit once. The next cut is available at 660 ms. |
| Hold Q | Guard the front. After an ordinary block, release Q to attack during recovery. A press during recovery can raise a block as soon as the hand is free. Releasing Q cancels that request. |
| Timed Q, then F | Raise the blade within 180 ms of impact for a parry. The opponent staggers for 900 ms. F can riposte directly from the ward. Landing inside that opening deals 33 damage and consumes it. A regular hit deals 22. |
| M | Pause the exchange and release the mouse. Select another opponent, reset the current encounter, or resume. Begin and Resume focus the viewport and request mouse look inside the button gesture. |

Reset restores both fighters, the spawn and the encounter loadout. A rematch shares the WebGL renderer and cached assets. Victory and defeat release the cursor and expose the encounter controls.

## What changed in the exchange

The earlier browser check explicitly drove the sword encounter to victory by pressing F every 710 ms. Edric's old guard only covered his attack windup. Rook could lose his attack whenever an incoming slash interrupted that windup.

Both fighters now observe a committed swing near their front. Their reaction time and current attack phase determine whether they can raise a ward before contact. Once they commit to a ward, they hold it through the incoming cut. An early block turns into a telegraphed counter. A parry against a repeated cut also delays the challenger's next guard and attack. A player can exploit the exposed flank, interrupt an unguarded windup or stay outside the locked line and punish recovery. A clean enemy hit shortens the enemy's recovery. Blocking or drawing a miss leaves the longer opening.

| Authored behaviour | Edric, Defensive Guard | Rook, Aggressive Swordsman |
| --- | --- | --- |
| Approach | Slower approach, protects his windup, retreats a step after a committed cut and comes back into measure | Closes faster and stays close |
| Ordinary attack | 680 ms windup, 175 ms to contact, 465 ms recovery after a block or miss | 410 / 160 / 380 ms opener and 545 / 145 / 625 ms long crosscut |
| Defence | Can block the first frontal threat after 75 ms | Usually commits to the first exchange and needs 125 ms to react |
| Repeated pressure | A second threat within 1,050 ms can trigger a parry | Same cadence rule. His shorter windup more often puts him outside the phase in which he can defend. |
| Counter | 300 ms windup after a 100 ms blade bind | 235 ms windup after the bind |

The rule applies to attackers with authored sword tactics. The NPC attack editor exposes the reaction, repeat threshold and counter windup. Item definitions own damage, contact timing and parry timing. The shared runtime owns heading, obstruction, damage, stagger, defeat and counter eligibility. The Three adapter reads those outcomes for the hand pose, recoil, sound and HUD cue.

## Art and animation

The challenger, keeper and freeblade use the existing Golden humanoids and clothing. The Bell Court variants add articulated shoulder plates, vambraces, a riveted cuirass, a sallet for Edric and an embroidered cloak panel for the challenger. The swept-hilt hanger has a tapered steel blade, wrapped grip and knuckle bow. It uses the existing right-hand socket and finger pose. The court frames the fighters more closely, with the watchtower behind the ruined arches and warm side lighting across the steel.

[Previous guard view](../assets/combat-arena/guard.jpg) · [Revised guard view](../assets/combat-arena/duels/guard-01-windup.jpg)

The outside ward has its own upper-body clip and contact recoil. The enemy loads the shoulder over the telegraph and plays the cut through the existing 0.30 s contact marker. A blade bind, a parry and a body hit have different synthesized sounds. The camera stays steady through contact.

The source characters derive from the Quaternius Universal Base Characters Kit under CC0. The armour, hanger, heraldry, ward and synthesized sounds were authored here. The Blender scripts re-import the resulting GLBs and check character skinning and hand bones, sword dimensions and the ward action. [Base licence](../../public/assets/source/quaternius/License_Standard.txt) · [Armour and hanger source](../../tools/hollow-kingdom/combat-arena/armoury.py) · [Ward source](../../tools/hollow-kingdom/combat-arena/ward.py)

## Reproducing the court

The import, models and animation are included. To rebuild edited sources, run the following from the repository root with Blender 5.2 on PATH.

```powershell
blender -b --factory-startup --python-exit-code 1 -P tools/hollow-kingdom/combat-arena/armoury.py
blender -b --factory-startup --python-exit-code 1 -P tools/hollow-kingdom/combat-arena/ward.py
node tools/hollow-kingdom/combat-arena/build.mjs
```

The two Chromium selectors use Playwright with real keyboard and mouse input. They import the shipped project, use the actual viewport and observe health meters, mixer state, camera and renderer telemetry. The harness serves the local build and public assets over a loopback origin.

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/bell-duel-build',copyPublicDir:false}})"
$env:ARENA_BUILD = 'test-results/bell-duel-build'
$env:ARENA_OUTPUT = 'test-results/bell-duels'
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node e2e/combat-arena.mjs --list
node e2e/combat-arena.mjs blade guard footwork
```

## Chromium gameplay results

Chrome 158.0.8127.37 ran the diagnostic build at 1120 × 760 on Intel Iris Xe, ANGLE D3D11. The driver stood its ground for the attack and defence comparisons. In the attack run it pressed F, waited 115 ms between input loops and kept going until one fighter fell. In the defence run it held Q through the first blow, then timed Q and F on each following exchange. Both opponents started with 84 health in every fresh bout.

| Opponent and input | Player health | Opponent health | Observed exchange |
| --- | ---: | ---: | --- |
| Edric, F only | 0/112 | 84/84 | 76 F presses, six enemy parries and six counters |
| Edric, defend and riposte | 112/112 | 0/84 | One held block, three parries, three damaging ripostes |
| Rook, F only | 0/112 | 40/84 | 71 F presses. Two cuts got through, but five enemy parries led to five counters. |
| Rook, defend and riposte | 112/112 | 0/84 | One held block, three parries, three damaging ripostes |

Edric stepped from row 8 back to row 9 after the held block, then re-entered row 8. Rook reached row 8 and stayed there. In a separate footwork trial, dropping Q during Edric's windup cost 22 health. Moving out of the locked attack arc produced a miss and left the player at 112/112.

The six successful Q presses preceded contact by 89–104 ms. Visible attack-start to damage spanned 204–217 ms across the six ripostes. The player's sampled slash clip read 0.290–0.308 s when the health change appeared, against its authored 0.300 s contact marker. On the first rendered recovery frame after enemy contact, the opponent's clip read 0.313–0.340 s across the 13 observable strike-to-recovery transitions. The enemy can therefore look a little past contact when the result appears. These measurements use frame-resolution observations. The actors retained their equipped hand attachments, with zero missing or incompatible clips in the measured samples.

| Opponent and run | RAF intervals | Frame p50 / p95 / p99 | Median GPU time |
| --- | ---: | --- | ---: |
| Edric, F only | 694 | 12.8 / 20.7 / 25.3 ms | 13.62 ms |
| Edric, defence | 387 | 16.6 / 25.1 / 41.8 ms | 14.92 ms |
| Rook, F only | 570 | 16.7 / 25.0 / 29.2 ms | 15.97 ms |
| Rook, defence | 340 | 16.6 / 20.8 / 25.0 ms | 14.27 ms |

The attack runs include approach and combat. The defence samples include evidence screenshots and Edric's brief save-menu visit. Loading and restarting are outside these frame samples. All four p95 results exceed the 16.7 ms frame budget for 60 Hz.

**Navigation.** M released pointer lock during a windup and focused the selector. Health held during a 1,050 ms pause. Resume relocked and refocused the viewport. The driver switched to the other opponent during combat, rotated the camera under pointer lock, moved with D, then switched back. The four warm resets made Begin Bout available in 94–251 ms and restored both health meters. Continue also restored Edric at 51/84 after saving a partial duel. No Escape input was used.

[Guard windup](../assets/combat-arena/duels/guard-01-windup.jpg) · [Parry](../assets/combat-arena/duels/guard-02-parry.jpg) · [Riposte](../assets/combat-arena/duels/guard-03-riposte.jpg) · [Victory](../assets/combat-arena/duels/guard-04-victory.jpg) · [Player defeat](../assets/combat-arena/duels/guard-spam-outcome.jpg) · [Rook's telegraph](../assets/combat-arena/duels/blade-01-windup.jpg)

Raw captures include the browser version, bundle SHA-256, sampled combat states, clip times, health, render timings and pointer-lock assertions. [Edric](../assets/combat-arena/duels/guard.json) · [Rook](../assets/combat-arena/duels/blade.json) · [Early release and footwork](../assets/combat-arena/duels/footwork.json)

## Automated verification

The focused combat, animation and hand-attachment run passed all 49 tests. It includes five attack-only cadences against Edric, three against Rook, rear hits, guard buffering, an active-window contact, counter damage, spacing and import/save compatibility. The full repository CI passed all 1,139 Vitest cases, root and Studio production builds, the three package builds and all 78 compiler/asset tests. Biome reported zero errors and six existing warnings across the checked files. Both Vite builds emitted their existing large-chunk advisory. The working-tree whitespace check passed.

## Remaining playability questions

The hit test uses reach, heading, obstruction and a short active interval. The two blade meshes can pass beside one another at some angles. Both opponents use the same diagonal slash source, and the hit animation provides a general upper-body reaction. NPC footwork follows interpolated grid steps. Close circling can expose a sharp turn or sliding feet.

Both sword opponents currently have blockable attacks. A player who keeps the blade facing them can hold Q and survive indefinitely. Winning still requires opening the guard or timing a riposte. Their attack sequences and cadence recognition are deterministic, so an experienced player can learn a repeatable answer.

The browser driver reads the committed strike phase and presses Q near impact. A human has to identify that instant from the shoulder, sword and sound. The most important next playtest is whether someone can discover and repeat a riposte with the HUD guidance, then exploit Rook's longer crosscut recovery without relying on a parry every time.
