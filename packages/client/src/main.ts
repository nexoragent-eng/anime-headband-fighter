import { Application } from 'pixi.js';
import { LoginScene } from './scenes/LoginScene';
import { HubScene } from './scenes/HubScene';
import { FightScene } from './scenes/FightScene';
import { LockerRoomScene } from './scenes/LockerRoomScene';
import { CharacterSprite } from './game/CharacterSprite';
import type { PlayerProfile } from '@ahf/shared';

export { SERVER_URL, API_URL } from './config';

export type SceneName = 'login' | 'hub' | 'fight' | 'locker';

export interface GameContext {
  app: Application;
  player: PlayerProfile | null;
  switchScene: (name: SceneName, opts?: Record<string, unknown>) => void;
}

let currentScene: { destroy(): void } | null = null;

function showLoadingScreen(): Promise<void> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: #0a0a1a; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 24px;
      font-family: 'Impact', 'Arial Black', sans-serif;
    `;

    const title = document.createElement('div');
    title.textContent = '⚔ ANIME HEADBAND FIGHTER';
    title.style.cssText = `
      color: #ff6b35; font-size: clamp(18px, 4vw, 32px);
      letter-spacing: 4px; text-shadow: 0 0 20px #ff0000;
    `;

    const barWrap = document.createElement('div');
    barWrap.style.cssText = `
      width: min(380px, 80vw); height: 22px; border: 2px solid rgba(255,107,53,0.5);
      border-radius: 11px; overflow: hidden; background: rgba(255,255,255,0.05);
    `;

    const bar = document.createElement('div');
    bar.style.cssText = `
      height: 100%; width: 0%; border-radius: 11px;
      background: linear-gradient(90deg, #ff6b35, #ffd700);
      transition: width 0.2s ease; box-shadow: 0 0 12px rgba(255,107,53,0.6);
    `;

    const label = document.createElement('div');
    label.textContent = 'Loading assets...';
    label.style.cssText = `color: rgba(255,215,0,0.7); font-size: 13px; letter-spacing: 2px; font-family: Arial, sans-serif;`;

    barWrap.appendChild(bar);
    overlay.append(title, barWrap, label);
    document.body.appendChild(overlay);

    CharacterSprite.preload(p => {
      bar.style.width = `${Math.round(p * 100)}%`;
    }).then(() => {
      bar.style.width = '100%';
      label.textContent = 'Ready!';
      setTimeout(() => {
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 420);
      }, 200);
    }).catch(() => {
      overlay.remove();
      resolve();
    });
  });
}

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

  // Show loading screen while Spine assets download, then reveal the app
  await showLoadingScreen();

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

