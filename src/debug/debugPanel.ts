/** ?debug panel: god mode, give any letter, instant upgrade, spawn mobs, hitboxes/emitters/shields, FPS/entities. */
import { LETTER_KEYS } from '../sim/glyphs';
import { debugGiveLetter, debugSpawnMobs, debugUpgradeActive } from '../sim/world';
import type { Game } from '../game/game';

export function mountDebugPanel(game: Game, parent: HTMLElement): () => void {
  const box = document.createElement('div');
  box.className = 'debug-panel';
  box.innerHTML = `
    <b>DEBUG</b>
    <label><input type="checkbox" data-k="god"> God mode</label>
    <label><input type="checkbox" data-k="hit"> Hitboxes / emitters / shields</label>
    <div><select data-k="letter">${LETTER_KEYS.map((k) => `<option>${k}</option>`).join('')}</select>
    <button data-k="give">Give</button></div>
    <button data-k="upgrade">Upgrade active letter</button>
    <button data-k="mobs">Spawn 20 mobs</button>
    <button data-k="fog">Skip fog wait</button>
    <div data-k="stats" class="debug-stats"></div>`;
  parent.appendChild(box);
  const q = <T extends HTMLElement>(k: string) => box.querySelector(`[data-k="${k}"]`) as T;
  const me = () => game.world.players[game.localId];
  q<HTMLInputElement>('god').onchange = (e) => (me().god = (e.target as HTMLInputElement).checked);
  q<HTMLInputElement>('hit').onchange = (e) => (game.debug.hitboxes = (e.target as HTMLInputElement).checked);
  q('give').onclick = () => debugGiveLetter(game.world, game.localId, q<HTMLSelectElement>('letter').value);
  q('upgrade').onclick = () => debugUpgradeActive(game.world, game.localId);
  q('mobs').onclick = () => debugSpawnMobs(game.world, me().x, me().y, 20);
  q('fog').onclick = () => {
    if (game.world.fog.phase === 'wait') game.world.fog.timer = 0.1;
  };
  // Buttons must not keep keyboard focus (letter keys would change the select).
  box.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur());
  const stats = q('stats');
  const iv = window.setInterval(() => {
    const w = game.world;
    stats.textContent = `FPS ${game.fps.toFixed(0)} | mobs ${w.mobs.length} | bullets ${w.bullets.length} | tick ${w.tick}`;
  }, 250);
  return () => {
    clearInterval(iv);
    box.remove();
  };
}
