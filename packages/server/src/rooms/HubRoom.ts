import { Room, Client, matchMaker } from 'colyseus';
import type { Presence } from 'colyseus';
import { HubRoomState, HubPlayer, LeaderEntry } from '../schemas/HubState';
import { playerRepo } from '../db/database';

export class HubRoom extends Room<HubRoomState> {
  maxClients = 100;
  private leaderboardInterval?: ReturnType<typeof setInterval>;

  constructor(presence?: Presence) {
    super(presence);
  }

  onCreate() {
    this.setState(new HubRoomState());
    this.refreshLeaderboard();
    this.leaderboardInterval = setInterval(() => this.refreshLeaderboard(), 10_000);

    this.onMessage('move', (client: Client, data: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inFight) return;
      player.x = Math.max(0, Math.min(800, data.x));
      player.y = Math.max(0, Math.min(600, data.y));
    });

    this.onMessage('queue_fight', async (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inFight) return;

      const reservation = await matchMaker.joinOrCreate('fight_room', {
        playerId: client.sessionId,
        username: player.username,
      });

      player.inFight = true;
      client.send('fight_found', { roomId: reservation.room.roomId });
    });
  }

  onJoin(client: Client, options: { playerId: string; username: string }) {
    const dbPlayer = playerRepo.findById(options.playerId);
    const top3ids = playerRepo.getLeaderboard(3).map(p => p.id);

    const player = new HubPlayer();
    player.sessionId = client.sessionId;
    player.username = options.username;
    player.outfitColor = dbPlayer?.outfit_color ?? '#4a90d9';
    player.auraColor = dbPlayer?.aura_color ?? '#7b2fff';
    player.rankPoints = dbPlayer?.rank_points ?? 1000;
    player.x = 200 + Math.random() * 400;
    player.y = 200 + Math.random() * 200;
    player.inFight = false;
    player.headbandRank = top3ids.indexOf(options.playerId) + 1; // 0 if not in top 3

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private refreshLeaderboard() {
    const top = playerRepo.getLeaderboard(10);
    const entries = top.map((p, i) => {
      const entry = new LeaderEntry();
      entry.username = p.username;
      entry.rankPoints = p.rank_points;
      entry.position = i + 1;
      return entry;
    });
    this.state.leaderboard.length = 0;
    entries.forEach(e => this.state.leaderboard.push(e));
  }

  onDispose() {
    if (this.leaderboardInterval) clearInterval(this.leaderboardInterval);
  }
}
