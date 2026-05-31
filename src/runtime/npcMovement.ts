import { getOverlayPreset, getStructurePreset, getTerrainPreset } from "../data/mapVisuals";
import type { GameArea, NPCInstance, PatrolPoint } from "../types/game";

export type NPCMovementState = {
  patrolIndex: number;
  wanderTarget?: PatrolPoint;
  stopped?: boolean;
};

export type NPCMovementUpdate = {
  moved: boolean;
  x: number;
  y: number;
  facing: NonNullable<NPCInstance["facing"]>;
  state: NPCMovementState;
};

type CanMove = (x: number, y: number) => boolean;

function samePoint(a: PatrolPoint, b: PatrolPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function stepToward(from: PatrolPoint, target: PatrolPoint): PatrolPoint {
  if (from.x !== target.x) {
    return { x: from.x + Math.sign(target.x - from.x), y: from.y };
  }

  return { x: from.x, y: from.y + Math.sign(target.y - from.y) };
}

function facingForStep(from: PatrolPoint, to: PatrolPoint, fallback: NPCMovementUpdate["facing"]) {
  if (to.x < from.x) {
    return "left";
  }
  if (to.x > from.x) {
    return "right";
  }
  if (to.y < from.y) {
    return "up";
  }
  if (to.y > from.y) {
    return "down";
  }
  return fallback;
}

function unchanged(npc: NPCInstance, state: NPCMovementState): NPCMovementUpdate {
  return {
    moved: false,
    x: npc.x,
    y: npc.y,
    facing: npc.facing ?? "down",
    state,
  };
}

function moveToward(
  npc: NPCInstance,
  state: NPCMovementState,
  target: PatrolPoint,
  canMove: CanMove,
): NPCMovementUpdate {
  const next = stepToward(npc, target);
  if (!canMove(next.x, next.y)) {
    return unchanged(npc, state);
  }

  return {
    moved: true,
    x: next.x,
    y: next.y,
    facing: facingForStep(npc, next, npc.facing ?? "down"),
    state,
  };
}

export function updateStationaryNPC(
  npc: NPCInstance,
  state: NPCMovementState = { patrolIndex: 0 },
): NPCMovementUpdate {
  return unchanged(npc, state);
}

export function updatePatrolNPC(
  npc: NPCInstance,
  state: NPCMovementState = { patrolIndex: 0 },
  canMove: CanMove = () => true,
): NPCMovementUpdate {
  const path = npc.patrolPath;
  if (!path || path.points.length === 0 || state.stopped) {
    return unchanged(npc, state);
  }

  let patrolIndex = Math.min(Math.max(0, state.patrolIndex), path.points.length - 1);
  let target = path.points[patrolIndex];
  if (samePoint(npc, target)) {
    if (patrolIndex >= path.points.length - 1) {
      if (!path.loop) {
        return unchanged(npc, { ...state, stopped: true });
      }
      patrolIndex = 0;
    } else {
      patrolIndex += 1;
    }
    target = path.points[patrolIndex];
  }

  return moveToward(npc, { ...state, patrolIndex }, target, canMove);
}

export function generateWanderDestination(
  npc: NPCInstance,
  area: Pick<GameArea, "width" | "height">,
  random = Math.random,
): PatrolPoint | undefined {
  const zone = npc.wanderZone;
  if (!zone || zone.width <= 0 || zone.height <= 0) {
    return undefined;
  }

  const minX = Math.max(0, Math.round(zone.x));
  const minY = Math.max(0, Math.round(zone.y));
  const maxX = Math.min(area.width - 1, minX + Math.max(1, Math.round(zone.width)) - 1);
  const maxY = Math.min(area.height - 1, minY + Math.max(1, Math.round(zone.height)) - 1);
  if (maxX < minX || maxY < minY) {
    return undefined;
  }

  return {
    x: minX + Math.floor(random() * (maxX - minX + 1)),
    y: minY + Math.floor(random() * (maxY - minY + 1)),
  };
}

export function updateWanderNPC(
  npc: NPCInstance,
  area: Pick<GameArea, "width" | "height">,
  state: NPCMovementState = { patrolIndex: 0 },
  canMove: CanMove = () => true,
  random = Math.random,
): NPCMovementUpdate {
  const target =
    state.wanderTarget && !samePoint(npc, state.wanderTarget)
      ? state.wanderTarget
      : generateWanderDestination(npc, area, random);
  if (!target || samePoint(npc, target)) {
    return unchanged(npc, { ...state, wanderTarget: undefined });
  }

  const nextState = { ...state, wanderTarget: target };
  const update = moveToward(npc, nextState, target, canMove);
  return update.moved ? update : unchanged(npc, { ...state, wanderTarget: undefined });
}

export function isNpcTileWalkable(
  area: GameArea,
  movingNpcId: string,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
    return false;
  }

  if (
    area.structures.some((structure) => {
      const preset = getStructurePreset(structure.structureId);
      return (
        x >= structure.x &&
        y >= structure.y &&
        x < structure.x + structure.widthTiles &&
        y < structure.y + structure.heightTiles &&
        (structure.blocksMovement || (structure.movementRule ?? preset.movementRule).walkable === false)
      );
    })
  ) {
    return false;
  }

  if (area.npcs.some((npc) => npc.id !== movingNpcId && npc.blocksMovement && npc.x === x && npc.y === y)) {
    return false;
  }

  const terrainTile = area.terrainTiles.find((tile) => tile.x === x && tile.y === y);
  if (!terrainTile) {
    return false;
  }

  const overlayTile = area.overlayTiles.find((tile) => tile.x === x && tile.y === y);
  if (overlayTile) {
    const overlayRule = getOverlayPreset(overlayTile.overlayId).movementRule;
    if (overlayRule.walkable !== undefined) {
      return overlayRule.walkable;
    }
  }

  return getTerrainPreset(terrainTile.tileId).movementRule.walkable !== false;
}

