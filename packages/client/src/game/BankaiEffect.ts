import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export class BankaiEffect {
  readonly container: Container;
  private beam: Graphics;
  private flash: Graphics;
  private label: Text;
  private active = false;
  private progress = 0; // 0-1
  private dir: 'right' | 'left';
  private originX = 0;
  private originY = 0;
  private beamWidthMult = 1;
  private leaveZone = false;
  private burnZone: Graphics | null = null;
  private burnTimer = 0;

  constructor() {
    this.container = new Container();
    this.dir = 'right';

    this.flash = new Graphics();
    this.flash.alpha = 0;
    this.container.addChild(this.flash);

    this.beam = new Graphics();
    this.beam.alpha = 0;
    this.container.addChild(this.beam);

    this.label = new Text({
      text: 'BANKAI!!!',
      style: new TextStyle({
        fill: ['#ffffff', '#ffff00'],
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontSize: 48,
        fontWeight: 'bold',
        stroke: { color: '#ff0000', width: 6 },
        dropShadow: true,
        dropShadowColor: '#ff6600',
        dropShadowBlur: 30,
        dropShadowDistance: 0,
        dropShadowAngle: 0,
      }),
    });
    this.label.anchor.set(0.5);
    this.label.alpha = 0;
    this.container.addChild(this.label);
  }

  fire(
    x: number,
    y: number,
    dir: 'right' | 'left',
    screenW: number,
    screenH: number,
    beamWidthMult = 1,
    leaveZone = false,
  ) {
    this.dir = dir;
    this.originX = x;
    this.originY = y;
    this.active = true;
    this.progress = 0;
    this.beamWidthMult = beamWidthMult;
    this.leaveZone = leaveZone;

    this.label.x = screenW / 2;
    this.label.y = screenH * 0.2;
    this.label.alpha = 1;
    this.label.scale.set(0.3);

    if (this.burnZone) {
      this.burnZone.destroy();
      this.burnZone = null;
    }
  }

  update(dt: number, screenW: number, screenH: number) {
    if (!this.active) {
      // update burn zone if present
      if (this.burnZone) {
        this.burnTimer -= dt;
        this.burnZone.alpha = Math.max(0, this.burnTimer / 1500);
        if (this.burnTimer <= 0) {
          this.burnZone.destroy();
          this.burnZone = null;
        }
      }
      return;
    }

    this.progress += dt * 0.0025;

    // flash phase 0-0.2
    if (this.progress < 0.2) {
      const t = this.progress / 0.2;
      this.flash.clear();
      this.flash.rect(0, 0, screenW, screenH).fill({ color: 0xffffff, alpha: t * 0.8 });
      this.flash.alpha = 1;
      this.beam.alpha = 0;
      this.label.scale.set(0.3 + t * 0.7);
    }
    // beam phase 0.2-0.7
    else if (this.progress < 0.7) {
      const t = (this.progress - 0.2) / 0.5;
      this.flash.alpha = Math.max(0, 0.8 - t * 2);

      const beamH = 60 * this.beamWidthMult;
      const beamLen = screenW * t;
      const dx = this.dir === 'right' ? 1 : -1;

      this.beam.clear();
      // core beam
      this.beam.rect(
        dx > 0 ? this.originX : this.originX - beamLen,
        this.originY - beamH / 2,
        beamLen,
        beamH,
      ).fill({ color: 0xffffff, alpha: 0.95 });
      // glow layer
      this.beam.rect(
        dx > 0 ? this.originX : this.originX - beamLen,
        this.originY - beamH,
        beamLen,
        beamH * 2,
      ).fill({ color: 0xffff00, alpha: 0.4 });
      this.beam.alpha = 1;

      this.label.alpha = 1 - t * 0.8;
    }
    // fade out 0.7-1.0
    else {
      const t = (this.progress - 0.7) / 0.3;
      this.beam.alpha = 1 - t;
      this.flash.alpha = 0;
      this.label.alpha = 0;

      if (this.progress >= 1) {
        this.active = false;
        this.beam.alpha = 0;

        if (this.leaveZone) {
          this.spawnBurnZone(screenW, screenH);
        }
      }
    }
  }

  private spawnBurnZone(screenW: number, screenH: number) {
    this.burnZone = new Graphics();
    const beamH = 60 * this.beamWidthMult;
    const dx = this.dir === 'right' ? 1 : -1;
    const endX = dx > 0 ? screenW * 0.6 : screenW * 0.4;
    this.burnZone.rect(endX - 60, this.originY - beamH / 2, 120, beamH)
      .fill({ color: 0xff6600, alpha: 0.5 });
    this.burnTimer = 1500;
    this.container.addChild(this.burnZone);
  }

  get isActive() { return this.active || this.burnZone !== null; }

  destroy() {
    this.container.destroy({ children: true });
  }
}
