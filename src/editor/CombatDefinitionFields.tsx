import { useState } from "react";
import type {
	EnemyAttack,
	EnemyBehaviour,
	ItemDefinition,
	MeleeProfile,
} from "../types/game";

function Quantity({
	label,
	value,
	min,
	max,
	step = 1,
	change,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	change: (value: number) => void;
}) {
	return (
		<label>
			{label}
			<input
				type="number"
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => {
					const n = e.currentTarget.valueAsNumber;
					if (Number.isFinite(n)) change(Math.min(max, Math.max(min, n)));
				}}
			/>
		</label>
	);
}
const defaultMelee: MeleeProfile = {
	damage: 35,
	reachTiles: 2,
	impactMs: 215,
	cooldownMs: 750,
	parryMs: 180,
};
export function SwordFields({
	item,
	change,
}: {
	item: ItemDefinition;
	change: (melee: MeleeProfile | undefined) => void;
}) {
	const profile = item.melee;
	return (
		<details open={!!profile}>
			<summary>Melee timing</summary>
			<label>
				<input
					type="checkbox"
					checked={!!profile}
					onChange={(e) =>
						change(e.target.checked ? { ...defaultMelee } : undefined)
					}
				/>
				Timed strike and guard
			</label>
			{profile && (
				<div className="form-grid">
					<Quantity
						label="Blade damage"
						min={1}
						max={999}
						value={profile.damage}
						change={(damage) => change({ ...profile, damage })}
					/>
					<Quantity
						label="Reach (tiles)"
						min={0.5}
						max={6}
						step={0.1}
						value={profile.reachTiles}
						change={(reachTiles) => change({ ...profile, reachTiles })}
					/>
					<Quantity
						label="Impact after (ms)"
						min={30}
						max={2000}
						value={profile.impactMs}
						change={(impactMs) =>
							change({
								...profile,
								impactMs,
								cooldownMs: Math.max(impactMs, profile.cooldownMs),
							})
						}
					/>
					<Quantity
						label="Active contact window (ms)"
						min={0}
						max={180}
						value={profile.activeMs ?? 0}
						change={(activeMs) => change({ ...profile, activeMs })}
					/>
					<Quantity
						label="Next strike after (ms)"
						min={Math.max(100, profile.impactMs)}
						max={5000}
						value={profile.cooldownMs}
						change={(cooldownMs) => change({ ...profile, cooldownMs })}
					/>
					<Quantity
						label="Parry window (ms)"
						min={0}
						max={500}
						value={profile.parryMs}
						change={(parryMs) => change({ ...profile, parryMs })}
					/>
				</div>
			)}
		</details>
	);
}
const template: EnemyAttack = {
	label: "a cut",
	damage: 10,
	rangeTiles: 1.6,
	arcDegrees: 85,
	windupMs: 700,
	impactMs: 175,
	recoveryMs: 650,
};
export function EnemyAttackFields({
	enemy,
	change,
}: {
	enemy: EnemyBehaviour;
	change: (patch: Partial<EnemyBehaviour>) => void;
}) {
	const [index, setIndex] = useState(0);
	const attacks = enemy.attacks ?? [],
		selected = Math.max(0, Math.min(index, attacks.length - 1)),
		attack = attacks[selected];
	function patch(update: Partial<EnemyAttack>) {
		change({
			attacks: attacks.map((a, i) =>
				i === selected ? { ...a, ...update } : a,
			),
		});
	}
	return (
		<details>
			<summary>Attack pattern</summary>
			<div className="form-grid">
				<label>
					Held weapon
					<select
						value={enemy.weapon ?? ""}
						onChange={(e) =>
							change({
								weapon:
									e.target.value === "bow"
										? "bow"
										: e.target.value === "sword"
											? "sword"
											: undefined,
							})
						}
					>
						<option value="">None</option>
						<option value="sword">Sword</option>
						<option value="bow">Bow</option>
					</select>
				</label>
				<Quantity
					label="Retreat inside (tiles)"
					min={0}
					max={20}
					step={0.1}
					value={enemy.keepDistanceTiles ?? 0}
					change={(keepDistanceTiles) => change({ keepDistanceTiles })}
				/>
				<Quantity
					label="Interrupt stagger (ms)"
					min={0}
					max={3000}
					value={enemy.staggerMs ?? 0}
					change={(staggerMs) => change({ staggerMs })}
				/>
				<label>
					<input
						type="checkbox"
						checked={!!enemy.guardWindup}
						onChange={(e) => change({ guardWindup: e.target.checked })}
					/>
					Guard during windup
				</label>
			</div>
			{enemy.weapon === "sword" && (
				<fieldset>
					<label>
						<input
							type="checkbox"
							checked={!!enemy.swordTactics}
							onChange={(e) =>
								change({
									swordTactics: e.target.checked
										? { parryAfter: 2, reactionMs: 95, counterWindupMs: 300 }
										: undefined,
								})
							}
						/>
						React to incoming sword attacks
					</label>
					{enemy.swordTactics &&
						(
							[
								["parryAfter", "Consecutive threats before parrying", 1, 8],
								["reactionMs", "Time to raise defence (ms)", 0, 800],
								["counterWindupMs", "Counterattack windup (ms)", 120, 1000],
							] as const
						).map(([key, label, min, max]) => (
							<Quantity
								key={key}
								label={label}
								min={min}
								max={max}
								value={enemy.swordTactics?.[key] ?? min}
								change={(value) =>
									enemy.swordTactics &&
									change({
										swordTactics: { ...enemy.swordTactics, [key]: value },
									})
								}
							/>
						))}
				</fieldset>
			)}
			{attack && (
				<>
					<label>
						Attack in sequence
						<select
							value={selected}
							onChange={(e) => setIndex(Number(e.target.value))}
						>
							{attacks.map((a, i) => (
								<option key={String(i + 1)} value={i}>
									{i + 1}. {a.label}
								</option>
							))}
						</select>
					</label>
					<label>
						Attack name
						<input
							value={attack.label}
							onChange={(e) => patch({ label: e.target.value })}
						/>
					</label>
					<div className="form-grid">
						{(
							[
								["damage", "Damage", 0, 999, 1],
								["rangeTiles", "Range (tiles)", 0.5, 20, 0.1],
								["arcDegrees", "Arc (degrees)", 1, 360, 1],
								["windupMs", "Windup (ms)", 100, 5000, 10],
								["impactMs", "Impact delay (ms)", 0, 3000, 5],
								["recoveryMs", "Recovery (ms)", 100, 5000, 10],
							] as const
						).map(([key, label, min, max, step]) => (
							<Quantity
								key={key}
								label={label}
								value={attack[key]}
								min={min}
								max={max}
								step={step}
								change={(n) => patch({ [key]: n })}
							/>
						))}
						<label>
							<input
								type="checkbox"
								checked={attack.arrowSpeed !== undefined}
								onChange={(e) =>
									patch({ arrowSpeed: e.target.checked ? 12 : undefined })
								}
							/>
							Fire arrow
						</label>
						{attack.arrowSpeed !== undefined && (
							<Quantity
								label="Arrow speed (tiles/s)"
								value={attack.arrowSpeed}
								min={2}
								max={50}
								change={(arrowSpeed) => patch({ arrowSpeed })}
							/>
						)}
						<label>
							<input
								type="checkbox"
								checked={!!attack.unblockable}
								onChange={(e) => patch({ unblockable: e.target.checked })}
							/>
							Bypass guard
						</label>
						{(["windupClip", "strikeClip"] as const).map((key) => (
							<label key={key}>
								{key === "windupClip" ? "Windup clip" : "Strike clip"}
								<input
									value={attack[key] ?? ""}
									onChange={(e) =>
										patch({ [key]: e.target.value || undefined })
									}
								/>
							</label>
						))}
					</div>
					<button
						type="button"
						onClick={() =>
							change({ attacks: attacks.filter((_, i) => i !== selected) })
						}
					>
						Remove attack
					</button>
				</>
			)}
			<button
				type="button"
				onClick={() => {
					change({ attacks: [...attacks, { ...template }] });
					setIndex(attacks.length);
				}}
			>
				Add attack
			</button>
		</details>
	);
}
