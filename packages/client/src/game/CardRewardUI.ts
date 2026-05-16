import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { CardCollectionState, CardDefinition } from '@ahf/shared';
import { getCardById } from '@ahf/shared';

const RARITY_COLOR: Record<string, number> = {
  common: 0x888888,
  rare: 0x4488ff,
  epic: 0xaa44ff,
};

const TYPE_ICON: Record<string, string> = {
  stat: '⚡',
  ability: '✦',
  bankai: '🔥',
};

export class CardRewardUI {
  readonly container: Container;
  private picked = false;

  constructor(
    screenW: number,
    screenH: number,
    cards: CardDefinition[],
    collection: CardCollectionState,
    onPicked: (card: CardDefinition) => void,
  ) {
    this.container = new Container();

    const overlay = new Graphics();
    overlay.rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.82 });
    this.container.addChild(overlay);

    const owned = new Set(collection.unlocked);
    const title = new Text({
      text: 'CHOOSE YOUR REWARD',
      style: new TextStyle({ fill: '#ffd700', fontSize: 26, fontWeight: 'bold', letterSpacing: 4, fontFamily: 'Impact, Arial Black, sans-serif' }),
    });
    title.anchor.set(0.5, 0);
    title.x = screenW / 2;
    title.y = 24;
    this.container.addChild(title);

    const sub = new Text({
      text: `Collection ${collection.unlocked.length}/12  •  Dust ${collection.currency}`,
      style: new TextStyle({ fill: 'rgba(255,255,255,0.72)', fontSize: 13, letterSpacing: 1 }),
    });
    sub.anchor.set(0.5, 0);
    sub.x = screenW / 2;
    sub.y = 60;
    this.container.addChild(sub);

    const cardW = Math.min(220, screenW * 0.28);
    const cardH = Math.min(190, screenH * 0.48);
    const gap = Math.min(26, screenW * 0.03);
    const totalW = cardW * cards.length + gap * (cards.length - 1);
    const startX = screenW / 2 - totalW / 2;

    cards.forEach((card, i) => {
      const isDuplicate = owned.has(card.id);
      const c = this.makeCard(card, cardW, cardH, isDuplicate);
      c.x = startX + i * (cardW + gap);
      c.y = Math.max(94, screenH / 2 - cardH / 2);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      (c as any).on('pointerdown', () => {
        if (this.picked) return;
        this.picked = true;
        this.highlight(c, cardW, cardH);
        setTimeout(() => onPicked(card), 350);
      });
      this.container.addChild(c);
    });

    const hint = new Text({
      text: 'New cards are added to your collection. Duplicates are auto-sold for dust.',
      style: new TextStyle({ fill: 'rgba(255,255,255,0.52)', fontSize: 12 }),
    });
    hint.anchor.set(0.5, 1);
    hint.x = screenW / 2;
    hint.y = screenH - 18;
    this.container.addChild(hint);
  }

  private makeCard(card: CardDefinition, w: number, h: number, duplicate: boolean): Container {
    const c = new Container();
    const rarity = RARITY_COLOR[card.rarity] ?? 0xffffff;

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 14).fill({ color: 0x15152f, alpha: 0.98 });
    bg.roundRect(0, 0, w, h, 14).stroke({ color: rarity, width: 2 });
    c.addChild(bg);

    const icon = new Text({ text: TYPE_ICON[card.type] ?? '?', style: new TextStyle({ fontSize: 30 }) });
    icon.x = 14; icon.y = 12; c.addChild(icon);

    const name = new Text({
      text: card.name,
      style: new TextStyle({ fill: '#fff', fontSize: 17, fontWeight: 'bold', wordWrap: true, wordWrapWidth: w - 68 }),
    });
    name.x = 56; name.y = 16; c.addChild(name);

    const desc = new Text({
      text: card.description,
      style: new TextStyle({ fill: '#cccccc', fontSize: 13, wordWrap: true, wordWrapWidth: w - 20 }),
    });
    desc.x = 12; desc.y = 72; c.addChild(desc);

    const reward = duplicate ? `DUPLICATE → SELL +${card.dustValue}` : 'NEW CARD';
    const rewardText = new Text({
      text: reward,
      style: new TextStyle({ fill: duplicate ? '#ffaa44' : '#7dff9a', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }),
    });
    rewardText.anchor.set(0.5, 1);
    rewardText.x = w / 2; rewardText.y = h - 28; c.addChild(rewardText);

    const rarityLabel = new Text({ text: card.rarity.toUpperCase(), style: new TextStyle({ fill: rarity, fontSize: 10, letterSpacing: 1 }) });
    rarityLabel.anchor.set(1, 1); rarityLabel.x = w - 10; rarityLabel.y = h - 8; c.addChild(rarityLabel);

    const lookup = getCardById(card.id);
    if (!lookup) return c;
    return c;
  }

  private highlight(c: Container, w: number, h: number) {
    const hl = new Graphics();
    hl.roundRect(0, 0, w, h, 14).fill({ color: 0xffd700, alpha: 0.18 });
    hl.roundRect(0, 0, w, h, 14).stroke({ color: 0xffd700, width: 4 });
    c.addChildAt(hl, 1);
    c.eventMode = 'none';
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
