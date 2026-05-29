import { useProjectStore } from "../../store/useProjectStore";
import type { ProgressionStep } from "../../types/game";

type ProgressionType = ProgressionStep["type"];

const progressionTypes: { label: string; value: ProgressionType }[] = [
  { label: "Play cutscene", value: "play_cutscene" },
  { label: "Spawn player", value: "spawn_player" },
  { label: "Wait for trigger", value: "wait_for_trigger" },
  { label: "End game", value: "end_game" },
];

function makeStepForType(
  step: ProgressionStep,
  type: ProgressionType,
  cutsceneId: string,
  eventBlockId: string,
): ProgressionStep {
  if (type === "play_cutscene") {
    return { id: step.id, type, cutsceneId };
  }

  if (type === "spawn_player" || type === "wait_for_trigger") {
    return { id: step.id, type, eventBlockId };
  }

  return { id: step.id, type: "end_game" };
}

export function ProgressionEditor() {
  const project = useProjectStore((state) => state.project);
  const addProgressionStep = useProjectStore((state) => state.addProgressionStep);
  const updateProgressionStep = useProjectStore((state) => state.updateProgressionStep);
  const deleteProgressionStep = useProjectStore((state) => state.deleteProgressionStep);

  const firstCutsceneId = project.cutscenes[0]?.id ?? "";
  const firstEventBlockId = project.map.eventBlocks[0]?.id ?? "";

  // TODO: Add drag handles or up/down controls for reordering progression steps.

  return (
    <section className="editor-panel progression-editor">
      <div className="content-panel">
        <div className="panel-title">Linear progression</div>
        <div className="progression-list">
          {project.progression.map((step, index) => (
            <div className="progression-step" key={step.id}>
              <div className="step-index">{index + 1}</div>
              <div className="step-fields">
                <label>
                  Type
                  <select
                    onChange={(event) =>
                      updateProgressionStep(
                        step.id,
                        makeStepForType(
                          step,
                          event.target.value as ProgressionType,
                          firstCutsceneId,
                          firstEventBlockId,
                        ),
                      )
                    }
                    value={step.type}
                  >
                    {progressionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                {step.type === "play_cutscene" ? (
                  <label>
                    Cutscene
                    <select
                      onChange={(event) =>
                        updateProgressionStep(step.id, {
                          ...step,
                          cutsceneId: event.target.value,
                        })
                      }
                      value={step.cutsceneId}
                    >
                      {project.cutscenes.map((cutscene) => (
                        <option key={cutscene.id} value={cutscene.id}>
                          {cutscene.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {step.type === "spawn_player" || step.type === "wait_for_trigger" ? (
                  <label>
                    Event block
                    <select
                      onChange={(event) =>
                        updateProgressionStep(step.id, {
                          ...step,
                          eventBlockId: event.target.value,
                        })
                      }
                      value={step.eventBlockId}
                    >
                      {project.map.eventBlocks.map((eventBlock) => (
                        <option key={eventBlock.id} value={eventBlock.id}>
                          {eventBlock.name} ({eventBlock.kind})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                className="danger-button compact"
                onClick={() => deleteProgressionStep(step.id)}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <aside className="inspector-panel">
        <div className="panel-title">Add step</div>
        <div className="action-list">
          {progressionTypes.map((type) => (
            <button key={type.value} onClick={() => addProgressionStep(type.value)} type="button">
              {type.label}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
