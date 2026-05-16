import fs from 'fs';
import path from 'path';
import { RANK } from '@ahf/shared';

export interface DbPlayer {
  id: string;
  username: string;
  rank_points: number;
  hair_style: number;
  outfit_color: string;
  aura_color: string;
  character_name: string;
  current_run_cards: string; // JSON array
  fights_in_current_run: number;
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
      current_run_cards: '[]',
      fights_in_current_run: 0,
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

  updateCosmetics(id: string, hairStyle: number, outfitColor: string, auraColor: string, characterName: string) {
    const p = data.players.find(p => p.id === id);
    if (!p) return;
    p.hair_style = hairStyle;
    p.outfit_color = outfitColor;
    p.aura_color = auraColor;
    p.character_name = characterName;
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

  getLeaderboard(limit = 10): DbPlayer[] {
    return [...data.players]
      .sort((a, b) => b.rank_points - a.rank_points)
      .slice(0, limit);
  },
};
