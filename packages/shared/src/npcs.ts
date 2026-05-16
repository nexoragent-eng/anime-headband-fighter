import { MoveType } from './types';

// ── NPC profile ───────────────────────────────────────────────────────────────

export type FightStyle = 'aggressive' | 'balanced' | 'defensive' | 'trickster';

export interface NPCProfile {
  id: string;
  name: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  rankPoints: number;
  outfitColor: number;
  auraColor: number;
  style: FightStyle;
  // Stat multipliers (1.0 = baseline)
  attackMult: number;
  defenseMult: number;
  bankaiChargeRate: number;
  // AI thresholds (0–1 fractions of max)
  blockChance: number;      // probability to block on any given tick
  bankaiMinEnergy: number;  // use bankai when energy >= this fraction of 100
}

// ── The 10 permanent inhabitants ─────────────────────────────────────────────

export const NPC_ROSTER: NPCProfile[] = [
  // ── Bronze tier ──────────────────────────────────────────────────────────
  {
    id: 'npc_ryo',
    name: 'Ryo',
    title: 'The Scrapper',
    tier: 'bronze',
    rankPoints: 800,
    outfitColor: 0x5566aa,
    auraColor: 0x8899ff,
    style: 'aggressive',
    attackMult: 0.85,
    defenseMult: 0.9,
    bankaiChargeRate: 0.9,
    blockChance: 0.08,
    bankaiMinEnergy: 1.0, // never uses bankai effectively
  },
  {
    id: 'npc_hana',
    name: 'Hana',
    title: 'The Stubborn',
    tier: 'bronze',
    rankPoints: 900,
    outfitColor: 0xcc5577,
    auraColor: 0xff99bb,
    style: 'defensive',
    attackMult: 0.8,
    defenseMult: 1.1,
    bankaiChargeRate: 0.85,
    blockChance: 0.25,
    bankaiMinEnergy: 1.0,
  },
  {
    id: 'npc_tomo',
    name: 'Tomo',
    title: 'Wild Card',
    tier: 'bronze',
    rankPoints: 950,
    outfitColor: 0x44aa66,
    auraColor: 0x66ffaa,
    style: 'trickster',
    attackMult: 0.9,
    defenseMult: 0.85,
    bankaiChargeRate: 1.0,
    blockChance: 0.12,
    bankaiMinEnergy: 0.9,
  },

  // ── Silver tier ──────────────────────────────────────────────────────────
  {
    id: 'npc_kira',
    name: 'Kira',
    title: 'Storm Fist',
    tier: 'silver',
    rankPoints: 1150,
    outfitColor: 0x7755cc,
    auraColor: 0xaa77ff,
    style: 'aggressive',
    attackMult: 1.0,
    defenseMult: 0.95,
    bankaiChargeRate: 1.1,
    blockChance: 0.10,
    bankaiMinEnergy: 0.80,
  },
  {
    id: 'npc_zenji',
    name: 'Zenji',
    title: 'The Wall',
    tier: 'silver',
    rankPoints: 1250,
    outfitColor: 0x336688,
    auraColor: 0x55aacc,
    style: 'defensive',
    attackMult: 0.9,
    defenseMult: 1.2,
    bankaiChargeRate: 1.0,
    blockChance: 0.35,
    bankaiMinEnergy: 0.75,
  },
  {
    id: 'npc_mako',
    name: 'Mako',
    title: 'Blade Dancer',
    tier: 'silver',
    rankPoints: 1350,
    outfitColor: 0xbb6622,
    auraColor: 0xff9944,
    style: 'balanced',
    attackMult: 1.05,
    defenseMult: 1.0,
    bankaiChargeRate: 1.1,
    blockChance: 0.18,
    bankaiMinEnergy: 0.70,
  },

  // ── Gold tier ────────────────────────────────────────────────────────────
  {
    id: 'npc_rei',
    name: 'Rei',
    title: 'Silent Edge',
    tier: 'gold',
    rankPoints: 1600,
    outfitColor: 0x222244,
    auraColor: 0x4466ff,
    style: 'balanced',
    attackMult: 1.1,
    defenseMult: 1.1,
    bankaiChargeRate: 1.2,
    blockChance: 0.22,
    bankaiMinEnergy: 0.65,
  },
  {
    id: 'npc_akuma',
    name: 'Akuma',
    title: 'Red Wrath',
    tier: 'gold',
    rankPoints: 1750,
    outfitColor: 0x881111,
    auraColor: 0xff2200,
    style: 'aggressive',
    attackMult: 1.2,
    defenseMult: 0.9,
    bankaiChargeRate: 1.3,
    blockChance: 0.08,
    bankaiMinEnergy: 0.60,
  },
  {
    id: 'npc_shiro',
    name: 'Shiro',
    title: 'Phantom Step',
    tier: 'gold',
    rankPoints: 1900,
    outfitColor: 0xdddddd,
    auraColor: 0xffffff,
    style: 'trickster',
    attackMult: 1.15,
    defenseMult: 1.05,
    bankaiChargeRate: 1.25,
    blockChance: 0.28,
    bankaiMinEnergy: 0.55,
  },
  {
    id: 'npc_kai',
    name: 'Kai',
    title: 'The Apex',
    tier: 'gold',
    rankPoints: 2000,
    outfitColor: 0x111122,
    auraColor: 0xffd700,
    style: 'balanced',
    attackMult: 1.25,
    defenseMult: 1.2,
    bankaiChargeRate: 1.4,
    blockChance: 0.25,
    bankaiMinEnergy: 0.50,
  },
];

// ── NPC AI tick ───────────────────────────────────────────────────────────────
// Returns which move the NPC should make this frame.
// Call once per combat tick; the result replaces the "pending move".

export function npcAITick(
  npc: NPCProfile,
  npcHp: number,
  npcEnergy: number,
  opponentHp: number,
  _opponentEnergy: number,
  rng: () => number,
): MoveType {
  // Use bankai when energy is sufficient
  if (npcEnergy >= npc.bankaiMinEnergy * 100) {
    return MoveType.BANKAI;
  }

  // Block more when low on hp
  const hpRatio = npcHp / 100;
  const effectiveBlockChance = npc.blockChance + (hpRatio < 0.3 ? 0.2 : 0);
  if (rng() < effectiveBlockChance) {
    return MoveType.BLOCK;
  }

  // Pick an attack based on style (only light and heavy exist)
  const r = rng();
  switch (npc.style) {
    case 'aggressive':
      if (r < 0.60) return MoveType.ATTACK;
      if (r < 0.85) return MoveType.HEAVY_ATTACK;
      return MoveType.NONE;

    case 'defensive':
      if (r < 0.50) return MoveType.ATTACK;
      if (r < 0.65) return MoveType.HEAVY_ATTACK;
      return MoveType.NONE;

    case 'balanced':
      if (r < 0.55) return MoveType.ATTACK;
      if (r < 0.75) return MoveType.HEAVY_ATTACK;
      return MoveType.NONE;

    case 'trickster': {
      // alternates more unpredictably
      if (r < 0.45) return MoveType.ATTACK;
      if (r < 0.70) return MoveType.HEAVY_ATTACK;
      return MoveType.NONE;
    }
  }
}

// Seeded RNG for deterministic NPC behavior in replays / server-side
export function npcRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
