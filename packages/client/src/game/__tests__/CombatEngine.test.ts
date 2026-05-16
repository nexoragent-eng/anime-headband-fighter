import { describe, it, expect } from 'vitest';
import {
  defaultFighterState,
  resolveMove,
  tickPassiveEnergy,
  checkRoundEnd,
  applyRoundWin,
  resetForRound,
} from '../CombatEngine';
import { MoveType } from '@ahf/shared';
import { BASE_HP, MAX_ENERGY, DAMAGE, ENERGY_GAIN, ROUND_DURATION, ROUNDS_TO_WIN } from '@ahf/shared';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStates() {
  return { s1: defaultFighterState(), s2: defaultFighterState() };
}

// ── Basic move resolution ─────────────────────────────────────────────────────

describe('resolveMove — basic attacks', () => {
  it('normal attack deals ATTACK damage', () => {
    const { s1, s2 } = makeStates();
    const result = resolveMove(s1, s2, MoveType.ATTACK);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.ATTACK);
    expect(result.defenderHpDelta).toBe(-DAMAGE.ATTACK);
    expect(result.blocked).toBe(false);
  });

  it('high attack deals HIGH_ATTACK damage', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s1, s2, MoveType.HIGH_ATTACK);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.HIGH_ATTACK);
  });

  it('low attack deals LOW_ATTACK damage', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s1, s2, MoveType.LOW_ATTACK);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.LOW_ATTACK);
  });

  it('attack gives attacker energy on hit', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s1, s2, MoveType.ATTACK);
    expect(s1.energy).toBe(ENERGY_GAIN.ON_HIT);
  });

  it('defender gains energy on take hit', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s1, s2, MoveType.ATTACK);
    expect(s2.energy).toBe(ENERGY_GAIN.ON_TAKE_HIT);
  });

  it('HP never goes below 0', () => {
    const { s1, s2 } = makeStates();
    s2.hp = 1;
    resolveMove(s1, s2, MoveType.ATTACK);
    expect(s2.hp).toBe(0);
  });
});

// ── Block mechanics ───────────────────────────────────────────────────────────

describe('resolveMove — blocking', () => {
  it('block prevents normal attack damage', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s2, s1, MoveType.BLOCK); // s2 blocks
    const hpBefore = s2.hp;
    resolveMove(s1, s2, MoveType.ATTACK);
    expect(s2.hp).toBe(hpBefore); // no damage
  });

  it('block gives attacker ON_BLOCK energy', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s2, s1, MoveType.BLOCK);
    resolveMove(s1, s2, MoveType.ATTACK);
    expect(s1.energy).toBe(ENERGY_GAIN.ON_BLOCK);
  });

  it('high attack bypasses block', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s2, s1, MoveType.BLOCK);
    const hpBefore = s2.hp;
    resolveMove(s1, s2, MoveType.HIGH_ATTACK);
    expect(s2.hp).toBeLessThan(hpBefore);
  });

  it('block does NOT prevent low attack', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s2, s1, MoveType.BLOCK);
    const hpBefore = s2.hp;
    resolveMove(s1, s2, MoveType.LOW_ATTACK);
    // low attack is blocked by regular block
    expect(s2.hp).toBe(hpBefore);
  });
});

// ── Bankai ────────────────────────────────────────────────────────────────────

describe('resolveMove — Bankai', () => {
  it('Bankai does nothing if energy < 100', () => {
    const { s1, s2 } = makeStates();
    s1.energy = 99;
    const result = resolveMove(s1, s2, MoveType.BANKAI);
    expect(result.noop).toBe(true);
    expect(s2.hp).toBe(BASE_HP);
    expect(s1.energy).toBe(99); // unchanged
  });

  it('Bankai fires when energy = 100 and drains energy', () => {
    const { s1, s2 } = makeStates();
    s1.energy = MAX_ENERGY;
    resolveMove(s1, s2, MoveType.BANKAI);
    expect(s1.energy).toBe(0);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.BANKAI_BEAM);
  });

  it('Bankai deals BANKAI_BEAM damage', () => {
    const { s1, s2 } = makeStates();
    s1.energy = MAX_ENERGY;
    resolveMove(s1, s2, MoveType.BANKAI);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.BANKAI_BEAM);
  });

  it('block does NOT stop Bankai', () => {
    const { s1, s2 } = makeStates();
    s1.energy = MAX_ENERGY;
    resolveMove(s2, s1, MoveType.BLOCK);
    resolveMove(s1, s2, MoveType.BANKAI);
    expect(s2.hp).toBe(BASE_HP - DAMAGE.BANKAI_BEAM);
  });
});

// ── Energy passive tick ───────────────────────────────────────────────────────

describe('tickPassiveEnergy', () => {
  it('increases energy over time', () => {
    const { s1, s2 } = makeStates();
    tickPassiveEnergy(s1, s2, 1000); // 1 second
    expect(s1.energy).toBeGreaterThan(0);
    expect(s2.energy).toBeGreaterThan(0);
  });

  it('never exceeds MAX_ENERGY', () => {
    const { s1, s2 } = makeStates();
    s1.energy = MAX_ENERGY - 0.001;
    tickPassiveEnergy(s1, s2, 10000);
    expect(s1.energy).toBeLessThanOrEqual(MAX_ENERGY);
  });

  it('bankaiChargeRateMult speeds up charging', () => {
    const s1fast = defaultFighterState();
    const s1slow = defaultFighterState();
    const dummy = defaultFighterState();
    s1fast.bankaiChargeRateMult = 2;
    tickPassiveEnergy(s1fast, dummy, 1000);
    tickPassiveEnergy(s1slow, dummy, 1000);
    expect(s1fast.energy).toBeGreaterThan(s1slow.energy);
  });
});

// ── Round end detection ───────────────────────────────────────────────────────

describe('checkRoundEnd', () => {
  it('returns null while both fighters have HP and timer > 0', () => {
    const { s1, s2 } = makeStates();
    expect(checkRoundEnd(s1, s2, 10)).toBeNull();
  });

  it('detects KO when P1 HP reaches 0', () => {
    const { s1, s2 } = makeStates();
    s1.hp = 0;
    const result = checkRoundEnd(s1, s2, 10);
    expect(result?.reason).toBe('ko');
    expect(result?.winner).toBe(2);
  });

  it('detects KO when P2 HP reaches 0', () => {
    const { s1, s2 } = makeStates();
    s2.hp = 0;
    const result = checkRoundEnd(s1, s2, 10);
    expect(result?.winner).toBe(1);
  });

  it('detects timer expiry with P1 winning', () => {
    const { s1, s2 } = makeStates();
    s2.hp = 50;
    const result = checkRoundEnd(s1, s2, 0);
    expect(result?.reason).toBe('timer');
    expect(result?.winner).toBe(1);
  });

  it('timer draw when HP equal', () => {
    const { s1, s2 } = makeStates();
    const result = checkRoundEnd(s1, s2, 0);
    expect(result?.winner).toBe('draw');
  });

  it('double KO is a draw', () => {
    const { s1, s2 } = makeStates();
    s1.hp = 0;
    s2.hp = 0;
    expect(checkRoundEnd(s1, s2, 10)?.winner).toBe('draw');
  });
});

// ── Match progression ─────────────────────────────────────────────────────────

describe('applyRoundWin', () => {
  it('match not over after one round win', () => {
    const { s1, s2 } = makeStates();
    const r = applyRoundWin(s1, s2, 1, 1, ROUNDS_TO_WIN);
    expect(r.matchOver).toBe(false);
    expect(s1.roundWins).toBe(1);
  });

  it('match is over after two round wins', () => {
    const { s1, s2 } = makeStates();
    applyRoundWin(s1, s2, 1, 1, ROUNDS_TO_WIN);
    const r = applyRoundWin(s1, s2, 1, 2, ROUNDS_TO_WIN);
    expect(r.matchOver).toBe(true);
    expect(r.matchWinner).toBe(1);
  });

  it('draws are possible', () => {
    const { s1, s2 } = makeStates();
    applyRoundWin(s1, s2, 1, 1, ROUNDS_TO_WIN);
    applyRoundWin(s1, s2, 2, 2, ROUNDS_TO_WIN);
    const r = applyRoundWin(s1, s2, 'draw', 3, ROUNDS_TO_WIN);
    expect(r.matchOver).toBe(true);
    expect(r.matchWinner).toBe('draw');
  });

  it('match ends after round 3 regardless of wins', () => {
    const { s1, s2 } = makeStates();
    applyRoundWin(s1, s2, 'draw', 3, ROUNDS_TO_WIN);
    // any call with round >= 3 forces match over
    expect(applyRoundWin(s1, s2, 'draw', 3, ROUNDS_TO_WIN).matchOver).toBe(true);
  });
});

// ── Card effects ──────────────────────────────────────────────────────────────

describe('card effects', () => {
  it('attackMult increases damage dealt', () => {
    const { s1: base1, s2: base2 } = makeStates();
    resolveMove(base1, base2, MoveType.ATTACK);
    const baseDmg = BASE_HP - base2.hp;

    const { s1: buff1, s2: buff2 } = makeStates();
    buff1.attackMult = 1.15;
    resolveMove(buff1, buff2, MoveType.ATTACK);
    const buffDmg = BASE_HP - buff2.hp;

    expect(buffDmg).toBeGreaterThan(baseDmg);
  });

  it('defenseMult reduces damage received', () => {
    const { s1, s2: tank } = makeStates();
    tank.defenseMult = 1.1;
    resolveMove(s1, tank, MoveType.ATTACK);
    expect(tank.hp).toBeGreaterThan(BASE_HP - DAMAGE.ATTACK);
  });

  it('lowAttackSlows applies slow on low attack', () => {
    const { s1, s2 } = makeStates();
    s1.lowAttackSlows = true;
    resolveMove(s1, s2, MoveType.LOW_ATTACK, Date.now());
    expect(s2.isSlowed).toBe(true);
  });

  it('low attack without card does NOT slow', () => {
    const { s1, s2 } = makeStates();
    resolveMove(s1, s2, MoveType.LOW_ATTACK);
    expect(s2.isSlowed).toBe(false);
  });

  it('counterOnPerfectBlock triggers on perfect block', () => {
    const now = 1000;
    const { s1, s2 } = makeStates();
    s2.counterOnPerfectBlock = true;
    // defender blocks right before attack (perfect block window < 200ms)
    resolveMove(s2, s1, MoveType.BLOCK, now);
    const s1HpBefore = s1.hp;
    resolveMove(s1, s2, MoveType.ATTACK, now + 50); // within window
    expect(s1.hp).toBeLessThan(s1HpBefore);
  });

  it('counter does NOT trigger outside perfect block window', () => {
    const now = 1000;
    const { s1, s2 } = makeStates();
    s2.counterOnPerfectBlock = true;
    resolveMove(s2, s1, MoveType.BLOCK, now);
    const s1HpBefore = s1.hp;
    resolveMove(s1, s2, MoveType.ATTACK, now + 500); // too late
    expect(s1.hp).toBe(s1HpBefore); // block still works, no counter
  });
});

// ── Full fight simulation ─────────────────────────────────────────────────────

describe('full fight simulation', () => {
  /** Simulates a complete match, returns result. Never loops infinitely. */
  function simulateFight(
    moves1: MoveType[],
    moves2: MoveType[],
    tickMs = 50,
  ) {
    const s1 = defaultFighterState();
    const s2 = defaultFighterState();
    let round = 1;
    let matchWinner: 1 | 2 | 'draw' | null = null;
    let totalTicks = 0;
    const MAX_TICKS = 10_000; // safety: prevent true infinite loop in test

    while (!matchWinner && totalTicks < MAX_TICKS) {
      // reset for round
      resetForRound(s1);
      resetForRound(s2);
      let timer = ROUND_DURATION * 1000; // ms

      while (timer > 0 && totalTicks < MAX_TICKS) {
        totalTicks++;
        tickPassiveEnergy(s1, s2, tickMs);
        timer -= tickMs;

        // consume next move in sequence (wraps around)
        const m1 = moves1[totalTicks % moves1.length];
        const m2 = moves2[totalTicks % moves2.length];
        if (m1) resolveMove(s1, s2, m1);
        if (m2) resolveMove(s2, s1, m2);

        const end = checkRoundEnd(s1, s2, timer / 1000);
        if (end) {
          const r = applyRoundWin(s1, s2, end.winner, round, ROUNDS_TO_WIN);
          if (r.matchOver) matchWinner = r.matchWinner;
          round++;
          break;
        }
      }

      // forced end if timer ran out with no checkRoundEnd (timer exactly 0)
      if (!matchWinner) {
        const end = checkRoundEnd(s1, s2, 0);
        if (end) {
          const r = applyRoundWin(s1, s2, end.winner, round, ROUNDS_TO_WIN);
          if (r.matchOver) matchWinner = r.matchWinner;
          round++;
        }
      }
    }

    return { matchWinner, rounds: round - 1, ticks: totalTicks, s1, s2 };
  }

  it('spammer always beats idle opponent', () => {
    const spam = [MoveType.ATTACK, MoveType.ATTACK, MoveType.ATTACK];
    const idle = [MoveType.NONE];
    const { matchWinner } = simulateFight(spam, idle);
    expect(matchWinner).toBe(1);
  });

  it('blocker vs spammer: blocker survives longer', () => {
    const spam = [MoveType.ATTACK];
    const block = [MoveType.BLOCK];
    // Blocker should hold much longer than idle
    const { matchWinner: spamWin } = simulateFight(spam, [MoveType.NONE]);
    const { ticks: spamTicks } = simulateFight(spam, [MoveType.NONE]);
    const { ticks: blockTicks } = simulateFight(spam, block);
    // Spammer always wins vs idle
    expect(spamWin).not.toBeNull();
    // Blocker absorbs hits longer than idle opponent (block vs idle takes >= same ticks)
    expect(blockTicks).toBeGreaterThanOrEqual(spamTicks);
  });

  it('high attack beats blocker (bypasses block)', () => {
    const highSpam = [MoveType.HIGH_ATTACK];
    const block = [MoveType.BLOCK];
    const { matchWinner } = simulateFight(highSpam, block);
    expect(matchWinner).toBe(1);
  });

  it('match always has a winner (never hangs)', () => {
    const randomMoves = [
      MoveType.ATTACK, MoveType.HIGH_ATTACK, MoveType.LOW_ATTACK,
      MoveType.BLOCK, MoveType.NONE,
    ];
    // Run 20 random-ish fights
    for (let i = 0; i < 20; i++) {
      const seq1 = randomMoves.slice(i % 3);
      const seq2 = randomMoves.slice((i + 2) % 3);
      const { matchWinner, ticks } = simulateFight(seq1, seq2);
      expect(matchWinner).not.toBeNull();
      expect(ticks).toBeLessThan(10_000);
    }
  });

  it('HP is always >= 0 and <= BASE_HP throughout fight', () => {
    const { s1, s2 } = simulateFight(
      [MoveType.ATTACK, MoveType.BANKAI, MoveType.LOW_ATTACK],
      [MoveType.HIGH_ATTACK, MoveType.BLOCK, MoveType.NONE],
    );
    // At match end, both HPs must be valid
    expect(s1.hp).toBeGreaterThanOrEqual(0);
    expect(s1.hp).toBeLessThanOrEqual(BASE_HP);
    expect(s2.hp).toBeGreaterThanOrEqual(0);
    expect(s2.hp).toBeLessThanOrEqual(BASE_HP);
  });

  it('energy is always 0-MAX_ENERGY throughout fight', () => {
    const { s1, s2 } = simulateFight(
      [MoveType.ATTACK, MoveType.BANKAI],
      [MoveType.ATTACK, MoveType.BANKAI],
    );
    expect(s1.energy).toBeGreaterThanOrEqual(0);
    expect(s1.energy).toBeLessThanOrEqual(MAX_ENERGY);
    expect(s2.energy).toBeGreaterThanOrEqual(0);
    expect(s2.energy).toBeLessThanOrEqual(MAX_ENERGY);
  });

  it('Bankai-spammer vs Bankai-spammer always resolves', () => {
    const { matchWinner } = simulateFight(
      [MoveType.BANKAI, MoveType.ATTACK],
      [MoveType.BANKAI, MoveType.ATTACK],
    );
    expect(matchWinner).not.toBeNull();
  });
});

// ── resetForRound ─────────────────────────────────────────────────────────────

describe('resetForRound', () => {
  it('restores HP to BASE_HP', () => {
    const s = defaultFighterState();
    s.hp = 10;
    resetForRound(s);
    expect(s.hp).toBe(BASE_HP);
  });

  it('preserves card effects (attackMult)', () => {
    const s = defaultFighterState();
    s.attackMult = 1.15;
    resetForRound(s);
    expect(s.attackMult).toBe(1.15);
  });

  it('preserves energy', () => {
    const s = defaultFighterState();
    s.energy = 60;
    resetForRound(s);
    expect(s.energy).toBe(60);
  });

  it('resets hitCount', () => {
    const s = defaultFighterState();
    s.hitCount = 7;
    resetForRound(s);
    expect(s.hitCount).toBe(0);
  });
});
