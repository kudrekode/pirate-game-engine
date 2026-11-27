import { BOW } from "../data/bow";
import { SWORD } from "../data/sword";
import { hasItem } from "./inventory";
import { isPlayerAirborne } from "./playerLocomotion";
import { isRuntimeGameplayBlocked } from "./runtimeInput";
import type { RuntimeSessionState } from "./runtimeSession";

export function getEquippedWeapon(session: RuntimeSessionState) {
	const item = session.project.items.find(
		(item) => item.id === session.equippedWeaponId,
	);
	if (!item || !hasItem(session.runtimeState.inventory, item.id))
		return undefined;
	return item.weapon === "sword"
		? SWORD
		: item.weapon === "bow"
			? BOW
			: undefined;
}

/** The inventory menu may call this while open; other modal/airborne gates remain. */
export function equipRuntimeWeapon(
	session: RuntimeSessionState,
	itemId: string | undefined,
): boolean {
	if (
		isRuntimeGameplayBlocked(session, false) ||
		session.projectiles?.pending ||
		session.pendingMelee ||
		isPlayerAirborne(session) ||
		session.runtimePlayerHealth <= 0
	)
		return false;
	if (itemId !== undefined) {
		const item = session.project.items.find((item) => item.id === itemId);
		if (
			(item?.weapon !== "sword" && item?.weapon !== "bow") ||
			!hasItem(session.runtimeState.inventory, itemId)
		)
			return false;
	}
	if (session.equippedWeaponId !== itemId) {
		session.bowDraw = undefined;
		releaseGuard(session);
		session.riposte = undefined;
	}
	session.equippedWeaponId = itemId;
	// An equip change never resets the accepted attack's cooldown.
	return true;
}

export function equippedMeleeProfile(session: RuntimeSessionState) {
	if (getEquippedWeapon(session)?.id !== "sword") return undefined;
	return session.project.items.find(
		(item) => item.id === session.equippedWeaponId,
	)?.melee;
}

export function releaseGuard(session: RuntimeSessionState) {
	session.guardPressedAt = undefined;
	session.guardSince = undefined;
}

export function advanceHeldGuard(session: RuntimeSessionState, time: number) {
	if (session.guardPressedAt !== undefined) raiseGuard(session, time);
}

export function raiseGuard(
	session: RuntimeSessionState,
	time: number,
): boolean {
	if (
		session.guardSince !== undefined ||
		session.runtimePlayerHealth <= 0 ||
		isPlayerAirborne(session) ||
		isRuntimeGameplayBlocked(session, false) ||
		!equippedMeleeProfile(session)
	)
		return false;
	session.guardPressedAt ??= time;
	if (
		session.pendingMelee ||
		time < session.nextAttackAt ||
		time < (session.nextGuardAt ?? 0)
	)
		return false;
	// Holding Q through recovery raises a block as soon as the blade is free.
	// The parry window still begins at the physical press.
	session.guardSince = session.guardPressedAt;
	session.guardPressedAt = undefined;
	session.nextGuardAt = time + 520;
	return true;
}

export function getRuntimeAttackStats(session: RuntimeSessionState) {
	const weapon = getEquippedWeapon(session);
	const melee = equippedMeleeProfile(session);
	return weapon
		? {
				...session.playerCombat,
				attackDamage: melee?.damage ?? weapon.attackDamage,
				attackRangeTiles:
					weapon.id === "sword"
						? (melee?.reachTiles ?? weapon.attackRangeTiles)
						: session.playerCombat.attackRangeTiles,
				attackCooldownMs: melee?.cooldownMs ?? weapon.attackCooldownMs,
			}
		: session.playerCombat;
}
