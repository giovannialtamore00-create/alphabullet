import './style.css';
import { audio } from './audio/audio';
import { mountDebugPanel } from './debug/debugPanel';
import { attachFeedback } from './game/feedback';
import { Game, type MatchSetup } from './game/game';
import { ClientSession, HostSession, MAX_HUMANS } from './net/session';
import { hostPeer, joinPeer, type HostTransport } from './net/transport';
import { paperCanvas } from './render/paper';
import { botName } from './sim/bots';
import { MAX_PLAYERS } from './sim/config';
import { Rng } from './sim/rng';
import { removePlayer } from './sim/world';
import { showHostSetup, showJoin, showLobby } from './ui/online';
import { closeScreen, isScreenOpen, showEnd, showMenu, showNotice, showPause } from './ui/screens';

const DEBUG = new URLSearchParams(location.search).has('debug');
const root = document.getElementById('game')!;
document.body.style.backgroundImage = `url(${paperCanvas(512, 11).toDataURL()})`;

let game: Game | null = null;
let stopDebug: (() => void) | null = null;
/** Cleans up the current online session (peer, connections). */
let netCleanup: (() => void) | null = null;

function teardown(): void {
  stopDebug?.();
  stopDebug = null;
  game?.stop();
  game = null;
  netCleanup?.();
  netCleanup = null;
  closeScreen();
}

function menu(): void {
  teardown();
  document.body.classList.add('in-menu');
  showMenu({ onPlay: startSolo, onHost: hostFlow, onJoin: () => joinFlow(), online: true });
}

function botNames(seed: number, taken: string[]): string[] {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const out: string[] = [];
  while (out.length + taken.length < MAX_PLAYERS) {
    const n = botName(rng);
    if (!taken.includes(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

const newSeed = () => (Math.random() * 2 ** 31) | 0;

async function startMatch(setup: MatchSetup, opts: { onAgain: (() => void) | null }): Promise<Game> {
  stopDebug?.();
  game?.stop();
  closeScreen();
  document.body.classList.remove('in-menu');
  const g = new Game(root, setup, {
    onEnd: (w) => showEnd(w, setup.localId, { onAgain: opts.onAgain, onMenu: menu }),
    onEscape: () => togglePause(),
  });
  game = g;
  await g.start();
  attachFeedback(g);
  if (DEBUG && !g.net.client) stopDebug = mountDebugPanel(g, document.body);
  (window as unknown as { __game: Game }).__game = g;
  return g;
}

function startSolo(): void {
  teardown();
  const seed = newSeed();
  const players = [{ name: 'You', isBot: false }, ...botNames(seed, ['You']).map((name) => ({ name, isBot: true }))];
  void startMatch({ seed, players, localId: 0, solo: true }, { onAgain: startSolo });
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

// ---------- Online ----------

function hostFlow(): void {
  showHostSetup(async (name) => {
    let transport: HostTransport;
    try {
      transport = await hostPeer();
    } catch (e) {
      showNotice('Could not host', (e as Error).message, menu);
      return;
    }
    const session = new HostSession(name);
    netCleanup = () => {
      session.close();
      transport.close();
    };
    transport.onConnection((c) => session.addConn(c));
    const update = showLobby({
      code: transport.code,
      isHost: true,
      max: MAX_HUMANS,
      onLeave: menu,
      onStart: async () => {
        const seed = newSeed();
        const players = session.start(seed, botNames(seed, session.names));
        const g = await startMatch({ seed, players, localId: 0, solo: false }, { onAgain: null });
        g.net.host = session;
        g.inputOverride = () => session.inputs();
        session.onClientLeft = (id) => {
          removePlayer(g.world, id);
          g.hud.toast(`${g.world.players[id].name} disconnected`);
        };
      },
    });
    session.onLobbyChange = update;
    update(session.names);
  }, menu);
}

function joinFlow(error = ''): void {
  showJoin(
    async (code, name) => {
      let joined: Awaited<ReturnType<typeof joinPeer>>;
      try {
        joined = await joinPeer(code);
      } catch (e) {
        joinFlow((e as Error).message);
        return;
      }
      const client = new ClientSession(joined.conn, name);
      let ended = false;
      netCleanup = () => {
        ended = true;
        client.close();
        joined.close();
      };
      const update = showLobby({ code, isHost: false, max: MAX_HUMANS, onLeave: menu });
      client.onLobby = (names) => update(names);
      client.onBye = (reason) => {
        if (ended || game?.world.over) return;
        ended = true;
        teardown();
        showNotice('Disconnected', reason, menu);
      };
      joined.conn.onClose(() => {
        if (ended || game?.world.over) return;
        ended = true;
        teardown();
        showNotice('Disconnected', 'Lost connection to the host. The match has ended.', menu);
      });
      client.onStart = async (seed, players, you) => {
        const g = await startMatch({ seed, players, localId: you, solo: false }, { onAgain: null });
        g.enableClientMode(client);
      };
      client.join();
    },
    menu,
    error,
  );
}

audio.startMusic();
menu();
