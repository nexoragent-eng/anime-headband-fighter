export interface CardDefinition {
  id: string;
  name: string;
  type: 'stat' | 'ability' | 'bankai';
  description: string;
  effectKey: string;
  value: number;
  rarity: 'common' | 'rare' | 'epic';
}

export const ALL_CARDS: CardDefinition[] = [
  // Stat cards
  { id: 'quick_feet', name: 'Quick Feet', type: 'stat', description: '+5% speed', effectKey: 'speedMult', value: 1.05, rarity: 'common' },
  { id: 'heavy_hit', name: 'Heavy Hit', type: 'stat', description: '+10% attack, -5% speed', effectKey: 'heavyHit', value: 1.1, rarity: 'common' },
  { id: 'iron_guard', name: 'Iron Guard', type: 'stat', description: '+10% defense', effectKey: 'defenseMult', value: 1.1, rarity: 'common' },
  { id: 'berserker', name: 'Berserker', type: 'stat', description: '+15% attack', effectKey: 'attackMult', value: 1.15, rarity: 'rare' },
  { id: 'flash_step', name: 'Flash Step', type: 'stat', description: '+15% speed', effectKey: 'speedMult', value: 1.15, rarity: 'rare' },
  { id: 'spirit_charge', name: 'Spirit Charge', type: 'stat', description: '+20% Bankai charge rate', effectKey: 'bankaiChargeRateMult', value: 1.2, rarity: 'common' },

  // Ability cards
  { id: 'counter_spark', name: 'Counter Spark', type: 'ability', description: 'Perfect block triggers counter hit', effectKey: 'counterOnPerfectBlock', value: 1, rarity: 'rare' },
  { id: 'low_sweep', name: 'Low Sweep', type: 'ability', description: 'Low attacks briefly slow opponent', effectKey: 'lowAttackSlows', value: 1, rarity: 'common' },
  { id: 'third_strike', name: 'Third Strike', type: 'ability', description: 'Every third hit adds knockback', effectKey: 'thirdHitKnockback', value: 1, rarity: 'rare' },

  // Bankai cards
  { id: 'wide_beam', name: 'Wide Beam', type: 'bankai', description: 'Bankai beam hitbox +20%', effectKey: 'bankaiBeamWidthMult', value: 1.2, rarity: 'epic' },
  { id: 'fast_release', name: 'Fast Release', type: 'bankai', description: 'Bankai activates 30% faster', effectKey: 'bankaiActivateFaster', value: 0.7, rarity: 'rare' },
  { id: 'burning_beam', name: 'Burning Beam', type: 'bankai', description: 'Beam leaves short damage zone', effectKey: 'bankaiLeavesZone', value: 1, rarity: 'epic' },
];

export function drawRandomCards(count: number, exclude: string[] = []): CardDefinition[] {
  const pool = ALL_CARDS.filter(c => !exclude.includes(c.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
