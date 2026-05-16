import { Container, Assets } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Attachment } from '@esotericsoftware/spine-pixi-v8';
import { AnimState } from '@ahf/shared';

const SPINE_ATLAS = '/assets/spine/skeleton.atlas';
const SPINE_SKEL  = '/assets/spine/skeleton.json';

export interface CharacterLooks {
  bodyObject:   number;   // 1–7
  headObject:   number;   // 0 = none, 1–5
  hairObject:   number;   // 1–5
  handObject:   number;   // 0 = none, 1–6
  cloakObject:  number;   // 0 = none, 1–4
  eyeType:      'Basic' | 'Anger' | 'laugh';
  makeupIndex:  number;   // 0 = none, 1–2
  supportIndex: number;   // 0 = none, 2 only
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

// Only slots that have setup-pose attachments (verified from skeleton JSON)
const BODY_SLOTS   = ['BodyObject_01','BodyObject_02','BodyObject_03','BodyObject_04','BodyObject_05','BodyObject_06','BodyObject_07'];
const HEAD_SLOTS   = ['HeadObject_01','HeadObject_02','HeadObject_03','HeadObject_04','HeadObject_05'];
const HAIR_SLOTS   = ['hairObject_01','hairObject_02','hairObject_03','hairObject_04','hairObject_05'];
const HAND_SLOTS   = ['HandObject_01','HandObject_02','HandObject_03','HandObject_04','HandObject_05','HandObject_06'];
const CLOAK_SLOTS  = ['cloakObject_01','cloakObject_02','cloakObject_03','cloakObject_04'];
const MAKEUP_SLOTS = ['makeup_01','makeup_02'];
const SUPPORT_SLOTS= ['SupportObject_02'];

const SCALE = 0.085;

let _preloadPromise: Promise<void> | null = null;

export class CharacterSprite {
  readonly container: Container;
  private spine: Spine;
  // Keyed by placeholder/slot name; built once from the default skin.
  private setupAtt: Map<string, Attachment>;

  private constructor(spine: Spine, facing: 'left' | 'right') {
    this.spine = spine;

    this.setupAtt = new Map();
    const defaultSkin = spine.skeleton.data.defaultSkin;
    if (defaultSkin) {
      for (const entry of defaultSkin.getAttachments()) {
        this.setupAtt.set(entry.placeholder, entry.attachment);
      }
    }

    // spine-pixi-v8 outputs vertices already in PixiJS Y-down space — no Y flip needed.
    // This asset faces LEFT by default; flip X to make it face right.
    spine.scale.set(facing === 'left' ? SCALE : -SCALE, SCALE);
    this.container = new Container();
    this.container.addChild(spine);
  }

  // ── Static factory ────────────────────────────────────────────────────────

  static preload(onProgress?: (p: number) => void): Promise<void> {
    if (!_preloadPromise) {
      _preloadPromise = Assets.load(
        [SPINE_ATLAS, SPINE_SKEL],
        onProgress,
      ).then(() => undefined);
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

  static async createAsync(looks: CharacterLooks, facing: 'left' | 'right'): Promise<CharacterSprite> {
    await CharacterSprite.preload();
    return CharacterSprite.create(looks, facing);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  applyLooks(looks: CharacterLooks): void {
    this.setSlotsDirect(BODY_SLOTS,    looks.bodyObject);
    this.setSlotsDirect(HEAD_SLOTS,    looks.headObject);
    this.setSlotsDirect(HAIR_SLOTS,    looks.hairObject);
    this.setSlotsDirect(HAND_SLOTS,    looks.handObject);
    this.setSlotsDirect(CLOAK_SLOTS,   looks.cloakObject);
    this.setSlotsDirect(MAKEUP_SLOTS,  looks.makeupIndex);
    this.setSlotsDirect(SUPPORT_SLOTS, looks.supportIndex === 2 ? 1 : 0);
    this.setEyeSlotDirect(looks.eyeType);
  }

  /** Stop animation and freeze bones at setup pose (use in locker room preview). */
  freeze(): void {
    this.spine.state.clearTracks();
    this.spine.skeleton.setupPoseBones();
  }

  playState(state: AnimState): void {
    const animName = ANIM_MAP[state];
    const current = this.spine.state.tracks[0];
    if (current?.animation?.name === animName) return;
    this.spine.state.setAnimation(0, animName, LOOPING.has(state));
  }

  setFacing(facing: 'left' | 'right'): void {
    const s = Math.abs(this.spine.scale.x);
    this.spine.scale.x = facing === 'left' ? s : -s;
  }

  setScale(scale: number): void {
    const sign = this.spine.scale.x < 0 ? -1 : 1;
    this.spine.scale.set(sign * scale, scale);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private setSlotsDirect(slots: string[], showIdx: number): void {
    const skel = this.spine.skeleton;
    slots.forEach((name, i) => {
      const slot = skel.findSlot(name);
      if (!slot) return;
      const att = showIdx > 0 && i === showIdx - 1 ? (this.setupAtt.get(name) ?? null) : null;
      slot.pose.setAttachment(att);
    });
  }

  private setEyeSlotDirect(eyeType: CharacterLooks['eyeType']): void {
    const skel = this.spine.skeleton;
    (['Basic', 'Anger', 'laugh'] as const).forEach(et => {
      const slotName = `Eye_${et}`;
      const slot = skel.findSlot(slotName);
      if (!slot) return;
      const att = et === eyeType ? (this.setupAtt.get(slotName) ?? null) : null;
      slot.pose.setAttachment(att);
    });
  }
}

// ── Fallback placeholder ──────────────────────────────────────────────────────

import { Graphics } from 'pixi.js';
export function makePlaceholderSprite(auraColor = 0x7b2fff): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-14, -80, 28, 80, 6).fill(auraColor);
  g.circle(0, -90, 16).fill(auraColor);
  c.addChild(g);
  return c;
}
