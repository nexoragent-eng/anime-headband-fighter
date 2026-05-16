import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { AnimState } from '@ahf/shared';
import { BASE_HP, MAX_ENERGY } from '@ahf/shared';

const W = 56;
const H = 80;

interface FighterOptions {
  name: string;
  outfitColor: number;
  auraColor: number;
  facing: 'right' | 'left';
}

export class Fighter {
  readonly container: Container;
  private body: Graphics;
  private head: Graphics;
  private auraGlow: Graphics;
  private nameLabel: Text;
  private shakeTween = 0;
  private flashAlpha = 0;
  private bankaiFlash: Graphics;
  private _animState: AnimState = AnimState.IDLE;
  private opts: FighterOptions;

  constructor(opts: FighterOptions) {
    this.opts = opts;
    this.container = new Container();

    this.auraGlow = new Graphics();
    this.container.addChild(this.auraGlow);

    this.body = new Graphics();
    this.container.addChild(this.body);

    this.head = new Graphics();
    this.container.addChild(this.head);

    this.bankaiFlash = new Graphics();
    this.bankaiFlash.alpha = 0;
    this.container.addChild(this.bankaiFlash);

    this.nameLabel = new Text({
      text: opts.name,
      style: new TextStyle({
        fill: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowBlur: 4,
        dropShadowDistance: 1,
        dropShadowColor: '#000',
      }),
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -H / 2 - 8;
    this.container.addChild(this.nameLabel);

    this.drawIdle();
  }

  private drawIdle() {
    const c = this.opts.outfitColor;
    const dir = this.opts.facing === 'right' ? 1 : -1;

    this.body.clear();
    // torso
    this.body.rect(-W / 2, -H / 2, W, H * 0.6).fill(c);
    // legs
    this.body.rect(-W / 2, H * 0.1, W * 0.42, H * 0.42).fill(c - 0x111111);
    this.body.rect(W * 0.08, H * 0.1, W * 0.42, H * 0.42).fill(c - 0x111111);
    // arm
    this.body.rect(dir * (W / 2), -H / 4, dir * W * 0.18, H * 0.35).fill(c + 0x101010);

    this.head.clear();
    this.head.circle(0, -H / 2 - 14, 18).fill(0xffcc99);
    // hair blob
    this.head.ellipse(0, -H / 2 - 26, 20, 12).fill(this.opts.auraColor);

    this.auraGlow.clear();
  }

  private drawAttack(variant: 'normal' | 'high' | 'low') {
    const c = this.opts.outfitColor;
    const dir = this.opts.facing === 'right' ? 1 : -1;
    const yOff = variant === 'high' ? -H * 0.2 : variant === 'low' ? H * 0.25 : 0;

    this.body.clear();
    this.body.rect(-W / 2, -H / 2, W, H * 0.6).fill(c);
    // extended punch arm
    this.body.rect(dir * (W / 2), yOff - 12, dir * W * 0.7, 24).fill(c + 0x202020);
    // fist
    this.body.circle(dir * (W / 2 + W * 0.72), yOff, 14).fill(0xffcc99);

    this.head.clear();
    this.head.circle(0, -H / 2 - 14, 18).fill(0xffcc99);
    this.head.ellipse(0, -H / 2 - 26, 20, 12).fill(this.opts.auraColor);

    this.auraGlow.clear();
    this.auraGlow.circle(dir * (W / 2 + W * 0.72), yOff, 22).fill({ color: this.opts.auraColor, alpha: 0.35 });
  }

  private drawBlock() {
    const c = this.opts.outfitColor;
    const dir = this.opts.facing === 'right' ? 1 : -1;

    this.body.clear();
    // crouched/guard
    this.body.rect(-W / 2, 0, W, H * 0.5).fill(c);
    // both arms raised
    this.body.rect(-W * 0.6, -H * 0.35, W * 0.25, H * 0.4).fill(c + 0x101010);
    this.body.rect(W * 0.35, -H * 0.35, W * 0.25, H * 0.4).fill(c + 0x101010);

    this.head.clear();
    this.head.circle(0, -H * 0.05, 18).fill(0xffcc99);
    this.head.ellipse(0, -H * 0.19, 20, 12).fill(this.opts.auraColor);

    this.auraGlow.clear();
    // shield shimmer
    this.auraGlow.rect(-W * 0.75, -H * 0.5, W * 1.5, H * 1.1)
      .fill({ color: this.opts.auraColor, alpha: 0.12 });
  }

  private drawHit() {
    const c = this.opts.outfitColor;
    const dir = this.opts.facing === 'right' ? -1 : 1; // recoil backwards

    this.body.clear();
    this.body.rect(-W / 2 + dir * 8, -H / 2, W, H * 0.6).fill(c);
    this.body.rect(-W / 2 + dir * 8, H * 0.1, W, H * 0.42).fill(c - 0x111111);

    this.head.clear();
    this.head.circle(dir * 6, -H / 2 - 14, 18).fill(0xffcc99);
    this.head.ellipse(dir * 6, -H / 2 - 26, 20, 12).fill(this.opts.auraColor);

    this.auraGlow.clear();
    this.flashAlpha = 0.7;
  }

  private drawKO() {
    const c = this.opts.outfitColor;

    this.body.clear();
    // lying down
    this.body.rect(-H / 2, -W / 4, H, W / 2).fill(c);

    this.head.clear();
    this.head.circle(-H / 2 - 14, 0, 18).fill(0xffcc99);
    this.head.ellipse(-H / 2 - 26, 0, 12, 20).fill(this.opts.auraColor);

    this.auraGlow.clear();
  }

  private drawBankai() {
    const c = this.opts.outfitColor;
    const dir = this.opts.facing === 'right' ? 1 : -1;

    this.body.clear();
    this.body.rect(-W / 2, -H / 2, W, H * 0.6).fill(c);
    // one arm thrust forward charging
    this.body.rect(dir * (W / 2), -H * 0.1, dir * W * 1.2, 20).fill(this.opts.auraColor);

    this.head.clear();
    this.head.circle(0, -H / 2 - 14, 18).fill(0xffcc99);
    this.head.ellipse(0, -H / 2 - 26, 20, 12).fill(this.opts.auraColor);

    this.auraGlow.clear();
    this.auraGlow.circle(0, 0, W * 1.4).fill({ color: this.opts.auraColor, alpha: 0.3 });
    this.auraGlow.circle(0, 0, W * 0.9).fill({ color: this.opts.auraColor, alpha: 0.25 });

    this.bankaiFlash.clear();
    this.bankaiFlash.rect(-W * 2, -H * 2, W * 4, H * 4).fill({ color: this.opts.auraColor, alpha: 0.5 });
    this.bankaiFlash.alpha = 1;
    setTimeout(() => { this.bankaiFlash.alpha = 0; }, 600);
  }

  set animState(state: AnimState) {
    if (this._animState === state) return;
    this._animState = state;

    switch (state) {
      case AnimState.IDLE: this.drawIdle(); break;
      case AnimState.ATTACK: this.drawAttack('normal'); break;
      case AnimState.HIGH_ATTACK: this.drawAttack('high'); break;
      case AnimState.LOW_ATTACK: this.drawAttack('low'); break;
      case AnimState.BLOCK: this.drawBlock(); break;
      case AnimState.HIT: this.drawHit(); break;
      case AnimState.KO: this.drawKO(); break;
      case AnimState.BANKAI: this.drawBankai(); break;
    }
  }

  get animState() { return this._animState; }

  update(dt: number) {
    // hit flash
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.005);
      this.container.alpha = 1 - this.flashAlpha * 0.5 + Math.sin(Date.now() * 0.05) * this.flashAlpha * 0.3;
    } else {
      this.container.alpha = 1;
    }

    // idle breathing
    if (this._animState === AnimState.IDLE) {
      this.container.scale.y = 1 + Math.sin(Date.now() * 0.002) * 0.015;
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
