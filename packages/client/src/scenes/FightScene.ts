import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { GameContext } from '../main';
import { Fighter } from '../game/Fighter';
import { SwipeInput, bindKeyboard, KEYBOARD_MAP_P1, KEYBOARD_MAP_P2 } from '../game/SwipeInput';
import { BankaiEffect } from '../game/BankaiEffect';
import { HUD } from '../ui/HUD';
import { CardPickerUI } from '../game/CardPicker';
import {
  MoveType, AnimState, FightPhase,
  BASE_HP, MAX_ENERGY, BANKAI_ENERGY_COST,
  DAMAGE, ENERGY_GAIN, COUNTDOWN_DURATION,
  ROUND_DURATION, ROUNDS_TO_WIN,
} from '@ahf/shared';
import type { CardDefinition } from '@ahf/shared';
import { drawRandomCards } from '@ahf/shared';
import { ALL_CARDS } from '@ahf/shared';

interface LocalFighterState {
  hp: number;
  energy: number;
  roundWins: number;
  animState: AnimState;
  animResetAt: number;
  hitCount: number;
  isBlocking: boolean;
  blockStart: number;
  isSlowed: boolean;
  slowedUntil: number;
  // card effects
  attackMult: number;
  speedMult: number;
  defenseMult: number;
  bankaiChargeRateMult: number;
  counterOnPerfectBlock: boolean;
  lowAttackSlows: boolean;
  thirdHitKnockback: boolean;
  bankaiBeamWidthMult: number;
  bankaiActivateFaster: boolean;
  bankaiLeavesZone: boolean;
  cards: string[];
}

function defaultState(): LocalFighterState {
  return {
    hp: BASE_HP, energy: 0, roundWins: 0, animState: AnimState.IDLE,
    animResetAt: 0, hitCount: 0, isBlocking: false, blockStart: 0,
    isSlowed: false, slowedUntil: 0,
    attackMult: 1, speedMult: 1, defenseMult: 1, bankaiChargeRateMult: 1,
    counterOnPerfectBlock: false, lowAttackSlows: false, thirdHitKnockback: false,
    bankaiBeamWidthMult: 1, bankaiActivateFaster: false, bankaiLeavesZone: false,
    cards: [],
  };
}

export class FightScene {
  private container: Container;
  private bg: Graphics;
  private ticker: Ticker;
  private hud: HUD;
  private p1Fighter: Fighter;
  private p2Fighter: Fighter;
  private bankaiEffect: BankaiEffect;
  private s1: LocalFighterState;
  private s2: LocalFighterState;
  private p1Input: SwipeInput;
  private p2Input: SwipeInput;
  private cleanupKb1: () => void;
  private cleanupKb2: () => void;
  private phase: FightPhase = FightPhase.COUNTDOWN;
  private round = 1;
  private roundTimer = ROUND_DURATION;
  private countdown = COUNTDOWN_DURATION;
  private pendingMove1: MoveType = MoveType.NONE;
  private pendingMove2: MoveType = MoveType.NONE;
  private overlay: Graphics;
  private overlayText: Text;
  private roundEndTimeout: ReturnType<typeof setTimeout> | null = null;
  private cardPicker: CardPickerUI | null = null;
  private cardPickDone1 = false;
  private cardPickDone2 = false;
  private matchOver = false;

  constructor(private ctx: GameContext, private opts: { roomId?: string; local?: boolean }) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const { width: W, height: H } = ctx.app.screen;

    // Background
    this.bg = new Graphics();
    this.bg.rect(0, 0, W, H).fill(0x1a1a2e);
    // floor
    this.bg.rect(0, H * 0.72, W, H * 0.28).fill(0x16213e);
    // ring ropes
    this.bg.rect(W * 0.05, H * 0.55, W * 0.9, 4).fill(0xffd700);
    this.bg.rect(W * 0.05, H * 0.62, W * 0.9, 4).fill(0xffd700);
    // corner posts
    [W * 0.05, W * 0.95].forEach(x => {
      this.bg.rect(x - 6, H * 0.5, 12, H * 0.25).fill(0xcccccc);
    });
    this.container.addChild(this.bg);

    // Bankai effect (behind fighters)
    this.bankaiEffect = new BankaiEffect();
    this.container.addChild(this.bankaiEffect.container);

    // Fighters
    const fightY = H * 0.62;
    this.s1 = defaultState();
    this.s2 = defaultState();

    const p1Name = ctx.player?.username ?? 'Player 1';
    const p2Name = 'Player 2';

    this.p1Fighter = new Fighter({
      name: p1Name,
      outfitColor: 0x4a90d9,
      auraColor: 0x7b2fff,
      facing: 'right',
    });
    this.p1Fighter.container.x = W * 0.28;
    this.p1Fighter.container.y = fightY;
    this.container.addChild(this.p1Fighter.container);

    this.p2Fighter = new Fighter({
      name: p2Name,
      outfitColor: 0xe05050,
      auraColor: 0xff8c00,
      facing: 'left',
    });
    this.p2Fighter.container.x = W * 0.72;
    this.p2Fighter.container.y = fightY;
    this.container.addChild(this.p2Fighter.container);

    // HUD
    this.hud = new HUD(W, H, {
      p1Name,
      p2Name,
      p1Color: 0x4a90d9,
      p2Color: 0xe05050,
    });
    this.container.addChild(this.hud.container);

    // Overlay (countdown / round result)
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.5 });
    this.overlay.alpha = 0;
    this.container.addChild(this.overlay);

    this.overlayText = new Text({
      text: '',
      style: new TextStyle({
        fill: '#ffffff',
        fontSize: 80,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: '#000000', width: 8 },
        dropShadow: true,
        dropShadowBlur: 20,
        dropShadowColor: '#ff0000',
        dropShadowDistance: 0,
      }),
    });
    this.overlayText.anchor.set(0.5);
    this.overlayText.x = W / 2;
    this.overlayText.y = H / 2;
    this.container.addChild(this.overlayText);

    // Input: split screen touch (left half = P1, right half = P2)
    this.p1Input = new SwipeInput(window, 'left', m => { this.pendingMove1 = m; });
    this.p2Input = new SwipeInput(window, 'right', m => { this.pendingMove2 = m; });
    this.cleanupKb1 = bindKeyboard(KEYBOARD_MAP_P1, m => { this.pendingMove1 = m; });
    this.cleanupKb2 = bindKeyboard(KEYBOARD_MAP_P2, m => { this.pendingMove2 = m; });

    // Control hint
    this.drawControls(W, H);

    // Start countdown
    this.startCountdown();

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();
  }

  private drawControls(W: number, H: number) {
    // P1 zone hint (bottom left)
    const hint1 = new Text({
      text: 'P1: D=Attack  W=High  S=Low  A=Block  Q=Bankai\n← swipe left half of screen',
      style: new TextStyle({ fill: 'rgba(255,255,255,0.35)', fontSize: 11, align: 'left' }),
    });
    hint1.x = 12;
    hint1.y = H - 40;
    this.container.addChild(hint1);

    const hint2 = new Text({
      text: 'P2: →=Attack  ↑=High  ↓=Low  ←=Block  0=Bankai\n→ swipe right half of screen',
      style: new TextStyle({ fill: 'rgba(255,255,255,0.35)', fontSize: 11, align: 'right' }),
    });
    hint2.anchor.set(1, 1);
    hint2.x = W - 12;
    hint2.y = H - 4;
    this.container.addChild(hint2);
  }

  private startCountdown() {
    this.phase = FightPhase.COUNTDOWN;
    this.countdown = COUNTDOWN_DURATION;
    this.overlay.alpha = 0.5;
    this.overlayText.text = String(this.countdown);
    this.overlayText.style.fill = '#ffffff';
  }

  private startRound() {
    this.phase = FightPhase.FIGHTING;
    this.s1.hp = BASE_HP;
    this.s2.hp = BASE_HP;
    this.s1.animState = AnimState.IDLE;
    this.s2.animState = AnimState.IDLE;
    this.p1Fighter.animState = AnimState.IDLE;
    this.p2Fighter.animState = AnimState.IDLE;
    this.roundTimer = ROUND_DURATION;
    this.pendingMove1 = MoveType.NONE;
    this.pendingMove2 = MoveType.NONE;
    this.overlay.alpha = 0;
    this.overlayText.text = '';
  }

  private update(ticker: Ticker) {
    const dt = ticker.deltaMS;
    const now = Date.now();

    if (this.phase === FightPhase.COUNTDOWN) {
      this.countdown -= dt / 1000;
      const remaining = Math.ceil(this.countdown);
      this.overlayText.text = remaining > 0 ? String(remaining) : 'FIGHT!';
      if (this.countdown <= -0.6) {
        this.startRound();
      }
      return;
    }

    if (this.phase === FightPhase.FIGHTING) {
      this.roundTimer -= dt / 1000;
      if (this.roundTimer < 0) this.roundTimer = 0;

      // passive energy gain
      const tick = dt / 1000;
      this.s1.energy = Math.min(MAX_ENERGY, this.s1.energy + ENERGY_GAIN.BANKAI_CHARGE_PER_TICK * tick * 60 * this.s1.bankaiChargeRateMult);
      this.s2.energy = Math.min(MAX_ENERGY, this.s2.energy + ENERGY_GAIN.BANKAI_CHARGE_PER_TICK * tick * 60 * this.s2.bankaiChargeRateMult);

      // resolve moves
      const m1 = this.pendingMove1;
      const m2 = this.pendingMove2;
      this.pendingMove1 = MoveType.NONE;
      this.pendingMove2 = MoveType.NONE;

      if (m1 !== MoveType.NONE) this.applyMove(this.s1, this.s2, this.p1Fighter, this.p2Fighter, m1, 'right');
      if (m2 !== MoveType.NONE) this.applyMove(this.s2, this.s1, this.p2Fighter, this.p1Fighter, m2, 'left');

      // reset anim states
      [{ s: this.s1, f: this.p1Fighter }, { s: this.s2, f: this.p2Fighter }].forEach(({ s, f }) => {
        if (s.animResetAt > 0 && now >= s.animResetAt) {
          s.animResetAt = 0;
          s.animState = s.hp <= 0 ? AnimState.KO : AnimState.IDLE;
          f.animState = s.animState;
        }
        if (s.isSlowed && now >= s.slowedUntil) {
          s.isSlowed = false;
        }
      });

      this.hud.update(
        this.s1.hp, this.s2.hp,
        this.s1.energy, this.s2.energy,
        this.roundTimer, this.round,
        this.s1.roundWins, this.s2.roundWins,
      );

      if ((this.roundTimer <= 0 || this.s1.hp <= 0 || this.s2.hp <= 0) && !this.roundEndTimeout) {
        this.endRound();
      }
    }

    this.p1Fighter.update(dt);
    this.p2Fighter.update(dt);

    const { width: W, height: H } = this.ctx.app.screen;
    this.bankaiEffect.update(dt, W, H);
  }

  private applyMove(
    attacker: LocalFighterState, defender: LocalFighterState,
    attackerFighter: Fighter, defenderFighter: Fighter,
    move: MoveType, dir: 'right' | 'left',
  ) {
    if (move === MoveType.BANKAI) {
      if (attacker.energy < BANKAI_ENERGY_COST) return;
      attacker.energy = 0;
      attackerFighter.animState = AnimState.BANKAI;
      this.scheduleAnimReset(attacker, 800);

      const { width: W, height: H } = this.ctx.app.screen;
      this.bankaiEffect.fire(
        attackerFighter.container.x,
        attackerFighter.container.y - 30,
        dir,
        W, H,
        attacker.bankaiBeamWidthMult,
        attacker.bankaiLeavesZone,
      );

      const blocked = this.isBlocked(defender, move);
      if (!blocked) {
        this.dealDamage(defender, defenderFighter, DAMAGE.BANKAI_BEAM);
      }
      return;
    }

    attackerFighter.animState = moveToAnim(move);
    this.scheduleAnimReset(attacker, 300);

    if (move === MoveType.BLOCK) {
      attacker.isBlocking = true;
      attacker.blockStart = Date.now();
      setTimeout(() => { attacker.isBlocking = false; }, 300);
      return;
    }

    const blocked = this.isBlocked(defender, move);
    if (blocked) {
      attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_BLOCK);
      // counter spark
      if (defender.counterOnPerfectBlock && Date.now() - defender.blockStart < 200) {
        this.dealDamage(attacker, attackerFighter, DAMAGE.COUNTER_HIT);
      }
      return;
    }

    let dmg = move === MoveType.ATTACK ? DAMAGE.ATTACK
      : move === MoveType.HIGH_ATTACK ? DAMAGE.HIGH_ATTACK
      : DAMAGE.LOW_ATTACK;
    dmg = Math.round(dmg * attacker.attackMult / Math.max(1, defender.defenseMult));
    this.dealDamage(defender, defenderFighter, dmg);

    attacker.hitCount++;
    attacker.energy = Math.min(MAX_ENERGY, attacker.energy + ENERGY_GAIN.ON_HIT);

    if (move === MoveType.LOW_ATTACK && attacker.lowAttackSlows) {
      defender.isSlowed = true;
      defender.slowedUntil = Date.now() + 1500;
    }
  }

  private isBlocked(defender: LocalFighterState, move: MoveType): boolean {
    if (!defender.isBlocking) return false;
    if (move === MoveType.HIGH_ATTACK || move === MoveType.BANKAI) return false;
    return true;
  }

  private dealDamage(defender: LocalFighterState, defenderFighter: Fighter, amount: number) {
    defender.hp = Math.max(0, defender.hp - amount);
    defender.energy = Math.min(MAX_ENERGY, defender.energy + ENERGY_GAIN.ON_TAKE_HIT);
    defenderFighter.animState = AnimState.HIT;
    this.scheduleAnimReset(defender, 280);
  }

  private scheduleAnimReset(state: LocalFighterState, ms: number) {
    state.animResetAt = Date.now() + ms;
  }

  private endRound() {
    this.phase = FightPhase.ROUND_END;
    this.roundEndTimeout = setTimeout(() => {}, 0); // sentinel

    const aHp = this.s1.hp;
    const bHp = this.s2.hp;
    let msg = '';
    let color = '#ffffff';

    if (aHp > bHp) {
      this.s1.roundWins++;
      msg = 'P1 WINS ROUND!';
      color = '#4a90d9';
    } else if (bHp > aHp) {
      this.s2.roundWins++;
      msg = 'P2 WINS ROUND!';
      color = '#e05050';
    } else {
      msg = 'DRAW!';
    }

    this.overlay.alpha = 0.6;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;

    const matchOver = this.s1.roundWins >= ROUNDS_TO_WIN || this.s2.roundWins >= ROUNDS_TO_WIN || this.round >= 3;

    if (matchOver) {
      this.matchOver = true;
      setTimeout(() => this.showMatchEnd(), 2000);
    } else {
      this.round++;
      setTimeout(() => {
        this.roundEndTimeout = null;
        this.startCountdown();
      }, 2000);
    }
  }

  private showMatchEnd() {
    const w1 = this.s1.roundWins;
    const w2 = this.s2.roundWins;
    let msg = '';
    let color = '#ffd700';
    let winner: 1 | 2 | 0 = 0;

    if (w1 > w2) { msg = `${this.ctx.player?.username ?? 'P1'} WINS!`; color = '#4a90d9'; winner = 1; }
    else if (w2 > w1) { msg = 'P2 WINS!'; color = '#e05050'; winner = 2; }
    else { msg = 'DRAW!'; }

    this.overlay.alpha = 0.75;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;
    this.overlayText.style.fontSize = 72;

    // Show card picker after 1.5s
    setTimeout(() => {
      this.showCardPicker(winner);
    }, 1500);
  }

  private showCardPicker(winner: 1 | 2 | 0) {
    this.overlay.alpha = 0;
    this.overlayText.text = '';

    const p1Cards = drawRandomCards(3);
    const p2Cards = drawRandomCards(3);

    this.cardPicker = new CardPickerUI(
      this.ctx.app.screen.width,
      this.ctx.app.screen.height,
      p1Cards,
      p2Cards,
      (p1Card, p2Card) => {
        this.applyCardEffect(this.s1, p1Card);
        this.applyCardEffect(this.s2, p2Card);
        this.cardPicker?.destroy();
        this.cardPicker = null;

        // Back to hub or play again
        setTimeout(() => this.ctx.switchScene('hub'), 500);
      },
    );
    this.container.addChild(this.cardPicker.container);
  }

  private applyCardEffect(state: LocalFighterState, card: CardDefinition) {
    state.cards.push(card.id);
    switch (card.effectKey) {
      case 'speedMult': state.speedMult *= card.value; break;
      case 'attackMult': state.attackMult *= card.value; break;
      case 'defenseMult': state.defenseMult *= card.value; break;
      case 'bankaiChargeRateMult': state.bankaiChargeRateMult *= card.value; break;
      case 'heavyHit': state.attackMult *= card.value; state.speedMult *= 0.95; break;
      case 'counterOnPerfectBlock': state.counterOnPerfectBlock = true; break;
      case 'lowAttackSlows': state.lowAttackSlows = true; break;
      case 'thirdHitKnockback': state.thirdHitKnockback = true; break;
      case 'bankaiBeamWidthMult': state.bankaiBeamWidthMult *= card.value; break;
      case 'bankaiActivateFaster': state.bankaiChargeRateMult *= 1.3; break;
      case 'bankaiLeavesZone': state.bankaiLeavesZone = true; break;
    }
  }

  destroy() {
    this.ticker.stop();
    this.ticker.destroy();
    this.p1Input.destroy();
    this.p2Input.destroy();
    this.cleanupKb1();
    this.cleanupKb2();
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.cardPicker?.destroy();
    this.hud.destroy();
    this.bankaiEffect.destroy();
    this.p1Fighter.destroy();
    this.p2Fighter.destroy();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}

function moveToAnim(move: MoveType): AnimState {
  switch (move) {
    case MoveType.ATTACK: return AnimState.ATTACK;
    case MoveType.HIGH_ATTACK: return AnimState.HIGH_ATTACK;
    case MoveType.LOW_ATTACK: return AnimState.LOW_ATTACK;
    case MoveType.BLOCK: return AnimState.BLOCK;
    case MoveType.BANKAI: return AnimState.BANKAI;
    default: return AnimState.IDLE;
  }
}
