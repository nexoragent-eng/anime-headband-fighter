import { MoveType } from '@ahf/shared';

export type SwipeCallback = (move: MoveType) => void;

const MIN_SWIPE_PX = 40;
const MAX_SWIPE_MS = 600;

interface Touch {
  x: number;
  y: number;
  t: number;
}

const HOLD_TO_BLOCK_MS = 170;

export class SwipeInput {
  private starts = new Map<number, Touch>();
  private onSwipe: SwipeCallback;
  private zone: 'left' | 'right' | 'full';
  private el: HTMLElement | Window;
  private cleanup: (() => void)[] = [];

  constructor(
    el: HTMLElement | Window,
    zone: 'left' | 'right' | 'full',
    onSwipe: SwipeCallback,
  ) {
    this.el = el;
    this.zone = zone;
    this.onSwipe = onSwipe;
    this.bind();
  }

  private bind() {
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (!this.inZone(t.clientX)) continue;
        this.starts.set(t.identifier, { x: t.clientX, y: t.clientY, t: Date.now() });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const start = this.starts.get(t.identifier);
        if (!start) continue;
        this.starts.delete(t.identifier);
        const dt = Date.now() - start.t;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_SWIPE_PX && dt >= HOLD_TO_BLOCK_MS && dt <= MAX_SWIPE_MS) {
          this.onSwipe(MoveType.BLOCK);
          continue;
        }
        if (dt > MAX_SWIPE_MS) continue;
        const move = this.classify(dx, dy);
        if (move !== MoveType.NONE) this.onSwipe(move);
      }
    };

    const opt = { passive: true };
    this.el.addEventListener('touchstart', onTouchStart as EventListener, opt);
    this.el.addEventListener('touchend', onTouchEnd as EventListener, opt);
    this.cleanup.push(
      () => this.el.removeEventListener('touchstart', onTouchStart as EventListener),
      () => this.el.removeEventListener('touchend', onTouchEnd as EventListener),
    );
  }

  private inZone(x: number): boolean {
    if (this.zone === 'full') return true;
    const mid = window.innerWidth / 2;
    return this.zone === 'left' ? x < mid : x >= mid;
  }

  private classify(dx: number, dy: number): MoveType {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_SWIPE_PX) return MoveType.NONE;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX > absY) {
      return dx > 0 ? MoveType.ATTACK : MoveType.DODGE;
    } else {
      return dy < 0 ? MoveType.HIGH_ATTACK : MoveType.LOW_ATTACK;
    }
  }

  destroy() {
    this.cleanup.forEach(fn => fn());
  }
}

// Keyboard binding: returns a cleanup function
export function bindKeyboard(
  map: Record<string, MoveType>,
  onMove: SwipeCallback,
): () => void {
  const used = new Set<string>();

  const down = (e: KeyboardEvent) => {
    const move = map[e.code];
    if (!move || used.has(e.code)) return;
    used.add(e.code);
    onMove(move);
  };

  const up = (e: KeyboardEvent) => {
    used.delete(e.code);
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}

export const KEYBOARD_MAP_P1: Record<string, MoveType> = {
  KeyD: MoveType.ATTACK,
  KeyW: MoveType.HIGH_ATTACK,
  KeyS: MoveType.LOW_ATTACK,
  KeyA: MoveType.BLOCK,
  ShiftLeft: MoveType.DODGE,
  KeyQ: MoveType.BANKAI,
};

export const KEYBOARD_MAP_P2: Record<string, MoveType> = {
  ArrowRight: MoveType.ATTACK,
  ArrowUp: MoveType.HIGH_ATTACK,
  ArrowDown: MoveType.LOW_ATTACK,
  ArrowLeft: MoveType.BLOCK,
  ShiftRight: MoveType.DODGE,
  Numpad0: MoveType.BANKAI,
};
