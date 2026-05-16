export enum MoveType {
  ATTACK = 'attack',
  HIGH_ATTACK = 'high_attack',
  LOW_ATTACK = 'low_attack',
  BLOCK = 'block',
  BANKAI = 'bankai',
  NONE = 'none',
}

export enum AnimState {
  IDLE = 'idle',
  ATTACK = 'attack',
  HIGH_ATTACK = 'high_attack',
  LOW_ATTACK = 'low_attack',
  BLOCK = 'block',
  HIT = 'hit',
  BANKAI = 'bankai',
  KO = 'ko',
}

export enum RoundResult {
  WIN = 'win',
  LOSS = 'loss',
  DRAW = 'draw',
}

export enum FightPhase {
  WAITING = 'waiting',
  COUNTDOWN = 'countdown',
  FIGHTING = 'fighting',
  ROUND_END = 'round_end',
  CARD_PICK = 'card_pick',
  MATCH_END = 'match_end',
}

export interface Cosmetics {
  hairStyle: number;
  outfitColor: string;
  auraColor: string;
  characterName: string;
}

export interface PlayerProfile {
  id: string;
  username: string;
  rankPoints: number;
  cosmetics: Cosmetics;
  currentRunCards: string[];
  fightsInCurrentRun: number;
  createdAt: number;
  updatedAt: number;
}

export interface BaseStats {
  hp: number;
  attack: number;
  speed: number;
  defense: number;
  bankaiChargeRate: number;
}

export interface ActiveEffects {
  speedMult: number;
  attackMult: number;
  defenseMult: number;
  bankaiChargeRateMult: number;
  counterOnPerfectBlock: boolean;
  lowAttackSlows: boolean;
  thirdHitKnockback: boolean;
  bankaiBeamWidthMult: number;
  bankaiActivateFaster: boolean;
  bankaiLeavesZone: boolean;
  hitCount: number;
}

export const DEFAULT_STATS: BaseStats = {
  hp: 100,
  attack: 10,
  speed: 1,
  defense: 0,
  bankaiChargeRate: 1,
};

export const DEFAULT_EFFECTS: ActiveEffects = {
  speedMult: 1,
  attackMult: 1,
  defenseMult: 1,
  bankaiChargeRateMult: 1,
  counterOnPerfectBlock: false,
  lowAttackSlows: false,
  thirdHitKnockback: false,
  bankaiBeamWidthMult: 1,
  bankaiActivateFaster: false,
  bankaiLeavesZone: false,
  hitCount: 0,
};

export interface InputPayload {
  move: MoveType;
  tick: number;
}

export interface FightSnapshot {
  phase: FightPhase;
  round: number;
  roundTimer: number;
  playerAHp: number;
  playerBHp: number;
  playerAEnergy: number;
  playerBEnergy: number;
  playerAState: AnimState;
  playerBState: AnimState;
  playerAWins: number;
  playerBWins: number;
}

export interface CardPickPayload {
  cardId: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  rankPoints: number;
  hasHeadband: boolean;
  headbandTier: 'gold' | 'silver' | 'bronze' | null;
}
