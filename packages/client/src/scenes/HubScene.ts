import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { GameContext } from '../main';

interface Avatar {
  root: Container;
  body: Graphics;
  baseX: number;
  baseY: number;
  idlePhase: number;
  hitFlash: number;
  emoteLabel: Text;
  emoteShowTimer: number;
  emoteWaitTimer: number;
}

const WORLD_W = 500;
const RING_HW = 130;   // ring half-width (world units)
const RING_HD = 52;    // ring half-depth
const EMOTES = ['gg', 'next!', '🔥', 'rekt', 'EZ', 'go!', 'wow', '😤'];

export class HubScene {
  private container: Container;
  private world: Container;
  private ticker: Ticker;
  private uiEl: HTMLDivElement;
  private t = 0;

  // Animated elements
  private auraGlow!: Graphics;
  private vsText!: Text;
  private impactFx!: Graphics;
  private rf1!: Avatar;
  private rf2!: Avatar;
  private spectators: Avatar[] = [];

  // Demo fight: 0=idle 1=p1lunge 2=impact_p2 3=p2reel 4=recover 5=p2lunge 6=impact_p1 7=p1reel 8=recover
  private demoPhase = 0;
  private demoTimer = 0;
  private readonly DEMO_DUR = [2200, 220, 80, 500, 380, 220, 80, 500, 380];

  // Ring fighter base positions (set in drawRing)
  private rf1BaseX = 0;
  private rf2BaseX = 0;
  private ringFY = 0;

  // Pinch-to-zoom
  private worldScale = 0.85;
  private readonly MIN_SCALE = 0.5;
  private readonly MAX_SCALE = 2.0;
  private pinching = false;
  private pinchDist0 = 0;
  private pinchScale0 = 0.85;
  private cleanupZoom: (() => void) | null = null;

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    // Static backdrop (not zoomable)
    const { width: W, height: H } = ctx.app.screen;
    const backdrop = new Graphics();
    backdrop.rect(0, 0, W, H).fill(0x080818);
    this.container.addChild(backdrop);

    this.world = new Container();
    this.container.addChild(this.world);

    this.buildWorld(W, H);
    this.applyTransform(W);
    this.setupZoom(W);

    this.uiEl = this.buildUI(H);
    document.getElementById('ui-layer')!.appendChild(this.uiEl);

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();
  }

  private applyTransform(W: number) {
    this.world.scale.set(this.worldScale);
    this.world.x = W / 2 - (WORLD_W / 2) * this.worldScale;
    this.world.y = 0;
  }

  private buildWorld(_W: number, H: number) {
    const cx = WORLD_W / 2;
    const cy = H * 0.50;

    this.drawBg(H, cx, cy);
    this.drawRing(cx, cy);
    this.drawSpectators(cx, cy);
    this.drawTitle(cx);
  }

  private drawBg(H: number, cx: number, cy: number) {
    // Stars (seeded — no flicker on re-enter)
    const rng = mulberry32(42);
    const stars = new Graphics();
    for (let i = 0; i < 80; i++) {
      stars.circle(rng() * WORLD_W, rng() * H * 0.52, rng() * 1.3 + 0.35)
        .fill({ color: 0xffffff, alpha: rng() * 0.28 + 0.07 });
    }
    this.world.addChild(stars);

    // Arena banners from ceiling
    [0.1, 0.28, 0.5, 0.72, 0.9].forEach((t, i) => {
      const bx = WORLD_W * t;
      const col = i === 2 ? 0xff3300 : 0x1a1a44;
      const bh = H * 0.19 + (i % 2) * H * 0.04;
      const bw = 13;
      const b = new Graphics();
      b.rect(bx - bw / 2, 0, bw, bh).fill(col);
      b.poly([bx - bw / 2 - 3, bh, bx + bw / 2 + 3, bh, bx, bh + 13]).fill(col);
      this.world.addChild(b);
    });

    // Crowd silhouettes (rows, behind ring)
    const crowd = new Graphics();
    const rng2 = mulberry32(99);
    const baseY = H * 0.33;
    for (let row = 0; row < 4; row++) {
      const y = baseY - row * 19;
      const sc = 0.65 + row * 0.1;
      const n = Math.floor(WORLD_W / 17);
      for (let i = 0; i < n; i++) {
        const x = (i + rng2() * 0.5) * (WORLD_W / n);
        const a = 0.1 + row * 0.05;
        crowd.rect(x - 5 * sc, y - 17 * sc, 10 * sc, 17 * sc).fill({ color: 0x1a2a44, alpha: a });
        crowd.circle(x, y - 17 * sc - 5 * sc, 5 * sc).fill({ color: 0x152035, alpha: a });
      }
    }
    this.world.addChild(crowd);

    // Spotlight beams
    const sl = new Graphics();
    sl.poly([WORLD_W * 0.03, 0, WORLD_W * 0.14, 0, cx - 18, cy - 32, cx - 70, cy - 32])
      .fill({ color: 0xffeedd, alpha: 0.032 });
    sl.poly([WORLD_W * 0.97, 0, WORLD_W * 0.86, 0, cx + 70, cy - 32, cx + 18, cy - 32])
      .fill({ color: 0xffeedd, alpha: 0.032 });
    this.world.addChild(sl);

    // Floor glow
    const floor = new Graphics();
    floor.rect(0, H * 0.67, WORLD_W, H * 0.33).fill(0x0a0a1e);
    floor.rect(0, H * 0.67, WORLD_W, 2).fill({ color: 0xff6b35, alpha: 0.12 });
    this.world.addChild(floor);
  }

  private drawRing(cx: number, cy: number) {
    const rW = RING_HW;
    const rH = RING_HD;
    const depth = 24;
    const tL = { x: cx - rW * 0.82, y: cy - rH };
    const tR = { x: cx + rW * 0.82, y: cy - rH };
    const bR = { x: cx + rW, y: cy };
    const bL = { x: cx - rW, y: cy };

    // Aura beneath ring
    this.auraGlow = new Graphics();
    this.auraGlow.ellipse(cx, cy + rH * 0.25, rW * 0.85, rH * 0.6).fill({ color: 0x4400ff, alpha: 0.35 });
    this.auraGlow.ellipse(cx, cy + rH * 0.25, rW * 0.55, rH * 0.32).fill({ color: 0xff5500, alpha: 0.18 });
    this.world.addChild(this.auraGlow);

    // Canvas (top face)
    const surf = new Graphics();
    surf.poly([tL.x, tL.y, tR.x, tR.y, bR.x, bR.y, bL.x, bL.y]).fill(0x0c1c0c);
    surf.ellipse(cx, cy - rH * 0.28, rW * 0.3, rH * 0.22).stroke({ color: 0xffd700, width: 1.5, alpha: 0.18 });
    this.world.addChild(surf);

    // Side faces + front face
    const faces = new Graphics();
    faces.poly([bL.x, bL.y, bR.x, bR.y, bR.x, bR.y + depth, bL.x, bL.y + depth]).fill(0x060e06);
    faces.rect(bL.x, bL.y + depth - 2, rW * 2, 2).fill({ color: 0xffd700, alpha: 0.1 });
    faces.poly([tL.x, tL.y, bL.x, bL.y, bL.x, bL.y + depth, tL.x, tL.y + depth]).fill(0x080e08);
    faces.poly([tR.x, tR.y, bR.x, bR.y, bR.x, bR.y + depth, tR.x, tR.y + depth]).fill(0x070c07);
    this.world.addChild(faces);

    // Corner posts
    const postH = 56;
    const posts = new Graphics();
    [tL, tR, bL, bR].forEach(c => {
      posts.rect(c.x - 5, c.y - postH, 10, postH + depth + 2).fill(0xbbbbcc);
      posts.circle(c.x, c.y - postH, 7).fill(0xffd700);
    });
    this.world.addChild(posts);

    // Ropes (3 heights, all 4 sides)
    const ropes = new Graphics();
    ([0xff1111, 0xff3333, 0xff5555] as const).forEach((col, ri) => {
      const yo = -(ri * 13 + 11);
      const a = 0.72 - ri * 0.05;
      ropes.moveTo(tL.x, tL.y + yo).lineTo(tR.x, tR.y + yo).stroke({ color: col, width: 2.5, alpha: a * 0.55 });
      ropes.moveTo(bL.x, bL.y + yo).lineTo(bR.x, bR.y + yo).stroke({ color: col, width: 2.5, alpha: a });
      ropes.moveTo(tL.x, tL.y + yo).lineTo(bL.x, bL.y + yo).stroke({ color: col, width: 2.5, alpha: a * 0.75 });
      ropes.moveTo(tR.x, tR.y + yo).lineTo(bR.x, bR.y + yo).stroke({ color: col, width: 2.5, alpha: a * 0.75 });
    });
    this.world.addChild(ropes);

    // Shadow under ring
    const shadow = new Graphics();
    shadow.ellipse(cx, bL.y + depth + 10, rW * 0.88, 12).fill({ color: 0x000000, alpha: 0.55 });
    this.world.addChild(shadow);

    // Impact FX (hidden until triggered)
    this.impactFx = new Graphics();
    this.impactFx.alpha = 0;
    this.world.addChild(this.impactFx);

    // Ring fighters
    const fy = cy - rH * 0.2;
    this.ringFY = fy;
    this.rf1BaseX = cx - rW * 0.38;
    this.rf2BaseX = cx + rW * 0.38;
    this.rf1 = this.makeAvatar(this.rf1BaseX, fy, 0x4a90d9, 0x7b2fff, 'gold', 0.0, false);
    this.rf2 = this.makeAvatar(this.rf2BaseX, fy, 0xe05050, 0xff8c00, 'silver', Math.PI, false);
    this.world.addChild(this.rf1.root);
    this.world.addChild(this.rf2.root);

    // VS text
    this.vsText = new Text({
      text: 'VS',
      style: new TextStyle({
        fill: 0xff6b35, fontSize: 18,
        fontFamily: 'Impact, Arial Black, sans-serif', fontWeight: 'bold',
        dropShadow: { blur: 10, color: '#ff0000', distance: 0, angle: 0 },
      }),
    });
    this.vsText.anchor.set(0.5);
    this.vsText.x = cx;
    this.vsText.y = fy - 10;
    this.world.addChild(this.vsText);

    // Ring label
    const lbl = new Text({
      text: '— MAIN RING —',
      style: new TextStyle({ fill: 0xffd700, fontSize: 9, letterSpacing: 3 }),
    });
    lbl.anchor.set(0.5, 1);
    lbl.x = cx;
    lbl.y = tL.y - postH - 8;
    this.world.addChild(lbl);
  }

  private makeAvatar(
    x: number, y: number,
    bodyCol: number, auraCol: number,
    headband: 'gold' | 'silver' | 'bronze' | null,
    idlePhase: number,
    showName: boolean,
    name = '',
  ): Avatar {
    const root = new Container();
    root.x = x;
    root.y = y;

    const auraG = new Graphics();
    auraG.circle(0, -20, 22).fill({ color: auraCol, alpha: 0.2 });
    root.addChild(auraG);

    const body = new Graphics();
    body.rect(-10, -26, 20, 32).fill(bodyCol);
    body.circle(0, -33, 9).fill(0xffcc99);
    if (headband) {
      const hbCol = headband === 'gold' ? 0xffd700 : headband === 'silver' ? 0xc0c0c0 : 0xcd7f32;
      body.rect(-10, -40, 20, 6).fill(hbCol);
    }
    root.addChild(body);

    // Emote label (hidden by default)
    const emoteLabel = new Text({
      text: '',
      style: new TextStyle({
        fill: 0xffffff, fontSize: 10,
        stroke: { color: '#000', width: 3 },
        dropShadow: { blur: 4, color: '#000', distance: 0, angle: 0 },
      }),
    });
    emoteLabel.anchor.set(0.5, 1);
    emoteLabel.y = -47;
    emoteLabel.visible = false;
    root.addChild(emoteLabel);

    if (showName && name) {
      const nameLbl = new Text({
        text: name,
        style: new TextStyle({ fill: 0x667788, fontSize: 9, letterSpacing: 1 }),
      });
      nameLbl.anchor.set(0.5, 0);
      nameLbl.y = 9;
      root.addChild(nameLbl);
    }

    return {
      root, body,
      baseX: x, baseY: y,
      idlePhase,
      hitFlash: 0,
      emoteLabel,
      emoteShowTimer: 0,
      emoteWaitTimer: 4000 + Math.random() * 10000,
    };
  }

  private drawSpectators(cx: number, cy: number) {
    const rW = RING_HW;

    // 3 left, 3 right — in world space, outside the ring bounds
    const defs: Array<{
      x: number; y: number; col: number; aura: number;
      hb: 'gold' | 'silver' | 'bronze' | null; name: string; phase: number;
    }> = [
      { x: cx - rW * 1.42, y: cy - 12,  col: 0x22aa55, aura: 0x00ff88, hb: 'bronze', name: 'ZeroX',   phase: 0.5 },
      { x: cx - rW * 1.45, y: cy + 42,  col: 0x8844cc, aura: 0xcc44ff, hb: null,     name: 'Sora99',  phase: 1.3 },
      { x: cx - rW * 1.28, y: cy + 88,  col: 0x888888, aura: 0xaaaaaa, hb: null,     name: 'noob1',   phase: 2.1 },
      { x: cx + rW * 1.48, y: cy + 28,  col: 0xd9a84a, aura: 0xff8800, hb: 'bronze', name: 'MegaRyu', phase: 0.9 },
      { x: cx + rW * 1.52, y: cy + 74,  col: 0xcc4444, aura: 0xff2222, hb: null,     name: 'BladeX',  phase: 1.7 },
      { x: cx + rW * 1.44, y: cy + 116, col: 0x4488cc, aura: 0x00aaff, hb: null,     name: 'Ryu2099', phase: 2.8 },
    ];

    defs.forEach(d => {
      const av = this.makeAvatar(d.x, d.y, d.col, d.aura, d.hb, d.phase, true, d.name);
      this.world.addChild(av.root);
      this.spectators.push(av);
    });

    // Rank board (right of ring)
    // Rank board: right of ring, above spectators
    this.drawRankBoard(cx + rW + 28, cy - RING_HD - 52);
  }

  private drawRankBoard(x: number, y: number) {
    const board = new Graphics();
    board.rect(-40, -5, 80, 105).fill({ color: 0x080820, alpha: 0.92 });
    board.rect(-40, -5, 80, 105).stroke({ color: 0xffd700, width: 1.5, alpha: 0.35 });
    board.rect(-40, -5, 80, 18).fill(0x111133);
    board.x = x;
    board.y = y;
    this.world.addChild(board);

    const title = new Text({ text: 'TOP 3', style: new TextStyle({ fill: 0xffd700, fontSize: 9, fontWeight: 'bold', letterSpacing: 2 }) });
    title.anchor.set(0.5, 0.5);
    title.x = x;
    title.y = y + 4;
    this.world.addChild(title);

    [
      { medal: '🥇', name: 'KaiSama', rp: 2100, col: 0xffd700 },
      { medal: '🥈', name: 'MegaRyu', rp: 1850, col: 0xc0c0c0 },
      { medal: '🥉', name: 'ZeroX',   rp: 1620, col: 0xcd7f32 },
    ].forEach((e, i) => {
      const row = new Text({ text: `${e.medal} ${e.name}`, style: new TextStyle({ fill: e.col, fontSize: 9 }) });
      row.anchor.set(0, 0.5);
      row.x = x - 34;
      row.y = y + 28 + i * 26;
      this.world.addChild(row);

      const rp = new Text({ text: `${e.rp}`, style: new TextStyle({ fill: 0x445566, fontSize: 8 }) });
      rp.anchor.set(1, 0.5);
      rp.x = x + 36;
      rp.y = y + 28 + i * 26;
      this.world.addChild(rp);
    });
  }

  private drawTitle(cx: number) {
    const title = new Text({
      text: 'HEADBAND ARENA',
      style: new TextStyle({
        fill: 0xff6b35,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontSize: 38, fontWeight: 'bold', letterSpacing: 3,
        dropShadow: { blur: 22, color: '#cc1100', distance: 0, angle: 0 },
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = 10;
    this.world.addChild(title);
  }

  // ── Pinch-to-zoom (touch + mouse wheel) ─────────────────────────────────────

  private setupZoom(W: number) {
    const canvas = this.ctx.app.canvas;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        this.pinching = true;
        this.pinchDist0 = dist(e.touches);
        this.pinchScale0 = this.worldScale;
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (this.pinching && e.touches.length === 2) {
        this.worldScale = clamp(this.pinchScale0 * dist(e.touches) / this.pinchDist0, this.MIN_SCALE, this.MAX_SCALE);
        this.applyTransform(W);
        e.preventDefault();
      }
    };
    const onEnd = () => { this.pinching = false; };
    const onWheel = (e: WheelEvent) => {
      this.worldScale = clamp(this.worldScale * (e.deltaY > 0 ? 0.92 : 1.09), this.MIN_SCALE, this.MAX_SCALE);
      this.applyTransform(W);
      e.preventDefault();
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanupZoom = () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  // ── Main update loop ─────────────────────────────────────────────────────────

  private update(ticker: Ticker) {
    this.t += ticker.deltaMS;
    const dt = ticker.deltaMS;

    // Idle bob (all avatars)
    for (const av of [this.rf1, this.rf2, ...this.spectators]) {
      av.root.y = av.baseY + Math.sin(this.t * 0.0024 + av.idlePhase) * 3;
    }

    // VS pulse + aura breathe
    this.vsText.scale.set(1 + Math.sin(this.t * 0.003) * 0.055);
    this.auraGlow.alpha = 0.55 + Math.sin(this.t * 0.0018) * 0.3;

    // Demo fight
    this.demoTimer += dt;
    const dur = this.DEMO_DUR[this.demoPhase];
    if (this.demoTimer >= dur) {
      this.demoTimer -= dur;
      this.demoPhase = (this.demoPhase + 1) % this.DEMO_DUR.length;
      this.onDemoPhaseStart(this.demoPhase);
    }
    this.tickDemoFight();

    // Hit flash decay
    for (const f of [this.rf1, this.rf2]) {
      if (f.hitFlash > 0) {
        f.hitFlash = Math.max(0, f.hitFlash - dt * 0.0028);
        f.body.alpha = 0.25 + (1 - f.hitFlash) * 0.75;
      } else {
        f.body.alpha = 1;
      }
    }

    // Impact fade
    if (this.impactFx.alpha > 0) {
      this.impactFx.alpha = Math.max(0, this.impactFx.alpha - dt * 0.007);
    }

    // Spectator emotes
    for (const spec of this.spectators) {
      if (spec.emoteShowTimer > 0) {
        spec.emoteShowTimer -= dt;
        spec.emoteLabel.alpha = Math.min(1, spec.emoteShowTimer < 350 ? spec.emoteShowTimer / 350 : 1);
        if (spec.emoteShowTimer <= 0) spec.emoteLabel.visible = false;
      } else {
        spec.emoteWaitTimer -= dt;
        if (spec.emoteWaitTimer <= 0) {
          spec.emoteLabel.text = EMOTES[Math.floor(Math.random() * EMOTES.length)];
          spec.emoteLabel.alpha = 0;
          spec.emoteLabel.visible = true;
          spec.emoteShowTimer = 2000;
          spec.emoteWaitTimer = 6000 + Math.random() * 14000;
        }
      }
    }
  }

  private onDemoPhaseStart(phase: number) {
    if (phase === 2) { this.rf2.hitFlash = 1; this.triggerImpact(this.rf2BaseX, this.ringFY - 12); }
    if (phase === 6) { this.rf1.hitFlash = 1; this.triggerImpact(this.rf1BaseX, this.ringFY - 12); }
  }

  private triggerImpact(x: number, y: number) {
    this.impactFx.clear();
    const rng = mulberry32(Date.now() & 0xffff);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.5;
      const len = 9 + rng() * 9;
      this.impactFx.moveTo(0, 0).lineTo(Math.cos(a) * len, Math.sin(a) * len)
        .stroke({ color: 0xffff00, width: 2.2 });
    }
    this.impactFx.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.95 });
    this.impactFx.x = x;
    this.impactFx.y = y;
    this.impactFx.alpha = 1;
  }

  private tickDemoFight() {
    const pct = this.demoTimer / this.DEMO_DUR[this.demoPhase];
    const LUNGE = 22;
    const REEL = 11;
    const b1 = this.rf1BaseX;
    const b2 = this.rf2BaseX;

    switch (this.demoPhase) {
      case 0: this.rf1.root.x = b1; this.rf2.root.x = b2; break;
      case 1: this.rf1.root.x = lerp(b1, b1 + LUNGE, pct); break;
      case 2: this.rf1.root.x = b1 + LUNGE; break;
      case 3: this.rf1.root.x = lerp(b1 + LUNGE, b1, pct); this.rf2.root.x = lerp(b2, b2 + REEL, pct); break;
      case 4: this.rf2.root.x = lerp(b2 + REEL, b2, pct); break;
      case 5: this.rf2.root.x = lerp(b2, b2 - LUNGE, pct); break;
      case 6: this.rf2.root.x = b2 - LUNGE; break;
      case 7: this.rf2.root.x = lerp(b2 - LUNGE, b2, pct); this.rf1.root.x = lerp(b1, b1 - REEL, pct); break;
      case 8: this.rf1.root.x = lerp(b1 - REEL, b1, pct); break;
    }
  }

  // ── HTML overlay ──────────────────────────────────────────────────────────────

  private buildUI(H: number): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

    const player = this.ctx.player;

    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;top:8px;left:10px;background:rgba(0,0,0,0.62);border:1px solid rgba(255,215,0,0.22);border-radius:8px;padding:5px 11px;';
    info.innerHTML = `<div style="color:#ffd700;font-weight:bold;font-size:13px;letter-spacing:1px">${player?.username ?? 'Fighter'}</div><div style="color:#777;font-size:11px">${player?.rankPoints ?? 1000} RP</div>`;
    div.appendChild(info);

    const lb = document.createElement('div');
    lb.style.cssText = 'position:absolute;top:8px;right:10px;width:min(160px,36vw);background:rgba(0,0,0,0.65);border:1px solid rgba(255,215,0,0.22);border-radius:10px;padding:9px 11px;';
    lb.innerHTML = '<div style="color:#ffd700;font-size:10px;font-weight:bold;letter-spacing:2px;margin-bottom:7px;text-align:center">TOP FIGHTERS</div><div id="lb-content" style="font-size:11px;color:#aaa">Loading…</div>';
    div.appendChild(lb);
    this.fetchLeaderboard(lb.querySelector('#lb-content') as HTMLElement);

    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);color:#333;font-size:9px;letter-spacing:2px;white-space:nowrap;';
    hint.textContent = 'pinch to zoom';
    div.appendChild(hint);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `position:absolute;bottom:${Math.max(H * 0.038, 14)}px;left:50%;transform:translateX(-50%);pointer-events:all;display:flex;gap:12px;align-items:center;`;
    btnRow.append(
      this.makeBtn('LOCKER', '#111130', '#1a1a40', 'rgba(255,215,0,0.35)', '12px', '10px 18px',
        () => this.ctx.switchScene('locker')),
      this.makeBtn('⚔  FIGHT', '#aa2200', '#ff6b35', 'transparent', '16px', '13px 32px',
        () => this.ctx.switchScene('fight', { local: true })),
    );
    div.appendChild(btnRow);

    return div;
  }

  private makeBtn(
    label: string, c1: string, c2: string, border: string,
    fs: string, pad: string, onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `padding:${pad};border:2px solid ${border};border-radius:10px;cursor:pointer;background:linear-gradient(135deg,${c1},${c2});color:#fff;font-size:${fs};font-weight:bold;letter-spacing:2px;font-family:inherit;box-shadow:0 4px 22px rgba(0,0,0,0.55);transition:transform 0.1s;min-width:110px;`;
    const dn = () => { btn.style.transform = 'scale(0.95)'; };
    const up = () => { btn.style.transform = 'scale(1)'; };
    btn.addEventListener('mousedown', dn); btn.addEventListener('touchstart', dn);
    btn.addEventListener('mouseup', up); btn.addEventListener('touchend', up);
    btn.addEventListener('mouseleave', up);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private async fetchLeaderboard(el: HTMLElement) {
    try {
      const res = await fetch('/leaderboard');
      const data = await res.json() as Array<{ rank: number; username: string; rankPoints: number; headbandTier: string | null }>;
      if (!data.length) { el.innerHTML = '<span style="color:#333;font-size:10px">No fighters yet</span>'; return; }
      el.innerHTML = data.slice(0, 5).map((e, i) => {
        const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${e.rank}.`;
        const c = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#666';
        return `<div style="color:${c};margin-bottom:5px;display:flex;justify-content:space-between;font-size:11px"><span>${m} ${e.username}</span><span style="opacity:0.5">${e.rankPoints}</span></div>`;
      }).join('');
    } catch { el.innerHTML = '<span style="color:#333;font-size:10px">offline</span>'; }
  }

  destroy() {
    this.ticker.stop();
    this.ticker.destroy();
    this.cleanupZoom?.();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
