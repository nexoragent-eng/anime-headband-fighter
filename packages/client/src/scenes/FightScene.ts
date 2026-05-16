import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { GameContext } from '../main';
import { Fighter } from '../game/Fighter';
import { SwipeInput, bindKeyboard, KEYBOARD_MAP_P1, KEYBOARD_MAP_P2 } from '../game/SwipeInput';
import { BankaiEffect } from '../game/BankaiEffect';
import { HUD } from '../ui/HUD';
import { CardRewardUI } from '../game/CardRewardUI';
import {
  defaultFighterState,
  resolveMove,
  tickPassiveEnergy,
  checkRoundEnd,
  applyRoundWin,
  resetForRound,
} from '../game/CombatEngine';
import type { FighterState as LocalFighterState } from '../game/CombatEngine';
import { MoveType, AnimState } from '@ahf/shared';
import type { CardDefinition } from '@ahf/shared';
import { getPlayerCardCollection, claimCardRewardForPlayer } from '../game/CardCollectionStore';
import { NPC_ROSTER, npcAITick, npcRng, type NPCProfile } from '../../../shared/src/npcs';
import { drawRewardCards, getCardById } from '@ahf/shared';
import {
  COUNTDOWN_DURATION, ROUND_DURATION, ROUNDS_TO_WIN,
  DODGE_IFRAME_MS, DODGE_COOLDOWN_MS, HIT_STOP_MS,
} from '@ahf/shared';
import { MOVE_TIMINGS, INPUT_BUFFER_MS, canBufferMove, isAttackMove } from '../game/CombatTiming';
import { Client } from 'colyseus.js';
import type { Room } from 'colyseus.js';
import { SERVER_URL } from '../config';

// ── Constants ──────────────────────────────────────────────────────────────────

const MOVE_SPEED_PX_S = 160;   // pixels per second while moving
const ARENA_MARGIN   = 0.09;   // fraction of screen width kept clear on each side
const MIN_SEP_PX     = 72;     // minimum centre-to-centre gap between fighters

const LUNGE_PX: Partial<Record<MoveType, number>> = {
  [MoveType.ATTACK]:       20,
  [MoveType.HEAVY_ATTACK]: 36,
};

// Spine playback speed per attack — light = snappy, heavy = weighty
const ANIM_SPEED: Partial<Record<MoveType, number>> = {
  [MoveType.ATTACK]:       1.30,
  [MoveType.HEAVY_ATTACK]: 0.80,
  [MoveType.BANKAI]:       0.85,
};

// ── Types ─────────────────────────────────────────────────────────────────────

type FightPhase = 'countdown' | 'fighting' | 'round_end' | 'card_pick' | 'match_end';
type FighterKey = 'p1' | 'p2';

interface ActionRuntime {
  lockedUntil: number;
  bufferedMove: MoveType;
  bufferedAt: number;
  currentMove: MoveType;
  dodgeCooldownUntil: number;
  hitStopUntil: number;
}

function freshActionRuntime(): ActionRuntime {
  return {
    lockedUntil: 0,
    bufferedMove: MoveType.NONE,
    bufferedAt: 0,
    currentMove: MoveType.NONE,
    dodgeCooldownUntil: 0,
    hitStopUntil: 0,
  };
}

function moveToAnim(move: MoveType): AnimState {
  switch (move) {
    case MoveType.ATTACK:       return AnimState.ATTACK;
    case MoveType.HEAVY_ATTACK: return AnimState.HEAVY_ATTACK;
    case MoveType.BLOCK:        return AnimState.BLOCK;
    case MoveType.DODGE:        return AnimState.DODGE;
    case MoveType.BANKAI:       return AnimState.BANKAI;
    default:                    return AnimState.IDLE;
  }
}

// ── FightScene ────────────────────────────────────────────────────────────────

export class FightScene {
  private container: Container;
  private ticker: Ticker;
  private hud: HUD;
  private p1Fighter: Fighter;
  private p2Fighter: Fighter;
  private bankaiEffect: BankaiEffect;
  private overlay: Graphics;
  private overlayText: Text;
  private cardPicker: CardRewardUI | null = null;
  private destroyed = false;
  private impactShakeMs = 0;
  private impactShakeStrength = 0;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private animResets = new Map<'p1' | 'p2', ReturnType<typeof setTimeout>>();

  // ── Network mode ──────────────────────────────────────────────────────────
  private fightRoom: Room | null = null;
  private myRole: 'A' | 'B' = 'A';
  private netPhase = '';
  private prevMyAnim = '';
  private prevOppAnim = '';
  private cardPickShown = false;
  private oppLooksApplied = false;
  private netInput: SwipeInput | null = null;
  private netCleanupKb: (() => void) | null = null;

  // ── NPC / local mode ──────────────────────────────────────────────────────
  private s1!: LocalFighterState;
  private s2!: LocalFighterState;
  private p1Input: SwipeInput | undefined;
  private p2Input: SwipeInput | undefined;
  private cleanupKb1: (() => void) | undefined;
  private cleanupKb2: (() => void) | undefined;
  private cleanupMovementKb: (() => void) | undefined;
  private phase: FightPhase = 'countdown';
  private round = 1;
  private roundTimer = ROUND_DURATION;
  private countdown = COUNTDOWN_DURATION;
  private actionRuntime!: Record<FighterKey, ActionRuntime>;
  private roundEndScheduled = false;
  private npcProfile: NPCProfile | null = null;
  private npcRng: (() => number) | null = null;
  private npcInputCooldown = 0;
  private npcRewardGranted = false;
  // Movement
  private p1MoveDir: -1 | 0 | 1 = 0;
  private p2MoveDir: -1 | 0 | 1 = 0;
  private arenaLeft = 0;
  private arenaRight = 0;

  constructor(
    private ctx: GameContext,
    opts: { reservation?: unknown; npcId?: string; local?: boolean },
  ) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const { width: W, height: H } = ctx.app.screen;

    // Background
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
    const cos = ctx.player?.cosmetics;
    const p1Name = ctx.player?.username ?? 'Player 1';

    this.p1Fighter = new Fighter({
      name: p1Name,
      facing: 'right',
      auraColor: cos?.auraColor ? parseInt(cos.auraColor.replace('#', ''), 16) : 0x7b2fff,
      looks: {
        bodyObject:   cos?.bodyObject   ?? 1,
        headObject:   cos?.headObject   ?? 0,
        hairObject:   cos?.hairObject   ?? 1,
        handObject:   cos?.handObject   ?? 1,
        cloakObject:  cos?.cloakObject  ?? 0,
        eyeType:      cos?.eyeType      ?? 'Basic',
        makeupIndex:  cos?.makeupIndex  ?? 0,
        supportIndex: cos?.supportIndex ?? 0,
      },
    });
    this.p1Fighter.container.x = W * 0.28;
    this.p1Fighter.container.y = fightY;
    this.container.addChild(this.p1Fighter.container);

    const npcForLooks = opts.npcId ? NPC_ROSTER.find(n => n.id === opts.npcId) ?? null : null;
    const p2Aura = npcForLooks?.auraColor ?? 0xff8c00;
    this.p2Fighter = new Fighter({
      name: npcForLooks?.name ?? 'Opponent',
      auraColor: p2Aura,
      facing: 'left',
      looks: { bodyObject: 2, hairObject: 2, handObject: 2, eyeType: 'Anger' },
    });
    this.p2Fighter.container.x = W * 0.72;
    this.p2Fighter.container.y = fightY;
    this.container.addChild(this.p2Fighter.container);

    this.hud = new HUD(W, H, {
      p1Name,
      p2Name: npcForLooks?.name ?? 'Opponent',
      p1Color: 0x4a90d9,
      p2Color: p2Aura,
    });
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

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();

    // Mode selection
    if (opts.reservation) {
      this.setupNetworkMode(opts.reservation);
    } else {
      this.drawControls(W, H);
      this.setupLocalMode(opts.npcId);
    }
  }

  // ── Safe timeout ──────────────────────────────────────────────────────────

  private after(ms: number, fn: () => void): void {
    if (this.destroyed) return;
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timeouts.add(id);
  }

  // ── Network mode ──────────────────────────────────────────────────────────

  private setupNetworkMode(reservation: unknown) {
    this.overlay.alpha = 0.6;
    this.overlayText.text = 'Connecting...';
    (this.overlayText.style as TextStyle).fontSize = 36;

    const sendMove = (move: MoveType) => {
      if (!this.fightRoom || this.netPhase !== 'fighting') return;
      this.fightRoom.send('input', { move });
    };

    this.netInput = new SwipeInput(window, 'full', sendMove);
    this.netCleanupKb = bindKeyboard(KEYBOARD_MAP_P1, sendMove);

    void this.connectFightRoom(reservation);
  }

  private async connectFightRoom(reservation: unknown) {
    const client = new Client(SERVER_URL);
    try {
      const room = await client.consumeSeatReservation(reservation as Parameters<typeof client.consumeSeatReservation>[0]);
      if (this.destroyed) { void room.leave(); return; }
      this.fightRoom = room;
    } catch (e) {
      console.error('[FightScene] consumeSeatReservation failed:', e);
      if (!this.destroyed) this.after(500, () => this.ctx.switchScene('hub'));
      return;
    }

    // Determine role
    const state = (this.fightRoom as any).state;
    const myId = this.ctx.player?.id ?? 'guest';
    this.myRole = state?.playerA?.playerId === myId ? 'A' : 'B';

    // Phase listener (Colyseus schema .listen API)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (state as any)?.listen?.('phase', (phase: string) => {
      if (!this.destroyed) this.handleNetPhase(phase);
    });

    // Apply opponent looks as soon as their playerId is populated.
    // Player B always arrives after A, so A waits for B via .listen.
    const oppState = this.myRole === 'A' ? state.playerB : state.playerA;
    this.applyOpponentLooks(oppState);
    oppState?.listen?.('playerId', (_val: string) => {
      if (!this.destroyed) this.applyOpponentLooks(this.myRole === 'A' ? state.playerB : state.playerA);
    });

    // Handle room disconnect (after card pick, server calls disconnect())
    this.fightRoom.onLeave(() => {
      if (!this.destroyed && this.netPhase !== 'hub') {
        this.netPhase = 'hub';
        this.after(400, () => this.ctx.switchScene('hub'));
      }
    });

    // Trigger for current phase (we might have joined mid-countdown)
    this.handleNetPhase(state.phase as string);
  }

  private applyOpponentLooks(oppState: any) {
    if (this.oppLooksApplied || !oppState?.playerId || this.destroyed) return;
    this.oppLooksApplied = true;

    const { width: W, height: H } = this.ctx.app.screen;
    const fightY = H * 0.62;
    const auraStr: string = oppState.auraColor ?? '#ff8c00';
    const auraHex = parseInt(auraStr.replace('#', ''), 16) || 0xff8c00;

    // Recreate p2Fighter with the correct cosmetics and aura colour.
    const p1Idx = this.container.getChildIndex(this.p1Fighter.container);
    this.container.removeChild(this.p2Fighter.container);
    this.p2Fighter.destroy();

    this.p2Fighter = new Fighter({
      name: (oppState.username as string) ?? 'Opponent',
      auraColor: auraHex,
      facing: 'left',
      looks: {
        bodyObject:   (oppState.bodyObject   as number) ?? 1,
        headObject:   (oppState.headObject   as number) ?? 0,
        hairObject:   (oppState.hairObject   as number) ?? 1,
        handObject:   (oppState.handObject   as number) ?? 1,
        cloakObject:  (oppState.cloakObject  as number) ?? 0,
        eyeType:      ((oppState.eyeType as string) ?? 'Basic') as 'Basic' | 'Anger' | 'laugh',
        makeupIndex:  (oppState.makeupIndex  as number) ?? 0,
        supportIndex: (oppState.supportIndex as number) ?? 0,
      },
    });
    this.p2Fighter.container.x = W * 0.72;
    this.p2Fighter.container.y = fightY;
    this.container.addChildAt(this.p2Fighter.container, p1Idx + 1);

    // Reset anim tracking so the new fighter picks up the current server state next frame.
    this.prevOppAnim = '';
  }

  private handleNetPhase(phase: string) {
    this.netPhase = phase;

    if (phase === 'countdown') {
      this.overlay.alpha = 0.5;
      (this.overlayText.style as TextStyle).fontSize = 80;
      this.overlayText.style.fill = 0xffffff;
    } else if (phase === 'fighting') {
      this.overlay.alpha = 0;
      this.overlayText.text = '';
      this.cardPickShown = false;
    } else if (phase === 'round_end') {
      this.showRoundEndOverlay();
    } else if (phase === 'card_pick') {
      this.showMatchEndOverlay();
      this.after(1500, () => this.showNetCardPicker());
    }
  }

  private showRoundEndOverlay() {
    const state = (this.fightRoom as any)?.state;
    const winnerId = (state?.winnerId as string) ?? '';
    const myId = this.ctx.player?.id ?? 'guest';

    let msg = 'DRAW!';
    let color = 0xffffff;
    if (winnerId && winnerId === myId) { msg = 'ROUND WON!'; color = 0x4a90d9; }
    else if (winnerId) { msg = 'ROUND LOST'; color = 0xe05050; }

    this.overlay.alpha = 0.6;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;
    (this.overlayText.style as TextStyle).fontSize = 60;
  }

  private showMatchEndOverlay() {
    const state = (this.fightRoom as any)?.state;
    const matchWinnerId = (state?.matchWinnerId as string) ?? '';
    const myId = this.ctx.player?.id ?? 'guest';

    let msg = 'DRAW!';
    let color = 0xffd700;
    if (matchWinnerId && matchWinnerId === myId) {
      msg = `${this.ctx.player?.username ?? 'YOU'} WIN!`;
      color = 0x4a90d9;
      this.p1Fighter.animState = AnimState.WIN;
    } else if (matchWinnerId) {
      const oppState = this.myRole === 'A' ? (state as any)?.playerB : (state as any)?.playerA;
      msg = `${(oppState?.username as string) ?? 'OPPONENT'} WINS!`;
      color = 0xe05050;
      this.p2Fighter.animState = AnimState.WIN;
    }

    this.overlay.alpha = 0.75;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;
    (this.overlayText.style as TextStyle).fontSize = 72;
  }

  private showNetCardPicker() {
    if (this.destroyed || this.cardPickShown) return;
    const state = (this.fightRoom as any)?.state;
    if (!state) return;

    const myCards: unknown[] = Array.from(
      (this.myRole === 'A' ? state.cardOptionsA : state.cardOptionsB) ?? [],
    );

    if (myCards.length === 0) {
      // Cards not pushed yet — retry briefly
      this.cardPickShown = false;
      this.after(250, () => this.showNetCardPicker());
      return;
    }
    this.cardPickShown = true;

    const cardDefs: CardDefinition[] = myCards
      .map((c) => getCardById((c as { id: string }).id))
      .filter(Boolean) as CardDefinition[];

    this.overlay.alpha = 0;
    this.overlayText.text = '';

    const collection = getPlayerCardCollection(this.ctx.player);
    this.cardPicker = new CardRewardUI(
      this.ctx.app.screen.width,
      this.ctx.app.screen.height,
      cardDefs,
      collection,
      (card: CardDefinition) => {
        if (this.destroyed) return;
        this.fightRoom?.send('card_pick', { cardId: card.id });
        this.cardPicker?.destroy();
        this.cardPicker = null;
        this.overlay.alpha = 0.6;
        this.overlayText.text = `${card.name} selected`;
        (this.overlayText.style as TextStyle).fontSize = 36;
        this.after(1200, () => this.ctx.switchScene('hub'));
      },
    );
    this.container.addChild(this.cardPicker.container);
  }

  // ── Network update (per-frame) ────────────────────────────────────────────

  private updateNetwork(dt: number) {
    const state = (this.fightRoom as any)?.state;
    if (!state?.playerA) return;

    const me = this.myRole === 'A' ? state.playerA : state.playerB;
    const opp = this.myRole === 'A' ? state.playerB : state.playerA;

    // Drive animations from server state
    const myAnim = me?.animState as string;
    const oppAnim = opp?.animState as string;
    if (myAnim && myAnim !== this.prevMyAnim) {
      this.prevMyAnim = myAnim;
      this.p1Fighter.animState = myAnim as AnimState;
    }
    if (oppAnim && oppAnim !== this.prevOppAnim) {
      this.prevOppAnim = oppAnim;
      this.p2Fighter.animState = oppAnim as AnimState;
    }

    // Countdown number
    if (this.netPhase === 'countdown') {
      const cd = Math.ceil(state.countdown as number);
      this.overlayText.text = cd > 0 ? String(cd) : 'FIGHT!';
    }

    // HUD
    if (this.netPhase === 'fighting' || this.netPhase === 'round_end') {
      this.hud.update(
        me?.hp ?? 0, opp?.hp ?? 0,
        me?.energy ?? 0, opp?.energy ?? 0,
        state.roundTimer ?? 0, state.round ?? 1,
        me?.roundWins ?? 0, opp?.roundWins ?? 0,
      );
    }

    this.p1Fighter.update(dt);
    this.p2Fighter.update(dt);
  }

  // ── Local / NPC mode ──────────────────────────────────────────────────────

  private setupLocalMode(npcId?: string) {
    this.s1 = defaultFighterState();
    this.s2 = defaultFighterState();
    this.applyActiveCardLoadout();
    this.actionRuntime = { p1: freshActionRuntime(), p2: freshActionRuntime() };

    this.npcProfile = npcId ? NPC_ROSTER.find(n => n.id === npcId) ?? null : null;
    this.npcRng = this.npcProfile ? npcRng(Date.now() & 0xfffffff) : null;

    this.p1Input = new SwipeInput(window, 'left', m => this.queueMove('p1', m));
    this.p2Input = new SwipeInput(window, 'right', m => this.queueMove('p2', m));
    this.cleanupKb1 = bindKeyboard(KEYBOARD_MAP_P1, m => this.queueMove('p1', m));
    this.cleanupKb2 = bindKeyboard(KEYBOARD_MAP_P2, m => this.queueMove('p2', m));

    // Arena bounds (inner 82 % of screen)
    const { width: W } = this.ctx.app.screen;
    this.arenaLeft  = W * ARENA_MARGIN;
    this.arenaRight = W * (1 - ARENA_MARGIN);

    this.cleanupMovementKb = this.bindLocalMovementKb();
    this.startCountdown();
  }

  // Tracks held movement keys and updates p1/p2MoveDir continuously.
  private bindLocalMovementKb(): () => void {
    const held = new Set<string>();
    const P1L = new Set(['ArrowLeft']);
    const P1R = new Set(['ArrowRight']);
    const P2L = new Set(['Numpad4']);
    const P2R = new Set(['Numpad6']);
    const update = () => {
      this.p1MoveDir = [...P1L].some(k => held.has(k)) ? -1 : [...P1R].some(k => held.has(k)) ? 1 : 0;
      this.p2MoveDir = [...P2L].some(k => held.has(k)) ? -1 : [...P2R].some(k => held.has(k)) ? 1 : 0;
    };
    const onDown = (e: KeyboardEvent) => { held.add(e.code); update(); };
    const onUp   = (e: KeyboardEvent) => { held.delete(e.code); update(); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  }

  // Dodge direction: follow held movement key, else dodge away from opponent.
  private getDodgeDir(key: FighterKey): -1 | 1 {
    const moveDir = key === 'p1' ? this.p1MoveDir : this.p2MoveDir;
    if (moveDir !== 0) return moveDir as -1 | 1;
    const selfX = key === 'p1' ? this.p1Fighter.container.x : this.p2Fighter.container.x;
    const oppX  = key === 'p1' ? this.p2Fighter.container.x : this.p1Fighter.container.x;
    return selfX < oppX ? -1 : 1; // default: away from opponent
  }

  // Direction the NPC (p2) should step this frame.
  private calcNpcMoveDir(): -1 | 0 | 1 {
    const dx   = this.p2Fighter.container.x - this.p1Fighter.container.x;
    const dist = Math.abs(dx);
    const sign = (dx > 0 ? 1 : -1) as 1 | -1;
    if (dist > 210) return -sign as -1 | 0 | 1; // too far → approach
    if (dist < 80)  return  sign as -1 | 0 | 1; // too close → retreat
    return 0;
  }

  // ── Ticker ────────────────────────────────────────────────────────────────

  private update(ticker: Ticker) {
    if (this.destroyed) return;
    const dt = ticker.deltaMS;
    const { width: W, height: H } = this.ctx.app.screen;

    this.updateImpactShake(dt);
    this.bankaiEffect.update(dt, W, H);

    if (this.fightRoom !== null) {
      this.updateNetwork(dt);
    } else {
      this.updateLocal(dt);
    }
  }

  private updateLocal(dt: number) {
    if (this.phase === 'countdown') {
      this.countdown -= dt / 1000;
      this.overlayText.text = Math.ceil(this.countdown) > 0 ? String(Math.ceil(this.countdown)) : 'FIGHT!';
      if (this.countdown <= -0.6) this.startRound();
      this.p1Fighter.update(dt);
      this.p2Fighter.update(dt);
      return;
    }

    if (this.phase === 'fighting') {
      this.roundTimer -= dt / 1000;
      if (this.roundTimer < 0) this.roundTimer = 0;

      tickPassiveEnergy(this.s1, this.s2, dt);

      if (this.npcProfile && this.npcRng) this.updateNpcInput(dt);

      // ── Fighter movement ────────────────────────────────────────────────
      const nowPerf = performance.now();
      const mdt     = dt / 1000;

      const p1Free = nowPerf >= this.actionRuntime.p1.lockedUntil && Date.now() >= this.s1.hitStunUntil;
      if (p1Free && this.p1MoveDir !== 0) {
        this.p1Fighter.container.x = Math.max(this.arenaLeft, Math.min(this.arenaRight,
          this.p1Fighter.container.x + this.p1MoveDir * MOVE_SPEED_PX_S * mdt,
        ));
      }

      const p2Dir  = this.npcProfile ? this.calcNpcMoveDir() : this.p2MoveDir;
      const p2Free = nowPerf >= this.actionRuntime.p2.lockedUntil && Date.now() >= this.s2.hitStunUntil;
      if (p2Free && p2Dir !== 0) {
        this.p2Fighter.container.x = Math.max(this.arenaLeft, Math.min(this.arenaRight,
          this.p2Fighter.container.x + p2Dir * MOVE_SPEED_PX_S * mdt,
        ));
      }

      // Keep fighters from overlapping
      const sep = this.p2Fighter.container.x - this.p1Fighter.container.x;
      if (sep < MIN_SEP_PX) {
        const push = (MIN_SEP_PX - sep) / 2;
        this.p1Fighter.container.x = Math.max(this.arenaLeft,  this.p1Fighter.container.x - push);
        this.p2Fighter.container.x = Math.min(this.arenaRight, this.p2Fighter.container.x + push);
      }

      this.tryStartBufferedAction('p1');
      this.tryStartBufferedAction('p2');

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

    const now = performance.now();
    if (now >= this.actionRuntime.p1.hitStopUntil) this.p1Fighter.update(dt);
    if (now >= this.actionRuntime.p2.hitStopUntil) this.p2Fighter.update(dt);
  }

  private updateNpcInput(dt: number) {
    if (!this.npcProfile || !this.npcRng || this.phase !== 'fighting') return;
    this.npcInputCooldown -= dt;
    if (this.npcInputCooldown > 0) return;

    const tierDelay = this.npcProfile.tier === 'gold' ? 430 : this.npcProfile.tier === 'silver' ? 620 : 820;
    const jitter = this.npcRng() * 260;
    this.npcInputCooldown = tierDelay + jitter;
    this.queueMove('p2', npcAITick(
      this.npcProfile,
      this.s2.hp, this.s2.energy,
      this.s1.hp, this.s1.energy,
      this.npcRng,
    ));
  }

  private updateImpactShake(dt: number) {
    if (this.impactShakeMs <= 0) {
      this.container.x = 0; this.container.y = 0;
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

  // ── Input buffering ───────────────────────────────────────────────────────

  private queueMove(key: FighterKey, move: MoveType) {
    if (this.phase !== 'fighting' || !canBufferMove(move)) return;
    const now = performance.now();
    const runtime = this.actionRuntime[key];

    if (now >= runtime.lockedUntil) {
      this.startTimedAction(key, move, now);
      return;
    }
    runtime.bufferedMove = move;
    runtime.bufferedAt = now;
  }

  private tryStartBufferedAction(key: FighterKey) {
    const now = performance.now();
    const runtime = this.actionRuntime[key];
    if (now < runtime.lockedUntil || runtime.bufferedMove === MoveType.NONE) return;

    const age = now - runtime.bufferedAt;
    const move = runtime.bufferedMove;
    runtime.bufferedMove = MoveType.NONE;
    runtime.bufferedAt = 0;

    if (age <= INPUT_BUFFER_MS) this.startTimedAction(key, move, now);
  }

  private startTimedAction(key: FighterKey, move: MoveType, now: number) {
    if (this.phase !== 'fighting' || move === MoveType.NONE) return;

    const runtime = this.actionRuntime[key];
    const timing = MOVE_TIMINGS[move];
    const fighter = key === 'p1' ? this.p1Fighter : this.p2Fighter;
    const state = key === 'p1' ? this.s1 : this.s2;

    if (Date.now() < state.hitStunUntil) return; // hitStunUntil uses Date.now() base
    if (move === MoveType.DODGE && now < runtime.dodgeCooldownUntil) return;

    runtime.currentMove = move;
    runtime.lockedUntil = now + timing.windupMs + timing.activeMs + timing.recoveryMs;
    runtime.bufferedMove = MoveType.NONE;

    fighter.animState = moveToAnim(move);
    const animSpeed = ANIM_SPEED[move];
    if (animSpeed) fighter.setAnimTimeScale(animSpeed);

    if (move === MoveType.BLOCK) {
      state.isBlocking = true;
      state.blockStart = Date.now();
      this.after(timing.activeMs, () => {
        state.isBlocking = false;
        if (fighter.animState === AnimState.BLOCK && state.hp > 0) fighter.animState = AnimState.IDLE;
      });
      this.scheduleAnimReset(key, state, fighter, timing.activeMs + timing.recoveryMs);
      return;
    }

    if (move === MoveType.DODGE) {
      runtime.dodgeCooldownUntil = now + DODGE_COOLDOWN_MS;
      const dodgeDir = this.getDodgeDir(key);
      // i-frames start at the active frame (after windup), not immediately
      this.after(timing.windupMs, () => {
        if (this.destroyed || this.phase !== 'fighting') return;
        state.isDodging = true;
        state.dodgeUntil = Date.now() + DODGE_IFRAME_MS;
        fighter.container.x = Math.max(this.arenaLeft, Math.min(this.arenaRight,
          fighter.container.x + dodgeDir * 80,
        ));
      });
      this.after(timing.windupMs + timing.activeMs, () => {
        state.isDodging = false;
        if ((fighter.animState === AnimState.BLOCK || fighter.animState === AnimState.DODGE) && state.hp > 0)
          fighter.animState = AnimState.IDLE;
      });
      this.scheduleAnimReset(key, state, fighter, timing.windupMs + timing.activeMs + timing.recoveryMs);
      return;
    }

    if (move === MoveType.BANKAI && state.energy >= 100) this.shake(3, timing.windupMs);

    this.after(timing.windupMs, () => {
      if (this.phase !== 'fighting' || state.hp <= 0) return;
      if (key === 'p1')
        this.applyMoveWithVisuals(this.s1, this.s2, this.p1Fighter, this.p2Fighter, move, 'p1', 'right');
      else
        this.applyMoveWithVisuals(this.s2, this.s1, this.p2Fighter, this.p1Fighter, move, 'p2', 'left');
    });

    this.scheduleAnimReset(key, state, fighter, timing.windupMs + timing.activeMs + timing.recoveryMs);
  }

  private applyMoveWithVisuals(
    attacker: LocalFighterState, defender: LocalFighterState,
    attackerFighter: Fighter, defenderFighter: Fighter,
    move: MoveType, attackerKey: 'p1' | 'p2', dir: 'right' | 'left',
  ) {
    // Lunge toward opponent at the start of the active frame
    const lunge = LUNGE_PX[move];
    if (lunge) {
      const towardOpp = defenderFighter.container.x > attackerFighter.container.x ? 1 : -1;
      attackerFighter.container.x = Math.max(this.arenaLeft, Math.min(this.arenaRight,
        attackerFighter.container.x + towardOpp * lunge,
      ));
    }

    const timing = MOVE_TIMINGS[move];
    const runtime = this.actionRuntime[attackerKey];

    if (isAttackMove(move) && !this.isInRange(attackerFighter, defenderFighter, timing.rangePx)) {
      runtime.lockedUntil += Math.round(timing.recoveryMs * (timing.missRecoveryMult - 1));
      this.flashWhiff(attackerFighter);
      return;
    }

    if (move === MoveType.BANKAI && attacker.energy >= 100) {
      const { width: W, height: H } = this.ctx.app.screen;
      this.bankaiEffect.fire(
        attackerFighter.container.x, attackerFighter.container.y - 30,
        dir, W, H, attacker.bankaiBeamWidthMult, attacker.bankaiLeavesZone,
      );
      this.shake(10, 260);
    }

    const result = resolveMove(attacker, defender, move);
    if (result.noop) return;

    if (result.evaded || result.whiffed) {
      runtime.lockedUntil += Math.round(timing.recoveryMs * (timing.missRecoveryMult - 1));
      this.flashWhiff(attackerFighter);
      return;
    }

    if (result.blocked) {
      this.shake(result.blockBroken ? 6 : 3, 120);
      if (result.blockBroken) defenderFighter.animState = AnimState.HIT;
      return;
    }

    if (result.defenderHpDelta < 0) {
      const defKey: 'p1' | 'p2' = attackerKey === 'p1' ? 'p2' : 'p1';
      this.applyHitStop(attackerKey, defKey);
      defenderFighter.animState = AnimState.HIT;
      this.shake(move === MoveType.BANKAI ? 14 : 6, move === MoveType.BANKAI ? 260 : 150);
      this.scheduleAnimReset(defKey, defender, defenderFighter, timing.hitStunMs);
    }

    if (defender.hp <= 0) defenderFighter.animState = AnimState.KO;
  }

  private isInRange(a: Fighter, b: Fighter, rangePx: number): boolean {
    return Math.abs(a.container.x - b.container.x) <= rangePx;
  }

  private flashWhiff(fighter: Fighter) {
    fighter.container.alpha = 0.72;
    this.after(70, () => { fighter.container.alpha = 1; });
  }

  private applyHitStop(attackerKey: FighterKey, defenderKey: FighterKey) {
    const until = performance.now() + HIT_STOP_MS;
    this.actionRuntime[attackerKey].hitStopUntil = Math.max(this.actionRuntime[attackerKey].hitStopUntil, until);
    this.actionRuntime[defenderKey].hitStopUntil = Math.max(this.actionRuntime[defenderKey].hitStopUntil, until);
  }

  private scheduleAnimReset(key: 'p1' | 'p2', state: LocalFighterState, fighter: Fighter, ms: number) {
    const existing = this.animResets.get(key);
    if (existing) clearTimeout(existing);
    const id = setTimeout(() => {
      this.animResets.delete(key);
      if (!this.destroyed)
        fighter.animState = state.hp <= 0 ? AnimState.KO : AnimState.IDLE;
    }, ms);
    this.animResets.set(key, id);
  }

  // ── Round management (local mode) ─────────────────────────────────────────

  private startCountdown() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_DURATION;
    this.overlay.alpha = 0.5;
    this.overlayText.text = String(this.countdown);
    this.overlayText.style.fill = 0xffffff;
    (this.overlayText.style as TextStyle).fontSize = 80;
  }

  private startRound() {
    this.phase = 'fighting';
    resetForRound(this.s1);
    resetForRound(this.s2);
    this.p1Fighter.animState = AnimState.IDLE;
    this.p2Fighter.animState = AnimState.IDLE;
    // Reset positions to centre-stage for each round
    const { width: W } = this.ctx.app.screen;
    this.p1Fighter.container.x = W * 0.28;
    this.p2Fighter.container.x = W * 0.72;
    this.roundTimer = ROUND_DURATION;
    this.actionRuntime.p1 = freshActionRuntime();
    this.actionRuntime.p2 = freshActionRuntime();
    this.roundEndScheduled = false;
    this.overlay.alpha = 0;
    this.overlayText.text = '';
  }

  private endRound(winner: 1 | 2 | 'draw' | null) {
    this.phase = 'round_end';
    let msg = 'DRAW!'; let color = 0xffffff;
    if (winner === 1) { msg = 'P1 WINS ROUND!'; color = 0x4a90d9; }
    else if (winner === 2) { msg = 'P2 WINS ROUND!'; color = 0xe05050; }

    this.overlay.alpha = 0.6;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;

    const r = applyRoundWin(this.s1, this.s2, winner, this.round, ROUNDS_TO_WIN);
    if (r.matchOver) {
      this.after(2000, () => this.showLocalMatchEnd(r.matchWinner));
    } else {
      this.round++;
      this.after(2000, () => this.startCountdown());
    }
  }

  private showLocalMatchEnd(winner: 1 | 2 | 'draw' | null) {
    let msg = 'DRAW!'; let color = 0xffd700;
    const npcName = this.npcProfile?.name ?? 'P2';
    if (winner === 1) { msg = `${this.ctx.player?.username ?? 'P1'} WINS!`; color = 0x4a90d9; }
    else if (winner === 2) { msg = `${npcName} WINS!`; color = this.npcProfile?.outfitColor ?? 0xe05050; }

    if (winner === 1) { this.p1Fighter.animState = AnimState.WIN; }
    else if (winner === 2) { this.p2Fighter.animState = AnimState.WIN; }

    if (winner === 1) this.tryGrantNpcReward();

    this.overlay.alpha = 0.75;
    this.overlayText.text = msg;
    this.overlayText.style.fill = color;
    (this.overlayText.style as TextStyle).fontSize = 72;

    this.after(1500, () => this.showLocalCardPicker());
  }

  private tryGrantNpcReward() {
    if (!this.npcProfile || this.npcRewardGranted) return;
    const playerId = this.ctx.player?.id ?? 'guest';
    const key = `ahf:npcReward:${playerId}:${this.npcProfile.id}`;
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
    this.npcRewardGranted = true;
    this.overlayText.text = `${this.ctx.player?.username ?? 'P1'} WINS!\nNPC reward unlocked`;
  }

  private showLocalCardPicker() {
    if (this.destroyed) return;
    this.overlay.alpha = 0;
    this.overlayText.text = '';

    const rewardCards = drawRewardCards(3);
    const collection = getPlayerCardCollection(this.ctx.player);

    this.cardPicker = new CardRewardUI(
      this.ctx.app.screen.width,
      this.ctx.app.screen.height,
      rewardCards,
      collection,
      (card: CardDefinition) => {
        if (this.destroyed) return;
        void this.claimLocalReward(card);
      },
    );
    this.container.addChild(this.cardPicker.container);
  }

  private async claimLocalReward(card: CardDefinition) {
    const result = await claimCardRewardForPlayer(this.ctx.player, card.id);
    if (this.destroyed) return;
    this.cardPicker?.destroy();
    this.cardPicker = null;

    this.overlay.alpha = 0.72;
    this.overlayText.style.fill = result.duplicate ? 0xffaa44 : 0x7dff9a;
    (this.overlayText.style as TextStyle).fontSize = 44;
    this.overlayText.text = result.duplicate
      ? `Duplicate sold\n+${result.currencyGained} dust`
      : `${card.name} unlocked`;

    this.after(900, () => this.ctx.switchScene('hub'));
  }

  private applyActiveCardLoadout() {
    const collection = getPlayerCardCollection(this.ctx.player);
    collection.active.forEach(cardId => {
      const card = getCardById(cardId);
      if (!card) return;
      switch (card.effectKey) {
        case 'heavyHit':
        case 'attackMult':        this.s1.attackMult *= card.value; break;
        case 'defenseMult':       this.s1.defenseMult *= card.value; break;
        case 'bankaiChargeRateMult': this.s1.bankaiChargeRateMult *= card.value; break;
        case 'counterOnPerfectBlock': this.s1.counterOnPerfectBlock = true; break;
        case 'lowAttackSlows':    this.s1.lowAttackSlows = true; break;
        case 'thirdHitKnockback': this.s1.thirdHitKnockback = true; break;
        case 'bankaiBeamWidthMult': this.s1.bankaiBeamWidthMult *= card.value; break;
        case 'bankaiLeavesZone':  this.s1.bankaiLeavesZone = true; break;
      }
    });
  }

  private drawControls(W: number, H: number) {
    const hint1 = new Text({
      text: 'P1: ←/→=move  W=Heavy  S=Light  A=Dodge  D=Block  E=Bankai',
      style: new TextStyle({ fill: 0x888888, fontSize: 11 }),
    });
    hint1.x = 12;
    hint1.y = H - 38;
    this.container.addChild(hint1);

    const hint2 = new Text({
      text: 'P2: Num4/6=move  U=Heavy  J=Light  H=Dodge  K=Block  Y=Bankai',
      style: new TextStyle({ fill: 0x888888, fontSize: 11, align: 'right' }),
    });
    hint2.anchor.set(1, 1);
    hint2.x = W - 12;
    hint2.y = H - 4;
    this.container.addChild(hint2);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts.clear();
    this.animResets.forEach(id => clearTimeout(id));
    this.animResets.clear();

    this.ticker.stop();
    this.ticker.destroy();

    // Network mode cleanup
    this.netInput?.destroy();
    this.netCleanupKb?.();
    if (this.fightRoom) {
      this.fightRoom.onLeave(() => undefined); // silence final event
      void this.fightRoom.leave();
    }

    // Local mode cleanup
    this.p1Input?.destroy();
    this.p2Input?.destroy();
    this.cleanupKb1?.();
    this.cleanupKb2?.();
    this.cleanupMovementKb?.();

    this.cardPicker?.destroy();
    this.hud.destroy();
    this.bankaiEffect.destroy();
    this.p1Fighter.destroy();
    this.p2Fighter.destroy();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
