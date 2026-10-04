import type { ReactNode } from "react";
import {
	defaultEnemyBehaviour,
	resolveNPCInstance,
} from "../../runtime/npcResolver";
import type {
	EnemyBehaviour,
	GameProject,
	NPCAttributes,
	NPCInstance,
	NPCMovementConfig,
} from "../../types/game";

type MapNpcInspectorProps = {
	project: GameProject;
	selectedNpc: NPCInstance;
	updateSelectedNpc: (patch: Partial<NPCInstance>) => void;
	deleteSelectedNpc: () => void;
	interactionEditor: ReactNode;
};

// Definition inheritance and instance overrides stay together with their controls.
export function MapNpcInspector({
	project,
	selectedNpc,
	updateSelectedNpc,
	deleteSelectedNpc,
	interactionEditor,
}: MapNpcInspectorProps) {
	const selectedNpcDefinition = project.npcs.find(
		(npc) => npc.id === selectedNpc.npcDefinitionId,
	);
	const selectedResolvedNpc = resolveNPCInstance(
		selectedNpcDefinition,
		selectedNpc,
	);
	function updateSelectedNpcAttributes(patch: Partial<NPCAttributes>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			...selectedResolvedNpc.attributes,
			...selectedNpc.attributesOverride,
			...patch,
		};
		next.maxHealth = Math.max(1, Number(next.maxHealth));
		next.health = Math.min(next.maxHealth, Math.max(0, Number(next.health)));
		next.movementSpeed = Math.max(0.1, Number(next.movementSpeed ?? 1));
		updateSelectedNpc({ attributes: next, attributesOverride: next });
	}

	function updateSelectedNpcMovement(patch: Partial<NPCMovementConfig>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			movementMode: selectedResolvedNpc.movementMode,
			movementSpeed: selectedResolvedNpc.movementSpeed,
			patrolPath: selectedResolvedNpc.patrolPath,
			wanderZone: selectedResolvedNpc.wanderZone,
			...selectedNpc.movementOverride,
			...patch,
		};
		updateSelectedNpc({
			movementMode: next.movementMode,
			movementSpeed: next.movementSpeed,
			patrolPath: next.patrolPath,
			wanderZone: next.wanderZone,
			movementOverride: next,
		});
	}

	function updateSelectedNpcEnemyBehaviour(patch: Partial<EnemyBehaviour>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			...defaultEnemyBehaviour,
			...selectedResolvedNpc.enemyBehaviour,
			...selectedNpc.enemyBehaviourOverride,
			...patch,
		};
		updateSelectedNpc({ enemyBehaviour: next, enemyBehaviourOverride: next });
	}

	function resetSelectedNpcSection(
		section: "attributes" | "movement" | "enemy" | "interaction",
	) {
		if (!selectedNpc) {
			return;
		}

		if (section === "attributes") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				attributesOverride: undefined,
			});
			updateSelectedNpc({
				attributes: next.attributes,
				attributesOverride: undefined,
			});
			return;
		}

		if (section === "movement") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				movementOverride: undefined,
			});
			updateSelectedNpc({
				movementMode: next.movementMode,
				movementSpeed: next.movementSpeed,
				patrolPath: next.patrolPath,
				wanderZone: next.wanderZone,
				movementOverride: undefined,
			});
			return;
		}

		if (section === "enemy") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				enemyBehaviourOverride: undefined,
			});
			updateSelectedNpc({
				enemyBehaviour: next.enemyBehaviour,
				enemyBehaviourOverride: undefined,
			});
			return;
		}

		const next = resolveNPCInstance(selectedNpcDefinition, {
			...selectedNpc,
			interactionOverride: undefined,
		});
		updateSelectedNpc({
			interaction: next.interaction,
			interactionOverride: undefined,
		});
	}

	function addPatrolPoint() {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				loop: selectedResolvedNpc.patrolPath?.loop ?? true,
				points: [
					...(selectedResolvedNpc.patrolPath?.points ?? []),
					{ x: selectedNpc.x, y: selectedNpc.y },
				],
			},
		});
	}

	function updatePatrolPoint(
		index: number,
		patch: Partial<{ x: number; y: number }>,
	) {
		if (!selectedResolvedNpc?.patrolPath) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				...selectedResolvedNpc.patrolPath,
				points: selectedResolvedNpc.patrolPath.points.map(
					(point, pointIndex) =>
						pointIndex === index ? { ...point, ...patch } : point,
				),
			},
		});
	}

	function deletePatrolPoint(index: number) {
		if (!selectedResolvedNpc?.patrolPath) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				...selectedResolvedNpc.patrolPath,
				points: selectedResolvedNpc.patrolPath.points.filter(
					(_, pointIndex) => pointIndex !== index,
				),
			},
		});
	}

	function updateSelectedNpcMovementMode(
		movementMode: NPCInstance["movementMode"],
	) {
		if (!selectedNpc) {
			return;
		}

		updateSelectedNpcMovement({
			movementMode,
			...(movementMode === "patrol" && !selectedResolvedNpc?.patrolPath
				? {
						patrolPath: {
							points: [{ x: selectedNpc.x, y: selectedNpc.y }],
							loop: true,
						},
					}
				: {}),
			...(movementMode === "wander" && !selectedResolvedNpc?.wanderZone
				? {
						wanderZone: {
							x: selectedNpc.x,
							y: selectedNpc.y,
							width: 3,
							height: 3,
						},
					}
				: {}),
		});
	}

	const definition = selectedResolvedNpc.definition;
	const attributes = selectedResolvedNpc.attributes;
	const enemyBehaviour =
		selectedResolvedNpc.enemyBehaviour ?? defaultEnemyBehaviour;
	const hasAttributeOverride = Boolean(selectedNpc.attributesOverride);
	const hasMovementOverride = Boolean(selectedNpc.movementOverride);
	const hasEnemyOverride = Boolean(selectedNpc.enemyBehaviourOverride);
	const hasInteractionOverride = Boolean(selectedNpc.interactionOverride);

	return (
		<>
			<div className="panel-title">NPC Instance</div>
			<div className="form-stack">
				<label>
					NPC
					<select
						onChange={(event) =>
							updateSelectedNpc({ npcDefinitionId: event.target.value })
						}
						value={selectedNpc.npcDefinitionId}
					>
						{project.npcs.map((npc) => (
							<option key={npc.id} value={npc.id}>
								{npc.name}
							</option>
						))}
					</select>
				</label>
				<div className="form-grid compact">
					<label>
						X
						<input
							min={0}
							onChange={(event) =>
								updateSelectedNpc({ x: Number(event.target.value) })
							}
							type="number"
							value={selectedNpc.x}
						/>
					</label>
					<label>
						Y
						<input
							min={0}
							onChange={(event) =>
								updateSelectedNpc({ y: Number(event.target.value) })
							}
							type="number"
							value={selectedNpc.y}
						/>
					</label>
				</div>
				<label>
					Facing
					<select
						onChange={(event) =>
							updateSelectedNpc({
								facing: event.target.value as NonNullable<
									NPCInstance["facing"]
								>,
							})
						}
						value={selectedNpc.facing ?? "down"}
					>
						<option value="up">Up</option>
						<option value="down">Down</option>
						<option value="left">Left</option>
						<option value="right">Right</option>
					</select>
				</label>
				<label className="checkbox-row standalone">
					<input
						checked={selectedNpc.blocksMovement}
						onChange={(event) =>
							updateSelectedNpc({ blocksMovement: event.target.checked })
						}
						type="checkbox"
					/>
					Blocks movement
				</label>
				<div className="panel-title secondary">Attributes</div>
				<div className="coordinate-readout">
					Source:{" "}
					{hasAttributeOverride ? "instance override" : "definition default"}
				</div>
				<div className="form-grid compact">
					<label>
						Current health
						<input
							min={0}
							max={attributes.maxHealth}
							onChange={(event) =>
								updateSelectedNpcAttributes({
									health: Math.min(
										attributes.maxHealth,
										Math.max(0, Number(event.target.value)),
									),
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
								const maxHealth = Math.max(1, Number(event.target.value));
								updateSelectedNpcAttributes({
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
							updateSelectedNpcAttributes({ faction: event.target.value })
						}
						value={attributes.faction}
					/>
				</label>
				<label>
					Alignment
					<select
						onChange={(event) =>
							updateSelectedNpcAttributes({
								alignment: event.target
									.value as NPCInstance["attributes"]["alignment"],
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
							updateSelectedNpcAttributes({
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
							updateSelectedNpcAttributes({
								movementSpeed: Math.max(0.1, Number(event.target.value)),
							})
						}
						type="number"
						value={attributes.movementSpeed ?? 1}
					/>
				</label>
				{hasAttributeOverride ? (
					<button
						onClick={() => resetSelectedNpcSection("attributes")}
						type="button"
					>
						Reset attributes to definition default
					</button>
				) : null}
				{attributes.alignment === "hostile" ? (
					<>
						<div className="panel-title secondary">Enemy Behaviour</div>
						<div className="coordinate-readout">
							Source:{" "}
							{hasEnemyOverride ? "instance override" : "definition default"}
						</div>
						<label className="checkbox-row standalone">
							<input
								checked={enemyBehaviour.enabled}
								onChange={(event) =>
									updateSelectedNpcEnemyBehaviour({
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
										updateSelectedNpcEnemyBehaviour({
											detectionRadiusTiles: Math.max(
												0,
												Number(event.target.value),
											),
										})
									}
									type="number"
									value={enemyBehaviour.detectionRadiusTiles}
								/>
							</label>
							<label>
								Chase radius
								<input
									min={0}
									onChange={(event) =>
										updateSelectedNpcEnemyBehaviour({
											chaseRadiusTiles: Math.max(0, Number(event.target.value)),
										})
									}
									type="number"
									value={enemyBehaviour.chaseRadiusTiles}
								/>
							</label>
							<label>
								Contact damage
								<input
									min={0}
									onChange={(event) =>
										updateSelectedNpcEnemyBehaviour({
											contactDamage: Math.max(0, Number(event.target.value)),
										})
									}
									type="number"
									value={enemyBehaviour.contactDamage ?? 0}
								/>
							</label>
						</div>
						<label className="checkbox-row standalone">
							<input
								checked={enemyBehaviour.returnToOrigin}
								onChange={(event) =>
									updateSelectedNpcEnemyBehaviour({
										returnToOrigin: event.target.checked,
									})
								}
								type="checkbox"
							/>
							Return to origin when player leaves chase radius
						</label>
						{hasEnemyOverride ? (
							<button
								onClick={() => resetSelectedNpcSection("enemy")}
								type="button"
							>
								Reset enemy behaviour to definition default
							</button>
						) : null}
					</>
				) : null}
				<div className="panel-title secondary">Movement</div>
				<div className="coordinate-readout">
					Source:{" "}
					{hasMovementOverride ? "instance override" : "definition default"}
				</div>
				<label>
					Mode
					<select
						onChange={(event) =>
							updateSelectedNpcMovementMode(
								event.target.value as NPCInstance["movementMode"],
							)
						}
						value={selectedResolvedNpc.movementMode}
					>
						<option value="stationary">Stationary</option>
						<option value="patrol">Patrol</option>
						<option value="wander">Wander</option>
					</select>
				</label>
				{selectedResolvedNpc.movementMode === "patrol" ? (
					<div className="form-stack">
						<label className="checkbox-row">
							<input
								checked={selectedResolvedNpc.patrolPath?.loop ?? true}
								onChange={(event) =>
									updateSelectedNpcMovement({
										patrolPath: {
											points: selectedResolvedNpc.patrolPath?.points ?? [],
											loop: event.target.checked,
										},
									})
								}
								type="checkbox"
							/>
							Loop patrol
						</label>
						{(selectedResolvedNpc.patrolPath?.points ?? []).map(
							(point, index) => (
								<div
									className="patrol-point-row"
									// biome-ignore lint/suspicious/noArrayIndexKey: patrol paths may intentionally revisit the same coordinate, so sequence position is part of identity.
									key={`${selectedNpc.id}_${point.x}_${point.y}_${index}`}
								>
									<span>{index + 1}</span>
									<input
										aria-label={`Patrol point ${index + 1} X`}
										min={0}
										onChange={(event) =>
											updatePatrolPoint(index, {
												x: Number(event.target.value),
											})
										}
										type="number"
										value={point.x}
									/>
									<input
										aria-label={`Patrol point ${index + 1} Y`}
										min={0}
										onChange={(event) =>
											updatePatrolPoint(index, {
												y: Number(event.target.value),
											})
										}
										type="number"
										value={point.y}
									/>
									<button
										className="danger-button compact"
										onClick={() => deletePatrolPoint(index)}
										type="button"
									>
										Delete
									</button>
								</div>
							),
						)}
						<button onClick={addPatrolPoint} type="button">
							Add patrol point
						</button>
					</div>
				) : null}
				{selectedResolvedNpc.movementMode === "wander" ? (
					<div className="form-grid compact">
						{(["x", "y", "width", "height"] as const).map((field) => (
							<label key={field}>
								Zone {field}
								<input
									min={field === "width" || field === "height" ? 1 : 0}
									onChange={(event) =>
										updateSelectedNpcMovement({
											wanderZone: {
												x: selectedResolvedNpc.wanderZone?.x ?? selectedNpc.x,
												y: selectedResolvedNpc.wanderZone?.y ?? selectedNpc.y,
												width: selectedResolvedNpc.wanderZone?.width ?? 3,
												height: selectedResolvedNpc.wanderZone?.height ?? 3,
												[field]: Math.max(
													field === "width" || field === "height" ? 1 : 0,
													Number(event.target.value),
												),
											},
										})
									}
									type="number"
									value={
										selectedResolvedNpc.wanderZone?.[field] ??
										(field === "width" || field === "height"
											? 3
											: selectedNpc[field])
									}
								/>
							</label>
						))}
					</div>
				) : null}
				{hasMovementOverride ? (
					<button
						onClick={() => resetSelectedNpcSection("movement")}
						type="button"
					>
						Reset movement to definition default
					</button>
				) : null}
				<div className="coordinate-readout">
					{definition?.description ?? "Friendly interactable NPC."}
				</div>
				<div className="coordinate-readout">
					Interaction source:{" "}
					{hasInteractionOverride ? "instance override" : "definition default"}
				</div>
				{interactionEditor}
				{hasInteractionOverride ? (
					<button
						onClick={() => resetSelectedNpcSection("interaction")}
						type="button"
					>
						Reset interaction to definition default
					</button>
				) : null}
				<button
					className="danger-button"
					onClick={deleteSelectedNpc}
					type="button"
				>
					Delete NPC instance
				</button>
			</div>
		</>
	);
}
