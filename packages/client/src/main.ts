import { Application } from 'pixi.js';
import { LoginScene } from './scenes/LoginScene';
import { HubScene } from './scenes/HubScene';
import { FightScene } from './scenes/FightScene';
import { LockerRoomScene } from './scenes/LockerRoomScene';
import { CharacterSprite } from './game/CharacterSprite';
import type { PlayerProfile } from '@ahf/shared';

declare const __SERVER_URL__: string;
export const SERVER_URL = __SERVER_URL__;

export type SceneName = 'login' | 'hub' | 'fight' | 'locker';

export interface GameContext {
  app: Application;
  player: PlayerProfile | null;
  switchScene: (name: SceneName, opts?: Record<string, unknown>) => void;
}

let currentScene: { destroy(): void } | null = null;

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x0a0a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  // Start loading Spine assets immediately (cached for all scenes)
  CharacterSprite.preload().catch(console.error);

  const ctx: GameContext = {
    app,
    player: null,
    switchScene: (name, opts) => {
      currentScene?.destroy();
      currentScene = null;

      switch (name) {
        case 'login':
          currentScene = new LoginScene(ctx);
          break;
        case 'hub':
          currentScene = new HubScene(ctx);
          break;
        case 'fight':
          currentScene = new FightScene(ctx, opts as { roomId?: string; local?: boolean });
          break;
        case 'locker':
          currentScene = new LockerRoomScene(ctx);
          break;
      }
    },
  };

  if (location.hostname === 'localhost') (window as unknown as Record<string, unknown>).__ahf = ctx;
  ctx.switchScene('login');
}

main().catch(console.error);
