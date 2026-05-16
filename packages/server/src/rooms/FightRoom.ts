import { Room, Client } from 'colyseus';
import type { Presence } from 'colyseus';
import { FightRoomState, FighterState, CardOption } from '../schemas/FightState';
import { playerRepo } from '../db/database';
import { drawRandomCards } from '@ahf/shared';
import {
  MoveType, AnimState,
  BASE_HP, MAX_ENERGY, BANKAI_ENERGY_COST,
  DAMAGE, ENERGY_GAIN, RANK, RUN_LENGTH,
  ROUND_DURATION, ROUNDS_TO_WIN, COUNTDOWN_DURATION,
  TICK_RATE, ROUND_END_DELAY, BLOCK_WINDOW_MS, DODGE_IFRAME_MS, DODGE_COOLDOWN_MS, BLOCK_BREAK_HITS, BLOCK_BREAK_RECOVERY_MS,
} from '@ahf/shared';
import type { FightPhase } from '@ahf/shared';
import { FightPhase as FP } from '@ahf/shared';

const TICK_MS = 1000 / TICK_RATE;
const IDLE_RESET_MS = 300;

const SERVER_MOVE_TIMINGS: Record<MoveType, { windupMs: number; activeMs: number; recoveryMs: number; rangePx: number; missRecoveryMult: number }> = {
  [MoveType.NONE]: { windupMs: 0, activeMs: 0, recoveryMs: 0, rangePx: 0, missRecoveryMult: 1 },
  [MoveType.ATTACK]: { windupMs: 80, activeMs: 100, recoveryMs: 120, rangePx: 132, missRecoveryMult: 1.25 },
  [MoveType.HIGH_ATTACK]: { windupMs: 200, activeMs: 120, recoveryMs: 300, rangePx: 164, missRecoveryMult: 1.35 },
  [MoveType.LOW_ATTACK]: { windupMs: 150, activeMs: 100, recoveryMs: 245, rangePx: 118, missRecoveryMult: 1.3 },
  [MoveType.BLOCK]: { windupMs: 0, activeMs: 260, recoveryMs: 170, rangePx: 0, missRecoveryMult: 1 },
  [MoveType.DODGE]: { windupMs: 0, activeMs: 120, recoveryMs: 380, rangePx: 0, missRecoveryMult: 1 },
  [MoveType.BANKAI]: { windupMs: 520, activeMs: 220, recoveryMs: 620, rangePx: 9999, missRecoveryMult: 1.2 },
};

interface PlayerSession {
  client: Client;
  playerId: string;
  role: 'A' | 'B';
  lastMove: MoveType;
  lastMoveTick: number;
  blockWindowStart: number;
  actionLockedUntil: number;
  blockActiveUntil: number;
  blockHits: number;
  blockBrokenUntil: number;
  dodgeActiveUntil: number;
  dodgeCooldownUntil: number;
}

export class FightRoom extends Room<FightRoomState> {
  maxClients = 2;

  private sessions = new Map<string, PlayerSession>();
  private tick = 0;
  private roundTimerMs = ROUND_DURATION * 1000;
  private countdownMs = COUNTDOWN_DURATION * 1000;
  private animResetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private processingRoundEnd = false;

  constructor(presence?: Presence) {
    super(presence);
  }

  onCreate() {
    this.setState(new FightRoomState());
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);

    this.onMessage('input', (client: Client, msg: { move: MoveType }) => {
      const session = this.sessions.get(client.sessionId);
      if (!session || this.state.phase !== FP.FIGHTING) return;
      if (!msg.move || msg.move === MoveType.NONE) return;

      this.beginServerAction(session, msg.move);
    });

    this.onMessage('card_pick', (client: Client, msg: { cardId: string }) => {
      const session = this.sessions.get(client.sessionId);
      if (!session) return;
      this.applyCardPick(session, msg.cardId);
    });
  }

  onJoin(client: Client, options: { playerId: string; username: string }) {
    const role: 'A' | 'B' = this.sessions.size === 0 ? 'A' : 'B';
    const session: PlayerSession = {
      client,
      playerId: options.playerId,
      role,
      lastMove: MoveType.NONE,
      lastMoveTick: -1,
      blockWindowStart: 0,
      actionLockedUntil: 0,
      blockActiveUntil: 0,
      blockHits: 0,
      blockBrokenUntil: 0,
      dodgeActiveUntil: 0,
      dodgeCooldownUntil: 0,
    };
    this.sessions.set(client.sessionId, session);

    const dbPlayer = playerRepo.findById(options.playerId);
    const fighter = role === 'A' ? this.state.playerA : this.state.playerB;
    fighter.playerId = options.playerId;
    fighter.username = options.username;
    fighter.outfitColor = dbPlayer?.outfit_color ?? '#4a90d9';
    fighter.auraColor = dbPlayer?.aura_color ?? '#7b2fff';
    fighter.hp = BASE_HP;
    fighter.energy = 0;

    if (this.sessions.size === 2) {
      this.startCountdown();
    }
  }

  onLeave(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (session && this.state.phase === FP.FIGHTING) {
      const winner = session.role === 'A' ? this.state.playerB : this.state.playerA;
      this.endMatch(winner.playerId);
    }
    this.sessions.delete(client.sessionId);
  }

  private startCountdown() {
    this.state.phase = FP.COUNTDOWN;
    this.countdownMs = COUNTDOWN_DURATION * 1000;
    this.state.countdown = COUNTDOWN_DURATION;
  }

  private startRound() {
    this.state.phase = FP.FIGHTING;
    this.roundTimerMs = ROUND_DURATION * 1000;
    this.state.roundTimer = ROUND_DURATION;
    this.state.playerA.hp = BASE_HP;
    this.state.playerB.hp = BASE_HP;
    this.state.playerA.animState = AnimState.IDLE;
    this.state.playerB.animState = AnimState.IDLE;
    this.processingRoundEnd = false;
    this.sessions.forEach(s => {
      s.lastMove = MoveType.NONE;
      s.lastMoveTick = -1;
      s.actionLockedUntil = 0;
      s.blockActiveUntil = 0;
      s.blockWindowStart = 0;
      s.blockHits = 0;
      s.blockBrokenUntil = 0;
      s.dodgeActiveUntil = 0;
      s.dodgeCooldownUntil = 0;
    });
  }


  private beginServerAction(session: PlayerSession, move: MoveType) {
    const now = Date.now();
    if (now < session.actionLockedUntil) return;
    if (move === MoveType.DODGE && now < session.dodgeCooldownUntil) return;

    const timing = SERVER_MOVE_TIMINGS[move];
    session.actionLockedUntil = now + timing.windupMs + timing.activeMs + timing.recoveryMs;
    session.lastMove = MoveType.NONE;
    session.lastMoveTick = -1;

    const fighter = session.role === 'A' ? this.state.playerA : this.state.playerB;
    fighter.animState = moveToAnim(move);
    this.scheduleAnimReset(fighter, timing.windupMs + timing.activeMs + timing.recoveryMs);

    if (move === MoveType.BLOCK) {
      if (now < session.blockBrokenUntil) return;
      session.blockWindowStart = now;
      session.blockActiveUntil = now + timing.activeMs;
      return;
    }

    if (move === MoveType.DODGE) {
      session.dodgeActiveUntil = now + DODGE_IFRAME_MS;
      session.dodgeCooldownUntil = now + DODGE_COOLDOWN_MS;
      return;
    }

    setTimeout(() => {
      if (this.state.phase !== FP.FIGHTING) return;
      const attacker = session.role === 'A' ? this.state.playerA : this.state.playerB;
      const defender = session.role === 'A' ? this.state.playerB : this.state.playerA;
      const defenderSess = this.getSessionByRole(session.role === 'A' ? 'B' : 'A');
      if (!defenderSess || attacker.hp <= 0) return;
      this.applyMove(attacker, defender, move, session, defenderSess);
    }, timing.windupMs);
  }

  private update(dt: number) {
    this.tick++;

    if (this.state.phase === FP.COUNTDOWN) {
      this.countdownMs -= dt;
      this.state.countdown = Math.ceil(this.countdownMs / 1000);
      if (this.countdownMs <= 0) this.startRound();
      return;
    }

    if (this.state.phase !== FP.FIGHTING) return;

    this.roundTimerMs -= dt;
    this.state.roundTimer = Math.ceil(this.roundTimerMs / 1000);

    this.gainPassiveEnergy(dt);

    const sessA = this.getSessionByRole('A');
    const sessB = this.getSessionByRole('B');
    if (sessA && sessB) this.resolveInputs(sessA, sessB);

    if ((this.roundTimerMs <= 0 || this.state.playerA.hp <= 0 || this.state.playerB.hp <= 0) && !this.processingRoundEnd) {
      this.processingRoundEnd = true;
      this.endRound();
    }
  }

  private gainPassiveEnergy(dt: number) {
    const gain = (ENERGY_GAIN.BANKAI_CHARGE_PER_TICK * dt) / TICK_MS;
    [this.state.playerA, this.state.playerB].forEach(f => {
      f.energy = Math.min(MAX_ENERGY, f.energy + gain * f.bankaiChargeRateMult);
    });
  }

  private resolveInputs(sessA: PlayerSession, sessB: PlayerSession) {
    const moveA = sessA.lastMoveTick === this.tick ? sessA.lastMove : MoveType.NONE;
    const moveB = sessB.lastMoveTick === this.tick ? sessB.lastMove : MoveType.NONE;
    if (moveA !== MoveType.NONE) sessA.lastMove = MoveType.NONE;
    if (moveB !== MoveType.NONE) sessB.lastMove = MoveType.NONE;
    this.applyMove(this.state.playerA, this.state.playerB, moveA, sessA, sessB);
    this.applyMove(this.state.playerB, this.state.playerA, moveB, sessB, sessA);
  }

  private applyMove(attacker: FighterState, defender: FighterState, move: MoveType, _attackerSess: PlayerSession, defenderSess: PlayerSession) {
    if (move === MoveType.NONE) return;

    if (move === MoveType.BANKAI) {
      if (attacker.energy < BANKAI_ENERGY_COST) return;
      attacker.energy = 0;
      attacker.animState = AnimState.BANKAI;
      this.scheduleAnimReset(attacker, 800);
      if (!this.checkBlock(defender, defenderSess, move)) {
        const dmg = Math.round(DAMAGE.BANKAI_BEAM / Math.max(defender.defenseMult, 0.1));
        this.dealDamage(defender, attacker, dmg);
      }
      return;
    }

    attacker.animState = moveToAnim(move);
    this.scheduleAnimReset(attacker, 300);
    if (move === MoveType.BLOCK || move === MoveType.DODGE) return;

    if (Date.now() <= defenderSess.dodgeActiveUntil) {
      const timing = SERVER_MOVE_TIMINGS[move];
      _attackerSess.actionLockedUntil += Math.round(timing.recoveryMs * (timing.missRecoveryMult - 1));
      return;
    }

    const blocked = this.checkBlock(defender, defenderSess, move);
    if (blocked) {
      attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_BLOCK);
      defenderSess.blockHits++;
      if (defenderSess.blockHits >= BLOCK_BREAK_HITS) {
        defenderSess.blockHits = 0;
        defenderSess.blockActiveUntil = 0;
        defenderSess.blockBrokenUntil = Date.now() + BLOCK_BREAK_RECOVERY_MS;
        defender.animState = AnimState.HIT;
      }
      if (defender.counterOnPerfectBlock && this.isPerfectBlock(defenderSess)) {
        this.dealDamage(attacker, defender, DAMAGE.COUNTER_HIT);
      }
      return;
    }

    let baseDmg = move === MoveType.ATTACK ? DAMAGE.ATTACK
      : move === MoveType.HIGH_ATTACK ? DAMAGE.HIGH_ATTACK
      : DAMAGE.LOW_ATTACK;
    baseDmg = Math.round(baseDmg * attacker.attackMult);
    if (defender.defenseMult > 1) baseDmg = Math.max(1, Math.round(baseDmg / defender.defenseMult));
    this.dealDamage(defender, attacker, baseDmg);

    attacker.hitCount++;
    attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_HIT);

    if (move === MoveType.LOW_ATTACK && attacker.lowAttackSlows) {
      defender.isSlowed = true;
      setTimeout(() => { defender.isSlowed = false; }, 1500);
    }
  }

  private checkBlock(_defender: FighterState, defenderSess: PlayerSession, move: MoveType): boolean {
    const now = Date.now();
    if (now > defenderSess.blockActiveUntil || now < defenderSess.blockBrokenUntil) return false;
    // Heavy/Bankai beat block. They must be dodged or punished during startup.
    if (move === MoveType.HIGH_ATTACK || move === MoveType.BANKAI) return false;
    return true;
  }

  private isPerfectBlock(sess: PlayerSession): boolean {
    return Date.now() - sess.blockWindowStart < BLOCK_WINDOW_MS;
  }

  private dealDamage(defender: FighterState, _attacker: FighterState, amount: number) {
    defender.hp = Math.max(0, defender.hp - amount);
    defender.animState = AnimState.HIT;
    this.scheduleAnimReset(defender, IDLE_RESET_MS);
    defender.energy = Math.min(MAX_ENERGY, defender.energy + ENERGY_GAIN.ON_TAKE_HIT);
  }

  private scheduleAnimReset(fighter: FighterState, ms: number) {
    const key = fighter.playerId;
    const existing = this.animResetTimers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      if (fighter.animState === AnimState.HIT || fighter.animState === AnimState.BANKAI || fighter.animState === AnimState.ATTACK || fighter.animState === AnimState.HIGH_ATTACK || fighter.animState === AnimState.LOW_ATTACK || fighter.animState === AnimState.BLOCK) {
        fighter.animState = fighter.hp <= 0 ? AnimState.KO : AnimState.IDLE;
      }
    }, ms);
    this.animResetTimers.set(key, t);
  }

  private getSessionByRole(role: 'A' | 'B'): PlayerSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.role === role) return s;
    }
    return undefined;
  }

  private endRound() {
    this.state.phase = FP.ROUND_END;
    const aHp = this.state.playerA.hp;
    const bHp = this.state.playerB.hp;
    let roundWinner: FighterState | null = null;

    if (aHp > bHp) { this.state.playerA.roundWins++; roundWinner = this.state.playerA; }
    else if (bHp > aHp) { this.state.playerB.roundWins++; roundWinner = this.state.playerB; }

    this.state.winnerId = roundWinner?.playerId ?? '';
    const matchOver = this.state.playerA.roundWins >= ROUNDS_TO_WIN || this.state.playerB.roundWins >= ROUNDS_TO_WIN || this.state.round >= 3;

    if (matchOver) {
      const winner = this.state.playerA.roundWins > this.state.playerB.roundWins ? this.state.playerA : this.state.playerB;
      setTimeout(() => this.dealCardsAndEndMatch(winner.playerId), ROUND_END_DELAY);
    } else {
      this.state.round++;
      setTimeout(() => this.startCountdown(), ROUND_END_DELAY);
    }
  }

  private dealCardsAndEndMatch(winnerId: string) {
    this.state.phase = FP.CARD_PICK;
    this.state.matchWinnerId = winnerId;

    const sessA = this.getSessionByRole('A');
    const sessB = this.getSessionByRole('B');
    [sessA, sessB].forEach((sess, i) => {
      if (!sess) return;
      const dbPlayer = playerRepo.findById(sess.playerId);
      const existing: string[] = dbPlayer ? JSON.parse(dbPlayer.current_run_cards) : [];
      const options = drawRandomCards(3, existing);
      const target = i === 0 ? this.state.cardOptionsA : this.state.cardOptionsB;
      target.clear();
      options.forEach(card => {
        const opt = new CardOption();
        opt.id = card.id;
        opt.name = card.name;
        opt.type = card.type;
        opt.description = card.description;
        target.push(opt);
      });
    });

    this.updateRanks(winnerId);
  }

  private updateRanks(winnerId: string) {
    this.sessions.forEach(sess => {
      const delta = sess.playerId === winnerId ? RANK.WIN_POINTS : RANK.LOSS_POINTS;
      playerRepo.updateRank(sess.playerId, delta);
    });
  }

  private applyCardPick(session: PlayerSession, cardId: string) {
    const dbPlayer = playerRepo.findById(session.playerId);
    if (!dbPlayer) return;
    const existing: string[] = JSON.parse(dbPlayer.current_run_cards);
    const newFights = dbPlayer.fights_in_current_run + 1;
    if (newFights >= RUN_LENGTH) {
      playerRepo.updateRunState(session.playerId, [], 0);
    } else {
      playerRepo.updateRunState(session.playerId, [...existing, cardId], newFights);
    }
    this.endMatch(this.state.matchWinnerId);
  }

  private endMatch(winnerId: string) {
    this.state.phase = FP.MATCH_END;
    this.state.matchWinnerId = winnerId;
    this.broadcast('match_end', { winnerId });
    setTimeout(() => this.disconnect(), 3000);
  }

  onDispose() {
    this.animResetTimers.forEach(t => clearTimeout(t));
  }
}

function moveToAnim(move: MoveType): AnimState {
  switch (move) {
    case MoveType.ATTACK: return AnimState.ATTACK;
    case MoveType.HIGH_ATTACK: return AnimState.HIGH_ATTACK;
    case MoveType.LOW_ATTACK: return AnimState.LOW_ATTACK;
    case MoveType.BLOCK: return AnimState.BLOCK;
    case MoveType.DODGE: return AnimState.BLOCK;
    case MoveType.BANKAI: return AnimState.BANKAI;
    default: return AnimState.IDLE;
  }
}
