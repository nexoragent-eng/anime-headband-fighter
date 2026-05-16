import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { AnimState } from '@ahf/shared';
import { CharacterSprite, DEFAULT_LOOKS, makePlaceholderSprite } from './CharacterSprite';
import type { CharacterLooks } from './CharacterSprite';

export type { CharacterLooks };

interface FighterOptions {
  name: string;
  looks?: Partial<CharacterLooks>;
  facing: 'left' | 'right';
  auraColor?: number;
  scale?: number;
}

const WHITE = 0xffffff;

export class Fighter {
  readonly container: Container;

  private charSprite: CharacterSprite | null = null;
  private placeholder: Container | null = null;
  private auraBack: Graphics;
  private auraFront: Graphics;
  private hitFlash: Graphics;
  private nameLabel: Text;

  private _animState: AnimState = AnimState.IDLE;
  private animTime = 0;
  private flashAlpha = 0;
  private bankaiPulse = 0;

  private readonly auraColor: number;
  private readonly facing: 'left' | 'right';
  private readonly targetScale: number;

  constructor(opts: FighterOptions) {
    this.auraColor = opts.auraColor ?? 0x7b2fff;
    this.facing = opts.facing;
    this.targetScale = opts.scale ?? 0.085;

    this.container = new Container();

    // Aura back (behind character)
    this.auraBack = new Graphics();
    this.auraBack.circle(0, -45, 55).fill({ color: this.auraColor, alpha: 0.10 });
    this.auraBack.alpha = 0;
    this.container.addChild(this.auraBack);

    const looks: CharacterLooks = { ...DEFAULT_LOOKS, ...opts.looks };

    if (CharacterSprite.isLoaded()) {
      this.charSprite = CharacterSprite.create(looks, opts.facing);
      this.charSprite.setScale(this.targetScale);
      this.container.addChild(this.charSprite.container);
    } else {
      // Async load: show placeholder, swap when ready
      this.placeholder = makePlaceholderSprite(this.auraColor);
      this.container.addChild(this.placeholder);
      CharacterSprite.preload().then(() => {
        if (this.placeholder) {
          this.container.removeChild(this.placeholder);
          this.placeholder.destroy({ children: true });
          this.placeholder = null;
        }
        this.charSprite = CharacterSprite.create(looks, this.facing);
        this.charSprite.setScale(this.targetScale);
        this.container.addChild(this.charSprite.container);
        this.container.addChild(this.auraFront);
        this.container.addChild(this.hitFlash);
        this.charSprite.playState(this._animState);
      });
    }

    // Aura front glow ring
    this.auraFront = new Graphics();
    this.auraFront.circle(0, -45, 42).stroke({ color: this.auraColor, alpha: 0.25, width: 2 });
    this.auraFront.alpha = 0;
    this.container.addChild(this.auraFront);

    // Hit flash overlay
    this.hitFlash = new Graphics();
    this.hitFlash.roundRect(-26, -110, 52, 112, 10).fill({ color: WHITE, alpha: 0.88 });
    this.hitFlash.alpha = 0;
    this.container.addChild(this.hitFlash);

    // Name label
    this.nameLabel = new Text({
      text: opts.name,
      style: new TextStyle({
        fill: WHITE,
        fontSize: 13,
        fontWeight: 'bold',
        dropShadow: { blur: 4, color: '#000', distance: 1, angle: Math.PI / 4 },
      }),
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -120;
    this.container.addChild(this.nameLabel);
  }

  // ── Animation state ──────────────────────────────────────────────────────

  set animState(state: AnimState) {
    if (this._animState === state) return;
    this._animState = state;
    this.animTime = 0;
    if (state === AnimState.HIT) this.flashAlpha = 1;
    if (state === AnimState.BANKAI) this.bankaiPulse = 1;
    this.charSprite?.playState(state);
  }

  get animState() { return this._animState; }

  // ── Per-frame update ─────────────────────────────────────────────────────

  update(dt: number) {
    this.animTime += dt;

    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.007);
    if (this.bankaiPulse > 0) this.bankaiPulse = Math.max(0, this.bankaiPulse - dt * 0.002);

    const auraPulse = 0.22 + Math.sin(this.animTime * 0.005) * 0.08;
    const isBankai = this._animState === AnimState.BANKAI;

    this.hitFlash.alpha = this.flashAlpha * 0.55;
    this.auraBack.alpha = isBankai ? 0.55 + this.bankaiPulse * 0.35 : auraPulse * 0.6;
    this.auraFront.alpha = isBankai ? 0.4 + this.bankaiPulse * 0.25 : auraPulse * 0.45;
  }

  // ── Appearance helpers ───────────────────────────────────────────────────

  applyLooks(looks: Partial<CharacterLooks>) {
    this.charSprite?.applyLooks({ ...DEFAULT_LOOKS, ...looks });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
