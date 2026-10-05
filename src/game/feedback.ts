/** Wires sim events to visual effects and sounds for one game. */
import { audio } from '../audio/audio';
import { Effects } from '../render/effects';
import type { Game } from './game';

const HEAR = 950; // px: beyond this, sounds from others are silent

export function attachFeedback(game: Game): Effects {
  const fx = new Effects(game.renderer);
  game.onEvents((events, w) => {
    fx.viewId = game.viewId;
    fx.onEvents(events, w);
    const view = w.players[game.viewId];
    const near = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - view.x, y - view.y) / HEAR);
    for (const e of events) {
      switch (e.t) {
        case 'shot':
          if (e.owner === game.viewId) audio.play(e.capital ? 'shotCap' : 'shot', 1);
          else audio.play('shot', near(e.x, e.y) * 0.5);
          break;
        case 'hit':
          if (e.target === 'player' && e.id === game.viewId) audio.play('hurt', 1);
          else if (e.by === game.viewId) audio.play('hit', e.target === 'player' ? 1 : 0.6);
          break;
        case 'mobDeath':
          audio.play('mobDeath', e.by === game.viewId ? 0.9 : near(e.x, e.y) * 0.5);
          break;
        case 'playerDeath':
          audio.play('playerDeath', Math.max(0.35, near(e.x, e.y)));
          break;
        case 'pickup':
          if (e.id === game.viewId) audio.play('pickup');
          break;
        case 'switch':
          if (e.id === game.viewId) audio.play('switch');
          break;
        case 'bold':
        case 'upgrade':
          if (e.id === game.viewId) audio.play('upgrade');
          break;
        case 'capital':
          if (e.on) {
            const p = w.players[e.id];
            audio.play('capital', e.id === game.viewId ? 1 : near(p.x, p.y) * 0.7);
          }
          break;
        case 'shieldBlock':
          if (e.id === game.viewId) audio.play('shield', 0.8);
          break;
      }
    }
    const alive = w.players.filter((p) => p.alive).length;
    audio.intensity = alive <= 3 ? 2 : w.fog.stage >= 2 ? 1 : 0;
  });
  game.onFrame((dt, alpha) => fx.update(game.world, dt, alpha));
  return fx;
}
