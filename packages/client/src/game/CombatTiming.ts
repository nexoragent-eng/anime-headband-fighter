import { MoveType } from '@ahf/shared';

export interface MoveTiming {
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  rangePx: number;
  hitStunMs: number;
  missRecoveryMult: number;
  note: string;
}

export const MOVE_TIMINGS: Record<MoveType, MoveTiming> = {
  [MoveType.NONE]: {
    windupMs: 0,
    activeMs: 0,
    recoveryMs: 0,
    rangePx: 0,
    hitStunMs: 0,
    missRecoveryMult: 1,
    note: 'No action.',
  },
  [MoveType.ATTACK]: {
    windupMs: 80,
    activeMs: 100,
    recoveryMs: 120,
    rangePx: 132,
    hitStunMs: 210,
    missRecoveryMult: 1.25,
    note: 'Light attack: quick poke, low commitment.',
  },
  [MoveType.HIGH_ATTACK]: {
    windupMs: 200,
    activeMs: 120,
    recoveryMs: 300,
    rangePx: 164,
    hitStunMs: 285,
    missRecoveryMult: 1.35,
    note: 'Heavy attack: beats block, high damage, very punishable on whiff.',
  },
  [MoveType.LOW_ATTACK]: {
    windupMs: 150,
    activeMs: 100,
    recoveryMs: 245,
    rangePx: 118,
    hitStunMs: 235,
    missRecoveryMult: 1.3,
    note: 'Low attack: catches late dodges and can enable slow/card effects.',
  },
  [MoveType.BLOCK]: {
    windupMs: 0,
    activeMs: 260,
    recoveryMs: 170,
    rangePx: 0,
    hitStunMs: 0,
    missRecoveryMult: 1,
    note: 'Timed guard. Perfect block window is short; three blocked hits breaks guard.',
  },
  [MoveType.DODGE]: {
    windupMs: 0,
    activeMs: 120,
    recoveryMs: 380,
    rangePx: 0,
    hitStunMs: 0,
    missRecoveryMult: 1,
    note: 'Dodge: short invulnerability, long cooldown/recovery. Baitable.',
  },
  [MoveType.BANKAI]: {
    windupMs: 520,
    activeMs: 220,
    recoveryMs: 620,
    rangePx: 9999,
    hitStunMs: 420,
    missRecoveryMult: 1.2,
    note: 'Bankai: giant commitment, punishable startup, huge payoff if timed well.',
  },
};

export const INPUT_BUFFER_MS = 100;

export function canBufferMove(move: MoveType): boolean {
  return move !== MoveType.NONE;
}

export function isAttackMove(move: MoveType): boolean {
  return move === MoveType.ATTACK || move === MoveType.HIGH_ATTACK || move === MoveType.LOW_ATTACK || move === MoveType.BANKAI;
}
