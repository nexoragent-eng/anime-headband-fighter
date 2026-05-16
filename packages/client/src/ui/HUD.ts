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
  private w: number;
  private p1Color: number;
  private p2Color: number;
  private barW: number;
  private pad: number;
  private barH: number;

  constructor(screenW: number, screenH: number, opts: HUDOpts) {
    void screenH;
    this.w = screenW;
    this.pad = 12;
    this.barH = 22;
    this.barW = (screenW / 2) - this.pad * 2.5;
    this.p1Color = opts.p1Color;
    this.p2Color = opts.p2Color;
    this.container = new Container();

    const { pad, barH, barW } = this;

    const bg = new Graphics();
    bg.rect(0, 0, screenW, 80).fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(bg);

    const p1HpBg = new Graphics();
    p1HpBg.rect(pad, pad + 20, barW, barH).fill({ color: 0x333333, alpha: 1 });
    this.container.addChild(p1HpBg);

    this.p1HpBar = new Graphics();
    this.container.addChild(this.p1HpBar);

    const p2HpBg = new Graphics();
    p2HpBg.rect(screenW / 2 + pad * 1.5, pad + 20, barW, barH).fill({ color: 0x333333, alpha: 1 });
    this.container.addChild(p2HpBg);

    this.p2HpBar = new Graphics();
    this.container.addChild(this.p2HpBar);

    const p1EnBg = new Graphics();
    p1EnBg.rect(pad, pad + 20 + barH + 4, barW, 8).fill({ color: 0x222222, alpha: 1 });
    this.container.addChild(p1EnBg);

    this.p1EnergyBar = new Graphics();
    this.container.addChild(this.p1EnergyBar);

    const p2EnBg = new Graphics();
    p2EnBg.rect(screenW / 2 + pad * 1.5, pad + 20 + barH + 4, barW, 8).fill({ color: 0x222222, alpha: 1 });
    this.container.addChild(p2EnBg);

    this.p2EnergyBar = new Graphics();
    this.container.addChild(this.p2EnergyBar);

    const nameStyle: Partial<TextStyle> = { fill: 0xffffff as unknown as string, fontSize: 13, fontWeight: 'bold' };
    const p1Name = new Text({ text: opts.p1Name, style: new TextStyle(nameStyle) });
    p1Name.x = pad;
    p1Name.y = pad + 4;
    this.container.addChild(p1Name);

    const p2Name = new Text({ text: opts.p2Name, style: new TextStyle({ ...nameStyle }) });
    p2Name.anchor.set(1, 0);
    p2Name.x = screenW - pad;
    p2Name.y = pad + 4;
    this.container.addChild(p2Name);

    this.p1WinDots = new Graphics();
    this.p1WinDots.x = pad;
    this.p1WinDots.y = pad + 20 + barH + 14;
    this.container.addChild(this.p1WinDots);

    this.p2WinDots = new Graphics();
    this.p2WinDots.x = screenW - pad;
    this.p2WinDots.y = pad + 20 + barH + 14;
    this.container.addChild(this.p2WinDots);

    this.timerText = new Text({
      text: '20',
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'Impact, Arial Black, sans-serif',
        dropShadow: { blur: 8, color: '#000', distance: 2, angle: Math.PI / 4 },
      }),
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = screenW / 2;
    this.timerText.y = pad;
    this.container.addChild(this.timerText);

    this.roundText = new Text({
      text: 'ROUND 1',
      style: new TextStyle({ fill: 0xffd700, fontSize: 12, fontWeight: 'bold', letterSpacing: 2 }),
    });
    this.roundText.anchor.set(0.5, 1);
    this.roundText.x = screenW / 2;
    this.roundText.y = 78;
    this.container.addChild(this.roundText);
  }

  update(p1Hp: number, p2Hp: number, p1Energy: number, p2Energy: number, timer: number, round: number, p1Wins: number, p2Wins: number) {
    const { pad, barH, barW } = this;
    const p1Pct = Math.max(0, p1Hp / BASE_HP);
    const p2Pct = Math.max(0, p2Hp / BASE_HP);
    const p1EnPct = Math.max(0, p1Energy / MAX_ENERGY);
    const p2EnPct = Math.max(0, p2Energy / MAX_ENERGY);
    const hpColor = (pct: number) => pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2222;

    this.p1HpBar.clear();
    this.p1HpBar.rect(pad, pad + 20, barW * p1Pct, barH).fill(hpColor(p1Pct));

    this.p2HpBar.clear();
    this.p2HpBar.rect(this.w / 2 + pad * 1.5, pad + 20, barW * p2Pct, barH).fill(hpColor(p2Pct));

    this.p1EnergyBar.clear();
    this.p1EnergyBar.rect(pad, pad + 20 + barH + 4, barW * p1EnPct, 8)
      .fill(p1EnPct >= 1 ? 0xffd700 : this.p1Color);

    this.p2EnergyBar.clear();
    this.p2EnergyBar.rect(this.w / 2 + pad * 1.5, pad + 20 + barH + 4, barW * p2EnPct, 8)
      .fill(p2EnPct >= 1 ? 0xffd700 : this.p2Color);

    this.timerText.text = String(Math.ceil(timer));
    this.timerText.style.fill = timer <= 5 ? 0xff4444 : 0xffffff;
    this.roundText.text = `ROUND ${round}`;

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
