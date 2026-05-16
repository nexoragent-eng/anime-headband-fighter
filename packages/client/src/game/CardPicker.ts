import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { CardDefinition } from '@ahf/shared';

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

export class CardPickerUI {
  readonly container: Container;
  private p1Pick: CardDefinition | null = null;
  private p2Pick: CardDefinition | null = null;
  private onPicked: (p1: CardDefinition, p2: CardDefinition) => void;

  constructor(
    screenW: number,
    screenH: number,
    p1Cards: CardDefinition[],
    p2Cards: CardDefinition[],
    onPicked: (p1: CardDefinition, p2: CardDefinition) => void,
  ) {
    this.container = new Container();
    this.onPicked = onPicked;

    // Dim overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.8 });
    this.container.addChild(overlay);

    // Title
    const title = new Text({
      text: 'CHOOSE YOUR POWER',
      style: new TextStyle({
        fill: '#ffd700',
        fontSize: 24,
        fontWeight: 'bold',
        letterSpacing: 4,
        fontFamily: 'Impact, Arial Black, sans-serif',
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = screenW / 2;
    title.y = 20;
    this.container.addChild(title);

    // P1 cards (left half)
    const p1Label = new Text({ text: 'PLAYER 1', style: new TextStyle({ fill: '#4a90d9', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }) });
    p1Label.anchor.set(0.5, 0);
    p1Label.x = screenW * 0.25;
    p1Label.y = 60;
    this.container.addChild(p1Label);

    // P2 cards (right half)
    const p2Label = new Text({ text: 'PLAYER 2', style: new TextStyle({ fill: '#e05050', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }) });
    p2Label.anchor.set(0.5, 0);
    p2Label.x = screenW * 0.75;
    p2Label.y = 60;
    this.container.addChild(p2Label);

    // Divider
    const divider = new Graphics();
    divider.rect(screenW / 2 - 1, 50, 2, screenH - 100).fill({ color: 0x444444, alpha: 0.8 });
    this.container.addChild(divider);

    const cardH = Math.min(150, (screenH - 140) / 3 - 12);
    const cardW = Math.min(180, screenW * 0.4);

    p1Cards.forEach((card, i) => {
      const cardContainer = this.makeCard(card, cardW, cardH);
      cardContainer.x = screenW * 0.25 - cardW / 2;
      cardContainer.y = 90 + i * (cardH + 12);
      cardContainer.eventMode = 'static';
      cardContainer.cursor = 'pointer';
      (cardContainer as any).on('pointerdown', () => {
        if (this.p1Pick) return;
        this.p1Pick = card;
        this.highlightCard(cardContainer, cardW, cardH, true);
        this.checkBothPicked();
      });
      this.container.addChild(cardContainer);
    });

    p2Cards.forEach((card, i) => {
      const cardContainer = this.makeCard(card, cardW, cardH);
      cardContainer.x = screenW * 0.75 - cardW / 2;
      cardContainer.y = 90 + i * (cardH + 12);
      cardContainer.eventMode = 'static';
      cardContainer.cursor = 'pointer';
      (cardContainer as any).on('pointerdown', () => {
        if (this.p2Pick) return;
        this.p2Pick = card;
        this.highlightCard(cardContainer, cardW, cardH, false);
        this.checkBothPicked();
      });
      this.container.addChild(cardContainer);
    });

    // Waiting hint
    const hint = new Text({
      text: 'Both players tap a card',
      style: new TextStyle({ fill: 'rgba(255,255,255,0.5)', fontSize: 13 }),
    });
    hint.anchor.set(0.5, 1);
    hint.x = screenW / 2;
    hint.y = screenH - 16;
    this.container.addChild(hint);
  }

  private makeCard(card: CardDefinition, w: number, h: number): Container {
    const c = new Container();

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 12).fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.roundRect(0, 0, w, h, 12).stroke({ color: RARITY_COLOR[card.rarity], width: 2 });
    c.addChild(bg);

    const icon = new Text({
      text: TYPE_ICON[card.type] ?? '?',
      style: new TextStyle({ fontSize: 28 }),
    });
    icon.x = 12;
    icon.y = 10;
    c.addChild(icon);

    const name = new Text({
      text: card.name,
      style: new TextStyle({
        fill: '#ffffff',
        fontSize: 15,
        fontWeight: 'bold',
        wordWrap: true,
        wordWrapWidth: w - 60,
      }),
    });
    name.x = 50;
    name.y = 14;
    c.addChild(name);

    const desc = new Text({
      text: card.description,
      style: new TextStyle({
        fill: '#cccccc',
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: w - 16,
      }),
    });
    desc.x = 10;
    desc.y = 60;
    c.addChild(desc);

    const rarityLabel = new Text({
      text: card.rarity.toUpperCase(),
      style: new TextStyle({ fill: RARITY_COLOR[card.rarity], fontSize: 10, letterSpacing: 1 }),
    });
    rarityLabel.anchor.set(1, 1);
    rarityLabel.x = w - 8;
    rarityLabel.y = h - 8;
    c.addChild(rarityLabel);

    return c;
  }

  private highlightCard(c: Container, w: number, h: number, isP1: boolean) {
    const hl = new Graphics();
    hl.roundRect(0, 0, w, h, 12).fill({ color: isP1 ? 0x4a90d9 : 0xe05050, alpha: 0.25 });
    hl.roundRect(0, 0, w, h, 12).stroke({ color: isP1 ? 0x4a90d9 : 0xe05050, width: 3 });
    c.addChildAt(hl, 1);
    c.eventMode = 'none';
  }

  private checkBothPicked() {
    if (this.p1Pick && this.p2Pick) {
      setTimeout(() => this.onPicked(this.p1Pick!, this.p2Pick!), 800);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
