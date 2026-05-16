/**
 * Pure combat engine — zero PixiJS imports.
 * All fight logic lives here so it can be unit-tested without a browser.
 */
import {
  MoveType,
  BASE_HP, MAX_ENERGY, BANKAI_ENERGY_COST,
  DAMAGE, ENERGY_GAIN, BLOCK_WINDOW_MS, BLOCK_BREAK_HITS, BLOCK_BREAK_RECOVERY_MS,
} from '@ahf/shared';

export interface FighterState {
  hp: number;
  energy: number;
  roundWins: number;
  hitCount: number;
  isBlocking: boolean;
  blockStart: number;
  blockHits: number;
  blockBrokenUntil: number;
  isDodging: boolean;
  dodgeUntil: number;
  hitStunUntil: number;
  isSlowed: boolean;
  slowedUntil: number;
  // card effects
  attackMult: number;
  defenseMult: number;
  bankaiChargeRateMult: number;
  counterOnPerfectBlock: boolean;
  lowAttackSlows: boolean;
  thirdHitKnockback: boolean;
  bankaiBeamWidthMult: number;
  bankaiLeavesZone: boolean;
}

export interface MoveResult {
  attackerEnergyDelta: number;
  defenderHpDelta: number;
  defenderEnergyDelta: number;
  blocked: boolean;
  perfectBlocked: boolean;
  blockBroken: boolean;
  evaded: boolean;
  whiffed: boolean;
  counterHit: boolean;
  knockback: boolean;
  slowApplied: boolean;
  bankaiBlocked: boolean;
  noop: boolean; // e.g. bankai with insufficient energy
}

export interface TickResult {
  p1EnergyDelta: number;
  p2EnergyDelta: number;
}

export type RoundEndReason = 'ko' | 'timer' | null;
export type RoundWinner = 1 | 2 | 'draw' | null;

// ── Public API ────────────────────────────────────────────────────────────────

/** Apply dt milliseconds of passive energy ticks to both fighters. */
export function tickPassiveEnergy(s1: FighterState, s2: FighterState, dt: number): TickResult {
  const rate = (ENERGY_GAIN.BANKAI_CHARGE_PER_TICK * dt * 60) / 1000;
  const p1 = Math.min(MAX_ENERGY, s1.energy + rate * s1.bankaiChargeRateMult) - s1.energy;
  const p2 = Math.min(MAX_ENERGY, s2.energy + rate * s2.bankaiChargeRateMult) - s2.energy;
  s1.energy += p1;
  s2.energy += p2;
  return { p1EnergyDelta: p1, p2EnergyDelta: p2 };
}

/** Resolve a single move from attacker vs defender. Mutates both states. */
export function resolveMove(
  attacker: FighterState,
  defender: FighterState,
  move: MoveType,
  now = Date.now(),
): MoveResult {
  const base: MoveResult = {
    attackerEnergyDelta: 0,
    defenderHpDelta: 0,
    defenderEnergyDelta: 0,
    blocked: false,
    perfectBlocked: false,
    blockBroken: false,
    evaded: false,
    whiffed: false,
    counterHit: false,
    knockback: false,
    slowApplied: false,
    bankaiBlocked: false,
    noop: false,
  };

  if (move === MoveType.NONE) return { ...base, noop: true };

  if (now < attacker.hitStunUntil) return { ...base, noop: true };

  if (move === MoveType.DODGE) {
    attacker.isDodging = true;
    return { ...base, noop: false };
  }

  // ── Bankai ────────────────────────────────────────────────────────────────
  if (move === MoveType.BANKAI) {
    if (attacker.energy < BANKAI_ENERGY_COST) return { ...base, noop: true };

    attacker.energy = 0;
    const evaded = isEvaded(defender, now);
    if (evaded) return { ...base, evaded: true, whiffed: true };

    const blocked = isBlocked(defender, move, now);
    base.bankaiBlocked = blocked;

    if (!blocked) {
      const dmg = Math.round(DAMAGE.BANKAI_BEAM / Math.max(defender.defenseMult, 0.1));
      defender.hp = Math.max(0, defender.hp - dmg);
  defender.hitStunUntil = now + hitStunFor(move);
  defender.isBlocking = false;
  defender.blockHits = 0;
      base.defenderHpDelta = -dmg;
      defender.energy = Math.min(MAX_ENERGY, defender.energy + ENERGY_GAIN.ON_TAKE_HIT);
      base.defenderEnergyDelta = ENERGY_GAIN.ON_TAKE_HIT;
    }
    return base;
  }

  // ── Block (self) ──────────────────────────────────────────────────────────
  if (move === MoveType.BLOCK) {
    if (now < attacker.blockBrokenUntil) return { ...base, noop: true };
    attacker.isBlocking = true;
    attacker.blockStart = now;
    return { ...base, noop: false };
  }

  // ── Normal attack ─────────────────────────────────────────────────────────
  if (isEvaded(defender, now)) {
    return { ...base, evaded: true, whiffed: true };
  }

  const blocked = isBlocked(defender, move, now);
  if (blocked) {
    const energyGain = ENERGY_GAIN.ON_BLOCK;
    attacker.energy = Math.min(MAX_ENERGY, attacker.energy + energyGain);
    base.attackerEnergyDelta = energyGain;
    base.blocked = true;
    defender.blockHits++;
    base.perfectBlocked = now - defender.blockStart < BLOCK_WINDOW_MS;

    if (defender.blockHits >= BLOCK_BREAK_HITS) {
      defender.isBlocking = false;
      defender.blockHits = 0;
      defender.blockBrokenUntil = now + BLOCK_BREAK_RECOVERY_MS;
      base.blockBroken = true;
    }

    // Perfect block counter
    if (defender.counterOnPerfectBlock && base.perfectBlocked) {
      const cDmg = Math.round(DAMAGE.COUNTER_HIT * attacker.attackMult);
      attacker.hp = Math.max(0, attacker.hp - cDmg);
      base.counterHit = true;
      base.defenderHpDelta = -cDmg;
    }
    return base;
  }

  // Landed hit
  let dmg = moveDamage(move);
  dmg = Math.round(dmg * attacker.attackMult / Math.max(1, defender.defenseMult));
  dmg = Math.max(1, dmg);

  defender.hp = Math.max(0, defender.hp - dmg);
  defender.hitStunUntil = now + hitStunFor(move);
  defender.isBlocking = false;
  defender.blockHits = 0;
  base.defenderHpDelta = -dmg;

  const hitEnergyAttacker = ENERGY_GAIN.ON_HIT;
  attacker.energy = Math.min(MAX_ENERGY, attacker.energy + hitEnergyAttacker);
  base.attackerEnergyDelta = hitEnergyAttacker;

  const hitEnergyDefender = ENERGY_GAIN.ON_TAKE_HIT;
  defender.energy = Math.min(MAX_ENERGY, defender.energy + hitEnergyDefender);
  base.defenderEnergyDelta = hitEnergyDefender;

  attacker.hitCount++;

  // Third-strike knockback
  if (attacker.thirdHitKnockback && attacker.hitCount % 3 === 0) {
    base.knockback = true;
  }

  // Low sweep slow
  if (move === MoveType.LOW_ATTACK && attacker.lowAttackSlows) {
    defender.isSlowed = true;
    defender.slowedUntil = now + 1500;
    base.slowApplied = true;
  }

  return base;
}

/** Check whether a round should end. Returns null if still going. */
export function checkRoundEnd(
  s1: FighterState,
  s2: FighterState,
  timerRemaining: number,
): { reason: RoundEndReason; winner: RoundWinner } | null {
  if (s1.hp <= 0 || s2.hp <= 0) {
    if (s1.hp <= 0 && s2.hp <= 0) return { reason: 'ko', winner: 'draw' };
    return { reason: 'ko', winner: s1.hp > 0 ? 1 : 2 };
  }
  if (timerRemaining <= 0) {
    if (s1.hp === s2.hp) return { reason: 'timer', winner: 'draw' };
    return { reason: 'timer', winner: s1.hp > s2.hp ? 1 : 2 };
  }
  return null;
}

/** Apply round-win to the correct fighter. Returns whether the match is over. */
export function applyRoundWin(
  s1: FighterState,
  s2: FighterState,
  winner: RoundWinner,
  currentRound: number,
  roundsToWin: number,
): { matchOver: boolean; matchWinner: RoundWinner } {
  if (winner === 1) s1.roundWins++;
  else if (winner === 2) s2.roundWins++;

  const matchOver =
    s1.roundWins >= roundsToWin ||
    s2.roundWins >= roundsToWin ||
    currentRound >= 3;

  if (!matchOver) return { matchOver: false, matchWinner: null };

  if (s1.roundWins > s2.roundWins) return { matchOver: true, matchWinner: 1 };
  if (s2.roundWins > s1.roundWins) return { matchOver: true, matchWinner: 2 };
  return { matchOver: true, matchWinner: 'draw' };
}

/** Reset fighter HP for a new round (keeps energy + card effects). */
export function resetForRound(s: FighterState): void {
  s.hp = BASE_HP;
  s.hitCount = 0;
  s.isBlocking = false;
  s.blockHits = 0;
  s.blockBrokenUntil = 0;
  s.isDodging = false;
  s.dodgeUntil = 0;
  s.hitStunUntil = 0;
  s.isSlowed = false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isBlocked(defender: FighterState, move: MoveType, now = Date.now()): boolean {
  if (!defender.isBlocking || now < defender.blockBrokenUntil) return false;
  // Heavy attacks and Bankai beat plain block; must be dodged or punished during startup.
  if (move === MoveType.HIGH_ATTACK || move === MoveType.HEAVY_ATTACK || move === MoveType.BANKAI) return false;
  return true;
}

export function isEvaded(defender: FighterState, now = Date.now()): boolean {
  return defender.isDodging && now <= defender.dodgeUntil;
}

export function hitStunFor(move: MoveType): number {
  switch (move) {
    case MoveType.ATTACK: return 210;
    case MoveType.HIGH_ATTACK:
    case MoveType.HEAVY_ATTACK: return 285;
    case MoveType.LOW_ATTACK: return 235;
    case MoveType.BANKAI: return 420;
    default: return 0;
  }
}

export function moveDamage(move: MoveType): number {
  switch (move) {
    case MoveType.ATTACK: return DAMAGE.ATTACK;
    case MoveType.HIGH_ATTACK:
    case MoveType.HEAVY_ATTACK: return DAMAGE.HIGH_ATTACK;
    case MoveType.LOW_ATTACK: return DAMAGE.LOW_ATTACK;
    default: return 0;
  }
}

export function defaultFighterState(): FighterState {
  return {
    hp: BASE_HP,
    energy: 0,
    roundWins: 0,
    hitCount: 0,
    isBlocking: false,
    blockStart: 0,
    blockHits: 0,
    blockBrokenUntil: 0,
    isDodging: false,
    dodgeUntil: 0,
    hitStunUntil: 0,
    isSlowed: false,
    slowedUntil: 0,
    attackMult: 1,
    defenseMult: 1,
    bankaiChargeRateMult: 1,
    counterOnPerfectBlock: false,
    lowAttackSlows: false,
    thirdHitKnockback: false,
    bankaiBeamWidthMult: 1,
    bankaiLeavesZone: false,
  };
}
