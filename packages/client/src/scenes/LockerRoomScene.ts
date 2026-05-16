import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameContext } from '../main';
import { CharacterSprite, DEFAULT_LOOKS } from '../game/CharacterSprite';
import type { CharacterLooks } from '../game/CharacterSprite';
import { ALL_CARDS, activeCardSlotCountForRank, getMissingCardIds, getCardById } from '@ahf/shared';
import { buyCardForPlayer, getPlayerCardCollection, setActiveCardsForPlayer } from '../game/CardCollectionStore';

// ── Asset paths (individual PNGs from the source images folder) ─────────────
const IMG = '/assets/Customizable%202D%20Spine%20Character%20Animation%20Set%202/images/';

interface PartOption { label: string; img: string; value: number | string; }

const BODY_OPTIONS: PartOption[] = [1,2,3,4,5,6,7].map(i => ({
  label: `Outfit ${i}`, img: `${IMG}BodyObject_0${i}.png`, value: i,
}));
const HEAD_OPTIONS: PartOption[] = [
  { label: 'None', img: '', value: 0 },
  ...[1,2,3,4,5].map(i => ({ label: `Head ${i}`, img: `${IMG}HeadObject_0${i}.png`, value: i })),
];
const HAIR_OPTIONS: PartOption[] = [1,2,3,4,5].map(i => ({
  label: `Hair ${i}`, img: `${IMG}hairObject_0${i}.png`, value: i,
}));
const HAND_OPTIONS: PartOption[] = [
  { label: 'None', img: '', value: 0 },
  ...[1,2,3,4,5,6].map(i => ({ label: `Weapon ${i}`, img: `${IMG}HandObject_0${i}.png`, value: i })),
];
const CLOAK_OPTIONS: PartOption[] = [
  { label: 'None', img: '', value: 0 },
  ...[1,2,3,4].map(i => ({ label: `Cloak ${i}`, img: `${IMG}cloakObject_0${i}.png`, value: i })),
];
const EYE_OPTIONS: PartOption[] = [
  { label: 'Normal', img: `${IMG}Eye_Basic.png`,  value: 'Basic' },
  { label: 'Fierce', img: `${IMG}Eye_Anger.png`,  value: 'Anger' },
  { label: 'Happy',  img: `${IMG}Eye_laugh.png`,  value: 'laugh' },
];
const MAKEUP_OPTIONS: PartOption[] = [
  { label: 'None', img: '', value: 0 },
  { label: 'Style 1', img: `${IMG}makeup_01.png`, value: 1 },
  { label: 'Style 2', img: `${IMG}makeup_02.png`, value: 2 },
];
const SUPPORT_OPTIONS: PartOption[] = [
  { label: 'None',   img: '', value: 0 },
  { label: 'Item 2', img: `${IMG}SupportObject_02.png`, value: 2 },
];

const AURA_COLORS = ['#7b2fff','#ff8c00','#00ffaa','#ff2266','#00ccff','#ffff00'];

type TabKey = 'outfit' | 'head' | 'hair' | 'weapon' | 'more';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'outfit',  label: 'Outfit' },
  { key: 'head',    label: 'Head'   },
  { key: 'hair',    label: 'Hair'   },
  { key: 'weapon',  label: 'Weapon' },
  { key: 'more',    label: 'More'   },
];

// ── Scene ───────────────────────────────────────────────────────────────────

export class LockerRoomScene {
  private container: Container;
  private uiEl: HTMLDivElement;
  private previewSprite: CharacterSprite | null = null;
  private previewContainer: Container;

  private looks: CharacterLooks;
  private auraColor: string;
  private charName: string;
  private activeTab: TabKey = 'outfit';

  constructor(private ctx: GameContext) {
    this.container = new Container();
    ctx.app.stage.addChild(this.container);

    const cos = ctx.player?.cosmetics;
    this.auraColor = cos?.auraColor ?? '#7b2fff';
    this.charName  = cos?.characterName ?? ctx.player?.username ?? '';

    // Load looks from saved cosmetics (new fields), falling back to defaults
    this.looks = {
      bodyObject:   cos?.bodyObject   ?? DEFAULT_LOOKS.bodyObject,
      headObject:   cos?.headObject   ?? DEFAULT_LOOKS.headObject,
      hairObject:   cos?.hairObject   ?? DEFAULT_LOOKS.hairObject,
      handObject:   cos?.handObject   ?? DEFAULT_LOOKS.handObject,
      cloakObject:  cos?.cloakObject  ?? DEFAULT_LOOKS.cloakObject,
      eyeType:      cos?.eyeType      ?? DEFAULT_LOOKS.eyeType,
      makeupIndex:  cos?.makeupIndex  ?? DEFAULT_LOOKS.makeupIndex,
      supportIndex: cos?.supportIndex ?? DEFAULT_LOOKS.supportIndex,
    };

    const { width: W, height: H } = ctx.app.screen;

    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x0d0d2a);
    this.container.addChild(bg);

    const title = new Text({
      text: 'LOCKER ROOM',
      style: new TextStyle({ fill: 0xffd700, fontSize: 28, fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: 4 }),
    });
    title.anchor.set(0.5, 0);
    title.x = W / 2;
    title.y = 14;
    this.container.addChild(title);

    // Preview area (left side on wide screens, top on mobile)
    this.previewContainer = new Container();
    this.previewContainer.x = W * 0.22;
    this.previewContainer.y = H * 0.55;
    this.container.addChild(this.previewContainer);

    // Load spine and create preview
    CharacterSprite.preload().then(() => {
      this.previewSprite = CharacterSprite.create(this.looks, 'right');
      this.previewSprite.setScale(0.16);
      this.previewSprite.freeze();
      this.previewContainer.addChild(this.previewSprite.container);
    });

    this.uiEl = this.buildUI();
    document.getElementById('ui-layer')!.appendChild(this.uiEl);
  }

  // ── UI building ──────────────────────────────────────────────────────────

  private buildUI(): HTMLDivElement {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:stretch;';

    const panel = document.createElement('div');
    panel.style.cssText = [
      'pointer-events:all;',
      'background:rgba(8,8,28,0.94);',
      'border-left:1px solid rgba(255,215,0,0.25);',
      'width:min(420px,100%);',
      'height:100%;',
      'display:flex;',
      'flex-direction:column;',
      'overflow:hidden;',
    ].join('');

    // Header with name + aura
    panel.appendChild(this.buildHeader());

    // Tab bar
    panel.appendChild(this.buildTabBar());

    // Tab content (scrollable)
    const content = document.createElement('div');
    content.id = 'locker-tab-content';
    content.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';
    content.appendChild(this.buildTabContent(this.activeTab));
    panel.appendChild(content);

    // Card loadout
    panel.appendChild(this.buildCardSection());

    // Buttons
    panel.appendChild(this.buildButtonRow());

    root.appendChild(panel);
    return root;
  }

  private buildHeader(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'padding:16px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:10px;';

    // Name input
    const nameWrap = document.createElement('div');
    const nameLbl = document.createElement('label');
    nameLbl.textContent = 'FIGHTER NAME';
    nameLbl.style.cssText = 'color:#ffd700;font-size:10px;font-weight:bold;letter-spacing:2px;display:block;margin-bottom:5px;';
    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.value = this.charName; nameInp.maxLength = 20;
    nameInp.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,255,255,0.05);color:#fff;font-size:14px;font-family:inherit;box-sizing:border-box;';
    nameInp.addEventListener('input', () => { this.charName = nameInp.value; });
    nameWrap.appendChild(nameLbl); nameWrap.appendChild(nameInp);
    row.appendChild(nameWrap);

    // Aura color
    const auraWrap = document.createElement('div');
    const auraLbl = document.createElement('label');
    auraLbl.textContent = 'AURA COLOR';
    auraLbl.style.cssText = 'color:#ffd700;font-size:10px;font-weight:bold;letter-spacing:2px;display:block;margin-bottom:5px;';
    const swatches = document.createElement('div');
    swatches.style.cssText = 'display:flex;gap:8px;';
    AURA_COLORS.forEach(col => {
      const dot = document.createElement('button');
      dot.style.cssText = `width:28px;height:28px;border-radius:50%;background:${col};border:2px solid ${col === this.auraColor ? '#fff' : 'transparent'};cursor:pointer;box-shadow:0 0 8px ${col};`;
      dot.addEventListener('click', () => { this.auraColor = col; this.rebuildUI(); });
      swatches.appendChild(dot);
    });
    auraWrap.appendChild(auraLbl); auraWrap.appendChild(swatches);
    row.appendChild(auraWrap);

    return row;
  }

  private buildTabBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;border-bottom:1px solid rgba(255,255,255,0.1);';
    TABS.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      const active = key === this.activeTab;
      btn.style.cssText = `flex:1;padding:10px 4px;border:none;border-bottom:2px solid ${active ? '#ffd700' : 'transparent'};background:transparent;color:${active ? '#ffd700' : '#888'};font-size:12px;font-weight:bold;cursor:pointer;font-family:inherit;letter-spacing:1px;`;
      btn.addEventListener('click', () => { this.activeTab = key; this.rebuildUI(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  private buildTabContent(tab: TabKey): HTMLDivElement {
    const wrap = document.createElement('div');
    switch (tab) {
      case 'outfit':
        wrap.appendChild(this.buildGrid('Outfit', BODY_OPTIONS, this.looks.bodyObject, v => { this.looks = { ...this.looks, bodyObject: v as number }; this.updatePreview(); }));
        break;
      case 'head':
        wrap.appendChild(this.buildGrid('Head Gear', HEAD_OPTIONS, this.looks.headObject, v => { this.looks = { ...this.looks, headObject: v as number }; this.updatePreview(); }));
        wrap.appendChild(this.buildGrid('Eyes', EYE_OPTIONS, this.looks.eyeType, v => { this.looks = { ...this.looks, eyeType: v as CharacterLooks['eyeType'] }; this.updatePreview(); }));
        wrap.appendChild(this.buildGrid('Makeup', MAKEUP_OPTIONS, this.looks.makeupIndex, v => { this.looks = { ...this.looks, makeupIndex: v as number }; this.updatePreview(); }));
        break;
      case 'hair':
        wrap.appendChild(this.buildGrid('Hair Style', HAIR_OPTIONS, this.looks.hairObject, v => { this.looks = { ...this.looks, hairObject: v as number }; this.updatePreview(); }));
        break;
      case 'weapon':
        wrap.appendChild(this.buildGrid('Weapon / Item', HAND_OPTIONS, this.looks.handObject, v => { this.looks = { ...this.looks, handObject: v as number }; this.updatePreview(); }));
        break;
      case 'more':
        wrap.appendChild(this.buildGrid('Cloak', CLOAK_OPTIONS, this.looks.cloakObject, v => { this.looks = { ...this.looks, cloakObject: v as number }; this.updatePreview(); }));
        wrap.appendChild(this.buildGrid('Support Item', SUPPORT_OPTIONS, this.looks.supportIndex, v => { this.looks = { ...this.looks, supportIndex: v as number }; this.updatePreview(); }));
        break;
    }
    return wrap;
  }

  private buildGrid(sectionLabel: string, options: PartOption[], current: number | string, onChange: (v: number | string) => void): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:16px;';

    const lbl = document.createElement('div');
    lbl.textContent = sectionLabel.toUpperCase();
    lbl.style.cssText = 'color:#ffd700;font-size:10px;font-weight:bold;letter-spacing:2px;margin-bottom:8px;';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:6px;';

    options.forEach(opt => {
      const btn = document.createElement('button');
      const isActive = opt.value === current;
      btn.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;',
        'padding:6px 4px;border-radius:8px;cursor:pointer;font-family:inherit;',
        `border:2px solid ${isActive ? '#ffd700' : 'rgba(255,255,255,0.12)'};`,
        `background:${isActive ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)'};`,
      ].join('');

      if (opt.img) {
        const img = document.createElement('img');
        img.src = opt.img;
        img.style.cssText = 'width:52px;height:52px;object-fit:contain;image-rendering:pixelated;';
        img.draggable = false;
        btn.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'width:52px;height:52px;display:flex;align-items:center;justify-content:center;color:#666;font-size:22px;';
        placeholder.textContent = '✕';
        btn.appendChild(placeholder);
      }

      const lbl2 = document.createElement('span');
      lbl2.textContent = opt.label;
      lbl2.style.cssText = `font-size:10px;color:${isActive ? '#ffd700' : '#888'};`;
      btn.appendChild(lbl2);

      btn.addEventListener('click', () => { onChange(opt.value); this.rebuildUI(); });
      grid.appendChild(btn);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  private buildCardSection(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);padding:10px 14px;';

    const collection = getPlayerCardCollection(this.ctx.player);
    const slots = activeCardSlotCountForRank(this.ctx.player?.rankPoints ?? 0);
    const ownedCards = ALL_CARDS.filter(c => collection.unlocked.includes(c.id));
    const missingIds = getMissingCardIds(collection);
    const cheapest = missingIds.map(id => getCardById(id)).filter(Boolean).sort((a, b) => (a!.buyCost - b!.buyCost))[0];

    const hdr = document.createElement('div');
    hdr.textContent = `CARDS ${collection.unlocked.length}/12 · DUST ${collection.currency} · ACTIVE ${collection.active.length}/${slots}`;
    hdr.style.cssText = 'color:#ffd700;font-size:10px;font-weight:bold;letter-spacing:1px;margin-bottom:8px;';
    wrap.appendChild(hdr);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';

    ownedCards.forEach(card => {
      const active = collection.active.includes(card.id);
      const btn = document.createElement('button');
      btn.textContent = (active ? '✓ ' : '') + card.name;
      btn.title = card.description;
      btn.style.cssText = `padding:5px 8px;border-radius:7px;border:1px solid ${active ? '#ffd700' : 'rgba(255,255,255,0.16)'};background:${active ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)'};color:${active ? '#ffd700' : '#bbb'};font-size:11px;cursor:pointer;font-family:inherit;`;
      btn.addEventListener('click', async () => {
        let next = collection.active.filter(id => id !== card.id);
        if (!active) next = slots <= 1 ? [card.id] : [...collection.active, card.id].slice(0, slots);
        await setActiveCardsForPlayer(this.ctx.player, next);
        this.rebuildUI();
      });
      row.appendChild(btn);
    });

    if (ownedCards.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = 'Win fights to unlock cards.';
      empty.style.cssText = 'color:#666;font-size:12px;';
      row.appendChild(empty);
    }

    wrap.appendChild(row);

    if (cheapest) {
      const buyBtn = document.createElement('button');
      buyBtn.textContent = `Buy: ${cheapest.name} (${cheapest.buyCost} dust)`;
      buyBtn.disabled = collection.currency < cheapest.buyCost;
      buyBtn.style.cssText = `margin-top:7px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:${buyBtn.disabled ? 'transparent' : 'rgba(255,215,0,0.1)'};color:${buyBtn.disabled ? '#555' : '#ffd700'};font-size:11px;cursor:${buyBtn.disabled ? 'not-allowed' : 'pointer'};font-family:inherit;`;
      buyBtn.addEventListener('click', async () => {
        await buyCardForPlayer(this.ctx.player, cheapest.id);
        this.rebuildUI();
      });
      wrap.appendChild(buyBtn);
    }

    return wrap;
  }

  private buildButtonRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;padding:10px 14px 16px;pointer-events:all;';

    const save = document.createElement('button');
    save.textContent = 'SAVE & BACK';
    save.style.cssText = 'flex:1;padding:13px;border-radius:10px;border:none;background:linear-gradient(135deg,#ff6b35,#cc0000);color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;';
    save.addEventListener('click', () => void this.saveAndBack());

    const back = document.createElement('button');
    back.textContent = 'BACK';
    back.style.cssText = 'padding:13px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#aaa;font-size:14px;cursor:pointer;font-family:inherit;';
    back.addEventListener('click', () => this.ctx.switchScene('hub'));

    row.append(save, back);
    return row;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private updatePreview() {
    this.previewSprite?.applyLooks(this.looks);
  }

  private rebuildUI() {
    this.uiEl.remove();
    this.uiEl = this.buildUI();
    document.getElementById('ui-layer')!.appendChild(this.uiEl);
  }

  private async saveAndBack() {
    const player = this.ctx.player;
    if (!player) { this.ctx.switchScene('hub'); return; }

    Object.assign(player.cosmetics, {
      characterName: this.charName,
      auraColor:     this.auraColor,
      bodyObject:    this.looks.bodyObject,
      headObject:    this.looks.headObject,
      hairObject:    this.looks.hairObject,
      handObject:    this.looks.handObject,
      cloakObject:   this.looks.cloakObject,
      eyeType:       this.looks.eyeType,
      makeupIndex:   this.looks.makeupIndex,
      supportIndex:  this.looks.supportIndex,
    });

    try {
      await fetch(`/player/${player.id}/cosmetics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(player.cosmetics),
      });
    } catch { /* offline fallback */ }

    this.ctx.switchScene('hub');
  }

  destroy() {
    this.previewSprite?.destroy();
    this.ctx.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.uiEl.remove();
  }
}
