import { describe, it, expect, afterEach } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/app';
import { DEFAULT_SETTINGS, type Reply, type Snapshot } from '../shared/game';
const sockets: Socket[] = [];
const servers: ReturnType<typeof createGameServer>[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  for (const g of servers.splice(0)) await g.close();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function setup() {
  const game = createGameServer();
  servers.push(game);
  await new Promise<void>((r) => game.http.listen(0, '127.0.0.1', r));
  const port = (game.http.address() as { port: number }).port;
  return { game, url: `http://127.0.0.1:${port}` };
}
async function connect(url: string) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}
const request = (s: Socket, event: string, data: unknown = {}) =>
  new Promise<Reply>((resolve, reject) =>
    s.timeout(2000).emit(event, data, (err: unknown, r: Reply) => (err ? reject(err) : resolve(r))),
  );
describe('real websocket multiplayer', () => {
  it('shares rooms, refuses unauthorized starts and reconnects the same reserved player', async () => {
    const { game, url } = await setup();
    const a = await connect(url),
      b = await connect(url);
    const ra = await request(a, 'join', {
      kind: 'create',
      name: 'Alice',
      settings: { ...DEFAULT_SETTINGS, maxPlayers: 2 },
    });
    expect(ra.ok).toBe(true);
    const rb = await request(b, 'join', { kind: 'join', name: 'Bob', code: ra.snapshot!.code });
    expect(rb.ok).toBe(true);
    expect(rb.snapshot!.players).toHaveLength(2);
    expect((await request(b, 'start')).ok).toBe(false);
    const third = await connect(url);
    expect(
      (await request(third, 'join', { kind: 'join', name: 'Eve', code: ra.snapshot!.code })).ok,
    ).toBe(false);
    expect((await request(a, 'start')).ok).toBe(true);
    const room = game.rooms.get(ra.snapshot!.code)!;
    b.disconnect();
    await sleep(80);
    expect(room.members.get(rb.id!)?.player.connected).toBe(false);
    const replacement = await connect(url);
    const rr = await request(replacement, 'resume', { code: ra.snapshot!.code, token: rb.token });
    expect(rr.ok).toBe(true);
    expect(rr.id).toBe(rb.id);
    expect(room.members.size).toBe(2);
    expect(rr.snapshot!.phase).toBe('countdown');
    expect(JSON.stringify(rr.snapshot)).not.toContain(rb.token);
  });
  it('matches two real guests and deletes abandoned rooms', async () => {
    const { game, url } = await setup();
    const a = await connect(url),
      b = await connect(url);
    const ra = await request(a, 'join', { kind: 'quick', name: 'A' }),
      rb = await request(b, 'join', { kind: 'quick', name: 'B' });
    expect(ra.snapshot!.code).toBe(rb.snapshot!.code);
    await request(a, 'leave');
    await request(b, 'leave');
    expect(game.rooms.size).toBe(0);
  });
  it('expires reserved seats, keeps another player connected and rejects stale tokens', async () => {
    const { game, url } = await setup();
    const a = await connect(url),
      b = await connect(url);
    const ra = await request(a, 'join', { kind: 'create', name: 'A' });
    const rb = await request(b, 'join', { kind: 'join', name: 'B', code: ra.snapshot!.code });
    a.disconnect();
    await sleep(60);
    const room = game.rooms.get(ra.snapshot!.code)!;
    room.members.get(ra.id!)!.disconnectedAt = room.now - 21000;
    await sleep(80);
    expect(room.members.size).toBe(1);
    expect(room.host).toBe(rb.id);
    const c = await connect(url);
    expect((await request(c, 'resume', { code: room.code, token: ra.token })).ok).toBe(false);
  });
  it('validates hostile payloads without crashing the room', async () => {
    const { game, url } = await setup();
    const a = await connect(url);
    expect(
      (
        await request(a, 'join', {
          kind: 'create',
          name: 'A',
          settings: { ...DEFAULT_SETTINGS, lives: 999 },
        })
      ).ok,
    ).toBe(false);
    const ra = await request(a, 'join', { kind: 'create', name: 'A' });
    a.emit('input', { seq: 1, x: Infinity, y: 0, score: 999 });
    await sleep(80);
    const p = game.rooms.get(ra.snapshot!.code)!.members.get(ra.id!)!.player;
    expect(p.lives).toBe(5);
    expect(p.points).toBe(0);
  });
  it('runs ten clients with consistent snapshots and bounded movement under bursts', async () => {
    const { game, url } = await setup();
    const clients = await Promise.all(Array.from({ length: 10 }, () => connect(url)));
    const host = await request(clients[0], 'join', {
      kind: 'create',
      name: 'P0',
      settings: { ...DEFAULT_SETTINGS, mode: 'teams' },
    });
    for (let i = 1; i < 10; i++)
      expect(
        (
          await request(clients[i], 'join', {
            kind: 'join',
            name: `P${i}`,
            code: host.snapshot!.code,
          })
        ).ok,
      ).toBe(true);
    await request(clients[0], 'start');
    const room = game.rooms.get(host.snapshot!.code)!;
    room.startsAt = room.now - 1;
    room.nextBombAt = room.now;
    let seen: Snapshot | undefined;
    clients[9].on('state', (s) => (seen = s));
    for (let seq = 1; seq < 50; seq++)
      clients[0].emit('input', { seq, x: 1, y: 0, tag: false, dash: false, power: false });
    await sleep(350);
    expect(seen?.phase).toBe('playing');
    expect(seen?.players).toHaveLength(10);
    expect(seen?.bombs).toHaveLength(1);
    expect(seen?.players[0].x).toBeLessThan(380);
    expect(seen?.players.filter((p) => p.team === 0)).toHaveLength(5);
  });
});
