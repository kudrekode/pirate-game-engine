import { getOverlayPreset, getStructurePreset, getTerrainPreset } from "../data/mapVisuals";
import type {
  GameArea,
  MapStructure,
  ObjectInstance,
  MovementResult,
  MovementRule,
  PlayerConfig,
} from "../types/game";

function coversTile(structure: MapStructure, x: number, y: number): boolean {
  return (
    x >= structure.x &&
    y >= structure.y &&
    x < structure.x + structure.widthTiles &&
    y < structure.y + structure.heightTiles
  );
}

function objectCoversTile(object: ObjectInstance, area: GameArea, x: number, y: number): boolean {
  void area;
  const widthTiles = object.widthTiles ?? 1;
  const heightTiles = object.heightTiles ?? 1;
  return x >= object.x && y >= object.y && x < object.x + widthTiles && y < object.y + heightTiles;
}

function normalizeSpeedMultiplier(rule?: MovementRule): number {
  const multiplier = rule?.speedMultiplier ?? 1;
  return Number.isFinite(multiplier) ? Math.max(0.1, multiplier) : 1;
}

function block(reason: string, rule?: MovementRule): MovementResult {
  return {
    canMove: false,
    reason,
    speedMultiplier: normalizeSpeedMultiplier(rule),
    movementMode: rule?.movementMode,
  };
}

function allow(rule?: MovementRule): MovementResult {
  return {
    canMove: true,
    speedMultiplier: normalizeSpeedMultiplier(rule),
    movementMode: rule?.movementMode,
  };
}

export function resolveMovementAt(
  area: GameArea,
  x: number,
  y: number,
  player: PlayerConfig,
): MovementResult {
  if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
    return block("Out of bounds.");
  }

  const blockingStructure = area.structures.find((structure) => {
    if (!coversTile(structure, x, y)) {
      return false;
    }

    const preset = getStructurePreset(structure.structureId);
    const rule = structure.movementRule ?? preset.movementRule;
    return structure.blocksMovement || rule.walkable === false;
  });

  if (blockingStructure) {
    const preset = getStructurePreset(blockingStructure.structureId);
    return block(`Blocked by ${blockingStructure.name}.`, blockingStructure.movementRule ?? preset.movementRule);
  }

  const blockingObject = area.objects.find((object) => {
    if (!objectCoversTile(object, area, x, y)) {
      return false;
    }

    return object.blocksMovement === true;
  });

  if (blockingObject) {
    return block("Blocked by object.");
  }

  const blockingNpc = area.npcs.find((npc) => npc.blocksMovement && npc.x === x && npc.y === y);
  if (blockingNpc) {
    return block("Blocked by NPC.");
  }

  // TODO: Add object layer movement rules when object placement becomes first-class.

  const terrainTile = area.terrainTiles.find((tile) => tile.x === x && tile.y === y);
  if (!terrainTile) {
    return block("No tile.");
  }

  const overlayTile = area.overlayTiles.find((tile) => tile.x === x && tile.y === y);
  if (overlayTile) {
    const overlay = getOverlayPreset(overlayTile.overlayId);

    if (overlay.movementRule.walkable === true) {
      return allow(overlay.movementRule);
    }

    if (overlay.movementRule.walkable === false) {
      return block(`Blocked by ${overlay.label}.`, overlay.movementRule);
    }
  }

  const terrain = getTerrainPreset(terrainTile.tileId);
  if (terrain.movementRule.walkable === false || !player.canWalkOn.includes(terrainTile.tileId)) {
    return block(`Blocked by ${terrain.label}.`, terrain.movementRule);
  }

  return allow(terrain.movementRule);
}
