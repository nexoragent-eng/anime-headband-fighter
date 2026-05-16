import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { HubRoom } from './rooms/HubRoom';
import { FightRoom } from './rooms/FightRoom';
import { initDb, playerRepo } from './db/database';
import { v4 as uuidv4 } from 'uuid';
import { normalizeCardCollection } from '@ahf/shared';

const PORT = parseInt(process.env.PORT ?? '2567', 10);

const app = express();
const allowedOrigins = [
  'https://anime.futuredays.nl',
  'http://localhost:5173',
  'http://localhost:4173',
];

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Allow server-to-server tools/curl without browser Origin
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

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
      bodyType: player.body_type ?? 'balanced',
      weaponType: player.weapon_type ?? 'katana',
      outfitStyle: player.outfit_style ?? 'gi',
      hairColor: player.hair_color ?? '#111827',
      skinTone: player.skin_tone ?? '#ffc99b',
    },
    currentRunCards: JSON.parse(player.current_run_cards),
    fightsInCurrentRun: player.fights_in_current_run,
    cardCollection: playerRepo.getCardCollection(player.id),
  });
});

// Cosmetics save
app.post('/player/:id/cosmetics', (req, res) => {
  const { id } = req.params;
  const { hairStyle, outfitColor, auraColor, characterName, bodyType, weaponType, outfitStyle, hairColor, skinTone } = req.body;
  playerRepo.updateCosmetics(id, {
    hairStyle: hairStyle ?? 0,
    outfitColor: outfitColor ?? '#4a90d9',
    auraColor: auraColor ?? '#7b2fff',
    characterName: characterName ?? '',
    bodyType,
    weaponType,
    outfitStyle,
    hairColor,
    skinTone,
  });
  res.json({ ok: true });
});


// Card collection save
app.post('/player/:id/cards', (req, res) => {
  const { id } = req.params;
  const collection = normalizeCardCollection(req.body);
  playerRepo.updateCardCollection(id, collection);
  res.json({ ok: true, cardCollection: collection });
});

app.get('/player/:id/cards', (req, res) => {
  const { id } = req.params;
  res.json(playerRepo.getCardCollection(id));
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

initDb();
gameServer.listen(PORT).then(() => {
  console.log(`[AHF] Server running on ws://localhost:${PORT}`);
});
