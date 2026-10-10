/** Message transport. PeerJS (WebRTC) for real play; an in-memory pair for tests. */
import Peer, { type DataConnection } from 'peerjs';

export interface Conn {
  send(msg: unknown): void;
  /** Unreliable, unordered delivery (may be lost or arrive late). Falls back to send. */
  sendFast?(msg: unknown): void;
  /** Messages received on the unreliable channel so far (for tests/debug). */
  fastReceived?(): number;
  onMessage(fn: (m: any) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

/** Two connected in-memory endpoints (synchronous delivery). `dropFast` = chance each sendFast message is lost. */
export function memoryPair(opts: { dropFast?: number; seed?: number } = {}): [Conn, Conn] {
  let seed = opts.seed ?? 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const mk = () => ({ msg: [] as ((m: any) => void)[], close: [] as (() => void)[], open: true });
  const a = mk();
  const b = mk();
  const end = (me: typeof a, other: typeof a): Conn => ({
    send: (m) => {
      if (me.open && other.open) other.msg.forEach((f) => f(JSON.parse(JSON.stringify(m))));
    },
    sendFast: (m) => {
      if (rand() < (opts.dropFast ?? 0)) return;
      if (me.open && other.open) other.msg.forEach((f) => f(JSON.parse(JSON.stringify(m))));
    },
    onMessage: (f) => me.msg.push(f),
    onClose: (f) => me.close.push(f),
    close: () => {
      if (!me.open) return;
      me.open = false;
      other.open = false;
      me.close.forEach((f) => f());
      other.close.forEach((f) => f());
    },
  });
  return [end(a, b), end(b, a)];
}

const PREFIX = 'alphabullet-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

function wrap(dc: DataConnection): Conn {
  const closeFns: (() => void)[] = [];
  let closed = false;
  const fireClose = () => {
    if (closed) return;
    closed = true;
    closeFns.forEach((f) => f());
  };
  dc.on('close', fireClose);
  dc.on('error', fireClose);
  // ICE failures surface on the underlying RTCPeerConnection.
  const pc = dc.peerConnection;
  if (pc) pc.addEventListener('connectionstatechange', () => ['failed', 'closed'].includes(pc.connectionState) && fireClose());
  // Second channel without retransmits or ordering: a lost snapshot never holds back newer ones.
  // Both sides create it with the same fixed id (negotiated), so no extra signalling is needed.
  let fast: RTCDataChannel | null = null;
  try {
    fast = pc?.createDataChannel('fast', { negotiated: true, id: FAST_CHANNEL_ID, ordered: false, maxRetransmits: 0 }) ?? null;
  } catch {
    fast = null; // fall back to the reliable channel
  }
  const msgFns: ((m: any) => void)[] = [];
  let fastIn = 0;
  if (fast)
    fast.onmessage = (e) => {
      fastIn++;
      let m: unknown;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      msgFns.forEach((f) => f(m));
    };
  const send = (m: unknown) => {
    if (!closed && dc.open) dc.send(m);
  };
  return {
    send,
    sendFast: (m) => {
      if (closed) return;
      if (fast?.readyState === 'open') fast.send(JSON.stringify(m));
      else send(m);
    },
    fastReceived: () => fastIn,
    onMessage: (f) => {
      msgFns.push(f);
      dc.on('data', f);
    },
    onClose: (f) => closeFns.push(f),
    close: () => {
      fast?.close();
      dc.close();
      fireClose();
    },
  };
}

const FAST_CHANNEL_ID = 100;

export interface HostTransport {
  code: string;
  onConnection(fn: (c: Conn) => void): void;
  close(): void;
}

/** Register a room on the public PeerJS broker. Retries if the code is taken. */
export function hostPeer(timeoutMs = 15000): Promise<HostTransport> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = randomCode();
      const peer = new Peer(PREFIX + code);
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error('Could not reach the matchmaking server (timeout).'));
      }, timeoutMs);
      const fns: ((c: Conn) => void)[] = [];
      peer.on('open', () => {
        clearTimeout(timer);
        resolve({ code, onConnection: (f) => fns.push(f), close: () => peer.destroy() });
      });
      peer.on('connection', (dc) => dc.on('open', () => fns.forEach((f) => f(wrap(dc)))));
      peer.on('error', (err: { type?: string }) => {
        clearTimeout(timer);
        if (err.type === 'unavailable-id' && tries++ < 5) {
          peer.destroy();
          attempt();
        } else if (!peer.open) reject(new Error(`Could not create a room (${err.type ?? 'error'}).`));
      });
    };
    attempt();
  });
}

/** Connect to a host's room code. Resolves with the connection and a cleanup function. */
export function joinPeer(code: string, timeoutMs = 15000): Promise<{ conn: Conn; close: () => void }> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('Could not connect to that room (timeout). Check the code.'));
    }, timeoutMs);
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      dc.on('open', () => {
        clearTimeout(timer);
        resolve({ conn: wrap(dc), close: () => peer.destroy() });
      });
    });
    peer.on('error', (err: { type?: string }) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(err.type === 'peer-unavailable' ? 'No room with that code.' : `Connection failed (${err.type ?? 'error'}).`));
    });
  });
}
