import { SWORD } from "../data/sword";
import { hasItem } from "./inventory";
import { isPlayerAirborne } from "./playerLocomotion";
import { isRuntimeGameplayBlocked } from "./runtimeInput";
import type { RuntimeSessionState } from "./runtimeSession";

export function getEquippedWeapon(session: RuntimeSessionState) {
	const item = session.project.items.find(
		(item) => item.id === session.equippedWeaponId,
	);
	return item?.weapon === "sword" &&
		hasItem(session.runtimeState.inventory, item.id)
		? SWORD
		: undefined;
}

/** The inventory menu may call this while open; other modal/airborne gates remain. */
export function equipRuntimeWeapon(
	session: RuntimeSessionState,
	itemId: string | undefined,
): boolean {
	if (
		isRuntimeGameplayBlocked(session, false) ||
		isPlayerAirborne(session) ||
		session.runtimePlayerHealth <= 0
	)
		return false;
	if (itemId !== undefined) {
		const item = session.project.items.find((item) => item.id === itemId);
		if (
			item?.weapon !== "sword" ||
			!hasItem(session.runtimeState.inventory, itemId)
		)
			return false;
	}
	session.equippedWeaponId = itemId;
	// An equip change never resets the accepted attack's cooldown.
	return true;
}

export function getRuntimeAttackStats(session: RuntimeSessionState) {
	const weapon = getEquippedWeapon(session);
	return weapon
		? {
				...session.playerCombat,
				attackDamage: weapon.attackDamage,
				attackRangeTiles: weapon.attackRangeTiles,
				attackCooldownMs: weapon.attackCooldownMs,
			}
		: session.playerCombat;
}
