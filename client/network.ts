import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { serverAddress, isPrivateHost, type ConnectionMode } from '../shared/connection';
import {
  advancePlayer,
  STEP,
  type Player,
  type Input,
  type Snapshot,
  type Reply,
} from '../shared/game';
import { audio } from './audio';
export function defaultConnection(): { endpoint?: string; mode: ConnectionMode } {
  if (!Capacitor.isNativePlatform() && isPrivateHost(location.hostname))
    return { endpoint: location.origin, mode: 'lan' };
  return { endpoint: import.meta.env.VITE_SERVER_URL || undefined, mode: 'online' };
}
function storedConnection(): { endpoint?: string; mode: ConnectionMode } {
  try {
    const saved = JSON.parse(localStorage.getItem('bp.server') || 'null');
    if (saved && ['online', 'lan'].includes(saved.mode))
      return { endpoint: serverAddress(saved.endpoint, saved.mode), mode: saved.mode };
  } catch {}
  return defaultConnection();
}
const savedConnection = storedConnection();
export class GameConnection {
  endpoint = savedConnection.endpoint;
  mode = savedConnection.mode;
  socket = this.createSocket();
  createSocket() {
    return io(this.endpoint, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 5000,
      forceNew: true,
    });
  }
  snapshot: Snapshot | null = null;
  previous: Snapshot | null = null;
  predicted: Player | null = null;
  id = '';
  seq = 0;
  pending: Input[] = [];
  receivedAt = 0;
  status = 'Connecting…';
  ping = 0;
  error = '';
  listeners = new Set<() => void>();
  frames: { state: Snapshot; at: number }[] = [];
  lastEvent = 0;
  session: { code: string; token: string; server?: string } | null = null;
  pingTimer: ReturnType<typeof setInterval>;
  watchdog: ReturnType<typeof setInterval>;
  constructor() {
    try {
      this.session = JSON.parse(sessionStorage.getItem('bp.session') || 'null');
      if (
        this.session &&
        ((this.session.server && this.session.server !== (this.endpoint || location.origin)) ||
          (!this.session.server && this.endpoint))
      )
        this.clear();
    } catch {}
    this.bindSocket();
    // Browser offline events are faster than the transport heartbeat. Explicitly
    // reopen on online; silent packet loss also trips the snapshot watchdog.
    window.addEventListener('offline', () => {
      if (this.mode === 'lan') return;
      this.socket.disconnect();
      this.status = 'Reconnecting…';
      this.notify();
    });
    window.addEventListener('online', () => {
      if (this.endpoint || !Capacitor.isNativePlatform()) this.socket.connect();
    });
    this.watchdog = setInterval(() => {
      if (this.snapshot && this.socket.connected && performance.now() - this.receivedAt > 3500) {
        this.socket.disconnect();
        if (navigator.onLine || this.mode === 'lan') this.socket.connect();
      }
    }, 1000);
    this.pingTimer = setInterval(() => {
      if (!this.socket.connected) return;
      const start = performance.now();
      this.socket.timeout(2000).emit('pingCheck', (err: unknown) => {
        if (!err) {
          this.ping = Math.round(performance.now() - start);
          this.notify();
        }
      });
    }, 4000);
    if (this.endpoint || !Capacitor.isNativePlatform()) this.socket.connect();
    else this.status = 'Choose a server';
  }
  bindSocket() {
    const boundSocket = this.socket;
    this.socket.on('connect', () => {
      this.status = 'Connected';
      this.error = '';
      if (this.session)
        void this.request('resume', { code: this.session.code, token: this.session.token }).then(
          (r) => {
            if (boundSocket !== this.socket) return;
            if (r.ok) this.adopt(r);
            else {
              this.clear();
              this.error = r.error || 'Session expired.';
            }
            this.notify();
          },
        );
      this.notify();
    });
    this.socket.on('disconnect', (reason) => {
      this.status = 'Reconnecting…';
      this.pending = [];
      this.notify();
      if (reason === 'io server disconnect' && !this.session) this.socket.connect();
    });
    this.socket.on('connect_error', () => {
      this.status = 'Server unavailable · retrying';
      this.notify();
    });
    this.socket.on('state', (s: Snapshot) => this.receive(s));
    this.socket.on('removed', (message: string) => {
      this.clear();
      this.error = message;
      this.notify();
    });
  }
  async switchServer(endpoint: string | undefined, mode: ConnectionMode) {
    if (this.snapshot && this.socket.connected) await this.request('leave');
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.clear();
    this.endpoint = endpoint;
    this.mode = mode;
    this.error = '';
    this.status = 'Connecting…';
    this.ping = 0;
    try {
      if (endpoint) localStorage.setItem('bp.server', JSON.stringify({ endpoint, mode }));
      else localStorage.removeItem('bp.server');
    } catch {}
    this.socket = this.createSocket();
    this.bindSocket();
    this.socket.connect();
    this.notify();
  }
  inviteBase() {
    if (this.mode === 'lan') return this.endpoint || location.origin;
    return Capacitor.isNativePlatform()
      ? import.meta.env.VITE_PUBLIC_URL || this.endpoint || ''
      : location.origin;
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  notify() {
    this.listeners.forEach((f) => f());
  }
  async request(event: string, data: unknown = {}): Promise<Reply> {
    if (!this.socket.connected)
      return { ok: false, error: 'The game server is unavailable. Reconnecting…' };
    return new Promise((resolve) =>
      this.socket
        .timeout(5000)
        .emit(event, data, (err: unknown, r: Reply) =>
          resolve(err ? { ok: false, error: 'No reply from server. Please try again.' } : r),
        ),
    );
  }
  adopt(r: Reply) {
    this.id = r.id!;
    this.session = {
      code: r.snapshot!.code,
      token: r.token!,
      server: this.endpoint || location.origin,
    };
    try {
      sessionStorage.setItem('bp.session', JSON.stringify(this.session));
    } catch {}
    this.pending = [];
    this.seq = r.snapshot!.players.find((p) => p.id === this.id)?.ack || 0;
    this.lastEvent = r.snapshot!.events.at(-1)?.id || 0;
    this.receive(r.snapshot!);
  }
  clear() {
    this.session = null;
    this.snapshot = null;
    this.predicted = null;
    this.pending = [];
    this.frames = [];
    this.id = '';
    this.seq = 0;
    this.lastEvent = 0;
    try {
      sessionStorage.removeItem('bp.session');
    } catch {}
  }
  receive(s: Snapshot) {
    if (this.session && s.code !== this.session.code) return;
    const phaseChanged = this.snapshot?.phase !== s.phase;
    this.previous = this.snapshot;
    this.snapshot = s;
    this.receivedAt = performance.now();
    this.frames.push({ state: s, at: this.receivedAt });
    if (this.frames.length > 12) this.frames.shift();
    const local = s.players.find((p) => p.id === this.id);
    if (local) {
      this.pending = this.pending.filter((i) => i.seq > local.ack);
      if (phaseChanged) this.pending = [];
      this.predicted = { ...local };
      if (s.phase === 'playing')
        this.pending.forEach((input, i) =>
          advancePlayer(this.predicted!, input, s.now + (i + 1) * STEP),
        );
    }
    if (phaseChanged && s.phase === 'countdown') this.lastEvent = 0;
    for (const e of s.events)
      if (e.id > this.lastEvent) {
        audio.play(e.type);
        this.lastEvent = e.id;
      }
    audio.intense = s.stage === 'DOUBLE TROUBLE' || s.stage === 'FINAL CHAOS';
    if (phaseChanged && s.phase === 'results') audio.play('win');
    this.notify();
  }
  send(input: Omit<Input, 'seq'>) {
    if (
      !this.socket.connected ||
      !this.snapshot ||
      this.snapshot.phase !== 'playing' ||
      !this.predicted
    )
      return;
    if (performance.now() - this.receivedAt > 1500) {
      this.pending = [];
      return;
    }
    const command = { ...input, seq: ++this.seq };
    this.pending.push(command);
    if (this.pending.length > 60) this.pending.shift();
    advancePlayer(
      this.predicted,
      command,
      this.snapshot.now + (performance.now() - this.receivedAt),
    );
    this.socket.volatile.emit('input', command);
  }
  remotePlayers() {
    const at = performance.now() - 100;
    const before = [...this.frames].reverse().find((f) => f.at <= at) || this.frames[0],
      after = this.frames.find((f) => f.at >= at) || this.frames.at(-1);
    if (!before || !after) return [];
    const t =
      before === after ? 1 : Math.max(0, Math.min(1, (at - before.at) / (after.at - before.at)));
    return after.state.players.map((p) => {
      if (p.id === this.id && this.predicted) return this.predicted;
      const a = before.state.players.find((v) => v.id === p.id) || p;
      if (Math.hypot(a.x - p.x, a.y - p.y) > 150) return p;
      return { ...p, x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t };
    });
  }
}
export const net = new GameConnection();
