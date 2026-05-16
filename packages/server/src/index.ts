import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { HubRoom } from './rooms/HubRoom';
import { FightRoom } from './rooms/FightRoom';
import { getDb, playerRepo } from './db/database';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT ?? '2567', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth endpoints (guest login)
app.post('/auth/guest', (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username || username.trim().length < 2 || username.trim().length > 20) {
    return res.status(400).json({ error: 'Username must be 2-20 characters' });
  }
  const trimmed = username.trim();
  let player = playerRepo.findByUsername(trimmed);
  if (!player) {
    player = playerRepo.create(uuidv4(), trimmed);
  }
  res.json({
    id: player.id,
    username: player.username,
    rankPoints: player.rank_points,
    cosmetics: {
      hairStyle: player.hair_style,
      outfitColor: player.outfit_color,
      auraColor: player.aura_color,
      characterName: player.character_name,
    },
    currentRunCards: JSON.parse(player.current_run_cards),
    fightsInCurrentRun: player.fights_in_current_run,
  });
});

// Cosmetics save
app.post('/player/:id/cosmetics', (req, res) => {
  const { id } = req.params;
  const { hairStyle, outfitColor, auraColor, characterName } = req.body;
  playerRepo.updateCosmetics(id, hairStyle ?? 0, outfitColor ?? '#4a90d9', auraColor ?? '#7b2fff', characterName ?? '');
  res.json({ ok: true });
});

// Leaderboard
app.get('/leaderboard', (_req, res) => {
  const top = playerRepo.getLeaderboard(10);
  res.json(top.map((p, i) => ({
    rank: i + 1,
    username: p.username,
    rankPoints: p.rank_points,
    headbandTier: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null,
  })));
});

// Colyseus
const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define('hub_room', HubRoom);
gameServer.define('fight_room', FightRoom).enableRealtimeListing();

// Colyseus monitor (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/colyseus', monitor());
}

gameServer.listen(PORT).then(() => {
  console.log(`[AHF] Server running on ws://localhost:${PORT}`);
  getDb(); // init DB
});
