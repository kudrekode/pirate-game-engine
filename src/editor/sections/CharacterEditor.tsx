import {
	characterSprites,
	portraitPresets,
	tilePresets,
} from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import { getPlayerCombatStats } from "../../runtime/combat";

export function CharacterEditor() {
	const player = useProjectStore((state) => state.project.player);
	const updatePlayer = useProjectStore((state) => state.updatePlayer);
	const combat = getPlayerCombatStats(player);

	function toggleWalkable(tileId: string) {
		const canWalkOn = player.canWalkOn.includes(tileId)
			? player.canWalkOn.filter((id) => id !== tileId)
			: [...player.canWalkOn, tileId];

		updatePlayer({ canWalkOn });
	}

	return (
		<section className="editor-panel character-editor">
			<div className="split-layout">
				<div className="tool-panel wide">
					<div className="panel-title">Character</div>
					<div className="form-grid compact">
						<label>
							Character name
							<input
								onChange={(event) => updatePlayer({ name: event.target.value })}
								value={player.name}
							/>
						</label>
					</div>

					<div className="panel-title">Map Avatar</div>
					<div className="preset-grid">
						{characterSprites.map((sprite) => (
							<button
								className={`preset-card ${player.mapAvatarId === sprite.id ? "selected" : ""}`}
								key={sprite.id}
								onClick={() => updatePlayer({ mapAvatarId: sprite.id })}
								type="button"
							>
								<span
									className="avatar-preview small"
									style={{ background: sprite.color, color: sprite.accent }}
								>
									{sprite.label.slice(0, 1)}
								</span>
								{sprite.label}
							</button>
						))}
					</div>

					<div className="panel-title">Cutscene Portrait</div>
					<div className="preset-grid">
						{portraitPresets.map((portrait) => (
							<button
								className={`preset-card ${
									player.cutscenePortraitId === portrait.id ? "selected" : ""
								}`}
								key={portrait.id}
								onClick={() =>
									updatePlayer({ cutscenePortraitId: portrait.id })
								}
								type="button"
							>
								<span
									className="avatar-preview small"
									style={{ background: portrait.color, color: portrait.accent }}
								>
									{portrait.label.slice(0, 1)}
								</span>
								{portrait.label}
							</button>
						))}
					</div>

					<div className="panel-title">Stats</div>
					<div className="form-grid compact">
						<label>
							Speed
							<input
								min={1}
								onChange={(event) =>
									updatePlayer({ speed: Number(event.target.value) })
								}
								type="number"
								value={player.speed}
							/>
						</label>
						<label>
							Health
							<input
								min={1}
								onChange={(event) => {
									const health = Math.max(1, Number(event.target.value));
									updatePlayer({
										health,
										combat: {
											...combat,
											maxHealth: Math.max(health, combat.maxHealth),
											health,
										},
									});
								}}
								type="number"
								value={combat.health}
							/>
						</label>
						<label>
							Max health
							<input
								min={1}
								onChange={(event) => {
									const maxHealth = Math.max(1, Number(event.target.value));
									updatePlayer({
										health: Math.min(combat.health, maxHealth),
										combat: {
											...combat,
											maxHealth,
											health: Math.min(combat.health, maxHealth),
										},
									});
								}}
								type="number"
								value={combat.maxHealth}
							/>
						</label>
						<label>
							Attack damage
							<input
								min={0}
								onChange={(event) =>
									updatePlayer({
										combat: {
											...combat,
											attackDamage: Math.max(0, Number(event.target.value)),
										},
									})
								}
								type="number"
								value={combat.attackDamage}
							/>
						</label>
						<label>
							Attack range
							<input
								min={1}
								onChange={(event) =>
									updatePlayer({
										combat: {
											...combat,
											attackRangeTiles: Math.max(1, Number(event.target.value)),
										},
									})
								}
								type="number"
								value={combat.attackRangeTiles}
							/>
						</label>
						<label>
							Attack cooldown ms
							<input
								min={0}
								onChange={(event) =>
									updatePlayer({
										combat: {
											...combat,
											attackCooldownMs: Math.max(0, Number(event.target.value)),
										},
									})
								}
								type="number"
								value={combat.attackCooldownMs}
							/>
						</label>
					</div>
				</div>

				<aside className="inspector-panel wide">
					<div className="panel-title">Walkable tiles</div>
					<div className="checkbox-list">
						{tilePresets.map((tile) => (
							<label className="checkbox-row" key={tile.id}>
								<input
									checked={player.canWalkOn.includes(tile.id)}
									onChange={() => toggleWalkable(tile.id)}
									type="checkbox"
								/>
								<span className="swatch" style={{ background: tile.color }} />
								{tile.label}
							</label>
						))}
					</div>
				</aside>
			</div>
		</section>
	);
}
