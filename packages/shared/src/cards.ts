export type CardType = 'stat' | 'ability' | 'bankai';
export type CardRarity = 'common' | 'rare' | 'epic';

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  description: string;
  effectKey: string;
  value: number;
  rarity: CardRarity;
  dustValue: number;
  buyCost: number;
}

export interface CardCollectionState {
  unlocked: string[];
  active: string[];
  currency: number;
  soldDuplicates: number;
}

export const CARD_LIBRARY_SIZE = 12;
export const DEFAULT_ACTIVE_CARD_SLOTS = 1;
export const MAX_ACTIVE_CARD_SLOTS = 3;
export const DEFAULT_CARD_COLLECTION: CardCollectionState = {
  unlocked: [],
  active: [],
  currency: 0,
  soldDuplicates: 0,
};

export const ALL_CARDS: CardDefinition[] = [
  // Stat cards — deliberately small. Cards should shape style, not decide the fight alone.
  { id: 'quick_feet', name: 'Quick Feet', type: 'stat', description: 'Dodge and movement feel slightly faster.', effectKey: 'speedMult', value: 1.05, rarity: 'common', dustValue: 15, buyCost: 80 },
  { id: 'heavy_hit', name: 'Heavy Hit', type: 'stat', description: 'Hits slightly harder, but recovery feels heavier.', effectKey: 'heavyHit', value: 1.08, rarity: 'common', dustValue: 15, buyCost: 80 },
  { id: 'iron_guard', name: 'Iron Guard', type: 'stat', description: 'Take slightly less normal attack damage.', effectKey: 'defenseMult', value: 1.08, rarity: 'common', dustValue: 15, buyCost: 80 },
  { id: 'spirit_charge', name: 'Spirit Charge', type: 'stat', description: 'Bankai meter charges slightly faster.', effectKey: 'bankaiChargeRateMult', value: 1.12, rarity: 'common', dustValue: 15, buyCost: 80 },

  // Ability cards
  { id: 'counter_spark', name: 'Counter Spark', type: 'ability', description: 'Perfect block triggers a small counter hit.', effectKey: 'counterOnPerfectBlock', value: 1, rarity: 'rare', dustValue: 35, buyCost: 160 },
  { id: 'low_sweep', name: 'Low Sweep', type: 'ability', description: 'Low attacks briefly slow the opponent.', effectKey: 'lowAttackSlows', value: 1, rarity: 'common', dustValue: 15, buyCost: 80 },
  { id: 'third_strike', name: 'Third Strike', type: 'ability', description: 'Every third landed hit adds knockback.', effectKey: 'thirdHitKnockback', value: 1, rarity: 'rare', dustValue: 35, buyCost: 160 },
  { id: 'guard_focus', name: 'Guard Focus', type: 'ability', description: 'Perfect block window is more forgiving.', effectKey: 'perfectBlockWindowMult', value: 1.25, rarity: 'rare', dustValue: 35, buyCost: 160 },

  // Bankai cards
  { id: 'wide_beam', name: 'Wide Beam', type: 'bankai', description: 'Bankai beam is slightly wider.', effectKey: 'bankaiBeamWidthMult', value: 1.15, rarity: 'epic', dustValue: 70, buyCost: 300 },
  { id: 'fast_release', name: 'Fast Release', type: 'bankai', description: 'Bankai activation has less commitment.', effectKey: 'bankaiActivateFaster', value: 0.85, rarity: 'rare', dustValue: 35, buyCost: 160 },
  { id: 'burning_beam', name: 'Burning Beam', type: 'bankai', description: 'Beam leaves a short damage zone.', effectKey: 'bankaiLeavesZone', value: 1, rarity: 'epic', dustValue: 70, buyCost: 300 },
  { id: 'last_flash', name: 'Last Flash', type: 'bankai', description: 'Bankai hits harder when you are low HP.', effectKey: 'lowHpBankaiBoost', value: 1.15, rarity: 'epic', dustValue: 70, buyCost: 300 },
];

export function getCardById(cardId: string): CardDefinition | undefined {
  return ALL_CARDS.find(c => c.id === cardId);
}

export function normalizeCardCollection(input?: Partial<CardCollectionState> | null): CardCollectionState {
  const validIds = new Set(ALL_CARDS.map(c => c.id));
  const unlocked = Array.from(new Set((input?.unlocked ?? []).filter(id => validIds.has(id))));
  const active = Array.from(new Set((input?.active ?? []).filter(id => unlocked.includes(id)))).slice(0, MAX_ACTIVE_CARD_SLOTS);
  return {
    unlocked,
    active,
    currency: Math.max(0, Math.floor(input?.currency ?? 0)),
    soldDuplicates: Math.max(0, Math.floor(input?.soldDuplicates ?? 0)),
  };
}

export function drawRandomCards(count: number, exclude: string[] = []): CardDefinition[] {
  const excluded = new Set(exclude);
  const pool = ALL_CARDS.filter(c => !excluded.has(c.id));
  const source = pool.length >= count ? pool : ALL_CARDS;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function drawRewardCards(count: number): CardDefinition[] {
  // Duplicates are intentionally allowed against the player's collection.
  // This creates the collect-or-sell loop.
  return drawRandomCards(count);
}

export function activeCardSlotCountForRank(rankPoints = 0): number {
  // MVP: start with one slot. Future growth is data-driven.
  if (rankPoints >= 1800) return 3;
  if (rankPoints >= 1300) return 2;
  return DEFAULT_ACTIVE_CARD_SLOTS;
}

export function getMissingCardIds(collection: CardCollectionState): string[] {
  const owned = new Set(collection.unlocked);
  return ALL_CARDS.map(c => c.id).filter(id => !owned.has(id));
}

export function addCardReward(collection: CardCollectionState, cardId: string): { collection: CardCollectionState; duplicate: boolean; currencyGained: number } {
  const card = getCardById(cardId);
  const current = normalizeCardCollection(collection);
  if (!card) return { collection: current, duplicate: false, currencyGained: 0 };

  if (current.unlocked.includes(cardId)) {
    const next = normalizeCardCollection({
      ...current,
      currency: current.currency + card.dustValue,
      soldDuplicates: current.soldDuplicates + 1,
    });
    return { collection: next, duplicate: true, currencyGained: card.dustValue };
  }

  const next = normalizeCardCollection({
    ...current,
    unlocked: [...current.unlocked, cardId],
    active: current.active.length === 0 ? [cardId] : current.active,
  });
  return { collection: next, duplicate: false, currencyGained: 0 };
}

export function buyMissingCard(collection: CardCollectionState, cardId: string): { collection: CardCollectionState; ok: boolean; reason?: string } {
  const card = getCardById(cardId);
  const current = normalizeCardCollection(collection);
  if (!card) return { collection: current, ok: false, reason: 'Card not found' };
  if (current.unlocked.includes(cardId)) return { collection: current, ok: false, reason: 'Already owned' };
  if (current.currency < card.buyCost) return { collection: current, ok: false, reason: 'Not enough currency' };

  return {
    collection: normalizeCardCollection({
      ...current,
      unlocked: [...current.unlocked, cardId],
      currency: current.currency - card.buyCost,
    }),
    ok: true,
  };
}

export function setActiveCards(collection: CardCollectionState, active: string[], slotCount = DEFAULT_ACTIVE_CARD_SLOTS): CardCollectionState {
  const current = normalizeCardCollection(collection);
  const unique = Array.from(new Set(active))
    .filter(id => current.unlocked.includes(id))
    .slice(0, Math.max(1, Math.min(MAX_ACTIVE_CARD_SLOTS, slotCount)));
  return normalizeCardCollection({ ...current, active: unique });
}
