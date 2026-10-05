import './style.css';
import { Game } from './game/game';
import { botName } from './sim/bots';
import { Rng } from './sim/rng';
import { mountDebugPanel } from './debug/debugPanel';
import { attachFeedback } from './game/feedback';
import { audio } from './audio/audio';

const DEBUG = new URLSearchParams(location.search).has('debug');
const root = document.getElementById('game')!;

async function startSolo(): Promise<void> {
  const seed = (Math.random() * 2 ** 31) | 0;
  const rng = new Rng(seed ^ 0x5bd1e995);
  const players = [{ name: 'You', isBot: false }];
  while (players.length < 8) {
    const name = botName(rng);
    if (!players.some((p) => p.name === name)) players.push({ name, isBot: true });
  }
  const game = new Game(root, { seed, players, localId: 0, solo: true }, {
    onEnd: () => {},
    onEscape: () => (game.paused = !game.paused),
  });
  await game.start();
  attachFeedback(game);
  audio.startMusic();
  if (DEBUG) mountDebugPanel(game, document.body);
  (window as unknown as { __game: Game }).__game = game;
}

startSolo();
