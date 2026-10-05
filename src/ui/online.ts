/** Host / Join / lobby screens. */
import { button, h, showScreen } from './screens';

const NAME_KEY = 'alphabullet.name';

export function savedName(): string {
  try {
    const n = localStorage.getItem(NAME_KEY);
    if (n) return n;
  } catch {
    /* ignore */
  }
  return `Ink-${Math.floor(10 + Math.random() * 90)}`;
}

function nameField(): HTMLInputElement {
  const input = h('input', { type: 'text', value: savedName(), maxLength: 14 });
  input.style.textTransform = 'none';
  input.style.letterSpacing = '1px';
  input.style.width = '200px';
  input.onchange = () => {
    try {
      localStorage.setItem(NAME_KEY, input.value.trim());
    } catch {
      /* ignore */
    }
  };
  return input;
}

export function showHostSetup(onCreate: (name: string) => void, onBack: () => void): void {
  const name = nameField();
  const status = h('p', { cls: 'hud-small' }, '');
  const create = button('Create room', () => {
    create.disabled = true;
    status.textContent = 'Contacting the matchmaking server...';
    onCreate(name.value.trim() || 'Host');
  }, { cls: 'primary' });
  showScreen(h('div', { cls: 'screen' }, h('h2', {}, 'Host a match'), h('div', { cls: 'panel' }, h('label', { cls: 'field' }, 'Your name ', name)), status, h('div', { cls: 'menu-buttons row' }, create, button('Back', onBack))));
}

export function showJoin(onJoin: (code: string, name: string) => void, onBack: () => void, error = ''): void {
  const code = h('input', { type: 'text', maxLength: 5, placeholder: 'CODE' });
  const name = nameField();
  const status = h('p', { cls: error ? 'warn' : 'hud-small' }, error);
  const go = () => {
    const c = code.value.trim().toUpperCase();
    if (c.length !== 5) {
      status.textContent = 'Room codes have 5 letters.';
      return;
    }
    status.className = 'hud-small';
    status.textContent = 'Connecting...';
    join.disabled = true;
    onJoin(c, name.value.trim() || 'Player');
  };
  code.onkeydown = (e) => {
    if (e.key === 'Enter') go(); // returning false from onkeydown would block typing
  };
  const join = button('Join', go, { cls: 'primary' });
  showScreen(
    h('div', { cls: 'screen' }, h('h2', {}, 'Join a match'), h('div', { cls: 'panel' }, h('label', { cls: 'field' }, 'Room code ', code), h('br'), h('label', { cls: 'field' }, 'Your name ', name)), status, h('div', { cls: 'menu-buttons row' }, join, button('Back', onBack))),
  );
  code.focus();
}

/** Lobby: host sees a Start button; clients wait. Returns an updater for the player list. */
export function showLobby(opts: { code: string; isHost: boolean; max: number; onStart?: () => void; onLeave: () => void }): (names: string[]) => void {
  const list = h('ul', { cls: 'plist' });
  const count = h('p', { cls: 'hud-small' });
  showScreen(
    h(
      'div',
      { cls: 'screen' },
      h('h2', {}, opts.isHost ? 'Your room' : 'Lobby'),
      h('p', {}, opts.isHost ? 'Share this code with friends:' : 'Room'),
      h('div', { cls: 'code' }, opts.code),
      h('div', { cls: 'panel' }, h('h3', {}, 'Players'), list, count),
      h('p', { cls: 'hud-small' }, opts.isHost ? 'Empty slots are filled with bots when you start.' : 'Waiting for the host to start...'),
      h('div', { cls: 'menu-buttons row' }, opts.isHost ? button('Start match', () => opts.onStart?.(), { cls: 'primary' }) : '', button('Leave', opts.onLeave)),
    ),
  );
  return (names) => {
    list.replaceChildren(...names.map((n, i) => h('li', {}, `${i === 0 ? '★ ' : ''}${n}`)));
    count.textContent = `${names.length} / ${opts.max} humans (bots fill up to 8)`;
  };
}
