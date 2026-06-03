import type { ItemDefinition, ObjectBehaviour } from "../types/game";
import { giveItem, hasItem } from "./inventory";
import type { RuntimeGameState } from "./ruleEngine";

export type ObjectBehaviourResult =
  | { type: "none"; handled: false }
  | { type: "container"; handled: true; opened: boolean; message: string }
  | { type: "door"; handled: true; allowed: boolean; targetAreaId?: string; targetEventBlockId?: string; lockedCutsceneId?: string; message: string }
  | { type: "sign"; handled: true; text: string }
  | { type: "vehicle"; handled: true; message: string };

export type ObjectBehaviourContext = {
  itemDefinitions: ItemDefinition[];
  objectId: string;
  openedObjectIds: Set<string>;
  state: RuntimeGameState;
};

export function runObjectBehaviour(
  behaviour: ObjectBehaviour | undefined,
  context: ObjectBehaviourContext,
): ObjectBehaviourResult {
  if (!behaviour || behaviour.type === "none") {
    return { type: "none", handled: false };
  }

  if (behaviour.type === "container") {
    const opened = behaviour.openedFlag
      ? context.state.flags[behaviour.openedFlag] === true
      : context.openedObjectIds.has(context.objectId);

    if (behaviour.once && opened) {
      return { type: "container", handled: true, opened: false, message: "Container is empty." };
    }

    behaviour.contents.forEach((content) =>
      giveItem(context.state.inventory, context.itemDefinitions, content.itemId, content.quantity),
    );

    if (behaviour.once) {
      if (behaviour.openedFlag) {
        context.state.flags[behaviour.openedFlag] = true;
      } else {
        context.openedObjectIds.add(context.objectId);
      }
    }

    return { type: "container", handled: true, opened: true, message: "Collected contents." };
  }

  if (behaviour.type === "door") {
    const hasRequiredItem = !behaviour.requiredItemId ||
      hasItem(context.state.inventory, behaviour.requiredItemId, 1);

    if (!hasRequiredItem) {
      return {
        type: "door",
        handled: true,
        allowed: false,
        lockedCutsceneId: behaviour.lockedCutsceneId,
        message: "Door is locked.",
      };
    }

    return {
      type: "door",
      handled: true,
      allowed: true,
      targetAreaId: behaviour.targetAreaId,
      targetEventBlockId: behaviour.targetEventBlockId,
      message: "Door opened.",
    };
  }

  if (behaviour.type === "sign") {
    return { type: "sign", handled: true, text: behaviour.text };
  }

  return {
    type: "vehicle",
    handled: true,
    message: "Vehicle behaviour configured but runtime boarding is not implemented yet.",
  };
}
