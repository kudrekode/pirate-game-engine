import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameProject } from "../types/game";
import { AdventureScene } from "./AdventureScene";

type RuntimePanelProps = {
  project: GameProject;
  onClose: () => void;
};

export function RuntimePanel({ project, onClose }: RuntimePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportWidth = Math.max(1, Math.round(project.camera.viewportWidthTiles)) * project.map.tileSize;
  const viewportHeight =
    Math.max(1, Math.round(project.camera.viewportHeightTiles)) * project.map.tileSize;

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: viewportWidth,
      height: viewportHeight,
      backgroundColor: "#111827",
      scene: [new AdventureScene(project)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      game.destroy(true);
    };
  }, [project, viewportHeight, viewportWidth]);

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
      <div className="phaser-host" ref={containerRef} />
    </section>
  );
}
