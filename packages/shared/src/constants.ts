export const ROUND_DURATION = 20; // seconds
export const ROUNDS_TO_WIN = 2; // best of 3
export const TOTAL_ROUNDS = 3;
export const BASE_HP = 100;
export const MAX_ENERGY = 100;
export const BANKAI_ENERGY_COST = 100;

export const DAMAGE = {
  ATTACK: 10,
  HIGH_ATTACK: 12,
  LOW_ATTACK: 8,
  BANKAI_BEAM: 40,
  COUNTER_HIT: 15,
  BLOCK_CHIP: 2,
};

export const ENERGY_GAIN = {
  ON_HIT: 12,
  ON_BLOCK: 6,
  ON_TAKE_HIT: 8,
  BANKAI_CHARGE_PER_TICK: 0.3,
};

export const RANK = {
  WIN_POINTS: 25,
  LOSS_POINTS: -15,
  DEFAULT: 1000,
};

export const RUN_LENGTH = 5; // fights per run before cards reset

export const COUNTDOWN_DURATION = 3; // seconds

export const BLOCK_WINDOW_MS = 100; // ms — tight window for perfect block / counter timing
export const SLOW_DURATION_MS = 1500; // ms — low_sweep slow effect

export const TICK_RATE = 20; // server ticks per second
export const ROUND_END_DELAY = 2000; // ms before showing card picker / next round

export const HEADBAND_RANKS = [1, 2, 3];
export const HEADBAND_TIERS = { 1: 'gold', 2: 'silver', 3: 'bronze' } as const;

export const DODGE_IFRAME_MS = 120;
export const DODGE_COOLDOWN_MS = 500;
export const HIT_STOP_MS = 50;
export const INPUT_BUFFER_MS = 100;
export const BLOCK_BREAK_HITS = 3;
export const BLOCK_BREAK_RECOVERY_MS = 650;
