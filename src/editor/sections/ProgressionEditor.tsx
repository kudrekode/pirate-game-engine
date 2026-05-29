import { useProjectStore } from "../../store/useProjectStore";
import type { ProgressionAction, ProgressionStep } from "../../types/game";

type ProgressionType = ProgressionAction["type"];
type EventProgressionType = Extract<ProgressionAction, { eventBlockId: string }>["type"];

const progressionTypes: { label: string; value: ProgressionType }[] = [
  { label: "Play cutscene", value: "play_cutscene" },
  { label: "Spawn player", value: "spawn_player" },
  { label: "Wait for trigger", value: "wait_for_trigger" },
  { label: "Teleport player", value: "teleport_player" },
  { label: "End game", value: "end_game" },
];

function makeActionForType(
  type: ProgressionType,
  cutsceneId: string,
  eventBlockId: string,
): ProgressionAction {
  if (type === "play_cutscene") {
    return { type, cutsceneId };
  }

  if (type === "spawn_player" || type === "wait_for_trigger" || type === "teleport_player") {
    return { type, eventBlockId };
  }

  return { type: "end_game" };
}

function getStepName(step: ProgressionStep): string {
  if (step.label) {
    return step.label;
  }

  return progressionTypes.find((type) => type.value === step.action.type)?.label ?? "Step";
}

export function ProgressionEditor() {
  const project = useProjectStore((state) => state.project);
  const addProgressionStep = useProjectStore((state) => state.addProgressionStep);
  const updateProgressionStep = useProjectStore((state) => state.updateProgressionStep);
  const deleteProgressionStep = useProjectStore((state) => state.deleteProgressionStep);

  const firstCutsceneId = project.cutscenes[0]?.id ?? "";
  const firstEventBlockId = project.map.eventBlocks[0]?.id ?? "";

  // TODO: Replace the linear list with a node graph editor when branching progression is needed.

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
                  Label
                  <input
                    onChange={(event) =>
                      updateProgressionStep(step.id, {
                        ...step,
                        label: event.target.value || undefined,
                      })
                    }
                    placeholder={getStepName(step)}
                    value={step.label ?? ""}
                  />
                </label>

                <label>
                  Action
                  <select
                    onChange={(event) =>
                      updateProgressionStep(step.id, {
                        ...step,
                        action: makeActionForType(
                          event.target.value as ProgressionType,
                          firstCutsceneId,
                          firstEventBlockId,
                        ),
                      })
                    }
                    value={step.action.type}
                  >
                    {progressionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                {step.action.type === "play_cutscene" ? (
                  <label>
                    Cutscene
                    <select
                      onChange={(event) =>
                        updateProgressionStep(step.id, {
                          ...step,
                          action: {
                            type: "play_cutscene",
                            cutsceneId: event.target.value,
                          },
                        })
                      }
                      value={step.action.cutsceneId}
                    >
                      {project.cutscenes.map((cutscene) => (
                        <option key={cutscene.id} value={cutscene.id}>
                          {cutscene.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {step.action.type === "spawn_player" ||
                step.action.type === "wait_for_trigger" ||
                step.action.type === "teleport_player" ? (
                  <label>
                    Event block
                    <select
                      onChange={(event) =>
                        updateProgressionStep(step.id, {
                          ...step,
                          action: {
                            type: step.action.type as EventProgressionType,
                            eventBlockId: event.target.value,
                          },
                        })
                      }
                      value={step.action.eventBlockId}
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
