import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { GameContext } from '../main';
import { Fighter } from '../game/Fighter';
import { SwipeInput, bindKeyboard, KEYBOARD_MAP_P1, KEYBOARD_MAP_P2 } from '../game/SwipeInput';
import { BankaiEffect } from '../game/BankaiEffect';
import { HUD } from '../ui/HUD';
import { CardPickerUI } from '../game/CardPicker';
import {
  defaultFighterState,
  resolveMove,
  tickPassiveEnergy,
  checkRoundEnd,
  applyRoundWin,
  resetForRound,
} from '../game/CombatEngine';
import type { FighterState } from '../game/CombatEngine';
import { MoveType, AnimState } from '@ahf/shared';
import type { CardDefinition } from '@ahf/shared';
import { drawRandomCards } from '@ahf/shared';
import { COUNTDOWN_DURATION, ROUND_DURATION, ROUNDS_TO_WIN } from '@ahf/shared';

type FightPhase = 'countdown' | 'fighting' | 'round_end' | 'card_pick' | 'match_end';

export class FightScene {
  private container: Container;
  private ticker: Ticker;
  private hud: HUD;
  private p1Fighter: Fighter;
  private p2Fighter: Fighter;
  private bankaiEffect: BankaiEffect;
  private s1: FighterState;
  private s2: FighterState;
  private p1Input: SwipeInput;
  private p2Input: SwipeInput;
  private cleanupKb1: () => void;
  private cleanupKb2: () => void;
  private phase: FightPhase = 'countdown';
  private round = 1;
  private roundTimer = ROUND_DURATION; // seconds
  private countdown = COUNTDOWN_DURATION;
  private pendingMove1: MoveType = MoveType.NONE;
  private pendingMove2: MoveType = MoveType.NONE;
  private overlay: Graphics;
  private overlayText: Text;
  private roundEndScheduled = false;
  private cardPicker: CardPickerUI | null = null;
  private destroyed = false;
  private impactShakeMs = 0;
  private impactShakeStrength = 0;

  // Track every setTimeout so we can cancel on destroy
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  // Track per-fighter anim reset timers
  private animResets = new Map<'p1' | 'p2', ReturnType<typeof setTimeout>>();

  constructor(private ctx: GameContext, _opts: { roomId?: string; local?: boolean }) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const { width: W, height: H } = ctx.app.screen;

    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x1a1a2e);
    bg.rect(0, H * 0.72, W, H * 0.28).fill(0x16213e);
    bg.rect(W * 0.05, H * 0.55, W * 0.9, 4).fill(0xffd700);
    bg.rect(W * 0.05, H * 0.62, W * 0.9, 4).fill(0xffd700);
    [W * 0.05, W * 0.95].forEach(x => {
      bg.rect(x - 6, H * 0.5, 12, H * 0.25).fill(0xcccccc);
    });
    this.container.addChild(bg);

    this.bankaiEffect = new BankaiEffect();
    this.container.addChild(this.bankaiEffect.container);

    const fightY = H * 0.62;
    this.s1 = defaultFighterState();
    this.s2 = defaultFighterState();

    const p1Name = ctx.player?.username ?? 'Player 1';

    this.p1Fighter = new Fighter({ name: p1Name, outfitColor: 0x4a90d9, auraColor: 0x7b2fff, facing: 'right' });
    this.p1Fighter.container.x = W * 0.28;
    this.p1Fighter.container.y = fightY;
    this.container.addChild(this.p1Fighter.container);

    this.p2Fighter = new Fighter({ name: 'Player 2', outfitColor: 0xe05050, auraColor: 0xff8c00, facing: 'left' });
    this.p2Fighter.container.x = W * 0.72;
    this.p2Fighter.container.y = fightY;
    this.container.addChild(this.p2Fighter.container);

    this.hud = new HUD(W, H, { p1Name, p2Name: 'Player 2', p1Color: 0x4a90d9, p2Color: 0xe05050 });
    this.container.addChild(this.hud.container);

    this.overlay = new Graphics();
    this.overlay.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.5 });
    this.overlay.alpha = 0;
    this.container.addChild(this.overlay);

    this.overlayText = new Text({
      text: '',
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 80,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: '#000000', width: 8 },
        dropShadow: { blur: 20, color: '#ff0000', distance: 0, angle: 0 },
      }),
    });
    this.overlayText.anchor.set(0.5);
    this.overlayText.x = W / 2;
    this.overlayText.y = H / 2;
    this.container.addChild(this.overlayText);

    this.drawControls(W, H);

    this.p1Input = new SwipeInput(window, 'left', m => { this.pendingMove1 = m; });
    this.p2Input = new SwipeInput(window, 'right', m => { this.pendingMove2 = m; });
    this.cleanupKb1 = bindKeyboard(KEYBOARD_MAP_P1, m => { this.pendingMove1 = m; });
    this.cleanupKb2 = bindKeyboard(KEYBOARD_MAP_P2, m => { this.pendingMove2 = m; });

    this.startCountdown();

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();
  }

  // ── Safe timeout wrapper ───────────────────────────────────────────────────

  private after(ms: number, fn: () => void): void {
    if (this.destroyed) return;
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timeouts.add(id);
  }

  // ── Anim reset (debounced per fighter) ────────────────────────────────────

  private scheduleAnimReset(key: 'p1' | 'p2', state: FighterState, fighter: Fighter, ms: number) {
    const existing = this.animResets.get(key);
    if (existing) clearTimeout(existing);
    const id = setTimeout(() => {
      this.animResets.delete(key);
      if (!this.destroyed) {
        fighter.animState = state.hp <= 0 ? AnimState.KO : AnimState.IDLE;
      }
    }, ms);
    this.animResets.set(key, id);
  }

  // ── Scene phases ──────────────────────────────────────────────────────────

  private drawControls(W: number, H: number) {
    const hint1 = new Text({
      text: 'P1: D=Atk  W=High  S=Low  A=Block  Q=Bankai\n← swipe left half',
      style: new TextStyle({ fill: 0x888888, fontSize: 11 }),
    });
    hint1.x = 12;
    hint1.y = H - 38;
    this.container.addChild(hint1);

    const hint2 = new Text({
      text: 'P2: →=Atk  ↑=High  ↓=Low  ←=Block  0=Bankai\nswipe right half →',
      style: new TextStyle({ fill: 0x888888, fontSize: 11, align: 'right' }),
    });
    hint2.anchor.set(1, 1);
    hint2.x = W - 12;
    hint2.y = H - 4;
    this.container.addChild(hint2);
  }

  private startCountdown() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_DURATION;
    this.overlay.alpha = 0.5;
    this.overlayText.text = String(this.countdown);
    this.overlayText.style.fill = 0xffffff;
  }

  private startRound() {
    this.phase = 'fighting';
    resetForRound(this.s1);
    resetForRound(this.s2);
    this.p1Fighter.animState = AnimState.IDLE;
    this.p2Fighter.animState = AnimState.IDLE;
    this.roundTimer = ROUND_DURATION;
    this.pendingMove1 = MoveType.NONE;
    this.pendingMove2 = MoveType.NONE;
    this.roundEndScheduled = false;
    this.overlay.alpha = 0;
    this.overlayText.text = '';
  }

  // ── Ticker ────────────────────────────────────────────────────────────────

  private update(ticker: Ticker) {
    if (this.destroyed) return;
    const dt = ticker.deltaMS;

    this.updateImpactShake(dt);

    if (this.phase === 'countdown') {
      this.countdown -= dt / 1000;
      this.overlayText.text = Math.ceil(this.countdown) > 0 ? String(Math.ceil(this.countdown)) : 'FIGHT!';
      if (this.countdown <= -0.6) this.startRound();
      return;
    }

    if (this.phase === 'fighting') {
      this.roundTimer -= dt / 1000;
      if (this.roundTimer < 0) this.roundTimer = 0;

      tickPassiveEnergy(this.s1, this.s2, dt);

      const m1 = this.pendingMove1;
      const m2 = this.pendingMove2;
      this.pendingMove1 = MoveType.NONE;
      this.pendingMove2 = MoveType.NONE;

      if (m1 !== MoveType.NONE) this.applyMoveWithVisuals(this.s1, this.s2, this.p1Fighter, this.p2Fighter, m1, 'p1', 'right');
      if (m2 !== MoveType.NONE) this.applyMoveWithVisuals(this.s2, this.s1, this.p2Fighter, this.p1Fighter, m2, 'p2', 'left');

      this.hud.update(
        this.s1.hp, this.s2.hp,
        this.s1.energy, this.s2.energy,
        this.roundTimer, this.round,
        this.s1.roundWins, this.s2.roundWins,
      );

      if (!this.roundEndScheduled) {
        const end = checkRoundEnd(this.s1, this.s2, this.roundTimer);
        if (end) {
          this.roundEndScheduled = true;
          this.endRound(end.winner);
        }
      }
    }

    this.p1Fighter.update(dt);
    this.p2Fighter.update(dt);
    const { width: W, height: H } = this.ctx.app.screen;
    this.bankaiEffect.update(dt, W, H);
  }

  private updateImpactShake(dt: number) {
    if (this.impactShakeMs <= 0) {
      this.container.x = 0;
      this.container.y = 0;
      this.impactShakeStrength = 0;
      return;
    }
    this.impactShakeMs = Math.max(0, this.impactShakeMs - dt);
    const strength = this.impactShakeStrength * (this.impactShakeMs / 180);
    this.container.x = (Math.random() - 0.5) * strength;
    this.container.y = (Math.random() - 0.5) * strength;
  }

  private shake(strength: number, ms = 180) {
    this.impactShakeStrength = Math.max(this.impactShakeStrength, strength);
    this.impactShakeMs = Math.max(this.impactShakeMs, ms);
  }

  // ── Move application with visual feedback ─────────────────────────────────

  private applyMoveWithVisuals(
    attacker: FighterState, defender: FighterState,
    attackerFighter: Fighter, defenderFighter: Fighter,
    move: MoveType,
    attackerKey: 'p1' | 'p2',
    dir: 'right' | 'left',
  ) {
    // Show Bankai screen effect before resolving
    if (move === MoveType.BANKAI && attacker.energy >= 100) {
      const { width: W, height: H } = this.ctx.app.screen;
      this.bankaiEffect.fire(attackerFighter.container.x, attackerFighter.container.y - 30, dir, W, H, attacker.bankaiBeamWidthMult, attacker.bankaiLeavesZone);
      this.shake(10, 260);
    }

    const result = resolveMove(attacker, defender, move);
    if (result.noop) return;

    // Attacker anim
    if (move !== MoveType.NONE) {
      attackerFighter.animState = moveToAnim(move);
      const resetMs = move === MoveType.BANKAI ? 650 : move === MoveType.BLOCK ? 360 : 320;
      this.scheduleAnimReset(attackerKey, attacker, attackerFighter, resetMs);
    }

    // Defender hit flash
    if (result.defenderHpDelta < 0 && !result.blocked) {
      const defKey: 'p1' | 'p2' = attackerKey === 'p1' ? 'p2' : 'p1';
      defenderFighter.animState = AnimState.HIT;
      this.shake(move === MoveType.BANKAI ? 14 : 6, move === MoveType.BANKAI ? 260 : 150);
      this.scheduleAnimReset(defKey, defender, defenderFighter, 280);
    }

    // KO
    if (defender.hp <= 0) {
      defenderFighter.animState = AnimState.KO;
    }
  }

  // ── Round / match management ──────────────────────────────────────────────

  private endRound(winner: 1 | 2 | 'draw' | null) {
    this.phase = 'round_end';
    let msg = 'DRAW!';
    let color = 0xffffff;
    if (winner === 1) { msg = 'P1 WINS ROUND!'; color = 0x4a90d9; }
    else if (winner === 2) { msg = 'P2 WINS ROUND!'; color = 0xe05050; }

    this.overlay.alpha = 0.6;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;

    const r = applyRoundWin(this.s1, this.s2, winner, this.round, ROUNDS_TO_WIN);
    if (r.matchOver) {
      this.after(2000, () => this.showMatchEnd(r.matchWinner));
    } else {
      this.round++;
      this.after(2000, () => this.startCountdown());
    }
  }

  private showMatchEnd(winner: 1 | 2 | 'draw' | null) {
    let msg = 'DRAW!';
    let color = 0xffd700;
    if (winner === 1) { msg = `${this.ctx.player?.username ?? 'P1'} WINS!`; color = 0x4a90d9; }
    else if (winner === 2) { msg = 'P2 WINS!'; color = 0xe05050; }

    this.overlay.alpha = 0.75;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;
    (this.overlayText.style as TextStyle).fontSize = 72;

    this.after(1500, () => this.showCardPicker());
  }

  private showCardPicker() {
    if (this.destroyed) return;
    this.overlay.alpha = 0;
    this.overlayText.text = '';

    const p1Cards = drawRandomCards(3);
    const p2Cards = drawRandomCards(3);

    this.cardPicker = new CardPickerUI(
      this.ctx.app.screen.width,
      this.ctx.app.screen.height,
      p1Cards,
      p2Cards,
      (_p1Card: CardDefinition, _p2Card: CardDefinition) => {
        if (this.destroyed) return;
        this.cardPicker?.destroy();
        this.cardPicker = null;
        this.after(400, () => this.ctx.switchScene('hub'));
      },
    );
    this.container.addChild(this.cardPicker.container);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    // Cancel all pending timeouts
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts.clear();
    this.animResets.forEach(id => clearTimeout(id));
    this.animResets.clear();

    this.ticker.stop();
    this.ticker.destroy();
    this.p1Input.destroy();
    this.p2Input.destroy();
    this.cleanupKb1();
    this.cleanupKb2();
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
