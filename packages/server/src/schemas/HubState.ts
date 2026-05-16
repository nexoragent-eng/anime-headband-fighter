import { Schema, MapSchema, type } from '@colyseus/schema';

export class HubPlayer extends Schema {
  @type('string') sessionId = '';
  @type('string') username = '';
  @type('string') outfitColor = '#4a90d9';
  @type('string') auraColor = '#7b2fff';
  @type('number') rankPoints = 1000;
  @type('number') x = 400;
  @type('number') y = 300;
  @type('boolean') inFight = false;
  @type('number') headbandRank = 0; // 1=gold, 2=silver, 3=bronze, 0=none
}

export class ActiveFightInfo extends Schema {
  @type('string') roomId = '';
  @type('string') playerAName = '';
  @type('string') playerBName = '';
  @type('number') playerAHp = 100;
  @type('number') playerBHp = 100;
  @type('number') round = 1;
}

export class LeaderEntry extends Schema {
  @type('string') username = '';
  @type('number') rankPoints = 0;
  @type('number') position = 0;
}

export class HubRoomState extends Schema {
  @type({ map: HubPlayer }) players = new MapSchema<HubPlayer>();
  @type(ActiveFightInfo) featuredFight = new ActiveFightInfo();
  @type([LeaderEntry]) leaderboard: LeaderEntry[] = [];
}
