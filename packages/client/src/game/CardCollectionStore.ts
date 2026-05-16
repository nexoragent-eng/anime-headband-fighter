import {
  addCardReward,
  buyMissingCard,
  normalizeCardCollection,
  setActiveCards,
  activeCardSlotCountForRank,
  type CardCollectionState,
} from '@ahf/shared';
import type { PlayerProfile } from '@ahf/shared';

function storageKey(playerId: string) {
  return `ahf:cards:${playerId}`;
}

function readLocal(playerId: string): CardCollectionState {
  try {
    const raw = localStorage.getItem(storageKey(playerId));
    return normalizeCardCollection(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeCardCollection(null);
  }
}

function writeLocal(playerId: string, collection: CardCollectionState): CardCollectionState {
  const normalized = normalizeCardCollection(collection);
  localStorage.setItem(storageKey(playerId), JSON.stringify(normalized));
  return normalized;
}

export function getPlayerCardCollection(player: PlayerProfile | null): CardCollectionState {
  if (!player) return normalizeCardCollection(null);
  const fromProfile = normalizeCardCollection(player.cardCollection ?? null);
  const local = readLocal(player.id);
  const merged = normalizeCardCollection({
    unlocked: Array.from(new Set([...fromProfile.unlocked, ...local.unlocked])),
    active: local.active.length ? local.active : fromProfile.active,
    currency: Math.max(fromProfile.currency, local.currency),
    soldDuplicates: Math.max(fromProfile.soldDuplicates, local.soldDuplicates),
  });
  player.cardCollection = merged;
  writeLocal(player.id, merged);
  return merged;
}

export async function savePlayerCardCollection(player: PlayerProfile | null, collection: CardCollectionState): Promise<CardCollectionState> {
  const normalized = normalizeCardCollection(collection);
  if (!player) return normalized;
  player.cardCollection = normalized;
  writeLocal(player.id, normalized);
  try {
    await fetch(`/player/${player.id}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    });
  } catch {
    // local save is enough for offline/dev builds
  }
  return normalized;
}

export async function claimCardRewardForPlayer(player: PlayerProfile | null, cardId: string) {
  const current = getPlayerCardCollection(player);
  const result = addCardReward(current, cardId);
  await savePlayerCardCollection(player, result.collection);
  return result;
}

export async function buyCardForPlayer(player: PlayerProfile | null, cardId: string) {
  const current = getPlayerCardCollection(player);
  const result = buyMissingCard(current, cardId);
  if (result.ok) await savePlayerCardCollection(player, result.collection);
  return result;
}

export async function setActiveCardsForPlayer(player: PlayerProfile | null, active: string[]) {
  const current = getPlayerCardCollection(player);
  const slots = activeCardSlotCountForRank(player?.rankPoints ?? 0);
  const next = setActiveCards(current, active, slots);
  await savePlayerCardCollection(player, next);
  return next;
}
