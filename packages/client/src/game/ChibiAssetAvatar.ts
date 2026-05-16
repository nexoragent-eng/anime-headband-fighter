import { Container, Graphics, Sprite } from 'pixi.js';
import { AnimState } from '@ahf/shared';

export type ChibiAssetConfig = {
  enabled?: boolean;
  body?: string;
  hairBack?: string;
  hairFront?: string;
  bangs?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  gloves?: string;
  weapon?: string;
  pupils?: string;
  mouth?: string;
  eyebrows?: string;
  scale?: number;
  facing?: 'left' | 'right';
  auraColor?: number;
};

const BASE = '/assets/character';
const DEFAULTS: Required<Omit<ChibiAssetConfig, 'enabled' | 'scale' | 'facing' | 'auraColor'>> = {
  body: 'body/full.png',
  hairBack: 'hair_back/1.png',
  hairFront: 'hair/1.png',
  bangs: 'bangs/1.png',
  top: 'top/1.png',
  bottom: 'bottom/1.png',
  shoes: 'shoes/1.png',
  gloves: '',
  weapon: 'tools & weapons/1.png',
  pupils: 'PUPILS/1.png',
  mouth: 'MOUTH/1.png',
  eyebrows: 'EYEBROWS/1.png',
};

function assetUrl(path?: string): string | null {
  if (!path) return null;
  return `${BASE}/${path}`.replace(/ /g, '%20').replace(/&/g, '%26');
}

function addLayer(parent: Container, path?: string, alpha = 1): Sprite | null {
  const url = assetUrl(path);
  if (!url) return null;
  const s = Sprite.from(url);
  s.anchor.set(0.5, 1);
  s.alpha = alpha;
  s.width = 444;
  s.height = 700;
  parent.addChild(s);
  return s;
}

export function chibiConfigFromCosmetics(cosmetics?: any): ChibiAssetConfig {
  return {
    enabled: cosmetics?.useAssetCharacter ?? false,
    body: cosmetics?.assetBody ?? DEFAULTS.body,
    hairBack: cosmetics?.assetHairBack ?? DEFAULTS.hairBack,
    hairFront: cosmetics?.assetHairFront ?? DEFAULTS.hairFront,
    bangs: cosmetics?.assetBangs ?? DEFAULTS.bangs,
    top: cosmetics?.assetTop ?? DEFAULTS.top,
    bottom: cosmetics?.assetBottom ?? DEFAULTS.bottom,
    shoes: cosmetics?.assetShoes ?? DEFAULTS.shoes,
    gloves: cosmetics?.assetGloves ?? DEFAULTS.gloves,
    weapon: cosmetics?.assetWeapon ?? DEFAULTS.weapon,
    pupils: cosmetics?.assetPupils ?? DEFAULTS.pupils,
    mouth: cosmetics?.assetMouth ?? DEFAULTS.mouth,
    eyebrows: cosmetics?.assetEyebrows ?? DEFAULTS.eyebrows,
  };
}

export class ChibiAssetAvatar {
  readonly container = new Container();
  public animState: AnimState = AnimState.IDLE;

  private bodyRoot = new Container();
  private aura = new Graphics();
  private weaponLayer: Sprite | null = null;
  private t = 0;

  constructor(private config: ChibiAssetConfig = {}) {
    this.rebuild(config);
  }

  rebuild(config: ChibiAssetConfig = {}) {
    this.config = { ...this.config, ...config };
    this.container.removeChildren();
    this.bodyRoot = new Container();
    this.bodyRoot.scale.set((this.config.scale ?? 0.14) * (this.config.facing === 'left' ? -1 : 1), this.config.scale ?? 0.14);

    this.aura = new Graphics();
    this.container.addChild(this.aura);
    this.container.addChild(this.bodyRoot);

    const cfg = { ...DEFAULTS, ...this.config } as Required<ChibiAssetConfig>;

    // Layer order follows the original dress-up pack: full-canvas overlays stack cleanly.
    addLayer(this.bodyRoot, cfg.hairBack);
    addLayer(this.bodyRoot, cfg.body);
    addLayer(this.bodyRoot, cfg.bottom);
    addLayer(this.bodyRoot, cfg.shoes);
    addLayer(this.bodyRoot, cfg.top);
    addLayer(this.bodyRoot, cfg.gloves);
    addLayer(this.bodyRoot, cfg.eyebrows);
    addLayer(this.bodyRoot, cfg.pupils);
    addLayer(this.bodyRoot, cfg.mouth);
    addLayer(this.bodyRoot, cfg.hairFront);
    addLayer(this.bodyRoot, cfg.bangs);
    this.weaponLayer = addLayer(this.bodyRoot, cfg.weapon);

    // The source art feet sit at canvas bottom; lift origin to character feet.
    this.bodyRoot.y = 0;
    this.redrawAura();
  }

  update(dt: number) {
    this.t += dt;
    const idle = Math.sin(this.t * 0.004) * 2;
    this.bodyRoot.y = idle;
    this.bodyRoot.rotation = 0;
    this.bodyRoot.scale.y = this.config.scale ?? 0.14;
    this.bodyRoot.scale.x = (this.config.scale ?? 0.14) * (this.config.facing === 'left' ? -1 : 1);
    if (this.weaponLayer) {
      this.weaponLayer.rotation = 0;
      this.weaponLayer.x = 0;
    }

    if (this.animState === AnimState.ATTACK || this.animState === AnimState.HIGH_ATTACK || this.animState === AnimState.LOW_ATTACK) {
      const pulse = Math.sin(this.t * 0.035);
      this.bodyRoot.rotation = 0.04 * pulse;
      if (this.weaponLayer) {
        this.weaponLayer.rotation = 0.16 * pulse;
        this.weaponLayer.x = 10 * Math.max(0, pulse);
      }
    }

    if (this.animState === AnimState.HIT) {
      this.bodyRoot.x = Math.sin(this.t * 0.08) * 4;
    } else {
      this.bodyRoot.x = 0;
    }

    if (this.animState === AnimState.KO) {
      this.bodyRoot.rotation = 1.35;
      this.bodyRoot.y = 22;
      this.bodyRoot.scale.y = (this.config.scale ?? 0.14) * 0.72;
    }

    this.aura.alpha = this.animState === AnimState.BANKAI ? 0.75 : 0.22 + Math.sin(this.t * 0.006) * 0.06;
    this.aura.scale.set(1 + Math.sin(this.t * 0.006) * 0.06);
  }

  private redrawAura() {
    this.aura.clear();
    const color = this.config.auraColor ?? 0x7b2fff;
    this.aura.ellipse(0, -48, 28, 58).fill({ color, alpha: 0.16 });
    this.aura.ellipse(0, -48, 36, 72).stroke({ color, alpha: 0.22, width: 2 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
