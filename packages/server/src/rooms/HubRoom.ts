import { Room, Client, matchMaker } from 'colyseus';
import { HubRoomState, HubPlayer, ActiveFightInfo, LeaderEntry } from '../schemas/HubState';
import { playerRepo } from '../db/database';
import { HEADBAND_TIERS, HEADBAND_RANKS } from '@ahf/shared';

export class HubRoom extends Room<HubRoomState> {
  maxClients = 100;
  private leaderboardInterval?: ReturnType<typeof setInterval>;

  onCreate() {
    this.setState(new HubRoomState());
    this.refreshLeaderboard();
    this.leaderboardInterval = setInterval(() => this.refreshLeaderboard(), 10_000);

    this.onMessage('move', (client, data: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inFight) return;
      player.x = Math.max(0, Math.min(800, data.x));
      player.y = Math.max(0, Math.min(600, data.y));
    });

    this.onMessage('queue_fight', async (client) => {
      const session = this.state.players.get(client.sessionId);
      if (!session || session.inFight) return;

      const room = await matchMaker.joinOrCreate('fight_room', {
        playerId: session.playerId ?? client.sessionId,
        username: session.username,
      });

      session.inFight = true;
      client.send('fight_found', { roomId: room.roomId });
    });
  }

  async onJoin(client: Client, options: { playerId: string; username: string }) {
    const dbPlayer = playerRepo.findById(options.playerId);

    const player = new HubPlayer();
    player.sessionId = client.sessionId;
    player.username = options.username;
    player.outfitColor = dbPlayer?.outfit_color ?? '#4a90d9';
    player.auraColor = dbPlayer?.aura_color ?? '#7b2fff';
    player.rankPoints = dbPlayer?.rank_points ?? 1000;
    player.x = 200 + Math.random() * 400;
    player.y = 200 + Math.random() * 200;
    player.inFight = false;

    const leaderboard = playerRepo.getLeaderboard(3);
    const rankIdx = leaderboard.findIndex(p => p.id === options.playerId);
    player.headbandRank = rankIdx >= 0 ? rankIdx + 1 : 0;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private refreshLeaderboard() {
    const top = playerRepo.getLeaderboard(10);
    this.state.leaderboard = top.map((p, i) => {
      const entry = new LeaderEntry();
      entry.username = p.username;
      entry.rankPoints = p.rank_points;
      entry.position = i + 1;
      return entry;
    }) as any;

    // update headband ranks
    const top3ids = top.slice(0, 3).map(p => p.id);
    this.state.players.forEach((player) => {
      const idx = top3ids.indexOf((player as any).playerId ?? '');
      player.headbandRank = idx >= 0 ? idx + 1 : 0;
    });
  }

  onDispose() {
    if (this.leaderboardInterval) clearInterval(this.leaderboardInterval);
  }
}
