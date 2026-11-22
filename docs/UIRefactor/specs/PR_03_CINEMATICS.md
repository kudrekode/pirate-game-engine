# PR 03 — Cinematics: Storyboard-First Simple Mode + Advanced Timeline

**Branch:** `feat/editor-03-cinematics`  
**Dependency:** PRs 01–02 merged; actual cinematic system used in Merewatch must remain playable.  
**Visual source:** master HTML → Cinematics; `refs/cinematics_simple.png`, `refs/cinematics_advanced.png`.

## Objective

Replace the current Cinema authoring UI with a **simple first, powerful on demand** screen. A creator should be able to film a dialogue without manually entering coordinates. Advanced mode reveals technical controls for camera, actor, timing, voice and future lip sync. **Both modes must edit the exact same saved sequence**; hidden advanced values are not deleted when toggled off.

## Simple-mode layout

- Left: sequence list, selected sequence, cast linked to NPC/player/scene IDs, Add Shot preset palette.
- Centre: real Three.js scene preview viewed through selected shot's camera; subtitles, playback controls, shot isolation, reset. Project actual GLBs and stage, never an SVG screenshot.
- Bottom: horizontal storyboard cards: add, duplicate, drag-reorder, delete; each card shows preset, target, speaker and approximate duration. Total duration/shot index visible.
- Right: context inspector for selected shot with small number of semantic controls: `shot preset`, `look at actor/landmark`, `speaker`, `text`, `gesture/animation`, `auto/manual duration`.
- Defaults: Establishing, Close-up, Over-shoulder, Two-shot, Detail, Reveal, Current View. Frame from actor bounds/rig head socket/orientation or landmark position; handle collision and occlusion so cameras do not clip through scenery.
- Capture **Use Current View** as a custom shot. Authors may always orbit the editor view and then capture its transform; they shouldn't need to enter XYZ values.

## Advanced-mode layout

- Toggle clearly labelled **Advanced**. Preserve Simple storyboard but reveal a multi-track timeline / Inspector sections: Camera, Actors, Dialogue, Audio, Face, Effects.
- Camera: position/target offsets, FOV, ease/interpolation, tracking, collision avoidance, keyframe/path edit, preview gizmos. Advanced values override preset defaults without making them unreadable.
- Actors: clip reference, facing target, root transform/blocking, optional `walk-to` cue where runtime supports it, overlap/priority/blend.
- Subtitles/dialogue: speaker IDs, multi-line timings, skip behavior, display preview.
- Audio: import/upload/reference existing audio files with correct asset dependencies, waveform/time where possible, volume, fades, stop on completion/skip. One cue at a time is acceptable initially if current runtime does that—document limit.
- Face/lip-sync: reserve real typed tracks for phoneme/viseme timestamps and expression/morph targets. **Do not promise real lip sync without a compatible facial rig**. Expose these controls as unavailable/experimental until functional.
- Future AI panel may offer shot/performance suggestions, but **no external key/provider integration in PR 03**. Generated tracks must eventually be inspectable, reversible and auditable.

## Data and gameplay contracts

- Inspect existing serialisable 3D cinematic sequence definition and its trigger path. Adapt it rather than introducing a competing movie format.
- Stable IDs for sequences, shots, actor references, world markers and audio assets. Preserve compatibility/migrate old simple cutscene cards and current Merewatch sequences.
- Story owns the trigger, objective/quest actions and skip/completion outcomes; Cinema owns the presented shots and their cue timing. Runtime must apply completion/skip effects only once, restore camera/input/animation ownership, and stop playback/audio. Preview must use a cloned isolated session.
- Fallback gracefully on missing actor or unloaded asset: show diagnostic, no permanently blocked player input.
- Reuse working Three runtime animation mixer, character asset rigs, scene objects, cinematics and timeline cue structures. Keep project/schema migration safe.

## Acceptance criteria

1. New sequence created manually with Oswin + Player selected from project references.
2. Four-shot establishing → Oswin close-up → player over-shoulder → watchtower reveal created without entering coordinates.
3. Save/reload preserves shot order, subtitles, actor cues, camera targets; Play triggers exact saved sequence.
4. Reorder/duplicate/delete shots updates preview and JSON data, undo/redo works.
5. In Advanced, fine-tune camera offset/FOV and audio cue; switch back to Simple, then Advanced: override preserved.
6. Import a real WAV asset, preview it, skip during audio: cue stops; player regains control; sequence completion actions occur once.
7. Preview mode leaves the authored GameProject and current save state untouched.
8. Existing `The Light Across the Mere` still triggers via Oswin; complete and skip both enter The Last Watch as before.
9. Handle unresolvable actor/camera references as visible validation errors, not silently using zero coordinates.
10. Browser test shows actual scene and screenshots; test sequence persistence, quest triggers, skip/recovery; run CI.

## Out of scope

Actual AI speech/shot generation, paid API keys, facial motion capture, lip sync authoring for unsupported rigs, professional non-linear video editing, multitrack audio mixing, arbitrary mocap. Reserve compatible serialised extension points and a disabled/configurable future feature—not placeholder playback pretending to work.

## Delegation

Lead owns runtime/serialization boundary and skip semantics. Separate independent work: storyboard UI/presets; advanced timeline controls; audio preview/tests. Do not simultaneously change the central cinematic state machine in several branches.
