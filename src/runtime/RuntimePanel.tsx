import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import type { GameProject } from "../types/game";
import { AdventureScene } from "./AdventureScene";

const RUNTIME_SCREEN_WIDTH = 640;
const RUNTIME_SCREEN_HEIGHT = 480;

type RuntimePanelProps = {
  project: GameProject;
  onClose: () => void;
};

export function RuntimePanel({ project, onClose }: RuntimePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "i") {
        setIsInventoryOpen((isOpen) => !isOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: RUNTIME_SCREEN_WIDTH,
      height: RUNTIME_SCREEN_HEIGHT,
      backgroundColor: "#111827",
      scene: [new AdventureScene(project, setInventory)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      game.destroy(true);
    };
  }, [project]);

  const inventoryItems = Object.entries(inventory)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({
      item: project.items.find((candidate) => candidate.id === itemId),
      itemId,
      quantity,
    }));
  const goldCount = inventory.gold_coin ?? 0;

  return (
    <section className="runtime-panel">
      <div className="runtime-toolbar">
        <div>
          <strong>Play Test</strong>
          <span>{project.metadata.name}</span>
        </div>
        <button onClick={onClose} type="button">
          Back to editor
        </button>
      </div>
      <div className="runtime-stage">
        <div className="phaser-host" ref={containerRef} />
        <div className="inventory-hud">Gold: {goldCount}</div>
        {isInventoryOpen ? (
          <aside className="inventory-panel">
            <div className="inventory-heading">
              <strong>Inventory</strong>
              <span>Press I to close</span>
            </div>
            {inventoryItems.length > 0 ? (
              <div className="inventory-list">
                {inventoryItems.map(({ item, itemId, quantity }) => (
                  <div className="inventory-row" key={itemId}>
                    <span>{item?.name ?? itemId}</span>
                    <strong>x{quantity}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="inventory-empty">No items collected.</p>
            )}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
