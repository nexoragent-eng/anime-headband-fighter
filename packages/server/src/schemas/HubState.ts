import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class HubPlayer extends Schema {
  @type('string') sessionId = '';
  @type('string') username = '';
  @type('string') outfitColor = '#4a90d9';
  @type('string') auraColor = '#7b2fff';
  @type('number') rankPoints = 1000;
  @type('number') x = 400;
  @type('number') y = 300;
  @type('boolean') inFight = false;
  @type('number') headbandRank = 0;
}

export class LeaderEntry extends Schema {
  @type('string') username = '';
  @type('number') rankPoints = 0;
  @type('number') position = 0;
}

export class HubRoomState extends Schema {
  @type({ map: HubPlayer }) players = new MapSchema<HubPlayer>();
  @type([LeaderEntry]) leaderboard = new ArraySchema<LeaderEntry>();
}
