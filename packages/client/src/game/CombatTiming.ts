import { MoveType } from '@ahf/shared';

export interface MoveTiming {
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  note: string;
}

export const MOVE_TIMINGS: Record<MoveType, MoveTiming> = {
  [MoveType.NONE]: { windupMs: 0, activeMs: 0, recoveryMs: 0, note: 'No action.' },
  [MoveType.ATTACK]: { windupMs: 120, activeMs: 90, recoveryMs: 190, note: 'Fast jab: safest poke.' },
  [MoveType.HIGH_ATTACK]: { windupMs: 210, activeMs: 110, recoveryMs: 290, note: 'Slow heavy: stronger but punishable.' },
  [MoveType.LOW_ATTACK]: { windupMs: 170, activeMs: 100, recoveryMs: 250, note: 'Low sweep: medium speed utility.' },
  [MoveType.BLOCK]: { windupMs: 0, activeMs: 260, recoveryMs: 140, note: 'Instant guard with short counter window.' },
  [MoveType.BANKAI]: { windupMs: 360, activeMs: 220, recoveryMs: 520, note: 'Huge commitment, huge payoff.' },
};

export const INPUT_BUFFER_MS = 180;

export function canBufferMove(move: MoveType): boolean {
  return move !== MoveType.NONE;
}
