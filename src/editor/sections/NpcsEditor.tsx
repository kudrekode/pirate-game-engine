import { useEffect, useState } from "react";
import { characterSprites, portraitPresets } from "../../data/presets";
import {
	defaultEnemyBehaviour,
	defaultNPCAttributes,
	defaultNPCMovement,
	resolveNPCInstance,
} from "../../runtime/npcResolver";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	EnemyBehaviour,
	NPCAttributes,
	NPCDefinition,
	NPCMovementConfig,
} from "../../types/game";

export function isNpcDefinitionPlaced(
	areas: { npcs: { npcDefinitionId: string }[] }[],
	npcDefinitionId: string,
): boolean {
	return areas.some((area) =>
		area.npcs.some((npc) => npc.npcDefinitionId === npcDefinitionId),
	);
}

function makeId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	}

	return `${prefix}_${Date.now().toString(36)}`;
}

export function NpcsEditor() {
	const project = useProjectStore((state) => state.project);
	const updateProject = useProjectStore((state) => state.updateProject);
	const [selectedNpcId, setSelectedNpcId] = useState(project.npcs[0]?.id ?? "");
	const [message, setMessage] = useState("");
	const selectedNpc = project.npcs.find((npc) => npc.id === selectedNpcId);

	useEffect(() => {
		if (!selectedNpc) {
			setSelectedNpcId(project.npcs[0]?.id ?? "");
		}
	}, [project.npcs, selectedNpc]);

	function updateNpc(patch: Partial<NPCDefinition>) {
		if (!selectedNpc) {
			return;
		}

		updateProject((draft) => {
			draft.npcs = draft.npcs.map((npc) =>
				npc.id === selectedNpc.id ? { ...npc, ...patch } : npc,
			);
		});
	}

	function updateDefaultAttributes(patch: Partial<NPCAttributes>) {
		if (!selectedNpc) {
			return;
		}

		const next = {
			...defaultNPCAttributes,
			...selectedNpc.defaultAttributes,
			...patch,
		};
		next.maxHealth = Math.max(1, Number(next.maxHealth));
		next.health = Math.min(next.maxHealth, Math.max(0, Number(next.health)));
		next.movementSpeed = Math.max(0.1, Number(next.movementSpeed ?? 1));
		updateNpc({ defaultAttributes: next });
	}

	function updateDefaultMovement(patch: Partial<NPCMovementConfig>) {
		if (!selectedNpc) {
			return;
		}

		const next = {
			...defaultNPCMovement,
			...selectedNpc.defaultMovement,
			...patch,
		};
		updateNpc({ defaultMovement: next });
	}

	function updateDefaultEnemyBehaviour(patch: Partial<EnemyBehaviour>) {
		if (!selectedNpc) {
			return;
		}

		updateNpc({
			defaultEnemyBehaviour: {
				...defaultEnemyBehaviour,
				...selectedNpc.defaultEnemyBehaviour,
				...patch,
			},
		});
	}

	function addNpc() {
		const id = makeId("npc");
		updateProject((draft) => {
			draft.npcs.push({
				id,
				name: `NPC ${draft.npcs.length + 1}`,
				mapAvatarId: characterSprites[0]?.id ?? "scout",
				portraitId: portraitPresets[0]?.id,
				defaultAttributes: defaultNPCAttributes,
				defaultMovement: defaultNPCMovement,
			});
		});
		setSelectedNpcId(id);
		setMessage("");
	}

	function deleteNpc() {
		if (!selectedNpc) {
			return;
		}

		const isPlaced = isNpcDefinitionPlaced(project.areas, selectedNpc.id);
		if (isPlaced) {
			setMessage(
				`${selectedNpc.name} is placed in a map. Delete those instances first.`,
			);
			return;
		}

		if (!window.confirm(`Delete NPC definition "${selectedNpc.name}"?`)) {
			return;
		}

		updateProject((draft) => {
			draft.npcs = draft.npcs.filter((npc) => npc.id !== selectedNpc.id);
		});
		setMessage("");
	}

	return (
		<section className="editor-panel npcs-editor">
			<aside className="tool-panel">
				<div className="panel-title">NPCs</div>
				<p className="helper-text">
					Reusable character definitions. Place instances from the Map tab.
				</p>
				<button
					className="primary-button full-width"
					onClick={addNpc}
					type="button"
				>
					Add NPC
				</button>
				<div className="list-stack npc-list">
					{project.npcs.map((npc) => (
						<button
							className={`list-item ${npc.id === selectedNpcId ? "selected" : ""}`}
							key={npc.id}
							onClick={() => setSelectedNpcId(npc.id)}
							type="button"
						>
							{npc.name}
						</button>
					))}
					{project.npcs.length === 0 ? (
						<p className="empty-state compact">No NPC definitions.</p>
					) : null}
				</div>
			</aside>

			<div className="content-panel">
				{selectedNpc ? (
					<>
						<div className="panel-title">NPC Definition</div>
						{message ? (
							<div className="validation-message">{message}</div>
						) : null}
						{(() => {
							const attributes = {
								...defaultNPCAttributes,
								...selectedNpc.defaultAttributes,
							};
							const movement = {
								...defaultNPCMovement,
								...selectedNpc.defaultMovement,
							};
							const enemy = {
								...defaultEnemyBehaviour,
								...selectedNpc.defaultEnemyBehaviour,
							};

							return (
								<>
									<div className="form-grid compact">
										<label>
											Name
											<input
												onChange={(event) =>
													updateNpc({ name: event.target.value })
												}
												value={selectedNpc.name}
											/>
										</label>
									</div>
									<label>
										Description
										<textarea
											onChange={(event) =>
												updateNpc({ description: event.target.value })
											}
											rows={3}
											value={selectedNpc.description ?? ""}
										/>
									</label>
									<div className="panel-title secondary">Map Avatar</div>
									<div className="preset-grid">
										{characterSprites.map((sprite) => (
											<button
												className={`preset-card ${selectedNpc.mapAvatarId === sprite.id ? "selected" : ""}`}
												key={sprite.id}
												onClick={() => updateNpc({ mapAvatarId: sprite.id })}
												type="button"
											>
												<span
													className="avatar-preview small"
													style={{
														background: sprite.color,
														color: sprite.accent,
													}}
												>
													{sprite.label.slice(0, 1)}
												</span>
												{sprite.label}
											</button>
										))}
									</div>
									<div className="panel-title">Portrait</div>
									<div className="preset-grid">
										{portraitPresets.map((portrait) => (
											<button
												className={`preset-card ${selectedNpc.portraitId === portrait.id ? "selected" : ""}`}
												key={portrait.id}
												onClick={() => updateNpc({ portraitId: portrait.id })}
												type="button"
											>
												<span
													className="avatar-preview small"
													style={{
														background: portrait.color,
														color: portrait.accent,
													}}
												>
													{portrait.label.slice(0, 1)}
												</span>
												{portrait.label}
											</button>
										))}
									</div>
									<div className="panel-title secondary">
										Default Attributes
									</div>
									<div className="form-grid compact">
										<label>
											Current health
											<input
												min={0}
												max={attributes.maxHealth}
												onChange={(event) =>
													updateDefaultAttributes({
														health: Number(event.target.value),
													})
												}
												type="number"
												value={attributes.health}
											/>
										</label>
										<label>
											Max health
											<input
												min={1}
												onChange={(event) => {
													const maxHealth = Math.max(
														1,
														Number(event.target.value),
													);
													updateDefaultAttributes({
														maxHealth,
														health: Math.min(attributes.health, maxHealth),
													});
												}}
												type="number"
												value={attributes.maxHealth}
											/>
										</label>
									</div>
									<label>
										Faction
										<input
											onChange={(event) =>
												updateDefaultAttributes({ faction: event.target.value })
											}
											value={attributes.faction}
										/>
									</label>
									<label>
										Alignment
										<select
											onChange={(event) =>
												updateDefaultAttributes({
													alignment: event.target
														.value as NPCAttributes["alignment"],
												})
											}
											value={attributes.alignment}
										>
											<option value="friendly">Friendly</option>
											<option value="neutral">Neutral</option>
											<option value="hostile">Hostile</option>
										</select>
									</label>
									<label className="checkbox-row standalone">
										<input
											checked={attributes.canInteract}
											onChange={(event) =>
												updateDefaultAttributes({
													canInteract: event.target.checked,
												})
											}
											type="checkbox"
										/>
										Can interact
									</label>
									<label>
										Movement speed
										<input
											min={0.1}
											max={10}
											step={0.1}
											onChange={(event) =>
												updateDefaultAttributes({
													movementSpeed: Number(event.target.value),
												})
											}
											type="number"
											value={attributes.movementSpeed ?? 1}
										/>
									</label>
									<div className="panel-title secondary">Default Movement</div>
									<label>
										Mode
										<select
											onChange={(event) =>
												updateDefaultMovement({
													movementMode: event.target
														.value as NPCMovementConfig["movementMode"],
												})
											}
											value={movement.movementMode}
										>
											<option value="stationary">Stationary</option>
											<option value="patrol">Patrol</option>
											<option value="wander">Wander</option>
										</select>
									</label>
									<label>
										Movement speed
										<input
											min={0.1}
											max={10}
											step={0.1}
											onChange={(event) =>
												updateDefaultMovement({
													movementSpeed: Number(event.target.value),
												})
											}
											type="number"
											value={
												movement.movementSpeed ?? attributes.movementSpeed ?? 1
											}
										/>
									</label>
									<p className="helper-text compact">
										Patrol points and wander zones can be fine-tuned on placed
										instances in the Map inspector.
									</p>
									<div className="panel-title secondary">
										Default Enemy Behaviour
									</div>
									<label className="checkbox-row standalone">
										<input
											checked={enemy.enabled}
											onChange={(event) =>
												updateDefaultEnemyBehaviour({
													enabled: event.target.checked,
												})
											}
											type="checkbox"
										/>
										Enabled
									</label>
									<div className="form-grid compact">
										<label>
											Detection radius
											<input
												min={0}
												onChange={(event) =>
													updateDefaultEnemyBehaviour({
														detectionRadiusTiles: Math.max(
															0,
															Number(event.target.value),
														),
													})
												}
												type="number"
												value={enemy.detectionRadiusTiles}
											/>
										</label>
										<label>
											Chase radius
											<input
												min={0}
												onChange={(event) =>
													updateDefaultEnemyBehaviour({
														chaseRadiusTiles: Math.max(
															0,
															Number(event.target.value),
														),
													})
												}
												type="number"
												value={enemy.chaseRadiusTiles}
											/>
										</label>
										<label>
											Contact damage
											<input
												min={0}
												onChange={(event) =>
													updateDefaultEnemyBehaviour({
														contactDamage: Math.max(
															0,
															Number(event.target.value),
														),
													})
												}
												type="number"
												value={enemy.contactDamage ?? 0}
											/>
										</label>
									</div>
									<label className="checkbox-row standalone">
										<input
											checked={enemy.returnToOrigin}
											onChange={(event) =>
												updateDefaultEnemyBehaviour({
													returnToOrigin: event.target.checked,
												})
											}
											type="checkbox"
										/>
										Return to origin
									</label>
									<p className="helper-text compact">
										TODO: Reuse the Map inspector interaction editor for default
										NPC interactions.
									</p>
									<button
										className="danger-button"
										onClick={deleteNpc}
										type="button"
									>
										Delete NPC
									</button>
								</>
							);
						})()}
					</>
				) : (
					<p className="empty-state">
						Add an NPC definition to place friendly characters in maps.
					</p>
				)}
			</div>

			<aside className="inspector-panel">
				<div className="panel-title">Placed NPC Overview</div>
				{project.areas.flatMap((area) =>
					area.npcs.map((npc) => {
						const definition = project.npcs.find(
							(candidate) => candidate.id === npc.npcDefinitionId,
						);
						const resolved = resolveNPCInstance(definition, npc);
						return (
							<div className="npc-overview-item" key={npc.id}>
								<strong>{resolved.name}</strong>
								<div className="npc-overview-meta">
									{resolved.attributes.alignment}
								</div>
								<div className="npc-overview-meta">
									{resolved.attributes.faction}
								</div>
								<div className="npc-overview-meta">
									Health {resolved.attributes.health}/
									{resolved.attributes.maxHealth}
								</div>
								<div className="npc-overview-meta">{area.name}</div>
							</div>
						);
					}),
				)}
				{project.areas.every((area) => area.npcs.length === 0) ? (
					<p className="empty-state compact">No NPCs placed in any area.</p>
				) : null}
			</aside>
		</section>
	);
}
