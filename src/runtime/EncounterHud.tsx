import { useEffect, useRef } from "react";
import type { GameArea } from "../types/game";
import { isNpcAttackable } from "./combat";
import { resolveNPCInstance } from "./npcResolver";
import type { RuntimeSessionState } from "./runtimeSession";

export function EncounterHud({
	area,
	session,
	waiting,
	ready,
	status,
	onStart,
	onMenu,
	onSelect,
	resuming,
	finished,
	onEquip,
}: {
	area: GameArea;
	session: RuntimeSessionState;
	waiting: boolean;
	ready: boolean;
	status: string;
	onStart: () => void;
	onMenu: () => void;
	onSelect: (area: GameArea) => void;
	resuming: boolean;
	finished: boolean;
	onEquip: () => void;
}) {
	const select = useRef<HTMLSelectElement>(null);
	useEffect(() => {
		if (waiting || finished) select.current?.focus();
	}, [waiting, finished]);
	const enemies = area.npcs.filter((n) =>
		isNpcAttackable(n, session.runtimeState.npcs[n.id], session.defeatedNpcIds),
	);
	const npc =
		enemies.find((n) => n.id === session.recentEnemy?.id) ?? enemies[0];
	const resolved =
		npc &&
		resolveNPCInstance(
			session.project.npcs.find((d) => d.id === npc.npcDefinitionId),
			npc,
		);
	const enemy = resolved
		? {
				name: resolved.name,
				...(session.runtimeState.npcs[resolved.id] ?? resolved.attributes),
			}
		: session.recentEnemy;
	const weapon = session.project.items.find(
		(i) => i.id === session.equippedWeaponId,
	);
	return (
		<>
			<strong>{area.name}</strong>
			<label>
				Health {session.runtimePlayerHealth}/{session.playerCombat.maxHealth}
				<meter
					aria-label="Player health"
					min={0}
					max={session.playerCombat.maxHealth}
					value={session.runtimePlayerHealth}
				/>
			</label>
			{enemy && (
				<label>
					{enemy.name} {enemy.health}/{enemy.maxHealth}
					<meter
						aria-label="Enemy health"
						min={0}
						max={enemy.maxHealth}
						value={enemy.health}
					/>
				</label>
			)}
			<button
				type="button"
				onClick={onEquip}
				disabled={waiting || finished || session.runtimePlayerHealth === 0}
			>
				{weapon?.name ?? "Unarmed"} <kbd>I</kbd>
			</button>
			<small>
				{weapon?.weapon === "bow"
					? "Hold F to draw. Aim with the reticle, release F to shoot."
					: "F strikes. Hold Q to block. Tap Q as the blade falls, then F to riposte."}{" "}
				WASD moves.
			</small>
			{(waiting || finished) && (
				<label>
					Encounter
					<select
						aria-label="Encounter"
						ref={select}
						value={area.id}
						onChange={(event) => {
							const selected = session.project.areas.find(
								(entry) => entry.id === event.target.value,
							);
							if (selected) onSelect(selected);
						}}
					>
						{session.project.areas
							.filter((entry) => entry.encounter)
							.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.name}
								</option>
							))}
					</select>
				</label>
			)}
			{waiting || finished ? (
				<>
					{finished ? (
						<strong role="status">
							{session.runtimePlayerHealth > 0
								? "Victory. The court is yours."
								: "Defeat. The bout is over."}
						</strong>
					) : (
						<p>{area.encounter?.briefing}</p>
					)}
					<button type="button" onClick={() => onSelect(area)}>
						Reset encounter
					</button>
					{!finished && (
						<button type="button" disabled={!ready} onClick={onStart}>
							{resuming ? "Resume bout" : "Begin bout"}
						</button>
					)}
				</>
			) : (
				<>
					<button type="button" onClick={onMenu}>
						Encounters <kbd>M</kbd>
					</button>
					<span role="status">
						{!npc && session.runtimePlayerHealth > 0
							? "Victory. The court is yours."
							: status}
					</span>
				</>
			)}
		</>
	);
}
