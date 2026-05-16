import fs from 'fs';
import path from 'path';
import { RANK, normalizeCardCollection, type CardCollectionState } from '@ahf/shared';

export interface DbPlayer {
  id: string;
  username: string;
  rank_points: number;
  hair_style: number;
  outfit_color: string;
  aura_color: string;
  character_name: string;
  body_type?: string;
  weapon_type?: string;
  outfit_style?: string;
  hair_color?: string;
  skin_tone?: string;
  current_run_cards: string; // legacy JSON array
  fights_in_current_run: number;
  card_collection?: string; // JSON CardCollectionState
  created_at: number;
  updated_at: number;
}

interface DbSchema {
  players: DbPlayer[];
}

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'game.db.json');

let data: DbSchema = { players: [] };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function initDb() {
  if (fs.existsSync(DB_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      data = { players: [] };
    }
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  }, 500);
}

export const playerRepo = {
  create(id: string, username: string): DbPlayer {
    const now = Date.now();
    const player: DbPlayer = {
      id,
      username,
      rank_points: RANK.DEFAULT,
      hair_style: 0,
      outfit_color: '#4a90d9',
      aura_color: '#7b2fff',
      character_name: username,
      body_type: 'balanced',
      weapon_type: 'katana',
      outfit_style: 'gi',
      hair_color: '#111827',
      skin_tone: '#ffc99b',
      current_run_cards: '[]',
      fights_in_current_run: 0,
      card_collection: JSON.stringify(normalizeCardCollection(null)),
      created_at: now,
      updated_at: now,
    };
    data.players.push(player);
    scheduleSave();
    return player;
  },

  findById(id: string): DbPlayer | undefined {
    return data.players.find(p => p.id === id);
  },

  findByUsername(username: string): DbPlayer | undefined {
    return data.players.find(p => p.username === username);
  },

  updateRank(id: string, delta: number) {
    const p = data.players.find(p => p.id === id);
    if (!p) return;
    p.rank_points = Math.max(0, p.rank_points + delta);
    p.updated_at = Date.now();
    scheduleSave();
  },

  updateCosmetics(id: string, cosmetics: { hairStyle: number; outfitColor: string; auraColor: string; characterName: string; bodyType?: string; weaponType?: string; outfitStyle?: string; hairColor?: string; skinTone?: string }) {
    const p = data.players.find(p => p.id === id);
    if (!p) return;
    p.hair_style = cosmetics.hairStyle;
    p.outfit_color = cosmetics.outfitColor;
    p.aura_color = cosmetics.auraColor;
    p.character_name = cosmetics.characterName;
    p.body_type = cosmetics.bodyType ?? p.body_type ?? 'balanced';
    p.weapon_type = cosmetics.weaponType ?? p.weapon_type ?? 'katana';
    p.outfit_style = cosmetics.outfitStyle ?? p.outfit_style ?? 'gi';
    p.hair_color = cosmetics.hairColor ?? p.hair_color ?? '#111827';
    p.skin_tone = cosmetics.skinTone ?? p.skin_tone ?? '#ffc99b';
    p.updated_at = Date.now();
    scheduleSave();
  },

  updateRunState(id: string, cards: string[], fightsInRun: number) {
    const p = data.players.find(p => p.id === id);
    if (!p) return;
    p.current_run_cards = JSON.stringify(cards);
    p.fights_in_current_run = fightsInRun;
    p.updated_at = Date.now();
    scheduleSave();
  },

  updateCardCollection(id: string, collection: CardCollectionState) {
    const p = data.players.find(p => p.id === id);
    if (!p) return;
    p.card_collection = JSON.stringify(normalizeCardCollection(collection));
    p.updated_at = Date.now();
    scheduleSave();
  },

  getCardCollection(id: string): CardCollectionState {
    const p = data.players.find(p => p.id === id);
    if (!p) return normalizeCardCollection(null);
    try {
      return normalizeCardCollection(p.card_collection ? JSON.parse(p.card_collection) : null);
    } catch {
      return normalizeCardCollection(null);
    }
  },

  getLeaderboard(limit = 10): DbPlayer[] {
    return [...data.players]
      .sort((a, b) => b.rank_points - a.rank_points)
      .slice(0, limit);
  },
};
