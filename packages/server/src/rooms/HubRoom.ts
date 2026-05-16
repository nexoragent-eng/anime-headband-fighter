import { Room, Client, matchMaker } from 'colyseus';
import type { Presence } from 'colyseus';
import { HubRoomState, HubPlayer, LeaderEntry } from '../schemas/HubState';
import { playerRepo } from '../db/database';

export class HubRoom extends Room<HubRoomState> {
  maxClients = 100;
  private leaderboardInterval?: ReturnType<typeof setInterval>;
  // sessionId → actual DB playerId (not stored in schema to keep bandwidth small)
  private playerIds = new Map<string, string>();

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

    this.onMessage('challenge', (client: Client, data: { targetSessionId: string }) => {
      const challenger = this.state.players.get(client.sessionId);
      const target = this.state.players.get(data.targetSessionId);
      if (!challenger || !target || target.inFight || challenger.inFight) return;
      if (target.challengeFrom) return; // already being challenged
      target.challengeFrom = client.sessionId;
    });

    this.onMessage('challenge_respond', async (client: Client, data: { accept: boolean }) => {
      const responder = this.state.players.get(client.sessionId);
      if (!responder || !responder.challengeFrom) return;

      const challengerId = responder.challengeFrom;
      responder.challengeFrom = '';

      if (!data.accept) return;

      const challenger = this.state.players.get(challengerId);
      if (!challenger) return;

      challenger.inFight = true;
      responder.inFight = true;

      const challengerPlayerId = this.playerIds.get(challengerId) ?? challengerId;
      const responderPlayerId = this.playerIds.get(client.sessionId) ?? client.sessionId;
      const challengerClient = this.clients.find(c => c.sessionId === challengerId);

      try {
        const room = await matchMaker.createRoom('fight_room', {});
        const resA = await matchMaker.reserveSeatFor(room, {
          playerId: challengerPlayerId,
          username: challenger.username,
        });
        const resB = await matchMaker.reserveSeatFor(room, {
          playerId: responderPlayerId,
          username: responder.username,
        });
        challengerClient?.send('fight_found', { reservation: resA });
        client.send('fight_found', { reservation: resB });
      } catch (e) {
        console.error('[HubRoom] Failed to create fight room:', e);
        challenger.inFight = false;
        responder.inFight = false;
      }
    });

    this.onMessage('queue_fight', async (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.inFight) return;

      const playerId = this.playerIds.get(client.sessionId) ?? client.sessionId;
      const reservation = await matchMaker.joinOrCreate('fight_room', {
        playerId,
        username: player.username,
      });

      player.inFight = true;
      client.send('fight_found', { reservation });
    });
  }

  onJoin(client: Client, options: {
    playerId: string;
    username: string;
    cosmetics?: {
      bodyObject?: number; headObject?: number; hairObject?: number;
      handObject?: number; cloakObject?: number; eyeType?: string;
      makeupIndex?: number; supportIndex?: number; auraColor?: string;
    };
  }) {
    const dbPlayer = playerRepo.findById(options.playerId);
    const top3ids = playerRepo.getLeaderboard(3).map(p => p.id);
    const cos = options.cosmetics;

    const player = new HubPlayer();
    player.sessionId = client.sessionId;
    player.username = options.username;
    player.outfitColor = dbPlayer?.outfit_color ?? '#4a90d9';
    player.auraColor = cos?.auraColor ?? dbPlayer?.aura_color ?? '#7b2fff';
    player.rankPoints = dbPlayer?.rank_points ?? 1000;
    player.x = 200 + Math.random() * 400;
    player.y = 200 + Math.random() * 200;
    player.inFight = false;
    player.headbandRank = top3ids.indexOf(options.playerId) + 1;

    player.bodyObject   = cos?.bodyObject   ?? 1;
    player.headObject   = cos?.headObject   ?? 0;
    player.hairObject   = cos?.hairObject   ?? 1;
    player.handObject   = cos?.handObject   ?? 1;
    player.cloakObject  = cos?.cloakObject  ?? 0;
    player.eyeType      = (cos?.eyeType     ?? 'Basic') as 'Basic' | 'Anger' | 'laugh';
    player.makeupIndex  = cos?.makeupIndex  ?? 0;
    player.supportIndex = cos?.supportIndex ?? 0;

    this.state.players.set(client.sessionId, player);
    this.playerIds.set(client.sessionId, options.playerId);
  }

  onLeave(client: Client) {
    const sessionId = client.sessionId;
    this.playerIds.delete(sessionId);
    // Clear any pending challenges this player sent to others
    this.state.players.forEach(p => {
      if (p.challengeFrom === sessionId) p.challengeFrom = '';
    });
    this.state.players.delete(sessionId);
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
