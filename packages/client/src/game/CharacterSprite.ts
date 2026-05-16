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

// Skeleton has two slot systems:
//   • "Solt :" slots — on character bones (Body, Head, Hand). Equipment renders ON the character.
//   • Root-bone slots — named after the attachments (BodyObject_01, hairObject_01, etc.).
//     These have setup-pose defaults and appear at the character's feet during animation.
//
// We use only the "Solt :" slots for rendering, and explicitly null out the root-bone slots
// so their setup-pose defaults don't bleed through.

const ROOT_EQUIP_SLOTS = [
  'BodyObject_01',
  'BodyObject_02',
  'BodyObject_03',
  'BodyObject_04',
  'BodyObject_05',
  'BodyObject_06',
  'BodyObject_07',
  'BodyObject_08',

  'cloakObject_01',
  'cloakObject_02',
  'cloakObject_03',
  'cloakObject_04',
  'cloakObject_05',

  'hairObject_01',
  'hairObject_02',
  'hairObject_03',
  'hairObject_04',
  'hairObject_05',
  'hairObject_06',

  'HeadObject_01',
  'HeadObject_02',
  'HeadObject_03',
  'HeadObject_04',
  'HeadObject_05',

  'HandObject_01',
  'HandObject_02',
  'HandObject_03',
  'HandObject_04',
  'HandObject_05',
  'HandObject_06',
  'HandObject_07',

  'SupportObject_02',

  'Eye_Basic',
  'Eye_laugh',
  'Eye_Anger',

  'makeup_01',
  'makeup_02',
];

const SCALE = 0.085;

let _preloadPromise: Promise<void> | null = null;

export class CharacterSprite {
  readonly container: Container;
  private spine: Spine;
  // Attachment name → Attachment object, built from the default skin.
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
    const skel = this.spine.skeleton;

    // Null out root-bone equipment slots so setup-pose defaults don't show at the feet.
    for (const name of ROOT_EQUIP_SLOTS) {
      skel.findSlot(name)?.pose.setAttachment(null);
    }

    // Body outfit — "Solt : Body" follows the Body bone.
    this.setSingleSlot('Solt : Body',
      looks.bodyObject > 0 ? `BodyObject_0${looks.bodyObject}` : null);

    // Cloak — also on the Body bone.
    this.setSingleSlot('Solt : cloak',
      looks.cloakObject > 0 ? `cloakObject_0${looks.cloakObject}` : null);

    // Head slot — headgear, hair, and makeup share one slot on the Head bone.
    // Priority: headgear > hair > makeup (only one can show at a time).
    const headAtt =
      looks.headObject   > 0 ? `HeadObject_0${looks.headObject}`  :
      looks.hairObject   > 0 ? `hairObject_0${looks.hairObject}`  :
      looks.makeupIndex  > 0 ? `makeup_0${looks.makeupIndex}`     : null;
    this.setSingleSlot('Solt : Head', headAtt);

    // Eyes — "Solt : Head02" follows the Head bone.
    this.setSingleSlot('Solt : Head02', `Eye_${looks.eyeType}`);

    // Weapon / hand item — "Solt : R_Hand" follows the L_Hand bone.
    this.setSingleSlot('Solt : R_Hand',
      looks.handObject > 0 ? `HandObject_0${looks.handObject}` : null);

    // Support item — "Solt : L_Hand" follows the R_Hand bone.
    this.setSingleSlot('Solt : L_Hand',
      looks.supportIndex === 2 ? 'SupportObject_02' : null);
  }

  /** Stop animation and freeze bones at setup pose. */
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

  private setSingleSlot(slotName: string, attachmentName: string | null): void {
    const slot = this.spine.skeleton.findSlot(slotName);
    if (!slot) return;
    const att = attachmentName ? (this.setupAtt.get(attachmentName) ?? null) : null;
    slot.pose.setAttachment(att);
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
