import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { AnimState } from "@ahf/shared";
import type { GameContext } from "../main";
import { Fighter, type CharacterLooks } from "../game/Fighter";
import { NPC_ROSTER, type NPCProfile } from "../../../shared/src/npcs";
import { Client } from "colyseus.js";
import type { Room } from "colyseus.js";
import { SERVER_URL } from "../config";

interface Avatar {
  id: string;
  kind: "player" | "npc" | "ring";
  root: Container;
  fighter: Fighter;
  baseX: number;
  baseY: number;
  idlePhase: number;
  name?: Text;
  npc?: NPCProfile;
}

type Hotspot = "ring" | "locker" | `npc:${string}` | `player:${string}` | null;

const WORLD_W = 900;
const WORLD_H = 520;
const RING_X = 450;
const RING_Y = 240;
const RING_HW = 155;
const RING_HD = 58;
const PLAYER_SPEED = 0.26;

export class HubScene {
  private container: Container;
  private world: Container;
  private ticker: Ticker;
  private uiEl: HTMLDivElement;
  private t = 0;

  private playerAvatar!: Avatar;
  private npcAvatars: Avatar[] = [];
  private ringA!: Avatar;
  private ringB!: Avatar;
  private impactFx!: Graphics;
  private ringAura!: Graphics;
  private ringHpA!: Graphics;
  private ringHpB!: Graphics;
  private featuredName!: Text;
  private hotspot: Hotspot = null;
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;

  private worldScale = 0.86;
  private readonly MIN_SCALE = 0.56;
  private readonly MAX_SCALE = 1.75;
  private panX = 0;
  private panY = 0;
  private pinching = false;
  private pinchDist0 = 0;
  private pinchScale0 = 0.86;
  private cleanupFns: Array<() => void> = [];

  // ── Multiplayer networking ────────────────────────────────────────────────
  private hubRoom: Room | null = null;
  private mySessionId = '';
  private myHubPlayer: Record<string, unknown> | null = null;
  private otherPlayers = new Map<string, { root: Container; fighter: Fighter; hubPlayer: Record<string, unknown> }>();
  private lastMoveSent = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  // Challenge state
  private lastChallengeFrom = '';
  private challengePopup: HTMLDivElement | null = null;
  private countdownOverlay: HTMLDivElement | null = null;
  private sceneDestroyed = false;

  private demoPhase = 0;
  private demoTimer = 0;
  private readonly DEMO_DUR = [1700, 220, 90, 420, 300, 220, 90, 420, 300];
  private hpA = 0.82;
  private hpB = 0.67;

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const { width: W, height: H } = ctx.app.screen;
    const backdrop = new Graphics();
    backdrop.rect(0, 0, W, H).fill(0x070712);
    this.container.addChild(backdrop);

    this.world = new Container();
    this.container.addChild(this.world);

    this.buildWorld();
    this.focusCamera(W, H, RING_X, RING_Y + 60);
    this.setupInput();

    this.uiEl = this.buildUI();
    document.getElementById("ui-layer")!.appendChild(this.uiEl);

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();

    void this.connectToHub();
  }

  private buildWorld() {
    this.drawBg();
    this.drawLocker();
    this.drawPracticeCorner();
    this.drawRing();
    this.spawnNPCs();
    this.spawnPlayer();
    this.drawTitle();
  }

  private drawBg() {
    const g = new Graphics();
    g.rect(0, 0, WORLD_W, WORLD_H).fill(0x09091d);

    // skyline
    const rng = mulberry32(77);
    for (let i = 0; i < 28; i++) {
      const w = 18 + rng() * 32;
      const h = 70 + rng() * 130;
      const x = i * 34 + rng() * 8;
      g.rect(x, 105 - h * 0.25, w, h).fill({ color: 0x101032, alpha: 0.75 });
      if (rng() > 0.35)
        g.rect(x + 5, 95, w - 10, 2).fill({ color: 0xff6b35, alpha: 0.25 });
    }

    // floor
    g.rect(0, 250, WORLD_W, WORLD_H - 250).fill(0x0b0b1f);
    for (let y = 285; y < WORLD_H; y += 38)
      g.rect(0, y, WORLD_W, 1).fill({ color: 0x223355, alpha: 0.16 });
    for (let x = 0; x < WORLD_W; x += 56)
      g.rect(x, 250, 1, WORLD_H - 250).fill({ color: 0x223355, alpha: 0.11 });

    // neon walk lanes
    g.rect(70, 360, 760, 2).fill({ color: 0xff6b35, alpha: 0.18 });
    g.rect(70, 420, 760, 2).fill({ color: 0x66aaff, alpha: 0.14 });
    this.world.addChild(g);
  }

  private drawTitle() {
    const title = new Text({
      text: "HEADBAND ARENA",
      style: new TextStyle({
        fill: 0xff6b35,
        fontSize: 34,
        fontFamily: "Impact, Arial Black, sans-serif",
        fontWeight: "bold",
        letterSpacing: 4,
        dropShadow: { blur: 20, color: "#b00000", distance: 0, angle: 0 },
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = WORLD_W / 2;
    title.y = 16;
    this.world.addChild(title);
  }

  private drawLocker() {
    const x = 110,
      y = 345;
    const g = new Graphics();
    g.roundRect(x - 50, y - 58, 100, 82, 12).fill({
      color: 0x10102c,
      alpha: 0.95,
    });
    g.roundRect(x - 50, y - 58, 100, 82, 12).stroke({
      color: 0x66aaff,
      width: 2,
      alpha: 0.45,
    });
    g.rect(x - 28, y - 42, 56, 48).fill(0x050514);
    g.rect(x - 23, y - 37, 46, 4).fill({ color: 0x66aaff, alpha: 0.5 });
    this.world.addChild(g);

    const label = new Text({
      text: "LOCKER",
      style: new TextStyle({
        fill: 0x66aaff,
        fontSize: 10,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y + 37;
    this.world.addChild(label);
  }

  private drawPracticeCorner() {
    const x = 780,
      y = 372;
    const g = new Graphics();
    g.roundRect(x - 68, y - 48, 136, 88, 14).fill({
      color: 0x111018,
      alpha: 0.8,
    });
    g.roundRect(x - 68, y - 48, 136, 88, 14).stroke({
      color: 0x55ff99,
      width: 2,
      alpha: 0.22,
    });
    g.circle(x, y - 8, 20).fill({ color: 0x55ff99, alpha: 0.12 });
    g.rect(x - 5, y - 32, 10, 48).fill(0x335544);
    g.circle(x, y - 40, 12).fill(0x77aa88);
    this.world.addChild(g);

    const label = new Text({
      text: "PRACTICE",
      style: new TextStyle({
        fill: 0x55ff99,
        fontSize: 10,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y + 52;
    this.world.addChild(label);
  }

  private drawRing() {
    const cx = RING_X,
      cy = RING_Y;
    const tL = { x: cx - RING_HW * 0.82, y: cy - RING_HD };
    const tR = { x: cx + RING_HW * 0.82, y: cy - RING_HD };
    const bR = { x: cx + RING_HW, y: cy };
    const bL = { x: cx - RING_HW, y: cy };

    this.ringAura = new Graphics();
    this.ringAura
      .ellipse(cx, cy + 18, RING_HW * 0.9, 42)
      .fill({ color: 0xff3300, alpha: 0.18 });
    this.ringAura
      .ellipse(cx, cy + 18, RING_HW * 0.55, 24)
      .fill({ color: 0x6633ff, alpha: 0.2 });
    this.world.addChild(this.ringAura);

    const g = new Graphics();
    g.poly([tL.x, tL.y, tR.x, tR.y, bR.x, bR.y, bL.x, bL.y]).fill(0x112112);
    g.poly([bL.x, bL.y, bR.x, bR.y, bR.x, bR.y + 26, bL.x, bL.y + 26]).fill(
      0x050b05,
    );
    [tL, tR, bL, bR].forEach((p) => {
      g.rect(p.x - 5, p.y - 58, 10, 86).fill(0xbbbbcc);
      g.circle(p.x, p.y - 58, 7).fill(0xffd700);
    });
    [0, 1, 2].forEach((i) => {
      const yo = -14 - i * 13;
      g.moveTo(tL.x, tL.y + yo)
        .lineTo(tR.x, tR.y + yo)
        .stroke({ color: 0xff2222, width: 2, alpha: 0.35 });
      g.moveTo(bL.x, bL.y + yo)
        .lineTo(bR.x, bR.y + yo)
        .stroke({ color: 0xff2222, width: 2.5, alpha: 0.75 });
      g.moveTo(tL.x, tL.y + yo)
        .lineTo(bL.x, bL.y + yo)
        .stroke({ color: 0xff2222, width: 2, alpha: 0.55 });
      g.moveTo(tR.x, tR.y + yo)
        .lineTo(bR.x, bR.y + yo)
        .stroke({ color: 0xff2222, width: 2, alpha: 0.55 });
    });
    this.world.addChild(g);

    this.ringA = this.makeAvatar(
      "ring-a",
      "ring",
      cx - 58,
      cy - 18,
      0x111122,
      0xffd700,
      "Kai",
      0,
      "gold",
    );
    this.ringB = this.makeAvatar(
      "ring-b",
      "ring",
      cx + 58,
      cy - 18,
      0x881111,
      0xff2200,
      "Akuma",
      1.6,
      null,
    );
    this.world.addChild(this.ringA.root, this.ringB.root);

    this.featuredName = new Text({
      text: "FEATURED: Kai vs Akuma",
      style: new TextStyle({
        fill: 0xffd700,
        fontSize: 11,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    this.featuredName.anchor.set(0.5);
    this.featuredName.x = cx;
    this.featuredName.y = cy - 105;
    this.world.addChild(this.featuredName);

    this.ringHpA = new Graphics();
    this.ringHpB = new Graphics();
    this.world.addChild(this.ringHpA, this.ringHpB);
    this.drawRingHp();

    this.impactFx = new Graphics();
    this.impactFx.alpha = 0;
    this.world.addChild(this.impactFx);
  }

  private drawRingHp() {
    this.ringHpA.clear();
    this.ringHpB.clear();
    const x = RING_X - 92,
      y = RING_Y - 92,
      w = 74,
      h = 5;
    this.ringHpA
      .roundRect(x, y, w, h, 2)
      .fill({ color: 0x000000, alpha: 0.65 });
    this.ringHpA.roundRect(x, y, w * this.hpA, h, 2).fill(0xffd700);
    this.ringHpB
      .roundRect(RING_X + 18, y, w, h, 2)
      .fill({ color: 0x000000, alpha: 0.65 });
    this.ringHpB.roundRect(RING_X + 18, y, w * this.hpB, h, 2).fill(0xff3333);
  }

  private spawnNPCs() {
    const placements = [
      { x: 290, y: 350 },
      { x: 345, y: 410 },
      { x: 515, y: 402 },
      { x: 585, y: 345 },
      { x: 690, y: 286 },
      { x: 220, y: 285 },
      { x: 735, y: 438 },
      { x: 170, y: 438 },
    ];
    NPC_ROSTER.slice(0, placements.length).forEach((npc, i) => {
      const p = placements[i];
      const av = this.makeAvatar(
        npc.id,
        "npc",
        p.x,
        p.y,
        npc.outfitColor,
        npc.auraColor,
        npc.name,
        i * 0.7,
        null,
        npc,
      );
      this.npcAvatars.push(av);
      this.world.addChild(av.root);
    });
  }

  private spawnPlayer() {
    const p = this.ctx.player;
    const aura = colorStringToHex(p?.cosmetics?.auraColor ?? "#7b2fff");
    this.playerAvatar = this.makeAvatar(
      "self",
      "player",
      RING_X,
      440,
      aura,
      aura,
      p?.username ?? "You",
      2.2,
      null,
    );
    this.world.addChild(this.playerAvatar.root);
  }

  private makeAvatar(
    id: string,
    kind: Avatar["kind"],
    x: number,
    y: number,
    _bodyCol: number,
    auraCol: number,
    name: string,
    idlePhase: number,
    headband: "gold" | "silver" | "bronze" | null,
    npc?: NPCProfile,
  ): Avatar {
    const root = new Container();
    root.x = x;
    root.y = y;

    const fighter = new Fighter({
      name,
      auraColor: auraCol,
      facing: x > RING_X ? "left" : "right",
      scale: kind === "ring" ? 0.11 : 0.085,
      looks: this.avatarLooksFor(id, kind, npc),
    });
    root.addChild(fighter.container);

    if (headband) {
      const hb =
        headband === "gold"
          ? 0xffd700
          : headband === "silver"
            ? 0xc0c0c0
            : 0xcd7f32;
      const mark = new Graphics();
      mark.roundRect(-18, -52, 36, 7, 3).fill(0x000000);
      mark.roundRect(-15, -51, 30, 5, 2).fill(hb);
      root.addChild(mark);
    }

    if (npc) {
      const claimed = this.hasNpcReward(npc.id);
      const tierText = `${npc.tier.toUpperCase()}${claimed ? " ✓" : ""}`;
      const tier = new Text({
        text: tierText,
        style: new TextStyle({
          fill: claimed ? 0x55ff99 : 0x7788aa,
          fontSize: 7,
          letterSpacing: 1,
          stroke: { color: "#000", width: 3 },
        }),
      });
      tier.anchor.set(0.5, 0);
      tier.y = 25;
      root.addChild(tier);
    }

    return { id, kind, root, fighter, baseX: x, baseY: y, idlePhase, npc };
  }

  private avatarLooksFor(
    id: string,
    kind: Avatar["kind"],
    _npc?: NPCProfile,
  ): Partial<CharacterLooks> {
    if (kind === "player") {
      const c = this.ctx.player?.cosmetics;
      return {
        bodyObject:   c?.bodyObject   ?? 1,
        headObject:   c?.headObject   ?? 0,
        hairObject:   c?.hairObject   ?? 1,
        handObject:   c?.handObject   ?? 1,
        cloakObject:  c?.cloakObject  ?? 0,
        eyeType:      c?.eyeType      ?? 'Basic',
        makeupIndex:  c?.makeupIndex  ?? 0,
        supportIndex: c?.supportIndex ?? 0,
      };
    }

    // NPC presets — each NPC gets a distinctive look
    const presets: Record<string, Partial<CharacterLooks>> = {
      npc_ryo:   { bodyObject: 1, handObject: 2, hairObject: 1, eyeType: 'Basic' },
      npc_hana:  { bodyObject: 3, handObject: 3, hairObject: 4, eyeType: 'laugh' },
      npc_tomo:  { bodyObject: 2, handObject: 4, hairObject: 2, eyeType: 'Basic' },
      npc_kira:  { bodyObject: 4, handObject: 2, hairObject: 1, headObject: 2, eyeType: 'Anger' },
      npc_zenji: { bodyObject: 5, handObject: 3, hairObject: 5, headObject: 3, eyeType: 'Anger' },
      npc_mako:  { bodyObject: 6, handObject: 1, hairObject: 1, cloakObject: 1, eyeType: 'Basic' },
      npc_rei:   { bodyObject: 6, handObject: 1, hairObject: 2, cloakObject: 2, eyeType: 'Anger' },
      npc_akuma: { bodyObject: 7, handObject: 4, hairObject: 1, headObject: 4, eyeType: 'Anger' },
      npc_shiro: { bodyObject: 6, handObject: 4, hairObject: 3, eyeType: 'Anger', makeupIndex: 1 },
      npc_kai:   { bodyObject: 1, handObject: 1, hairObject: 1, eyeType: 'Basic' },
      'ring-a':  { bodyObject: 1, handObject: 1, hairObject: 1, eyeType: 'Basic' },
      'ring-b':  { bodyObject: 7, handObject: 4, hairObject: 1, headObject: 4, eyeType: 'Anger' },
    };

    return presets[id] ?? { bodyObject: 1, handObject: 1, hairObject: 1 };
  }

  // ── Multiplayer ──────────────────────────────────────────────────────────

  private async connectToHub() {
    const player = this.ctx.player;
    if (!player) return;
    try {
      const client = new Client(SERVER_URL);
      const cos = player.cosmetics;
      const room = await client.joinOrCreate('hub_room', {
        playerId: player.id,
        username: player.username,
        cosmetics: {
          bodyObject:   cos?.bodyObject   ?? 1,
          headObject:   cos?.headObject   ?? 0,
          hairObject:   cos?.hairObject   ?? 1,
          handObject:   cos?.handObject   ?? 1,
          cloakObject:  cos?.cloakObject  ?? 0,
          eyeType:      cos?.eyeType      ?? 'Basic',
          makeupIndex:  cos?.makeupIndex  ?? 0,
          supportIndex: cos?.supportIndex ?? 0,
          auraColor:    cos?.auraColor    ?? '#7b2fff',
        },
      });
      if (this.sceneDestroyed) { void room.leave(); return; }
      this.hubRoom = room;
      this.mySessionId = room.sessionId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = (room as any).state;

      state.players.onAdd((hubPlayer: Record<string, unknown>, sessionId: string) => {
        if (sessionId === this.mySessionId) {
          this.myHubPlayer = hubPlayer;
          return;
        }
        this.addOtherPlayer(sessionId, hubPlayer);
      });

      state.players.onRemove((_: unknown, sessionId: string) => {
        this.removeOtherPlayer(sessionId);
      });

      room.onMessage('fight_found', (data: { reservation: unknown }) => {
        this.hideChallengePopup();
        this.ctx.switchScene('fight', { reservation: data.reservation });
      });
    } catch {
      // Offline — hub works without a server connection
    }
  }

  private addOtherPlayer(sessionId: string, hubPlayer: Record<string, unknown>) {
    const x = (hubPlayer.x as number) ?? RING_X;
    const y = (hubPlayer.y as number) ?? 440;
    const aura = colorStringToHex((hubPlayer.auraColor as string) ?? '#7b2fff');

    const root = new Container();
    root.x = x;
    root.y = y;

    const fighter = new Fighter({
      name: (hubPlayer.username as string) ?? '???',
      auraColor: aura,
      facing: x > RING_X ? 'left' : 'right',
      scale: 0.085,
      looks: {
        bodyObject:   (hubPlayer.bodyObject   as number) ?? 1,
        headObject:   (hubPlayer.headObject   as number) ?? 0,
        hairObject:   (hubPlayer.hairObject   as number) ?? 1,
        handObject:   (hubPlayer.handObject   as number) ?? 1,
        cloakObject:  (hubPlayer.cloakObject  as number) ?? 0,
        eyeType:      ((hubPlayer.eyeType     as string) ?? 'Basic') as 'Basic' | 'Anger' | 'laugh',
        makeupIndex:  (hubPlayer.makeupIndex  as number) ?? 0,
        supportIndex: (hubPlayer.supportIndex as number) ?? 0,
      },
    });
    root.addChild(fighter.container);

    const label = new Text({
      text: (hubPlayer.username as string) ?? '???',
      style: new TextStyle({
        fill: 0xffffff, fontSize: 11, fontWeight: 'bold',
        dropShadow: { blur: 4, color: '#000', distance: 1, angle: Math.PI / 4 },
      }),
    });
    label.anchor.set(0.5, 1);
    label.y = -120;
    root.addChild(label);

    this.world.addChild(root);
    this.otherPlayers.set(sessionId, { root, fighter, hubPlayer });
  }

  private removeOtherPlayer(sessionId: string) {
    const other = this.otherPlayers.get(sessionId);
    if (!other) return;
    this.world.removeChild(other.root);
    other.root.destroy({ children: true });
    this.otherPlayers.delete(sessionId);
  }

  private showChallengePopup(challengerSessionId: string) {
    if (this.challengePopup) return;
    const other = this.otherPlayers.get(challengerSessionId);
    const name = (other?.hubPlayer.username as string) ?? 'Someone';

    const popup = document.createElement('div');
    popup.style.cssText = [
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
      'background:rgba(10,10,30,.96);border:2px solid rgba(255,107,53,.65);',
      'border-radius:16px;padding:28px 32px;text-align:center;',
      'pointer-events:all;z-index:50;min-width:260px;',
      'box-shadow:0 8px 40px rgba(0,0,0,.75);',
    ].join('');
    popup.innerHTML = `
      <div style="color:#ffd700;font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:8px">CHALLENGE!</div>
      <div style="color:#ccc;font-size:14px;margin-bottom:22px">${name} wants to fight you</div>
      <div style="display:flex;gap:12px;justify-content:center">
        <button id="ch-accept" style="padding:11px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#ff6b35,#cc0000);color:#fff;font-weight:bold;font-size:14px;cursor:pointer;letter-spacing:1px">ACCEPT</button>
        <button id="ch-decline" style="padding:11px 24px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#aaa;font-size:14px;cursor:pointer">Decline</button>
      </div>
    `;
    popup.querySelector('#ch-accept')!.addEventListener('click', () => {
      this.hubRoom?.send('challenge_respond', { accept: true });
      this.hideChallengePopup();
    });
    popup.querySelector('#ch-decline')!.addEventListener('click', () => {
      this.hubRoom?.send('challenge_respond', { accept: false });
      this.hideChallengePopup();
    });

    document.getElementById('ui-layer')!.appendChild(popup);
    this.challengePopup = popup;
  }

  private hideChallengePopup() {
    this.challengePopup?.remove();
    this.challengePopup = null;
  }

  private setupInput() {
    const canvas = this.ctx.app.canvas;
    const keyDown = (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase());
    const keyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    this.cleanupFns.push(() => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    });

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - this.world.x) / this.worldScale,
        y: (clientY - rect.top - this.world.y) / this.worldScale,
      };
    };

    const onPointer = (e: PointerEvent) => {
      if (this.pinching) return;
      const p = toWorld(e.clientX, e.clientY);
      this.target = {
        x: clamp(p.x, 42, WORLD_W - 42),
        y: clamp(p.y, 270, WORLD_H - 36),
      };
    };
    canvas.addEventListener("pointerdown", onPointer);
    this.cleanupFns.push(() =>
      canvas.removeEventListener("pointerdown", onPointer),
    );

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
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
        this.worldScale = clamp(
          (this.pinchScale0 * dist(e.touches)) / this.pinchDist0,
          this.MIN_SCALE,
          this.MAX_SCALE,
        );
        this.applyCamera();
        e.preventDefault();
      }
    };
    const onEnd = () => {
      this.pinching = false;
    };
    const onWheel = (e: WheelEvent) => {
      this.worldScale = clamp(
        this.worldScale * (e.deltaY > 0 ? 0.93 : 1.08),
        this.MIN_SCALE,
        this.MAX_SCALE,
      );
      this.applyCamera();
      e.preventDefault();
    };
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.cleanupFns.push(() => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("wheel", onWheel);
    });
  }

  private focusCamera(W: number, H: number, wx: number, wy: number) {
    this.panX = W / 2 - wx * this.worldScale;
    this.panY = H / 2 - wy * this.worldScale;
    this.applyCamera();
  }

  private applyCamera() {
    const { width: W, height: H } = this.ctx.app.screen;
    const minX = W - WORLD_W * this.worldScale;
    const minY = H - WORLD_H * this.worldScale;
    this.world.x = clamp(this.panX, Math.min(minX, 0), 0);
    this.world.y = clamp(this.panY, Math.min(minY, 0), 0);
    this.panX = this.world.x;
    this.panY = this.world.y;
    if (WORLD_W * this.worldScale < W)
      this.world.x = (W - WORLD_W * this.worldScale) / 2;
    if (WORLD_H * this.worldScale < H)
      this.world.y = (H - WORLD_H * this.worldScale) / 2;
  }

  private update(ticker: Ticker) {
    const dt = ticker.deltaMS;
    this.t += dt;
    this.updatePlayerMovement(dt);
    this.updateHotspot();
    this.updateAvatars();
    this.updateRingFight(dt);
    this.updateUI();
  }

  private updatePlayerMovement(dt: number) {
    let dx = 0,
      dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;

    const p = this.playerAvatar.root;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      p.x = clamp(p.x + (dx / len) * PLAYER_SPEED * dt, 42, WORLD_W - 42);
      p.y = clamp(p.y + (dy / len) * PLAYER_SPEED * dt, 270, WORLD_H - 36);
      this.target = null;
    } else if (this.target) {
      const tx = this.target.x - p.x;
      const ty = this.target.y - p.y;
      const len = Math.hypot(tx, ty);
      if (len < 4) this.target = null;
      else {
        p.x += (tx / len) * PLAYER_SPEED * dt;
        p.y += (ty / len) * PLAYER_SPEED * dt;
      }
    }

    // Throttled position sync to server (~15/s)
    if (this.hubRoom) {
      const now = performance.now();
      const px = p.x, py = p.y;
      if (now - this.lastMoveSent > 66 &&
          (Math.abs(px - this.lastSentX) > 1 || Math.abs(py - this.lastSentY) > 1)) {
        this.hubRoom.send('move', { x: Math.round(px), y: Math.round(py) });
        this.lastMoveSent = now;
        this.lastSentX = px;
        this.lastSentY = py;
      }
    }

    // soft camera follow, only when zoomed in enough
    const { width: W, height: H } = this.ctx.app.screen;
    if (this.worldScale > 0.95) {
      this.panX += (W / 2 - p.x * this.worldScale - this.panX) * 0.045;
      this.panY += (H / 2 - p.y * this.worldScale - this.panY) * 0.045;
      this.applyCamera();
    }
  }

  private updateHotspot() {
    const px = this.playerAvatar.root.x,
      py = this.playerAvatar.root.y;
    let best: { id: Hotspot; d: number } = { id: null, d: 9999 };

    const ringD = Math.hypot(px - RING_X, py - (RING_Y + 86));
    if (ringD < best.d && ringD < 115) best = { id: "ring", d: ringD };

    const lockerD = Math.hypot(px - 110, py - 345);
    if (lockerD < best.d && lockerD < 70) best = { id: "locker", d: lockerD };

    for (const npc of this.npcAvatars) {
      const d = Math.hypot(px - npc.root.x, py - npc.root.y);
      if (d < best.d && d < 58) best = { id: `npc:${npc.id}`, d };
    }

    for (const [sessionId, other] of this.otherPlayers) {
      const d = Math.hypot(px - other.root.x, py - other.root.y);
      if (d < best.d && d < 58) best = { id: `player:${sessionId}`, d };
    }

    this.hotspot = best.id;
  }

  private updateAvatars() {
    for (const av of [
      this.playerAvatar,
      ...this.npcAvatars,
      this.ringA,
      this.ringB,
    ]) {
      const bob =
        Math.sin(this.t * 0.003 + av.idlePhase) *
        (av.kind === "ring" ? 2 : 1.6);
      if (av.kind !== "player") av.root.y = av.baseY + bob;
      av.fighter.container.y = av.kind === "player" ? bob : 0;
      av.fighter.update(this.ticker.deltaMS);
    }

    // Smooth-lerp other real players toward their server-reported position
    for (const other of this.otherPlayers.values()) {
      const tx = (other.hubPlayer.x as number) ?? other.root.x;
      const ty = (other.hubPlayer.y as number) ?? other.root.y;
      other.root.x += (tx - other.root.x) * 0.15;
      other.root.y += (ty - other.root.y) * 0.15;
      other.fighter.update(this.ticker.deltaMS);
    }

    this.ringAura.alpha = 0.65 + Math.sin(this.t * 0.002) * 0.2;
  }

  private updateRingFight(dt: number) {
    this.demoTimer += dt;
    const dur = this.DEMO_DUR[this.demoPhase];
    if (this.demoTimer >= dur) {
      this.demoTimer -= dur;
      this.demoPhase = (this.demoPhase + 1) % this.DEMO_DUR.length;
      if (this.demoPhase === 2) {
        this.hpB = Math.max(0.18, this.hpB - 0.08);
        this.triggerImpact(this.ringB.root.x, RING_Y - 30);
      }
      if (this.demoPhase === 6) {
        this.hpA = Math.max(0.18, this.hpA - 0.07);
        this.triggerImpact(this.ringA.root.x, RING_Y - 30);
      }
      if (this.demoPhase === 0 && (this.hpA < 0.25 || this.hpB < 0.25)) {
        this.hpA = 0.82;
        this.hpB = 0.67;
      }
      this.drawRingHp();
    }

    this.ringA.fighter.animState = [1, 2].includes(this.demoPhase)
      ? AnimState.ATTACK
      : AnimState.IDLE;
    this.ringB.fighter.animState = [5, 6].includes(this.demoPhase)
      ? AnimState.ATTACK
      : AnimState.IDLE;

    const pct = this.demoTimer / this.DEMO_DUR[this.demoPhase];
    const aBase = RING_X - 58,
      bBase = RING_X + 58;
    switch (this.demoPhase) {
      case 1:
        this.ringA.root.x = lerp(aBase, aBase + 26, pct);
        break;
      case 2:
        this.ringA.root.x = aBase + 26;
        break;
      case 3:
        this.ringA.root.x = lerp(aBase + 26, aBase, pct);
        this.ringB.root.x = lerp(bBase, bBase + 14, pct);
        break;
      case 4:
        this.ringB.root.x = lerp(bBase + 14, bBase, pct);
        break;
      case 5:
        this.ringB.root.x = lerp(bBase, bBase - 26, pct);
        break;
      case 6:
        this.ringB.root.x = bBase - 26;
        break;
      case 7:
        this.ringB.root.x = lerp(bBase - 26, bBase, pct);
        this.ringA.root.x = lerp(aBase, aBase - 14, pct);
        break;
      case 8:
        this.ringA.root.x = lerp(aBase - 14, aBase, pct);
        break;
      default:
        this.ringA.root.x = aBase;
        this.ringB.root.x = bBase;
    }

    if (this.impactFx.alpha > 0)
      this.impactFx.alpha = Math.max(0, this.impactFx.alpha - dt * 0.007);
  }

  private triggerImpact(x: number, y: number) {
    this.impactFx.clear();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this.impactFx
        .moveTo(0, 0)
        .lineTo(Math.cos(a) * 18, Math.sin(a) * 18)
        .stroke({ color: 0xffff55, width: 2 });
    }
    this.impactFx.circle(0, 0, 5).fill(0xffffff);
    this.impactFx.x = x;
    this.impactFx.y = y;
    this.impactFx.alpha = 1;
  }

  private buildUI(): HTMLDivElement {
    const div = document.createElement("div");
    div.style.cssText =
      "position:absolute;inset:0;pointer-events:none;font-family:system-ui,Arial,sans-serif;";

    const top = document.createElement("div");
    top.style.cssText =
      "position:absolute;top:8px;left:8px;right:8px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start;";
    top.innerHTML = `
      <div style="background:rgba(0,0,0,.58);border:1px solid rgba(255,215,0,.2);border-radius:10px;padding:7px 10px;min-width:120px">
        <div style="color:#ffd700;font-weight:800;font-size:13px;letter-spacing:1px">${this.ctx.player?.username ?? "Fighter"}</div>
        <div style="color:#899;font-size:11px">${this.ctx.player?.rankPoints ?? 1000} RP</div>
      </div>
      <div id="hub-tip" style="background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:7px 10px;color:#9aa;font-size:11px;text-align:center;max-width:55vw">Move: WASD/tap · zoom: pinch/wheel</div>
      <div style="background:rgba(0,0,0,.58);border:1px solid rgba(255,215,0,.2);border-radius:10px;padding:7px 10px;text-align:right">
        <div style="color:#ffd700;font-size:10px;font-weight:800;letter-spacing:2px">LIVE RING</div>
        <div style="color:#aaa;font-size:11px">Kai vs Akuma</div>
      </div>`;
    div.appendChild(top);

    const portrait = document.createElement("div");
    portrait.id = "rotate-hint";
    portrait.style.cssText =
      "display:none;position:absolute;top:48px;left:50%;transform:translateX(-50%);background:rgba(255,107,53,.14);border:1px solid rgba(255,107,53,.35);border-radius:999px;color:#ffc2aa;font-size:11px;padding:6px 12px;white-space:nowrap;";
    portrait.textContent = "Landscape werkt beter voor de hub";
    div.appendChild(portrait);

    const actions = document.createElement("div");
    actions.id = "hub-actions";
    actions.style.cssText =
      "position:absolute;left:50%;bottom:14px;transform:translateX(-50%);pointer-events:all;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;";
    div.appendChild(actions);

    this.rebuildActions(actions);
    return div;
  }

  private updateUI() {
    const actions = this.uiEl.querySelector(
      "#hub-actions",
    ) as HTMLDivElement | null;
    if (actions && actions.dataset.hotspot !== String(this.hotspot))
      this.rebuildActions(actions);
    const rotate = this.uiEl.querySelector(
      "#rotate-hint",
    ) as HTMLDivElement | null;
    if (rotate)
      rotate.style.display =
        this.ctx.app.screen.height > this.ctx.app.screen.width
          ? "block"
          : "none";

    // Show/hide incoming challenge popup based on server state
    const challengeFrom = (this.myHubPlayer?.challengeFrom as string) ?? '';
    if (challengeFrom !== this.lastChallengeFrom) {
      this.lastChallengeFrom = challengeFrom;
      if (challengeFrom) this.showChallengePopup(challengeFrom);
      else this.hideChallengePopup();
    }
  }

  private rebuildActions(actions: HTMLDivElement) {
    actions.dataset.hotspot = String(this.hotspot);
    actions.innerHTML = "";

    if (this.hotspot === "locker") {
      actions.appendChild(
        this.makeBtn("LOCKER", "#112244", "#1a5cff", () =>
          this.ctx.switchScene("locker"),
        ),
      );
      return;
    }

    if (this.hotspot?.startsWith("player:")) {
      const sessionId = this.hotspot.slice(7);
      const other = this.otherPlayers.get(sessionId);
      const username = (other?.hubPlayer.username as string) ?? 'Player';
      actions.appendChild(
        this.makeBtn(`FIGHT ${username}`, "#661111", "#ff4b2b", () => {
          this.hubRoom?.send('challenge', { targetSessionId: sessionId });
          this.flashTip(`Challenge sent to ${username}!`);
        }),
      );
      return;
    }

    if (this.hotspot?.startsWith("npc:")) {
      const id = this.hotspot.slice(4);
      const npc = this.npcAvatars.find((n) => n.id === id)?.npc;
      if (npc) {
        const claimed = this.hasNpcReward(npc.id);
        actions.appendChild(
          this.makeBtn(`FIGHT ${npc.name}`, "#661111", "#ff4b2b", () =>
            this.ctx.switchScene("fight", { npcId: npc.id }),
          ),
        );
        actions.appendChild(
          this.makePill(
            `${npc.tier.toUpperCase()} · ${claimed ? "reward claimed" : "first win reward"}`,
          ),
        );
      }
      return;
    }

    if (this.hotspot === "ring") {
      actions.appendChild(
        this.makeBtn("WATCH", "#111130", "#333377", () =>
          this.flashTip("Featured fight is already live in the ring."),
        ),
      );
      actions.appendChild(
        this.makeBtn("CHALLENGE", "#aa2200", "#ff6b35", () =>
          this.ctx.switchScene("fight", {}),
        ),
      );
      actions.appendChild(
        this.makeBtn("EMOTE", "#202020", "#444444", () => this.playEmote()),
      );
      return;
    }

    actions.appendChild(this.makePill("Walk to the ring, locker, or an NPC"));
  }

  private makeBtn(
    label: string,
    c1: string,
    c2: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `border:1px solid rgba(255,255,255,.18);border-radius:12px;background:linear-gradient(135deg,${c1},${c2});color:#fff;font-weight:900;letter-spacing:1.6px;font-size:13px;padding:11px 17px;box-shadow:0 6px 24px rgba(0,0,0,.42);cursor:pointer;`;
    btn.onclick = onClick;
    return btn;
  }

  private makePill(label: string): HTMLDivElement {
    const pill = document.createElement("div");
    pill.textContent = label;
    pill.style.cssText =
      "background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);border-radius:999px;color:#aab;font-size:12px;padding:9px 13px;";
    return pill;
  }

  private flashTip(text: string) {
    const tip = this.uiEl.querySelector("#hub-tip") as HTMLDivElement | null;
    if (!tip) return;
    const old = tip.textContent;
    tip.textContent = text;
    window.setTimeout(() => {
      if (tip) tip.textContent = old;
    }, 1300);
  }

  private playEmote() {
    const emote = new Text({
      text: "🔥",
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 18,
        stroke: { color: "#000", width: 4 },
      }),
    });
    emote.anchor.set(0.5);
    emote.x = 0;
    emote.y = -70;
    this.playerAvatar.root.addChild(emote);
    window.setTimeout(() => emote.destroy(), 1000);
  }

  private hasNpcReward(npcId: string) {
    const playerId = this.ctx.player?.id ?? "guest";
    return localStorage.getItem(`ahf:npcReward:${playerId}:${npcId}`) === "1";
  }

  destroy() {
    this.sceneDestroyed = true;
    this.ticker.stop();
    this.ticker.destroy();
    this.cleanupFns.forEach((fn) => fn());

    // Disconnect from hub room
    void this.hubRoom?.leave();
    this.hubRoom = null;

    // Clean up other player display objects
    for (const sessionId of [...this.otherPlayers.keys()]) {
      this.removeOtherPlayer(sessionId);
    }

    // Remove any open overlays
    this.hideChallengePopup();
    this.countdownOverlay?.remove();
    this.countdownOverlay = null;

    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function colorStringToHex(c: string): number {
  if (!c) return 0x4a90d9;
  return Number.parseInt(c.replace("#", ""), 16) || 0x4a90d9;
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
