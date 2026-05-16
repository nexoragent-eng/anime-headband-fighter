import { Room, Client } from 'colyseus';
import { FightRoomState, FighterState, CardOption } from '../schemas/FightState';
import { playerRepo } from '../db/database';
import { drawRandomCards, CardDefinition } from '@ahf/shared';
import {
  MoveType, AnimState, FightPhase,
  BASE_HP, MAX_ENERGY, BANKAI_ENERGY_COST,
  DAMAGE, ENERGY_GAIN, RANK, RUN_LENGTH,
  ROUND_DURATION, ROUNDS_TO_WIN, COUNTDOWN_DURATION,
  TICK_RATE, ROUND_END_DELAY,
} from '@ahf/shared';

const TICK_MS = 1000 / TICK_RATE;
const IDLE_RESET_MS = 300;

interface PlayerSession {
  client: Client;
  playerId: string;
  role: 'A' | 'B';
  lastMove: MoveType;
  lastMoveTick: number;
  blockWindowStart: number;
  slowedUntil: number;
}

export class FightRoom extends Room<FightRoomState> {
  maxClients = 2;

  private sessions = new Map<string, PlayerSession>();
  private tick = 0;
  private roundTimerMs = ROUND_DURATION * 1000;
  private countdownMs = COUNTDOWN_DURATION * 1000;
  private animResetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private processingRoundEnd = false;

  onCreate() {
    this.setState(new FightRoomState());
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
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
      slowedUntil: 0,
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
    if (session && this.state.phase === FightPhase.FIGHTING) {
      // forfeit
      const winner = session.role === 'A' ? this.state.playerB : this.state.playerA;
      this.endMatch(winner.playerId);
    }
    this.sessions.delete(client.sessionId);
  }

  onMessage(client: Client, message: { type: string; move?: MoveType; cardId?: string }) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;

    if (message.type === 'input' && message.move && this.state.phase === FightPhase.FIGHTING) {
      session.lastMove = message.move;
      session.lastMoveTick = this.tick;
      if (message.move === MoveType.BLOCK) {
        session.blockWindowStart = Date.now();
      }
    }

    if (message.type === 'card_pick' && message.cardId) {
      this.applyCardPick(session, message.cardId);
    }
  }

  private startCountdown() {
    this.state.phase = FightPhase.COUNTDOWN;
    this.countdownMs = COUNTDOWN_DURATION * 1000;
    this.state.countdown = COUNTDOWN_DURATION;
  }

  private startRound() {
    this.state.phase = FightPhase.FIGHTING;
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
    });
  }

  private update(dt: number) {
    this.tick++;

    if (this.state.phase === FightPhase.COUNTDOWN) {
      this.countdownMs -= dt;
      this.state.countdown = Math.ceil(this.countdownMs / 1000);
      if (this.countdownMs <= 0) {
        this.startRound();
      }
      return;
    }

    if (this.state.phase !== FightPhase.FIGHTING) return;

    this.roundTimerMs -= dt;
    this.state.roundTimer = Math.ceil(this.roundTimerMs / 1000);

    this.gainPassiveEnergy(dt);

    const sessA = this.getSessionByRole('A');
    const sessB = this.getSessionByRole('B');

    if (sessA && sessB) {
      this.resolveInputs(sessA, sessB);
    }

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

  private applyMove(attacker: FighterState, defender: FighterState, move: MoveType, attackerSess: PlayerSession, defenderSess: PlayerSession) {
    if (move === MoveType.NONE) return;

    if (move === MoveType.BANKAI) {
      if (attacker.energy < BANKAI_ENERGY_COST) return;
      attacker.energy = 0;
      attacker.animState = AnimState.BANKAI;
      this.scheduleAnimReset(attacker, AttackAnimState(move), 800);
      const blocked = this.checkBlock(defender, defenderSess, move);
      if (!blocked) {
        const dmg = Math.round(DAMAGE.BANKAI_BEAM * (1 / Math.max(defender.defenseMult, 0.1)));
        this.dealDamage(defender, attacker, dmg);
      }
      return;
    }

    const baseAnim = AttackAnimState(move);
    attacker.animState = baseAnim;
    this.scheduleAnimReset(attacker, baseAnim, 300);

    if (move === MoveType.BLOCK) return;

    const blocked = this.checkBlock(defender, defenderSess, move);
    if (blocked) {
      attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_BLOCK);
      // perfect block counter
      if (defender.counterOnPerfectBlock && this.isPerfectBlock(defenderSess)) {
        const cDmg = Math.round(DAMAGE.COUNTER_HIT * attacker.attackMult);
        this.dealDamage(attacker, defender, cDmg);
      }
      return;
    }

    let baseDmg = move === MoveType.ATTACK ? DAMAGE.ATTACK
      : move === MoveType.HIGH_ATTACK ? DAMAGE.HIGH_ATTACK
      : DAMAGE.LOW_ATTACK;

    baseDmg = Math.round(baseDmg * attacker.attackMult);

    if (defender.defenseMult > 1) {
      baseDmg = Math.max(1, Math.round(baseDmg / defender.defenseMult));
    }

    this.dealDamage(defender, attacker, baseDmg);

    attacker.hitCount++;
    attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_HIT);

    // third strike knockback (just visual signal via anim state reset)
    if (attacker.thirdHitKnockback && attacker.hitCount % 3 === 0) {
      defender.animState = AnimState.HIT;
      this.scheduleAnimReset(defender, AnimState.HIT, 500);
    }

    // low sweep slow
    if (move === MoveType.LOW_ATTACK && attacker.lowAttackSlows) {
      defenderSess.slowedUntil = Date.now() + 1500;
      defender.isSlowed = true;
      setTimeout(() => { defender.isSlowed = false; }, 1500);
    }
  }

  private checkBlock(defender: FighterState, defenderSess: PlayerSession, move: MoveType): boolean {
    if (defenderSess.lastMove !== MoveType.BLOCK) return false;
    // high attacks bypass regular block
    if (move === MoveType.HIGH_ATTACK) return false;
    // bankai bypasses block
    if (move === MoveType.BANKAI) return false;
    return true;
  }

  private isPerfectBlock(sess: PlayerSession): boolean {
    return Date.now() - sess.blockWindowStart < 200;
  }

  private dealDamage(defender: FighterState, attacker: FighterState, amount: number) {
    defender.hp = Math.max(0, defender.hp - amount);
    defender.animState = AnimState.HIT;
    this.scheduleAnimReset(defender, AnimState.HIT, IDLE_RESET_MS);
    defender.energy = Math.min(MAX_ENERGY, defender.energy + ENERGY_GAIN.ON_TAKE_HIT);
  }

  private scheduleAnimReset(fighter: FighterState, fromState: AnimState, ms: number) {
    const key = fighter.playerId;
    const existing = this.animResetTimers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      if (fighter.animState === fromState) {
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
    this.state.phase = FightPhase.ROUND_END;

    const aHp = this.state.playerA.hp;
    const bHp = this.state.playerB.hp;
    let roundWinner: FighterState | null = null;

    if (aHp > bHp) {
      this.state.playerA.roundWins++;
      roundWinner = this.state.playerA;
    } else if (bHp > aHp) {
      this.state.playerB.roundWins++;
      roundWinner = this.state.playerB;
    }

    this.state.winnerId = roundWinner?.playerId ?? '';

    const matchOver = this.state.playerA.roundWins >= ROUNDS_TO_WIN || this.state.playerB.roundWins >= ROUNDS_TO_WIN
      || this.state.round >= 3;

    if (matchOver) {
      const winner = this.state.playerA.roundWins > this.state.playerB.roundWins
        ? this.state.playerA : this.state.playerB;
      setTimeout(() => this.dealCardsAndEndMatch(winner.playerId), ROUND_END_DELAY);
    } else {
      this.state.round++;
      setTimeout(() => this.startCountdown(), ROUND_END_DELAY);
    }
  }

  private dealCardsAndEndMatch(winnerId: string) {
    this.state.phase = FightPhase.CARD_PICK;
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
    const sessA = this.getSessionByRole('A');
    const sessB = this.getSessionByRole('B');
    [sessA, sessB].forEach(sess => {
      if (!sess) return;
      const delta = sess.playerId === winnerId ? RANK.WIN_POINTS : RANK.LOSS_POINTS;
      playerRepo.updateRank(sess.playerId, delta);
    });
  }

  private applyCardPick(session: PlayerSession, cardId: string) {
    const dbPlayer = playerRepo.findById(session.playerId);
    if (!dbPlayer) return;

    const existing: string[] = JSON.parse(dbPlayer.current_run_cards);
    const newCards = [...existing, cardId];
    let newFights = dbPlayer.fights_in_current_run + 1;

    if (newFights >= RUN_LENGTH) {
      playerRepo.updateRunState(session.playerId, [], 0);
    } else {
      playerRepo.updateRunState(session.playerId, newCards, newFights);
    }

    const bothPicked = Array.from(this.sessions.values()).every(s => {
      const p = playerRepo.findById(s.playerId);
      return p && p.fights_in_current_run !== dbPlayer.fights_in_current_run;
    });

    if (bothPicked || this.sessions.size < 2) {
      this.endMatch(this.state.matchWinnerId);
    }
  }

  private endMatch(winnerId: string) {
    this.state.phase = FightPhase.MATCH_END;
    this.state.matchWinnerId = winnerId;
    this.broadcast('match_end', { winnerId });
    setTimeout(() => this.disconnect(), 3000);
  }

  onDispose() {
    this.animResetTimers.forEach(t => clearTimeout(t));
  }
}

function AttackAnimState(move: MoveType): AnimState {
  switch (move) {
    case MoveType.ATTACK: return AnimState.ATTACK;
    case MoveType.HIGH_ATTACK: return AnimState.HIGH_ATTACK;
    case MoveType.LOW_ATTACK: return AnimState.LOW_ATTACK;
    case MoveType.BLOCK: return AnimState.BLOCK;
    case MoveType.BANKAI: return AnimState.BANKAI;
    default: return AnimState.IDLE;
  }
}
