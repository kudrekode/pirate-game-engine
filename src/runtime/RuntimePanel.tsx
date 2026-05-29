import { useEffect, useRef } from "react";
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
      scene: [new AdventureScene(project)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      game.destroy(true);
    };
  }, [project]);

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
