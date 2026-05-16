# Anime Headband Fighter — Build Plan

## Status: Phase 1 COMPLETE ✅ | Phase 2 NEXT

---

## Phase 1 — Combat Prototype ✅
**Goal:** Prove swipe combat is fun. Local 1v1 only.

- [x] PixiJS 8 renderer setup (Vite + TypeScript)
- [x] Split-screen swipe input (left half = P1, right half = P2)
- [x] Keyboard fallback (WASD / Arrow keys)
- [x] Fighter sprites (shape-based, animated)
- [x] HP system (100 HP each)
- [x] Energy / Bankai meter
- [x] Move set: attack, high_attack, low_attack, block
- [x] Bankai beam effect (full-screen activation)
- [x] Round system (best of 3, 20s per round)
- [x] HUD (HP bars, energy bars, timer, round wins)
- [x] Card picker after match (3 random cards, pick 1)
- [x] Login screen (guest username)
- [x] Hub screen (placeholder)
- [x] Locker Room (cosmetic editor)
- [x] Shared types package
- [x] Server scaffold (Colyseus, rooms, DB, cards)
- [x] Docker Compose for Coolify
- [x] Dockerfiles (server + client/nginx)

---

## Phase 2 — Online Match 🔜
**Goal:** Two players fight reliably over the network.

- [ ] Connect client to Colyseus FightRoom
- [ ] Server-authoritative damage (client sends inputs, server decides)
- [ ] Matchmaking queue via HubRoom
- [ ] Real-time HP/energy sync to spectators
- [ ] Latency handling (input timestamps, server tick reconciliation)
- [ ] Disconnect handling (forfeit on leave)
- [ ] Auth: POST /auth/guest → playerId stored in localStorage
- [ ] FightScene: online mode (use Colyseus state instead of local state)

---

## Phase 3 — Hub (Social)
**Goal:** Hub feels social and alive.

- [ ] HubRoom: real player avatars (positions synced via Colyseus)
- [ ] Pinch-to-zoom + pan camera (pixi-viewport)
- [ ] Central ring shows featured active fight (live HP bars)
- [ ] Online player list
- [ ] "Challenge" button on player avatar
- [ ] Spectate button for featured fight

---

## Phase 4 — Ranking + Headbands
**Goal:** Status creates motivation.

- [ ] Elo/ladder rank points (Win +25, Loss -15)
- [ ] Persistent leaderboard (SQLite)
- [ ] Top 3 headbands visible in hub and fight screen
- [ ] Gold/silver/bronze headband sprites on fighter head
- [ ] Rank display on player profile

---

## Phase 5 — Roguelike Cards
**Goal:** RNG makes repeat fights more fun.

- [ ] 5-fight run system (cards reset after run)
- [ ] Server deals 3 random cards after each fight
- [ ] Cards persist through run (stored per player in DB)
- [ ] Card effects applied server-side (not client)
- [ ] Run progress UI

---

## Tech Stack
- **Client:** PixiJS 8 + Vite + TypeScript
- **Server:** Node.js + Colyseus 0.15 + Express
- **DB:** SQLite (better-sqlite3) — upgrade to PostgreSQL for scale
- **Monorepo:** pnpm workspaces
- **Deploy:** Docker Compose → Coolify

## Key Combat Rules
```
Base HP: 100
Round time: 20s
Win condition: KO or highest HP after timer
Best of 3 rounds

Damage:
  attack:       10
  high_attack:  12 (bypasses block)
  low_attack:   8
  bankai beam:  40 (costs full energy meter)
  counter hit:  15

Energy gain:
  on hit:       +12
  on block:     +6
  on take hit:  +8
  passive:      +0.3/tick

Controls (keyboard):
  P1: D=Attack  W=High  S=Low  A=Block  Q=Bankai
  P2: →=Attack  ↑=High  ↓=Low  ←=Block  Num0=Bankai

Controls (touch):
  P1: swipe left half of screen
  P2: swipe right half of screen
  Right=Attack  Up=High  Down=Low  Left=Block
  Hold special button = Bankai (when energy full)
```

## Running Locally
```bash
cd anime-headband-fighter
pnpm install
pnpm dev        # starts both client (port 5173) and server (port 2567)
```

## Deploy to Coolify
1. Push repo to GitHub
2. In Coolify: New Service → Docker Compose
3. Point to `anime-headband-fighter/docker-compose.yml`
4. Set env: `VITE_SERVER_URL=wss://your-server-domain`
5. Deploy
