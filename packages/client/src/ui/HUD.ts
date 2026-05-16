import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { MAX_ENERGY, BASE_HP } from '@ahf/shared';

interface HUDOpts {
  p1Name: string;
  p2Name: string;
  p1Color: number;
  p2Color: number;
}

export class HUD {
  readonly container: Container;
  private p1HpBar: Graphics;
  private p2HpBar: Graphics;
  private p1EnergyBar: Graphics;
  private p2EnergyBar: Graphics;
  private timerText: Text;
  private roundText: Text;
  private p1WinDots: Graphics;
  private p2WinDots: Graphics;
  private p1Hp = BASE_HP;
  private p2Hp = BASE_HP;
  private p1Energy = 0;
  private p2Energy = 0;
  private w: number;
  private _h: number;

  constructor(screenW: number, screenH: number, opts: HUDOpts) {
    this.w = screenW;
    this._h = screenH;
    this.container = new Container();

    const pad = 12;
    const barH = 22;
    const barW = (screenW / 2) - pad * 2.5;

    // Background strip
    const bg = new Graphics();
    bg.rect(0, 0, screenW, 80).fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(bg);

    // P1 HP bar (left side)
    const p1HpBg = new Graphics();
    p1HpBg.rect(pad, pad + 20, barW, barH).fill({ color: 0x333333, alpha: 1 });
    this.container.addChild(p1HpBg);

    this.p1HpBar = new Graphics();
    this.container.addChild(this.p1HpBar);

    // P2 HP bar (right side)
    const p2HpBg = new Graphics();
    p2HpBg.rect(screenW / 2 + pad * 1.5, pad + 20, barW, barH).fill({ color: 0x333333, alpha: 1 });
    this.container.addChild(p2HpBg);

    this.p2HpBar = new Graphics();
    this.container.addChild(this.p2HpBar);

    // P1 energy bar
    const p1EnBg = new Graphics();
    p1EnBg.rect(pad, pad + 20 + barH + 4, barW, 8).fill({ color: 0x222222, alpha: 1 });
    this.container.addChild(p1EnBg);

    this.p1EnergyBar = new Graphics();
    this.container.addChild(this.p1EnergyBar);

    // P2 energy bar
    const p2EnBg = new Graphics();
    p2EnBg.rect(screenW / 2 + pad * 1.5, pad + 20 + barH + 4, barW, 8).fill({ color: 0x222222, alpha: 1 });
    this.container.addChild(p2EnBg);

    this.p2EnergyBar = new Graphics();
    this.container.addChild(this.p2EnergyBar);

    // Names
    const nameStyle: Partial<TextStyle> = { fill: '#fff', fontSize: 13, fontWeight: 'bold' };
    const p1Name = new Text({ text: opts.p1Name, style: new TextStyle(nameStyle) });
    p1Name.x = pad;
    p1Name.y = pad + 4;
    this.container.addChild(p1Name);

    const p2Name = new Text({ text: opts.p2Name, style: new TextStyle({ ...nameStyle, align: 'right' }) });
    p2Name.anchor.set(1, 0);
    p2Name.x = screenW - pad;
    p2Name.y = pad + 4;
    this.container.addChild(p2Name);

    // Round win dots
    this.p1WinDots = new Graphics();
    this.p1WinDots.x = pad;
    this.p1WinDots.y = pad + 20 + barH + 14;
    this.container.addChild(this.p1WinDots);

    this.p2WinDots = new Graphics();
    this.p2WinDots.x = screenW - pad;
    this.p2WinDots.y = pad + 20 + barH + 14;
    this.container.addChild(this.p2WinDots);

    // Timer
    this.timerText = new Text({
      text: '20',
      style: new TextStyle({
        fill: '#ffffff',
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Impact, Arial Black, sans-serif',
        dropShadow: true,
        dropShadowBlur: 8,
        dropShadowColor: '#000',
        dropShadowDistance: 2,
      }),
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = screenW / 2;
    this.timerText.y = pad;
    this.container.addChild(this.timerText);

    // Round text
    this.roundText = new Text({
      text: 'ROUND 1',
      style: new TextStyle({
        fill: '#ffd700',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
      }),
    });
    this.roundText.anchor.set(0.5, 1);
    this.roundText.x = screenW / 2;
    this.roundText.y = 78;
    this.container.addChild(this.roundText);

    this.redraw(opts.p1Color, opts.p2Color, barW, pad, barH);
  }

  private redraw(p1Color: number, p2Color: number, barW: number, pad: number, barH: number) {
    const p1Pct = Math.max(0, this.p1Hp / BASE_HP);
    const p2Pct = Math.max(0, this.p2Hp / BASE_HP);
    const p1EnPct = Math.max(0, this.p1Energy / MAX_ENERGY);
    const p2EnPct = Math.max(0, this.p2Energy / MAX_ENERGY);

    const hpColor = (pct: number) => pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2222;

    this.p1HpBar.clear();
    this.p1HpBar.rect(pad, pad + 20, barW * p1Pct, barH).fill(hpColor(p1Pct));

    this.p2HpBar.clear();
    this.p2HpBar.rect(this.w / 2 + pad * 1.5, pad + 20, barW * p2Pct, barH).fill(hpColor(p2Pct));

    this.p1EnergyBar.clear();
    this.p1EnergyBar.rect(pad, pad + 20 + barH + 4, barW * p1EnPct, 8)
      .fill(p1EnPct >= 1 ? 0xffd700 : p1Color);

    this.p2EnergyBar.clear();
    this.p2EnergyBar.rect(this.w / 2 + pad * 1.5, pad + 20 + barH + 4, barW * p2EnPct, 8)
      .fill(p2EnPct >= 1 ? 0xffd700 : p2Color);
  }

  update(p1Hp: number, p2Hp: number, p1Energy: number, p2Energy: number, timer: number, round: number, p1Wins: number, p2Wins: number) {
    this.p1Hp = p1Hp;
    this.p2Hp = p2Hp;
    this.p1Energy = p1Energy;
    this.p2Energy = p2Energy;

    const pad = 12;
    const barH = 22;
    const barW = (this.w / 2) - pad * 2.5;
    this.redraw(0x4a90d9, 0xe05050, barW, pad, barH);

    this.timerText.text = String(Math.ceil(timer));
    this.timerText.style.fill = timer <= 5 ? '#ff4444' : '#ffffff';
    this.roundText.text = `ROUND ${round}`;

    // win dots
    this.p1WinDots.clear();
    for (let i = 0; i < p1Wins; i++) {
      this.p1WinDots.circle(i * 14, 0, 5).fill(0xffd700);
    }
    this.p2WinDots.clear();
    for (let i = 0; i < p2Wins; i++) {
      this.p2WinDots.circle(-(i * 14), 0, 5).fill(0xffd700);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
