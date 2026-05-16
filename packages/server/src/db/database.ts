import Database from 'better-sqlite3';
import path from 'path';
import { DEFAULT_STATS, RANK } from '@ahf/shared';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../game.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      rank_points INTEGER NOT NULL DEFAULT ${RANK.DEFAULT},
      hair_style INTEGER NOT NULL DEFAULT 0,
      outfit_color TEXT NOT NULL DEFAULT '#4a90d9',
      aura_color TEXT NOT NULL DEFAULT '#7b2fff',
      character_name TEXT NOT NULL DEFAULT '',
      current_run_cards TEXT NOT NULL DEFAULT '[]',
      fights_in_current_run INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fights (
      id TEXT PRIMARY KEY,
      player_a_id TEXT NOT NULL,
      player_b_id TEXT,
      winner_id TEXT,
      rounds_a INTEGER NOT NULL DEFAULT 0,
      rounds_b INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
  `);
}

export interface DbPlayer {
  id: string;
  username: string;
  rank_points: number;
  hair_style: number;
  outfit_color: string;
  aura_color: string;
  character_name: string;
  current_run_cards: string;
  fights_in_current_run: number;
  created_at: number;
  updated_at: number;
}

export const playerRepo = {
  create(id: string, username: string): DbPlayer {
    const now = Date.now();
    getDb().prepare(`
      INSERT INTO players (id, username, rank_points, hair_style, outfit_color, aura_color, character_name, current_run_cards, fights_in_current_run, created_at, updated_at)
      VALUES (?, ?, ?, 0, '#4a90d9', '#7b2fff', ?, '[]', 0, ?, ?)
    `).run(id, username, username, now, now);
    return playerRepo.findById(id)!;
  },

  findById(id: string): DbPlayer | undefined {
    return getDb().prepare('SELECT * FROM players WHERE id = ?').get(id) as DbPlayer | undefined;
  },

  findByUsername(username: string): DbPlayer | undefined {
    return getDb().prepare('SELECT * FROM players WHERE username = ?').get(username) as DbPlayer | undefined;
  },

  updateRank(id: string, delta: number) {
    const now = Date.now();
    getDb().prepare('UPDATE players SET rank_points = rank_points + ?, updated_at = ? WHERE id = ?').run(delta, now, id);
  },

  updateCosmetics(id: string, hairStyle: number, outfitColor: string, auraColor: string, characterName: string) {
    const now = Date.now();
    getDb().prepare(`
      UPDATE players SET hair_style = ?, outfit_color = ?, aura_color = ?, character_name = ?, updated_at = ? WHERE id = ?
    `).run(hairStyle, outfitColor, auraColor, characterName, now, id);
  },

  updateRunState(id: string, cards: string[], fightsInRun: number) {
    const now = Date.now();
    getDb().prepare('UPDATE players SET current_run_cards = ?, fights_in_current_run = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(cards), fightsInRun, now, id);
  },

  getLeaderboard(limit = 10): DbPlayer[] {
    return getDb().prepare('SELECT * FROM players ORDER BY rank_points DESC LIMIT ?').all(limit) as DbPlayer[];
  },
};
