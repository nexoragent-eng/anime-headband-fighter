import { Schema, MapSchema, type, ArraySchema } from '@colyseus/schema';
import { AnimState, FightPhase } from '@ahf/shared';

export class FighterState extends Schema {
  @type('string') playerId = '';
  @type('string') username = '';
  @type('string') outfitColor = '#4a90d9';
  @type('string') auraColor = '#7b2fff';
  @type('number') hp = 100;
  @type('number') energy = 0;
  @type('number') roundWins = 0;
  @type('string') animState: AnimState = AnimState.IDLE;
  @type('boolean') isSlowed = false;
  @type('number') attackMult = 1;
  @type('number') speedMult = 1;
  @type('number') defenseMult = 1;
  @type('number') bankaiChargeRateMult = 1;
  @type('boolean') counterOnPerfectBlock = false;
  @type('boolean') lowAttackSlows = false;
  @type('boolean') thirdHitKnockback = false;
  @type('number') bankaiBeamWidthMult = 1;
  @type('boolean') bankaiActivateFaster = false;
  @type('boolean') bankaiLeavesZone = false;
  @type('number') hitCount = 0;
}

export class CardOption extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') type = '';
  @type('string') description = '';
}

export class FightRoomState extends Schema {
  @type('string') phase: FightPhase = FightPhase.WAITING;
  @type('number') round = 1;
  @type('number') roundTimer = 20;
  @type('number') countdown = 3;
  @type(FighterState) playerA = new FighterState();
  @type(FighterState) playerB = new FighterState();
  @type([CardOption]) cardOptionsA = new ArraySchema<CardOption>();
  @type([CardOption]) cardOptionsB = new ArraySchema<CardOption>();
  @type('string') winnerId = '';
  @type('string') matchWinnerId = '';
}
