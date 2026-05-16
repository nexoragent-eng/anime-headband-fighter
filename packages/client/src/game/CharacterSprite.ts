import { Container, Assets, Graphics } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { AnimState } from '@ahf/shared';

const SPINE_ATLAS = '/assets/spine/skeleton.atlas';
const SPINE_SKEL  = '/assets/spine/skeleton.json';

export interface CharacterLooks {
  bodyObject:   number;   // 1–7
  headObject:   number;   // 0 = none, 1–8
  hairObject:   number;   // 1–5
  handObject:   number;   // 0 = none, 1–6
  cloakObject:  number;   // 0 = none, 1–4
  eyeType:      'Basic' | 'Anger' | 'laugh';
  makeupIndex:  number;   // 0 = none, 1–2
  supportIndex: number;   // 0 = none, 1–2
}

export const DEFAULT_LOOKS: CharacterLooks = {
  bodyObject:   1,
  headObject:   0,
  hairObject:   1,
  handObject:   1,
  cloakObject:  0,
  eyeType:      'Basic',
  makeupIndex:  0,
  supportIndex: 0,
};

// Maps AnimState → Spine animation name
const ANIM_MAP: Record<AnimState, string> = {
  [AnimState.IDLE]:         'Idle',
  [AnimState.ATTACK]:       'SwordAttack',
  [AnimState.HIGH_ATTACK]:  'SwordAttack',
  [AnimState.LOW_ATTACK]:   'PunchAttack',
  [AnimState.BLOCK]:        'StatusEffect',
  [AnimState.HIT]:          'Hit',
  [AnimState.KO]:           'Death',
  [AnimState.BANKAI]:       'MagicAttack',
};

const LOOPING = new Set([AnimState.IDLE, AnimState.BLOCK, AnimState.BANKAI]);

// All slot groups in the skeleton
const BODY_SLOTS   = ['BodyObject_01','BodyObject_02','BodyObject_03','BodyObject_04','BodyObject_05','BodyObject_06','BodyObject_07'];
const HEAD_SLOTS   = ['HeadObject_01','HeadObject_02','HeadObject_03','HeadObject_04','HeadObject_05','HeadObject_06','HeadObject_07','HeadObject_08'];
const HAIR_SLOTS   = ['hairObject_01','hairObject_02','hairObject_03','hairObject_04','hairObject_05'];
const HAND_SLOTS   = ['HandObject_01','HandObject_02','HandObject_03','HandObject_04','HandObject_05','HandObject_06'];
const CLOAK_SLOTS  = ['cloakObject_01','cloakObject_02','cloakObject_03','cloakObject_04'];
const EYE_SLOTS    = ['Eye_Basic','Eye_Anger','Eye_laugh'];
const MAKEUP_SLOTS = ['makeup_01','makeup_02'];
const SUPPORT_SLOTS= ['SupportObject_01','SupportObject_02'];

// Spine units → pixels. Character skeleton height ≈ 1301 units.
const SCALE = 0.085;

let _preloadPromise: Promise<void> | null = null;

export class CharacterSprite {
  readonly container: Container;
  private spine: Spine;

  private constructor(spine: Spine, facing: 'left' | 'right') {
    this.spine = spine;
    // Spine Y-axis is up; PixiJS Y-axis is down → flip Y
    spine.scale.set(facing === 'left' ? -SCALE : SCALE, -SCALE);
    this.container = new Container();
    this.container.addChild(spine);
  }

  // ── Static factory ────────────────────────────────────────────────────────

  static preload(): Promise<void> {
    if (!_preloadPromise) {
      _preloadPromise = (async () => {
        await Assets.load(SPINE_ATLAS);
        await Assets.load(SPINE_SKEL);
      })();
    }
    return _preloadPromise;
  }

  static isLoaded(): boolean {
    return Assets.cache.has(SPINE_ATLAS) && Assets.cache.has(SPINE_SKEL);
  }

  /** Synchronous – call only after preload() has resolved. */
  static create(looks: CharacterLooks, facing: 'left' | 'right'): CharacterSprite {
    const spine = Spine.from({ skeleton: SPINE_SKEL, atlas: SPINE_ATLAS });
    const cs = new CharacterSprite(spine, facing);
    cs.applyLooks(looks);
    spine.state.setAnimation(0, 'Idle', true);
    return cs;
  }

  /** Async convenience wrapper for code that doesn't pre-load. */
  static async createAsync(looks: CharacterLooks, facing: 'left' | 'right'): Promise<CharacterSprite> {
    await CharacterSprite.preload();
    return CharacterSprite.create(looks, facing);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  applyLooks(looks: CharacterLooks): void {
    const skel = this.spine.skeleton;

    BODY_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.bodyObject === i + 1 ? slot : null));
    HEAD_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.headObject === i + 1 ? slot : null));
    HAIR_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.hairObject === i + 1 ? slot : null));
    HAND_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.handObject === i + 1 ? slot : null));
    CLOAK_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.cloakObject === i + 1 ? slot : null));
    EYE_SLOTS.forEach(slot => skel.setAttachment(slot, slot === `Eye_${looks.eyeType}` ? slot : null));
    MAKEUP_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.makeupIndex === i + 1 ? slot : null));
    SUPPORT_SLOTS.forEach((slot, i) => skel.setAttachment(slot, looks.supportIndex === i + 1 ? slot : null));
  }

  playState(state: AnimState): void {
    const animName = ANIM_MAP[state];
    const current = this.spine.state.tracks[0];
    if (current?.animation?.name === animName) return;
    this.spine.state.setAnimation(0, animName, LOOPING.has(state));
  }

  setFacing(facing: 'left' | 'right'): void {
    const s = Math.abs(this.spine.scale.x);
    this.spine.scale.x = facing === 'left' ? -s : s;
  }

  setScale(scale: number): void {
    const sign = this.spine.scale.x < 0 ? -1 : 1;
    this.spine.scale.set(sign * scale, -scale);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// ── Fallback placeholder (used when Spine hasn't loaded yet) ─────────────────

export function makePlaceholderSprite(auraColor = 0x7b2fff): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-14, -80, 28, 80, 6).fill(auraColor);
  g.circle(0, -90, 16).fill(auraColor);
  c.addChild(g);
  return c;
}
