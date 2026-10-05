import './style.css';
import { audio } from './audio/audio';
import { mountDebugPanel } from './debug/debugPanel';
import { attachFeedback } from './game/feedback';
import { Game, type MatchSetup } from './game/game';
import { paperCanvas } from './render/paper';
import { botName } from './sim/bots';
import { MAX_PLAYERS } from './sim/config';
import { Rng } from './sim/rng';
import { closeScreen, isScreenOpen, showEnd, showMenu, showPause } from './ui/screens';

const DEBUG = new URLSearchParams(location.search).has('debug');
const root = document.getElementById('game')!;
document.body.style.backgroundImage = `url(${paperCanvas(512, 11).toDataURL()})`;

let game: Game | null = null;
let stopDebug: (() => void) | null = null;

function teardown(): void {
  stopDebug?.();
  stopDebug = null;
  game?.stop();
  game = null;
  closeScreen();
}

function menu(): void {
  teardown();
  document.body.classList.add('in-menu');
  showMenu({ onPlay: startSolo, onHost: () => {}, onJoin: () => {}, online: false });
}

function soloSetup(): MatchSetup {
  const seed = (Math.random() * 2 ** 31) | 0;
  const rng = new Rng(seed ^ 0x5bd1e995);
  const players = [{ name: 'You', isBot: false }];
  while (players.length < MAX_PLAYERS) {
    const name = botName(rng);
    if (!players.some((p) => p.name === name)) players.push({ name, isBot: true });
  }
  return { seed, players, localId: 0, solo: true };
}

async function startSolo(): Promise<void> {
  teardown();
  document.body.classList.remove('in-menu');
  const setup = soloSetup();
  const g = new Game(root, setup, {
    onEnd: (w) => showEnd(w, setup.localId, { onAgain: startSolo, onMenu: menu }),
    onEscape: () => togglePause(),
  });
  game = g;
  await g.start();
  attachFeedback(g);
  if (DEBUG) stopDebug = mountDebugPanel(g, document.body);
  (window as unknown as { __game: Game }).__game = g;
}

function togglePause(): void {
  const g = game;
  if (!g || g.world.over) return;
  if (isScreenOpen()) {
    closeScreen();
    g.paused = false;
    g.keyboard.poll(); // drop keys pressed while the menu was open
    return;
  }
  if (g.setup.solo) g.paused = true;
  showPause({ solo: g.setup.solo, onResume: togglePause, onQuit: menu });
}

audio.startMusic();
menu();
