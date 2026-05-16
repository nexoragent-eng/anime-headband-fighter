import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { AnimState } from '@ahf/shared';

const W = 56;
const H = 80;

type Facing = 'right' | 'left';
export type BodyTypeId = 'balanced' | 'heavy' | 'slim';
export type WeaponTypeId = 'katana' | 'fists' | 'staff';

interface FighterOptions {
  name: string;
  outfitColor: number;
  auraColor: number;
  facing: Facing;
  bodyType?: BodyTypeId;
  weaponType?: WeaponTypeId;
}

type PartName =
  | 'shadow' | 'auraBack' | 'auraFront' | 'coatBack'
  | 'torso' | 'chestPatch' | 'belt'
  | 'head' | 'face' | 'hairBack' | 'hairFront' | 'headband'
  | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot'
  | 'weapon' | 'trail' | 'hitFlash' | 'bankaiFlash' | 'speedLines' | 'dust';

type PosePart = {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
};
type Pose = Partial<Record<PartName, PosePart>> & { root?: PosePart };

type BodyProfile = {
  torsoW: number;
  torsoH: number;
  headR: number;
  limbW: number;
  upperArm: number;
  lowerArm: number;
  upperLeg: number;
  lowerLeg: number;
  footW: number;
  footH: number;
  yScale: number;
};

const BODY_TYPES: Record<BodyTypeId, BodyProfile> = {
  balanced: { torsoW: 31, torsoH: 38, headR: 16, limbW: 7, upperArm: 19, lowerArm: 18, upperLeg: 20, lowerLeg: 21, footW: 18, footH: 8, yScale: 1 },
  heavy: { torsoW: 39, torsoH: 40, headR: 17, limbW: 9, upperArm: 18, lowerArm: 17, upperLeg: 20, lowerLeg: 20, footW: 20, footH: 9, yScale: 0.98 },
  slim: { torsoW: 25, torsoH: 42, headR: 15, limbW: 6, upperArm: 21, lowerArm: 19, upperLeg: 22, lowerLeg: 22, footW: 16, footH: 7, yScale: 1.04 },
};

const SKIN = 0xffc99b;
const DARK = 0x111827;
const BLACK = 0x050507;
const WHITE = 0xffffff;
const LEATHER = 0x1a1a22;

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function darker(color: number, amount = 0x181818) {
  const r = Math.max(0, ((color >> 16) & 0xff) - ((amount >> 16) & 0xff));
  const g = Math.max(0, ((color >> 8) & 0xff) - ((amount >> 8) & 0xff));
  const b = Math.max(0, (color & 0xff) - (amount & 0xff));
  return (r << 16) + (g << 8) + b;
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((ar + (br - ar) * t) << 16) + ((ag + (bg - ag) * t) << 8) + (ab + (bb - ab) * t);
}
function easeOutCubic(t: number) { return 1 - Math.pow(1 - clamp01(t), 3); }
function easeInCubic(t: number) { return clamp01(t) * clamp01(t) * clamp01(t); }
function easeOutBack(t: number) {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

abstract class FighterPart {
  readonly view = new Graphics();
  abstract redraw(ctx: FighterDrawContext): void;
}

type FighterDrawContext = {
  outfitColor: number;
  auraColor: number;
  body: BodyProfile;
};

function drawCapsule(g: Graphics, x: number, y: number, w: number, h: number, color: number, outline = true) {
  if (outline) g.roundRect(x - 2, y - 2, w + 4, h + 4, Math.min(w, h) / 2 + 2).fill(BLACK);
  g.roundRect(x, y, w, h, Math.min(w, h) / 2).fill(color);
}

class ShadowPart extends FighterPart {
  redraw() {
    this.view.clear();
    this.view.ellipse(0, 4, W * 0.7, 10).fill({ color: 0x000000, alpha: 0.38 });
  }
}

class AuraPart extends FighterPart {
  constructor(private readonly front: boolean) { super(); }
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    if (this.front) {
      this.view.circle(0, -48, 42).stroke({ color: ctx.auraColor, alpha: 0.22, width: 2 });
      this.view.circle(0, -48, 28).stroke({ color: WHITE, alpha: 0.08, width: 1 });
    } else {
      this.view.circle(0, -44, 38).fill({ color: ctx.auraColor, alpha: 0.08 });
      this.view.circle(0, -44, 62).stroke({ color: ctx.auraColor, alpha: 0.14, width: 2 });
    }
    this.view.alpha = 0;
  }
}

class CoatBackPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    const dark = darker(ctx.outfitColor, 0x303030);
    this.view.clear();
    this.view.poly([-18, -50, -34, -12, -20, -8, -8, -48]).fill(BLACK);
    this.view.poly([18, -50, 34, -12, 20, -8, 8, -48]).fill(BLACK);
    this.view.poly([-15, -49, -28, -14, -18, -12, -6, -47]).fill(dark);
    this.view.poly([15, -49, 28, -14, 18, -12, 6, -47]).fill(dark);
    this.view.moveTo(-25, -16).lineTo(-12, -46).stroke({ color: ctx.auraColor, alpha: 0.7, width: 2 });
    this.view.moveTo(25, -16).lineTo(12, -46).stroke({ color: ctx.auraColor, alpha: 0.7, width: 2 });
  }
}

class TorsoPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    const { torsoW, torsoH } = ctx.body;
    const x = -torsoW / 2;
    const dark = darker(ctx.outfitColor, 0x282828);
    this.view.clear();
    this.view.roundRect(x - 4, -58, torsoW + 8, torsoH + 7, 9).fill(BLACK);
    this.view.roundRect(x, -55, torsoW, torsoH, 7).fill(ctx.outfitColor);
    this.view.rect(x, -55, torsoW, 9).fill(mix(ctx.outfitColor, WHITE, 0.12));
    this.view.rect(x, -38, torsoW, 8).fill(dark);
    this.view.rect(-3, -55, 6, torsoH).fill({ color: WHITE, alpha: 0.08 });
    this.view.moveTo(x + 4, -52).lineTo(x + torsoW - 5, -21).stroke({ color: BLACK, alpha: 0.45, width: 2 });
    this.view.moveTo(x + torsoW - 5, -52).lineTo(x + 4, -21).stroke({ color: BLACK, alpha: 0.25, width: 2 });
  }
}

class ChestPatchPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.roundRect(-8, -47, 16, 10, 3).fill(BLACK);
    this.view.roundRect(-6, -46, 12, 8, 2).fill(darker(ctx.outfitColor, 0x404040));
    this.view.rect(-3, -44, 6, 2).fill(ctx.auraColor);
  }
}

class BeltPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.roundRect(-21, -22, 42, 8, 4).fill(BLACK);
    this.view.roundRect(-18, -21, 36, 5, 3).fill(LEATHER);
    this.view.roundRect(-6, -24, 12, 10, 2).fill(ctx.auraColor);
    this.view.circle(-17, -18, 2).fill(0xd6a84f);
    this.view.circle(17, -18, 2).fill(0xd6a84f);
  }
}

class HeadPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    const r = ctx.body.headR;
    this.view.clear();
    this.view.circle(0, -78, r + 3).fill(BLACK);
    this.view.circle(0, -78, r).fill(SKIN);
    this.view.rect(-r + 3, -81, r * 2 - 6, 3).fill({ color: 0xffe0bb, alpha: 0.5 });
    this.view.roundRect(-7, -73, 14, 2, 1).fill(0x6a2222);
  }
}

class FacePart extends FighterPart {
  redraw() {
    this.view.clear();
    this.view.poly([-11, -82, -2, -80, -9, -78]).fill(0xff3344);
    this.view.poly([11, -82, 2, -80, 9, -78]).fill(0xff3344);
    this.view.moveTo(-13, -84).lineTo(-1, -82).stroke({ color: BLACK, width: 2, cap: 'round' });
    this.view.moveTo(13, -84).lineTo(1, -82).stroke({ color: BLACK, width: 2, cap: 'round' });
    this.view.moveTo(-5, -70).lineTo(5, -70).stroke({ color: 0x5a1e1e, width: 1.5, cap: 'round' });
  }
}

class HairPart extends FighterPart {
  constructor(private readonly front: boolean) { super(); }
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    const color = this.front ? DARK : 0x08090f;
    const spikes = this.front
      ? [[-20,-88,-7,-122,2,-91],[-10,-92,3,-128,10,-91],[2,-94,18,-121,16,-88],[-18,-83,-37,-103,-16,-91],[17,-83,37,-100,15,-91]]
      : [[-13,-92,-25,-116,-3,-96],[12,-92,27,-113,3,-96],[-21,-84,-40,-95,-17,-91],[21,-84,40,-94,17,-91]];
    spikes.forEach(s => this.view.poly(s).fill(BLACK));
    spikes.forEach(s => this.view.poly(s.map((v, i) => i % 2 === 0 ? v * 0.9 : v + 4)).fill(color));
    if (this.front) {
      this.view.circle(0, -91, 18).fill(color);
      this.view.moveTo(-16, -99).lineTo(-3, -93).stroke({ color: mix(color, WHITE, 0.18), width: 2 });
      this.view.moveTo(6, -102).lineTo(15, -92).stroke({ color: mix(color, WHITE, 0.16), width: 2 });
      this.view.moveTo(-20, -91).lineTo(-7, -88).stroke({ color: ctx.auraColor, alpha: 0.35, width: 1.5 });
    }
    this.view.alpha = 1;
  }
}

class HeadbandPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.roundRect(-21, -90, 42, 9, 3).fill(BLACK);
    this.view.roundRect(-17, -89, 34, 6, 2).fill(0x1f2937);
    this.view.roundRect(-6, -91, 12, 10, 2).fill(0x4b5563);
    this.view.rect(-3, -88, 6, 3).fill(ctx.auraColor);
    this.view.circle(-14, -86, 1.5).fill(0x9ca3af);
    this.view.circle(14, -86, 1.5).fill(0x9ca3af);
  }
}

class LimbSegmentPart extends FighterPart {
  constructor(private readonly kind: 'upperArm' | 'lowerArm' | 'hand' | 'upperLeg' | 'lowerLeg' | 'foot') { super(); }
  redraw(ctx: FighterDrawContext) {
    const b = ctx.body;
    const cloth = darker(ctx.outfitColor, 0x202020);
    this.view.clear();
    switch (this.kind) {
      case 'upperArm': drawCapsule(this.view, -b.limbW / 2, 0, b.limbW, b.upperArm, cloth); break;
      case 'lowerArm':
        drawCapsule(this.view, -b.limbW / 2, 0, b.limbW, b.lowerArm, darker(ctx.outfitColor, 0x303030));
        this.view.rect(-b.limbW / 2 - 1, b.lowerArm * 0.45, b.limbW + 2, 3).fill(ctx.auraColor);
        break;
      case 'hand':
        this.view.circle(0, 0, 6).fill(BLACK);
        this.view.circle(0, 0, 4.5).fill(SKIN);
        break;
      case 'upperLeg': drawCapsule(this.view, -b.limbW / 2, 0, b.limbW, b.upperLeg, darker(ctx.outfitColor, 0x303030)); break;
      case 'lowerLeg': drawCapsule(this.view, -b.limbW / 2, 0, b.limbW, b.lowerLeg, DARK); break;
      case 'foot':
        this.view.roundRect(-b.footW / 2 - 2, -b.footH / 2 - 2, b.footW + 4, b.footH + 4, 4).fill(BLACK);
        this.view.roundRect(-b.footW / 2, -b.footH / 2, b.footW, b.footH, 3).fill(0x202020);
        this.view.rect(-b.footW / 2 + 2, -1, b.footW - 4, 2).fill(ctx.auraColor);
        break;
    }
  }
}

abstract class WeaponPart extends FighterPart { abstract readonly id: WeaponTypeId; }
class KatanaWeapon extends WeaponPart {
  readonly id = 'katana' as const;
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.roundRect(0, -3, 62, 6, 3).fill(BLACK);
    this.view.roundRect(4, -2, 55, 3, 2).fill(ctx.auraColor);
    this.view.moveTo(9, -3).lineTo(59, -3).stroke({ color: WHITE, alpha: 0.25, width: 1 });
    this.view.rect(-7, -7, 12, 14).fill(0xd6a84f);
    this.view.rect(-14, -4, 11, 8).fill(LEATHER);
  }
}
class FistsWeapon extends WeaponPart {
  readonly id = 'fists' as const;
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.circle(0, 0, 10).fill(BLACK);
    this.view.circle(0, 0, 7).fill(ctx.auraColor);
    this.view.circle(0, 0, 13).stroke({ color: ctx.auraColor, alpha: 0.35, width: 2 });
  }
}
class StaffWeapon extends WeaponPart {
  readonly id = 'staff' as const;
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.roundRect(-6, -3, 82, 6, 3).fill(BLACK);
    this.view.roundRect(-3, -2, 76, 3, 2).fill(0xd6a84f);
    this.view.circle(78, 0, 7).fill(BLACK);
    this.view.circle(78, 0, 4).fill(ctx.auraColor);
  }
}
function createWeapon(type: WeaponTypeId): WeaponPart {
  if (type === 'fists') return new FistsWeapon();
  if (type === 'staff') return new StaffWeapon();
  return new KatanaWeapon();
}

class TrailPart extends FighterPart {
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    this.view.poly([-3, 0, 60, -27, 80, -5, 61, 20]).fill({ color: ctx.auraColor, alpha: 0.28 });
    this.view.poly([5, 0, 54, -14, 74, -2, 55, 10]).fill({ color: WHITE, alpha: 0.16 });
    this.view.alpha = 0;
  }
}
class FlashPart extends FighterPart {
  constructor(private readonly kind: 'hit' | 'bankai' | 'speed' | 'dust') { super(); }
  redraw(ctx: FighterDrawContext) {
    this.view.clear();
    if (this.kind === 'hit') {
      this.view.roundRect(-24, -103, 48, 92, 12).fill({ color: WHITE, alpha: 0.9 });
    } else if (this.kind === 'bankai') {
      this.view.circle(0, -46, W * 1.25).fill({ color: ctx.auraColor, alpha: 0.32 });
      this.view.circle(0, -46, W * 1.75).stroke({ color: WHITE, alpha: 0.65, width: 4 });
    } else if (this.kind === 'speed') {
      for (let i = 0; i < 6; i++) this.view.moveTo(-58 - i * 8, -70 + i * 12).lineTo(-20 - i * 4, -70 + i * 12).stroke({ color: ctx.auraColor, alpha: 0.35, width: 2, cap: 'round' });
    } else {
      this.view.ellipse(-18, 2, 9, 3).fill({ color: 0xffffff, alpha: 0.16 });
      this.view.ellipse(15, 3, 11, 4).fill({ color: 0xffffff, alpha: 0.12 });
    }
    this.view.alpha = 0;
  }
}

export class Fighter {
  readonly container: Container;

  private rig = new Container();
  private root = new Container();
  private parts: Record<PartName, FighterPart>;
  private nameLabel: Text;

  private flashAlpha = 0;
  private bankaiPulse = 0;
  private attackBurst = 0;
  private _animState: AnimState = AnimState.IDLE;
  private animTime = 0;
  private opts: Required<FighterOptions>;
  private bodyScaleY = 1;

  constructor(opts: FighterOptions) {
    this.opts = { bodyType: 'balanced', weaponType: 'katana', ...opts };
    this.container = new Container();

    this.parts = {
      shadow: new ShadowPart(), auraBack: new AuraPart(false), auraFront: new AuraPart(true), coatBack: new CoatBackPart(),
      torso: new TorsoPart(), chestPatch: new ChestPatchPart(), belt: new BeltPart(),
      head: new HeadPart(), face: new FacePart(), hairBack: new HairPart(false), hairFront: new HairPart(true), headband: new HeadbandPart(),
      leftUpperArm: new LimbSegmentPart('upperArm'), leftLowerArm: new LimbSegmentPart('lowerArm'), leftHand: new LimbSegmentPart('hand'),
      rightUpperArm: new LimbSegmentPart('upperArm'), rightLowerArm: new LimbSegmentPart('lowerArm'), rightHand: new LimbSegmentPart('hand'),
      leftUpperLeg: new LimbSegmentPart('upperLeg'), leftLowerLeg: new LimbSegmentPart('lowerLeg'), leftFoot: new LimbSegmentPart('foot'),
      rightUpperLeg: new LimbSegmentPart('upperLeg'), rightLowerLeg: new LimbSegmentPart('lowerLeg'), rightFoot: new LimbSegmentPart('foot'),
      weapon: createWeapon(this.opts.weaponType), trail: new TrailPart(), hitFlash: new FlashPart('hit'),
      bankaiFlash: new FlashPart('bankai'), speedLines: new FlashPart('speed'), dust: new FlashPart('dust'),
    };

    this.container.addChild(this.parts.shadow.view, this.parts.auraBack.view, this.rig, this.parts.auraFront.view, this.parts.speedLines.view, this.parts.dust.view);
    this.rig.addChild(this.root);
    [
      'coatBack', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
      'torso', 'chestPatch', 'belt',
      'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'weapon', 'trail', 'hairBack', 'head', 'face', 'headband', 'hairFront', 'hitFlash', 'bankaiFlash',
    ].forEach(k => this.root.addChild(this.parts[k as PartName].view));

    this.nameLabel = new Text({ text: opts.name, style: new TextStyle({ fill: WHITE, fontSize: 13, fontWeight: 'bold', dropShadow: { blur: 4, color: '#000', distance: 1, angle: Math.PI / 4 } }) });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -H - 18;
    this.container.addChild(this.nameLabel);

    this.rig.scale.x = opts.facing === 'right' ? 1 : -1;
    this.redrawParts();
    this.applyPose(this.getIdlePose(0));
  }

  setBodyType(type: BodyTypeId) { this.opts.bodyType = type; this.redrawParts(); }
  setWeaponType(type: WeaponTypeId) {
    this.opts.weaponType = type;
    const oldWeapon = this.parts.weapon.view;
    const index = this.root.getChildIndex(oldWeapon);
    oldWeapon.destroy();
    this.parts.weapon = createWeapon(type);
    this.root.addChildAt(this.parts.weapon.view, index);
    this.redrawParts();
  }

  private redrawParts() {
    const ctx: FighterDrawContext = { outfitColor: this.opts.outfitColor, auraColor: this.opts.auraColor, body: BODY_TYPES[this.opts.bodyType] };
    Object.values(this.parts).forEach(part => part.redraw(ctx));
    this.bodyScaleY = ctx.body.yScale;
  }

  set animState(state: AnimState) {
    if (this._animState === state) return;
    this._animState = state;
    this.animTime = 0;
    if ([AnimState.ATTACK, AnimState.HIGH_ATTACK, AnimState.LOW_ATTACK].includes(state)) this.attackBurst = 1;
    if (state === AnimState.HIT) this.flashAlpha = 1;
    if (state === AnimState.BANKAI) this.bankaiPulse = 1;
  }
  get animState() { return this._animState; }

  update(dt: number) {
    this.animTime += dt;
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.007);
    if (this.bankaiPulse > 0) this.bankaiPulse = Math.max(0, this.bankaiPulse - dt * 0.002);
    if (this.attackBurst > 0) this.attackBurst = Math.max(0, this.attackBurst - dt * 0.004);

    this.applyPose(this.poseForState());
    this.parts.hitFlash.view.alpha = this.flashAlpha * 0.55;
    this.parts.bankaiFlash.view.alpha = this.bankaiPulse * 0.85;
    this.parts.bankaiFlash.view.scale.set(1 + (1 - this.bankaiPulse) * 0.75);
    this.parts.speedLines.view.alpha = this.attackBurst * 0.45;
    this.parts.dust.view.alpha = this.attackBurst * 0.7;
  }

  private poseForState(): Pose {
    const t = this.animTime;
    switch (this._animState) {
      case AnimState.ATTACK: return this.getAttackPose(t, 'normal');
      case AnimState.HIGH_ATTACK: return this.getAttackPose(t, 'high');
      case AnimState.LOW_ATTACK: return this.getAttackPose(t, 'low');
      case AnimState.BLOCK: return this.getBlockPose(t);
      case AnimState.HIT: return this.getHitPose(t);
      case AnimState.KO: return this.getKoPose(t);
      case AnimState.BANKAI: return this.getBankaiPose(t);
      default: return this.getIdlePose(t);
    }
  }

  private baseLimbPose(): Pose {
    return {
      leftUpperArm: { x: -19, y: -52, rotation: 0.28 }, leftLowerArm: { x: -26, y: -34, rotation: -0.08 }, leftHand: { x: -29, y: -16 },
      rightUpperArm: { x: 19, y: -52, rotation: -0.22 }, rightLowerArm: { x: 25, y: -35, rotation: 0.26 }, rightHand: { x: 32, y: -18 },
      leftUpperLeg: { x: -9, y: -20, rotation: 0.02 }, leftLowerLeg: { x: -9, y: 0, rotation: 0.02 }, leftFoot: { x: -11, y: 22 },
      rightUpperLeg: { x: 9, y: -20, rotation: -0.02 }, rightLowerLeg: { x: 9, y: 0, rotation: -0.02 }, rightFoot: { x: 11, y: 22 },
      weapon: { x: 33, y: -18, rotation: 0.02 }, trail: { x: 33, y: -18, alpha: 0 },
    };
  }

  private getIdlePose(t: number): Pose {
    const bob = Math.sin(t * 0.006) * 1.6;
    const breathe = Math.sin(t * 0.004) * 0.022;
    const sway = Math.sin(t * 0.0028) * 0.02;
    const auraPulse = 0.22 + Math.sin(t * 0.005) * 0.08;
    return {
      ...this.baseLimbPose(),
      root: { y: bob, scaleX: 1 - breathe * 0.25, scaleY: 1 + breathe, rotation: sway },
      torso: { rotation: sway * 0.7 }, chestPatch: { rotation: sway * 0.7 }, belt: { rotation: sway * 0.6 }, coatBack: { rotation: -sway * 1.5, y: Math.sin(t * 0.005) * 1 },
      head: { y: bob * 0.22, rotation: -sway * 0.8 }, face: { y: bob * 0.22, rotation: -sway * 0.8 }, headband: { y: bob * 0.22, rotation: -sway * 0.8 },
      hairBack: { y: bob * 0.08, rotation: -sway }, hairFront: { y: bob * 0.02, rotation: -sway * 1.4, scaleX: 1 + Math.sin(t * 0.005) * 0.012 },
      leftUpperArm: { x: -19, y: -52, rotation: 0.26 + Math.sin(t * 0.004) * 0.03 }, leftLowerArm: { x: -26, y: -34, rotation: -0.12 + Math.sin(t * 0.004 + 1.2) * 0.025 },
      rightUpperArm: { x: 19, y: -52, rotation: -0.22 + Math.sin(t * 0.004 + 1) * 0.03 }, rightLowerArm: { x: 25, y: -35, rotation: 0.27 + Math.sin(t * 0.004 + 1.7) * 0.025 },
      weapon: { x: 33, y: -18 + Math.sin(t * 0.004 + 1.7) * 0.8, rotation: -0.04 + Math.sin(t * 0.003) * 0.025 },
      auraBack: { alpha: auraPulse, scaleX: 1, scaleY: 1 }, auraFront: { alpha: auraPulse * 0.65, scaleX: 1, scaleY: 1 }, speedLines: { alpha: 0 }, dust: { alpha: 0 }, bankaiFlash: { alpha: 0 }, hitFlash: { alpha: 0 },
    };
  }

  private getAttackPose(t: number, variant: 'normal' | 'high' | 'low'): Pose {
    const p = clamp01(t / 310);
    const wind = p < 0.28 ? easeInCubic(p / 0.28) : 1;
    const strikeRaw = p < 0.28 ? 0 : clamp01((p - 0.28) / 0.28);
    const strike = easeOutBack(strikeRaw);
    const recover = p < 0.56 ? 0 : easeOutCubic((p - 0.56) / 0.44);
    const hold = 1 - recover;
    const aimY = variant === 'high' ? -19 : variant === 'low' ? 15 : 0;
    const crouch = variant === 'low' ? 8 * strike * hold : 0;
    const lunge = 9 * strike * hold - 3 * wind * (1 - strikeRaw);
    const swing = (-0.95 * wind + 1.95 * strike) * hold;
    const squash = strike * hold;
    return {
      ...this.baseLimbPose(),
      root: { x: lunge, y: -2 * strike + crouch, scaleX: 1.08 + 0.04 * squash, scaleY: 0.94 - 0.02 * squash, rotation: 0.07 * strike * hold },
      torso: { rotation: 0.18 * strike * hold - 0.08 * wind * (1 - strikeRaw) }, chestPatch: { rotation: 0.18 * strike * hold }, belt: { rotation: 0.12 * strike * hold },
      coatBack: { x: -5 * strike, y: 1, rotation: -0.22 * strike },
      head: { x: 2 * strike, y: -2 + crouch * 0.25, rotation: -0.12 * strike }, face: { x: 2 * strike, y: -2 + crouch * 0.25, rotation: -0.12 * strike }, headband: { x: 2 * strike, y: -2 + crouch * 0.25, rotation: -0.12 * strike },
      hairBack: { x: -3 * strike, y: -2, rotation: -0.18 * strike }, hairFront: { x: -4 * strike, y: -4, rotation: -0.24 * strike, scaleX: 1.04 },
      leftUpperArm: { x: -20, y: -51 + crouch * 0.3, rotation: -0.45 * strike }, leftLowerArm: { x: -28, y: -36 + crouch * 0.3, rotation: -0.65 * strike }, leftHand: { x: -32, y: -18 + crouch * 0.3 },
      rightUpperArm: { x: 20 + 5 * strike, y: -51 + aimY * 0.16 + crouch * 0.3, rotation: swing },
      rightLowerArm: { x: 28 + 16 * strike, y: -35 + aimY * 0.42 + crouch * 0.3, rotation: swing * 0.6 },
      rightHand: { x: 42 + 22 * strike, y: -18 + aimY + crouch * 0.3, scaleX: 1.1 },
      weapon: { x: 42 + 22 * strike, y: -18 + aimY + crouch * 0.3, rotation: swing * 0.58, scaleX: 1 + 0.18 * strike },
      trail: { x: 42 + 10 * strike, y: -18 + aimY, rotation: swing * 0.45, alpha: Math.sin(clamp01(strikeRaw) * Math.PI) * 0.95, scaleX: 1.1 + strike * 0.45, scaleY: 1 + (variant === 'high' ? 0.12 : variant === 'low' ? -0.08 : 0) },
      leftUpperLeg: { x: -10, y: -20, rotation: -0.16 * strike }, leftLowerLeg: { x: -11, y: 0, rotation: -0.10 * strike }, leftFoot: { x: -15, y: 22, rotation: -0.06 * strike },
      rightUpperLeg: { x: 10, y: -20, rotation: 0.22 * strike }, rightLowerLeg: { x: 11, y: 0, rotation: 0.14 * strike }, rightFoot: { x: 17, y: 22, rotation: 0.08 * strike },
      auraBack: { alpha: 0.24 + 0.35 * Math.sin(clamp01(strikeRaw) * Math.PI), scaleX: 1.15, scaleY: 1.1 }, auraFront: { alpha: 0.2 + 0.25 * Math.sin(clamp01(strikeRaw) * Math.PI), scaleX: 1.12, scaleY: 1.08 },
      speedLines: { alpha: Math.sin(clamp01(strikeRaw) * Math.PI) * 0.6 }, dust: { alpha: strike * hold },
    };
  }

  private getBlockPose(t: number): Pose {
    const pulse = 0.32 + Math.sin(t * 0.02) * 0.08;
    return {
      ...this.baseLimbPose(),
      root: { x: -5, y: 3, scaleX: 0.92, scaleY: 1.03, rotation: -0.08 }, torso: { rotation: -0.09 }, chestPatch: { rotation: -0.09 }, belt: { rotation: -0.05 }, coatBack: { rotation: 0.1 },
      head: { x: -3, y: 2, rotation: -0.06 }, face: { x: -3, y: 2, rotation: -0.06 }, headband: { x: -3, y: 2, rotation: -0.06 }, hairFront: { x: -3, y: 1, rotation: -0.05 }, hairBack: { x: -3, y: 1 },
      leftUpperArm: { x: -12, y: -54, rotation: -1.0 }, leftLowerArm: { x: -15, y: -42, rotation: -1.25 }, leftHand: { x: -5, y: -40 },
      rightUpperArm: { x: 13, y: -54, rotation: 1.05 }, rightLowerArm: { x: 15, y: -42, rotation: 1.35 }, rightHand: { x: 5, y: -40 },
      weapon: { x: 10, y: -42, rotation: -1.42 }, trail: { alpha: 0 }, leftUpperLeg: { x: -10, y: -20, rotation: -0.12 }, rightUpperLeg: { x: 10, y: -20, rotation: 0.15 },
      auraBack: { alpha: pulse, scaleX: 0.85, scaleY: 1.25 }, auraFront: { alpha: pulse * 0.8, scaleX: 0.78, scaleY: 1.18 },
    };
  }

  private getHitPose(t: number): Pose {
    const p = clamp01(t / 280);
    const recoil = 1 - easeOutCubic(p);
    return {
      ...this.baseLimbPose(),
      root: { x: -15 * recoil, y: 5 * recoil, rotation: -0.24 * recoil, scaleX: 0.94, scaleY: 1.06 }, torso: { rotation: -0.18 * recoil }, chestPatch: { rotation: -0.18 * recoil }, belt: { rotation: -0.12 * recoil }, coatBack: { rotation: 0.3 * recoil },
      head: { x: -7 * recoil, y: 4 * recoil, rotation: -0.27 * recoil }, face: { x: -7 * recoil, y: 4 * recoil, rotation: -0.27 * recoil }, headband: { x: -7 * recoil, y: 4 * recoil, rotation: -0.27 * recoil }, hairFront: { x: -9 * recoil, y: 3 * recoil, rotation: -0.32 * recoil }, hairBack: { x: -9 * recoil, y: 3 * recoil },
      leftUpperArm: { x: -22, y: -50, rotation: -0.7 * recoil }, leftLowerArm: { x: -32, y: -37, rotation: -0.85 * recoil }, leftHand: { x: -38, y: -20 },
      rightUpperArm: { x: 19, y: -51, rotation: 0.7 * recoil }, rightLowerArm: { x: 30, y: -36, rotation: 0.8 * recoil }, rightHand: { x: 38, y: -18 }, weapon: { x: 38, y: -18, rotation: 0.55 * recoil },
      trail: { alpha: 0 }, auraBack: { alpha: 0.22 * recoil, scaleX: 1.35, scaleY: 1.35 }, auraFront: { alpha: 0.18 * recoil, scaleX: 1.3, scaleY: 1.3 },
    };
  }

  private getKoPose(t: number): Pose {
    const p = clamp01(t / 560);
    const fall = easeOutCubic(p);
    return {
      ...this.baseLimbPose(),
      root: { x: -12 * fall, y: 22 * fall, rotation: -1.38 * fall, scaleX: 1, scaleY: 1 }, torso: { rotation: -0.15 * fall }, chestPatch: { rotation: -0.15 * fall }, belt: { rotation: -0.12 * fall }, coatBack: { rotation: 0.28 * fall },
      head: { x: -6 * fall, y: 5 * fall, rotation: -0.35 * fall }, face: { x: -6 * fall, y: 5 * fall, rotation: -0.35 * fall }, headband: { x: -6 * fall, y: 5 * fall, rotation: -0.35 * fall }, hairFront: { x: -6 * fall, y: 5 * fall, rotation: -0.35 * fall }, hairBack: { x: -6 * fall, y: 5 * fall },
      leftUpperArm: { x: -21, y: -50, rotation: -0.85 * fall }, leftLowerArm: { x: -31, y: -33, rotation: -0.95 * fall }, rightUpperArm: { x: 21, y: -50, rotation: 0.9 * fall }, rightLowerArm: { x: 31, y: -33, rotation: 0.8 * fall },
      weapon: { x: 36 + 8 * fall, y: -18 + 7 * fall, rotation: 0.65 * fall }, auraBack: { alpha: 0 }, auraFront: { alpha: 0 }, trail: { alpha: 0 }, speedLines: { alpha: 0 }, dust: { alpha: 0 },
    };
  }

  private getBankaiPose(t: number): Pose {
    const p = clamp01(t / 560);
    const charge = Math.sin(p * Math.PI);
    const shake = Math.sin(t * 0.09) * 2.2 * charge;
    return {
      ...this.baseLimbPose(),
      root: { x: shake, y: -8 * charge, scaleX: 1 + 0.1 * charge, scaleY: 1 + 0.08 * charge }, torso: { rotation: Math.sin(t * 0.05) * 0.05 * charge }, chestPatch: { rotation: Math.sin(t * 0.05) * 0.05 * charge }, coatBack: { y: -4 * charge, rotation: Math.sin(t * 0.05) * 0.15 * charge },
      head: { y: -5 * charge }, face: { y: -5 * charge }, headband: { y: -5 * charge }, hairBack: { y: -7 * charge, scaleX: 1 + 0.08 * charge, scaleY: 1 + 0.08 * charge }, hairFront: { y: -9 * charge, scaleX: 1 + 0.13 * charge, scaleY: 1 + 0.13 * charge },
      leftUpperArm: { x: -22, y: -54, rotation: -0.9 * charge }, leftLowerArm: { x: -31, y: -37, rotation: -0.6 * charge }, leftHand: { x: -36, y: -24 },
      rightUpperArm: { x: 20 + 8 * charge, y: -53 - 4 * charge, rotation: 0.25 + 0.72 * charge }, rightLowerArm: { x: 28 + 13 * charge, y: -35 - 3 * charge, rotation: 0.18 + 0.48 * charge }, rightHand: { x: 42 + 13 * charge, y: -19 - 3 * charge },
      weapon: { x: 42 + 13 * charge, y: -19 - 3 * charge, rotation: 0.12 + 0.48 * charge, scaleX: 1.22 }, trail: { x: 42, y: -20, alpha: 0.4 * charge, scaleX: 1.35, rotation: 0.35 },
      auraBack: { alpha: 0.7, scaleX: 1.25 + charge * 0.45, scaleY: 1.25 + charge * 0.45 }, auraFront: { alpha: 0.48, scaleX: 1.15 + charge * 0.35, scaleY: 1.15 + charge * 0.35 }, bankaiFlash: { alpha: 0.8 * charge }, speedLines: { alpha: 0.5 * charge }, dust: { alpha: 0.5 * charge },
    };
  }

  private applyPose(pose: Pose) {
    this.applyPart(this.root, pose.root);
    (Object.keys(this.parts) as PartName[]).forEach(name => this.applyPart(this.parts[name].view, pose[name]));
  }

  private applyPart(part: Container | Graphics, target?: PosePart) {
    part.x = target?.x ?? 0;
    part.y = target?.y ?? 0;
    part.rotation = target?.rotation ?? 0;
    part.scale.x = target?.scaleX ?? 1;
    const scaleY = target?.scaleY ?? 1;
    part.scale.y = part === this.root ? scaleY * this.bodyScaleY : scaleY;
    if (typeof target?.alpha === 'number') part.alpha = target.alpha;
    else if (part !== this.parts.hitFlash.view && part !== this.parts.bankaiFlash.view && part !== this.parts.speedLines.view && part !== this.parts.dust.view) part.alpha = 1;
  }

  destroy() { this.container.destroy({ children: true }); }
}
