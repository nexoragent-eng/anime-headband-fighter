import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameContext } from '../main';
import { Fighter } from '../game/Fighter';

const HAIR_STYLES = 4;
const OUTFIT_COLORS = ['#4a90d9', '#e05050', '#44aa44', '#cc44cc', '#ff8c00', '#00aacc'];
const AURA_COLORS = ['#7b2fff', '#ff8c00', '#00ffaa', '#ff2266', '#00ccff', '#ffff00'];

export class LockerRoomScene {
  private container: Container;
  private uiEl: HTMLDivElement;
  private preview: Fighter;
  private hairStyle = 0;
  private outfitColor = '#4a90d9';
  private auraColor = '#7b2fff';
  private charName = '';

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const { width: W, height: H } = ctx.app.screen;

    // BG
    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x0d0d2a);
    this.container.addChild(bg);

    // Title
    const title = new Text({
      text: 'LOCKER ROOM',
      style: new TextStyle({
        fill: '#ffd700',
        fontSize: 28,
        fontFamily: 'Impact, Arial Black, sans-serif',
        letterSpacing: 4,
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = W / 2;
    title.y = 16;
    this.container.addChild(title);

    // Character preview (center)
    const cos = ctx.player?.cosmetics;
    this.outfitColor = cos?.outfitColor ?? '#4a90d9';
    this.auraColor = cos?.auraColor ?? '#7b2fff';
    this.hairStyle = cos?.hairStyle ?? 0;
    this.charName = cos?.characterName ?? ctx.player?.username ?? '';

    this.preview = new Fighter({
      name: this.charName,
      outfitColor: parseInt(this.outfitColor.replace('#', ''), 16),
      auraColor: parseInt(this.auraColor.replace('#', ''), 16),
      facing: 'right',
    });
    this.preview.container.scale.set(2.5);
    this.preview.container.x = W / 2;
    this.preview.container.y = H * 0.45;
    this.container.addChild(this.preview.container);

    this.uiEl = this.buildUI();
    document.getElementById('ui-layer')!.appendChild(this.uiEl);
  }

  private buildUI(): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:24px;';

    const panel = document.createElement('div');
    panel.style.cssText = `
      pointer-events:all; background:rgba(10,10,30,0.9); border:1px solid rgba(255,215,0,0.3);
      border-radius:14px; padding:20px; width:min(400px,90vw); display:flex; flex-direction:column; gap:14px;
    `;

    // Character name
    panel.appendChild(this.makeField('Fighter Name', () => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = this.charName;
      inp.maxLength = 20;
      inp.style.cssText = 'width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,255,255,0.06);color:#fff;font-size:15px;font-family:inherit;';
      inp.addEventListener('input', () => {
        this.charName = inp.value;
        this.updatePreview();
      });
      return inp;
    }));

    // Outfit color
    panel.appendChild(this.makeField('Outfit Color', () => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      OUTFIT_COLORS.forEach(col => {
        const dot = document.createElement('button');
        dot.style.cssText = `width:32px;height:32px;border-radius:50%;background:${col};border:2px solid ${col === this.outfitColor ? '#fff' : 'transparent'};cursor:pointer;`;
        dot.addEventListener('click', () => {
          this.outfitColor = col;
          wrap.querySelectorAll('button').forEach((b: Element) => ((b as HTMLElement).style.border = '2px solid transparent'));
          dot.style.border = '2px solid #fff';
          this.updatePreview();
        });
        wrap.appendChild(dot);
      });
      return wrap;
    }));

    // Aura color
    panel.appendChild(this.makeField('Aura Color', () => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      AURA_COLORS.forEach(col => {
        const dot = document.createElement('button');
        dot.style.cssText = `width:32px;height:32px;border-radius:50%;background:${col};border:2px solid ${col === this.auraColor ? '#fff' : 'transparent'};cursor:pointer;box-shadow:0 0 8px ${col};`;
        dot.addEventListener('click', () => {
          this.auraColor = col;
          wrap.querySelectorAll('button').forEach((b: Element) => ((b as HTMLElement).style.border = '2px solid transparent'));
          dot.style.border = '2px solid #fff';
          this.updatePreview();
        });
        wrap.appendChild(dot);
      });
      return wrap;
    }));

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'SAVE & BACK';
    saveBtn.style.cssText = 'flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#ff6b35,#ff0000);color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;';
    saveBtn.addEventListener('click', () => this.saveAndBack());

    const backBtn = document.createElement('button');
    backBtn.textContent = 'BACK';
    backBtn.style.cssText = 'padding:12px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#aaa;font-size:14px;cursor:pointer;font-family:inherit;';
    backBtn.addEventListener('click', () => this.ctx.switchScene('hub'));

    btnRow.append(saveBtn, backBtn);
    panel.appendChild(btnRow);

    div.appendChild(panel);
    return div;
  }

  private makeField(label: string, buildInput: () => HTMLElement): HTMLDivElement {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = 'color:#ffd700;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:6px;';
    wrap.appendChild(lbl);
    wrap.appendChild(buildInput());
    return wrap;
  }

  private updatePreview() {
    if (!this.preview) return;
    this.preview.destroy();
    this.preview = new Fighter({
      name: this.charName || this.ctx.player?.username || 'Fighter',
      outfitColor: parseInt(this.outfitColor.replace('#', ''), 16),
      auraColor: parseInt(this.auraColor.replace('#', ''), 16),
      facing: 'right',
    });
    const { width: W, height: H } = this.ctx.app.screen;
    this.preview.container.scale.set(2.5);
    this.preview.container.x = W / 2;
    this.preview.container.y = H * 0.45;
    this.container.addChild(this.preview.container);
  }

  private async saveAndBack() {
    const player = this.ctx.player;
    if (!player) { this.ctx.switchScene('hub'); return; }

    player.cosmetics.outfitColor = this.outfitColor;
    player.cosmetics.auraColor = this.auraColor;
    player.cosmetics.hairStyle = this.hairStyle;
    player.cosmetics.characterName = this.charName;

    try {
      await fetch(`/player/${player.id}/cosmetics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hairStyle: this.hairStyle,
          outfitColor: this.outfitColor,
          auraColor: this.auraColor,
          characterName: this.charName,
        }),
      });
    } catch {
      // Offline — cosmetics saved locally only
    }

    this.ctx.switchScene('hub');
  }

  destroy() {
    this.preview.destroy();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}
