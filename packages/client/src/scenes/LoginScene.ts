import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameContext } from '../main';
import type { PlayerProfile } from '@ahf/shared';

export class LoginScene {
  private container: Container;
  private uiEl: HTMLDivElement;

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);
    this.uiEl = this.buildUI();
    document.getElementById('ui-layer')!.appendChild(this.uiEl);
    this.drawBackground();
  }

  private drawBackground() {
    const { width, height } = this.ctx.app.screen;
    const bg = new Graphics();
    bg.rect(0, 0, width, height).fill(0x0a0a1a);
    this.container.addChild(bg);

    const title = new Text({
      text: '⚔ ANIME\nHEADBAND\nFIGHTER',
      style: new TextStyle({
        fill: 0xff6b35,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontSize: Math.min(width * 0.12, 72),
        fontWeight: 'bold',
        align: 'center',
        dropShadow: { blur: 20, color: '#ff0000', distance: 0, angle: 0 },
        stroke: { color: '#000000', width: 4 },
        letterSpacing: 4,
      }),
    });
    title.anchor.set(0.5);
    title.x = width / 2;
    title.y = height * 0.28;
    this.container.addChild(title);

    const ring = new Graphics();
    ring.circle(width / 2, height * 0.28, Math.min(width, height) * 0.22)
      .stroke({ color: 0xff6b35, width: 3, alpha: 0.3 });
    ring.circle(width / 2, height * 0.28, Math.min(width, height) * 0.24)
      .stroke({ color: 0xffd700, width: 1, alpha: 0.15 });
    this.container.addChild(ring);
  }

  private buildUI(): HTMLDivElement {
    const { height } = this.ctx.app.screen;
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end; padding-bottom: ${height * 0.15}px;
    `;

    const form = document.createElement('div');
    form.style.cssText = `
      pointer-events: all; display: flex; flex-direction: column; align-items: center;
      gap: 16px; width: min(340px, 88vw);
      background: rgba(10,10,30,0.85); border: 1px solid rgba(255,107,53,0.4);
      border-radius: 16px; padding: 28px 24px; backdrop-filter: blur(8px);
    `;

    const label = document.createElement('p');
    label.textContent = 'Enter your fighter name';
    label.style.cssText = 'color: #ffd700; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin: 0;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. NarutoFan99';
    input.maxLength = 20;
    input.style.cssText = `
      width: 100%; padding: 12px 16px; border-radius: 10px;
      border: 2px solid rgba(255,107,53,0.5); background: rgba(255,255,255,0.07);
      color: #fff; font-size: 18px; outline: none; text-align: center; font-family: inherit;
    `;
    input.addEventListener('focus', () => { input.style.borderColor = '#ff6b35'; });
    input.addEventListener('blur', () => { input.style.borderColor = 'rgba(255,107,53,0.5)'; });

    const error = document.createElement('p');
    error.style.cssText = 'color: #ff4444; font-size: 13px; min-height: 18px; margin: 0;';

    const btn = document.createElement('button');
    btn.textContent = 'ENTER THE ARENA';
    btn.style.cssText = `
      width: 100%; padding: 14px; border-radius: 10px; border: none; cursor: pointer;
      background: linear-gradient(135deg, #ff6b35, #ff0000);
      color: #fff; font-size: 16px; font-weight: bold; letter-spacing: 2px;
      text-transform: uppercase; transition: transform 0.1s; font-family: inherit;
      box-shadow: 0 4px 20px rgba(255,107,53,0.4);
    `;
    btn.addEventListener('mouseover', () => { btn.style.transform = 'scale(1.02)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.97)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1.02)'; });

    const localFightBtn = document.createElement('button');
    localFightBtn.textContent = '⚔ LOCAL FIGHT (2 players, 1 screen)';
    localFightBtn.style.cssText = `
      width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,215,0,0.4);
      background: rgba(255,215,0,0.08); color: #ffd700; font-size: 13px; cursor: pointer;
      letter-spacing: 1px; font-family: inherit; transition: background 0.2s;
    `;
    localFightBtn.addEventListener('mouseover', () => { localFightBtn.style.background = 'rgba(255,215,0,0.15)'; });
    localFightBtn.addEventListener('mouseleave', () => { localFightBtn.style.background = 'rgba(255,215,0,0.08)'; });

    const login = async () => {
      const name = input.value.trim();
      if (name.length < 2) { error.textContent = 'Name must be at least 2 characters'; return; }
      btn.disabled = true;
      btn.textContent = 'Entering...';
      error.textContent = '';
      try {
        const res = await fetch('/auth/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name }),
        });
        if (!res.ok) {
          const data = await res.json() as { error?: string };
          error.textContent = data.error ?? 'Server error';
          btn.disabled = false;
          btn.textContent = 'ENTER THE ARENA';
          return;
        }
        const player = await res.json() as PlayerProfile;
        this.ctx.player = player;
        this.ctx.switchScene('hub');
      } catch {
        error.textContent = 'Cannot reach server. Try local fight mode.';
        btn.disabled = false;
        btn.textContent = 'ENTER THE ARENA';
      }
    };

    btn.addEventListener('click', login);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') void login(); });

    localFightBtn.addEventListener('click', () => {
      this.ctx.player = {
        id: 'local',
        username: input.value.trim() || 'Player1',
        rankPoints: 1000,
        cosmetics: { hairStyle: 0, outfitColor: '#4a90d9', auraColor: '#7b2fff', characterName: '' },
        currentRunCards: [],
        fightsInCurrentRun: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.ctx.switchScene('fight', { local: true });
    });

    form.append(label, input, error, btn, localFightBtn);
    div.appendChild(form);
    return div;
  }

  destroy() {
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}
