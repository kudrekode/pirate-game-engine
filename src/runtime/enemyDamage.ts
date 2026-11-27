import { type CombatPoint, damagePlayer } from "./combat";
import type { RuntimeNpcTickEventEmitter } from "./runtimeNpcTick";
import type { RuntimeSessionState } from "./runtimeSession";
import { equippedMeleeProfile } from "./weaponRuntime";

export function applyRuntimeEnemyDamage(
	session: RuntimeSessionState,
	npcId: string,
	damage: number,
	message: string,
	emit: RuntimeNpcTickEventEmitter,
	patterned = false,
	impact?: {
		time: number;
		incoming: CombatPoint;
		unblockable?: boolean;
		projectile?: boolean;
	},
) {
	const guard = session.guardSince;
	if (
		impact &&
		!impact.unblockable &&
		damage > 0 &&
		guard !== undefined &&
		session.playerFacing.x * impact.incoming.x +
			session.playerFacing.y * impact.incoming.y <
			-0.25
	) {
		const profile = equippedMeleeProfile(session);
		if (profile) {
			const parry = !impact.projectile && impact.time - guard < profile.parryMs;
			emit({ type: "guardContact", parry, npcId });
			const state = session.enemyAttacks.get(npcId);
			if (parry && state) {
				state.pending = undefined;
				state.staggerUntil = impact.time + 900;
				state.defence = undefined;
				state.counterQueued = false;
				state.consecutiveThreats = 0;
				session.riposte = { npcId, until: state.staggerUntil };
				emit({ type: "enemyStaggered", npcId });
			}
			emit({
				type: "status",
				message: parry ? "Parry! Press F now to riposte." : "Blocked.",
			});
			return parry ? "parry" : "block";
		}
	}
	let defeated = false;
	if (damage > 0) {
		const result = damagePlayer(session.runtimePlayerHealth, damage);
		session.runtimePlayerHealth = result.health;
		session.riposte = undefined;
		session.bowDraw = undefined;
		session.pendingMelee = undefined;
		session.guardSince = undefined;
		session.guardPressedAt = undefined;
		if (impact && equippedMeleeProfile(session))
			session.nextAttackAt = Math.max(session.nextAttackAt, impact.time + 280);
		defeated = result.defeated;
		emit({
			type: "playerDamaged",
			npcId,
			damage,
			health: result.health,
			...(patterned && { patterned }),
		});
	}
	emit({
		type: "status",
		message:
			damage > 0
				? `${message} Health ${session.runtimePlayerHealth}/${session.playerCombat.maxHealth}.`
				: message,
	});
	if (defeated) emit({ type: "gameOver" });
	emit({ type: "stateChanged" });
	emit({ type: "combatChanged" });
	return "hit";
}
