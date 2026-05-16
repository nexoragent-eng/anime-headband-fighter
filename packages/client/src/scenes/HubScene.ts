import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { GameContext } from '../main';

export class HubScene {
  private container: Container;
  private ticker: Ticker;
  private uiEl: HTMLDivElement;

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);
    this.drawHub();
    this.uiEl = this.buildUI();
    document.getElementById('ui-layer')!.appendChild(this.uiEl);

    this.ticker = new Ticker();
    this.ticker.add(this.update.bind(this));
    this.ticker.start();
  }

  private drawHub() {
    const { width: W, height: H } = this.ctx.app.screen;
    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x0d0d1f);
    this.container.addChild(bg);

    // Floor
    bg.rect(0, H * 0.6, W, H * 0.4).fill(0x12122a);

    // Ring
    const ringX = W / 2;
    const ringY = H * 0.52;
    const ringW = Math.min(W * 0.5, 320);
    const ringH = Math.min(H * 0.3, 160);

    const ring = new Graphics();
    // ring canvas
    ring.rect(ringX - ringW / 2, ringY - ringH / 2, ringW, ringH).fill({ color: 0x0a0a20, alpha: 1 });
    // ring ropes (3 levels)
    [0.2, 0.5, 0.8].forEach(t => {
      ring.rect(ringX - ringW / 2, ringY - ringH / 2 + ringH * t, ringW, 3).fill(0xffd700);
    });
    // corner posts
    [-1, 1].forEach(dx => {
      ring.rect(ringX + dx * ringW / 2 - 5, ringY - ringH / 2, 10, ringH).fill(0xaaaaaa);
    });
    // ring shadow
    ring.ellipse(ringX, ringY + ringH / 2 - 4, ringW * 0.55, 12).fill({ color: 0x000000, alpha: 0.4 });
    this.container.addChild(ring);

    // Ring label
    const ringLabel = new Text({
      text: '🥊 MAIN RING',
      style: new TextStyle({ fill: '#ffd700', fontSize: 13, fontWeight: 'bold', letterSpacing: 2 }),
    });
    ringLabel.anchor.set(0.5, 1);
    ringLabel.x = ringX;
    ringLabel.y = ringY - ringH / 2 - 8;
    this.container.addChild(ringLabel);

    // VS text in ring
    const vs = new Text({
      text: 'VS',
      style: new TextStyle({
        fill: '#ff6b35',
        fontSize: 36,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: '#000',
        dropShadowBlur: 10,
        dropShadowDistance: 0,
      }),
    });
    vs.anchor.set(0.5);
    vs.x = ringX;
    vs.y = ringY;
    this.container.addChild(vs);

    // Decorative fighters in ring (placeholder)
    const f1 = new Graphics();
    f1.rect(-20, -40, 40, 60).fill(0x4a90d9);
    f1.circle(0, -52, 16).fill(0xffcc99);
    f1.x = ringX - 60;
    f1.y = ringY + 10;
    this.container.addChild(f1);

    const f2 = new Graphics();
    f2.rect(-20, -40, 40, 60).fill(0xe05050);
    f2.circle(0, -52, 16).fill(0xffcc99);
    f2.x = ringX + 60;
    f2.y = ringY + 10;
    this.container.addChild(f2);

    // Title
    const title = new Text({
      text: 'HEADBAND ARENA',
      style: new TextStyle({
        fill: ['#ff6b35', '#ffd700'],
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontSize: Math.min(W * 0.055, 36),
        fontWeight: 'bold',
        letterSpacing: 4,
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = W / 2;
    title.y = 12;
    this.container.addChild(title);
  }

  private buildUI(): HTMLDivElement {
    const { width: W, height: H } = this.ctx.app.screen;
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

    const player = this.ctx.player;

    // Player info (top left)
    const info = document.createElement('div');
    info.style.cssText = `
      position:absolute; top:10px; left:12px; pointer-events:none;
      color:#fff; font-size:13px; line-height:1.6;
    `;
    info.innerHTML = `
      <span style="color:#ffd700;font-weight:bold">${player?.username ?? 'Fighter'}</span>
      <span style="color:#aaa"> · ${player?.rankPoints ?? 1000} RP</span>
    `;
    div.appendChild(info);

    // Buttons (bottom center)
    const btnArea = document.createElement('div');
    btnArea.style.cssText = `
      position:absolute; bottom:${H * 0.06}px; left:50%; transform:translateX(-50%);
      pointer-events:all; display:flex; gap:12px; flex-direction:column; align-items:center;
    `;

    const fightBtn = this.makeBtn('⚔ FIGHT', '#ff6b35', '#ff0000');
    fightBtn.addEventListener('click', () => this.ctx.switchScene('fight', { local: true }));

    const lockerBtn = this.makeBtn('👕 LOCKER ROOM', '#2a2a4a', '#1a1a3a');
    lockerBtn.style.border = '1px solid rgba(255,215,0,0.4)';
    lockerBtn.style.color = '#ffd700';
    lockerBtn.addEventListener('click', () => this.ctx.switchScene('locker'));

    btnArea.append(fightBtn, lockerBtn);
    div.appendChild(btnArea);

    // Leaderboard (right side)
    const lb = document.createElement('div');
    lb.style.cssText = `
      position:absolute; top:50px; right:12px; width:min(200px,42vw); pointer-events:none;
      background:rgba(0,0,0,0.7); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:10px;
    `;
    lb.innerHTML = `
      <div style="color:#ffd700;font-size:12px;font-weight:bold;letter-spacing:2px;margin-bottom:8px">TOP FIGHTERS</div>
      <div style="color:#aaa;font-size:11px" id="lb-content">Loading...</div>
    `;
    div.appendChild(lb);

    this.fetchLeaderboard(lb.querySelector('#lb-content') as HTMLElement);

    return div;
  }

  private makeBtn(text: string, c1: string, c2: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding:14px 32px; border:none; border-radius:10px; cursor:pointer;
      background:linear-gradient(135deg,${c1},${c2}); color:#fff;
      font-size:16px; font-weight:bold; letter-spacing:2px; font-family:inherit;
      box-shadow:0 4px 20px rgba(0,0,0,0.4); transition:transform 0.1s;
      min-width:180px;
    `;
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.96)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
    return btn;
  }

  private async fetchLeaderboard(el: HTMLElement) {
    try {
      const res = await fetch('/leaderboard');
      const data = await res.json() as Array<{ rank: number; username: string; rankPoints: number; headbandTier: string | null }>;
      el.innerHTML = data.map(e => {
        const hb = e.headbandTier === 'gold' ? '🥇' : e.headbandTier === 'silver' ? '🥈' : e.headbandTier === 'bronze' ? '🥉' : `${e.rank}.`;
        const color = e.headbandTier === 'gold' ? '#ffd700' : e.headbandTier === 'silver' ? '#c0c0c0' : e.headbandTier === 'bronze' ? '#cd7f32' : '#ccc';
        return `<div style="color:${color};margin-bottom:4px;font-size:12px">${hb} ${e.username} <span style="opacity:0.6">${e.rankPoints}rp</span></div>`;
      }).join('');
    } catch {
      el.innerHTML = '<span style="color:#666">Server offline</span>';
    }
  }

  private update(_ticker: Ticker) {
    // future: animate hub avatars
  }

  destroy() {
    this.ticker.stop();
    this.ticker.destroy();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}
