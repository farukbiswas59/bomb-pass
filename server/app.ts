import express from 'express';
import { isPrivateHost } from '../shared/connection.js';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { Room, roomCode } from './engine.js';
import { inputSchema, joinSchema, resumeSchema, RateLimit } from './validation.js';
import { DEFAULT_SETTINGS, RECONNECT_MS, STEP, idleInput, type Reply } from '../shared/game.js';

export function createGameServer(
  options: { origins?: string[]; production?: boolean; maxRooms?: number; lan?: boolean } = {},
) {
  const app = express(),
    http = createServer(app),
    rooms = new Map<string, Room>();
  const origins = options.origins || [];
  const allowed = (origin?: string) => {
    if (!origin || origins.includes(origin)) return true;
    if (options.production && !options.lan) return false;
    try {
      const url = new URL(origin);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        (['localhost', '127.0.0.1'].includes(url.hostname) || isPrivateHost(url.hostname))
      );
    } catch {
      return false;
    }
  };
  const io = new Server(http, {
    maxHttpBufferSize: 4096,
    serveClient: false,
    pingInterval: 5000,
    pingTimeout: 5000,
    cors: { origin: (origin, cb) => cb(null, allowed(origin)) },
    allowRequest: (req, cb) => cb(null, allowed(req.headers.origin)),
  });
  const admissions = new Map<string, { limiter: RateLimit; seen: number }>();
  io.use((socket, next) => {
    const ip = socket.handshake.address;
    let entry = admissions.get(ip);
    if (!entry) {
      if (admissions.size >= 5000) return next(new Error('Server busy. Try again shortly.'));
      entry = { limiter: new RateLimit(40, 0.5), seen: Date.now() };
      admissions.set(ip, entry);
    }
    entry.seen = Date.now();
    if (io.engine.clientsCount > 2000 || !entry.limiter.take())
      return next(new Error('Too many connections. Try again shortly.'));
    next();
  });
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  app.use(express.static(resolve('dist/client')));
  app.use((req, res) => {
    if (req.method === 'GET' && (req.path === '/' || /^\/join\/[A-Z2-9]{5}$/.test(req.path)))
      res.sendFile(resolve('dist/client/index.html'));
    else res.sendStatus(404);
  });
  function publish(room: Room) {
    io.to(room.code).emit('state', room.snapshot());
  }
  function remove(socket: any) {
    const room = rooms.get(socket.data.code);
    if (room) {
      room.remove(socket.data.playerId);
      socket.leave(room.code);
      publish(room);
      if (!room.members.size) rooms.delete(room.code);
    }
    socket.data.code = undefined;
    socket.data.playerId = undefined;
  }
  io.on('connection', (socket) => {
    const actions = new RateLimit(8, 2),
      inputs = new RateLimit(60, 40);
    const respond = (ack: unknown, reply: Reply) => {
      if (typeof ack === 'function') ack(reply);
    };
    const failure = (ack: unknown, error: string) => respond(ack, { ok: false, error });
    socket.on('join', (raw, ack) => {
      if (!actions.take()) return failure(ack, 'Slow down a moment.');
      if (socket.data.code) return failure(ack, 'Leave your current room first.');
      const data = joinSchema.safeParse(raw);
      if (!data.success) return failure(ack, 'Check your name and room options.');
      try {
        const d = data.data;
        let room =
          d.kind === 'join'
            ? rooms.get(d.code || '')
            : d.kind === 'quick'
              ? [...rooms.values()].find(
                  (r) =>
                    r.isPublic && r.phase === 'lobby' && r.members.size < r.settings.maxPlayers,
                )
              : undefined;
        if (d.kind === 'join' && !room) return failure(ack, 'Room not found. Check the code.');
        if (!room) {
          if (rooms.size >= (options.maxRooms || 200))
            return failure(ack, 'All arenas are busy. Try again shortly.');
          let code = roomCode();
          while (rooms.has(code)) code = roomCode();
          room = new Room(
            code,
            d.kind === 'quick',
            d.kind === 'create' && d.settings ? d.settings : { ...DEFAULT_SETTINGS },
          );
          rooms.set(code, room);
        }
        const member = room.add(d.name, socket.id);
        socket.data.code = room.code;
        socket.data.playerId = member.player.id;
        socket.join(room.code);
        respond(ack, {
          ok: true,
          id: member.player.id,
          token: member.token,
          snapshot: room.snapshot(),
        });
        publish(room);
      } catch (e) {
        failure(ack, e instanceof Error ? e.message : 'Unable to join room.');
      }
    });
    socket.on('resume', (raw, ack) => {
      if (!actions.take()) return failure(ack, 'Slow down a moment.');
      if (socket.data.code) return failure(ack, 'Already in a room.');
      const data = resumeSchema.safeParse(raw);
      if (!data.success) return failure(ack, 'Invalid reconnect session.');
      const room = rooms.get(data.data.code),
        m =
          room &&
          [...room.members.values()].find((m) => m.token === data.data.token && !m.player.bot);
      if (!room || !m || (m.disconnectedAt !== null && room.now - m.disconnectedAt > RECONNECT_MS))
        return failure(ack, 'Your reserved spot expired. Join a new room.');
      if (m.socketId && m.socketId !== socket.id) {
        const old = io.sockets.sockets.get(m.socketId);
        if (old) {
          old.emit('removed', 'Your player session moved to another tab.');
          old.data.code = undefined;
          old.data.playerId = undefined;
          old.disconnect(true);
        }
      }
      m.socketId = socket.id;
      m.disconnectedAt = null;
      m.player.connected = true;
      m.player.afk = false;
      m.lastActive = room.now;
      m.queue = [];
      m.player.ack = m.lastSeq;
      m.latest = idleInput(m.lastSeq);
      socket.data.code = room.code;
      socket.data.playerId = m.player.id;
      socket.join(room.code);
      room.rehost();
      respond(ack, { ok: true, id: m.player.id, token: m.token, snapshot: room.snapshot() });
      publish(room);
    });
    socket.on('input', (raw) => {
      if (!inputs.take()) return;
      const data = inputSchema.safeParse(raw);
      if (data.success) rooms.get(socket.data.code)?.input(socket.data.playerId, data.data);
    });
    socket.on('start', (_raw, ack) => {
      if (!actions.take()) return failure(ack, 'Slow down a moment.');
      const room = rooms.get(socket.data.code);
      if (!room || room.host !== socket.data.playerId)
        return failure(ack, 'Only the host can start.');
      try {
        room.start();
        publish(room);
        respond(ack, { ok: true });
      } catch (e) {
        failure(ack, (e as Error).message);
      }
    });
    socket.on('addBot', (_raw, ack) => {
      if (!actions.take()) return failure(ack, 'Slow down a moment.');
      const room = rooms.get(socket.data.code);
      if (!room || room.host !== socket.data.playerId)
        return failure(ack, 'Only the host can add bots.');
      try {
        room.add(`Bot ${room.members.size}`, null, true);
        publish(room);
        respond(ack, { ok: true });
      } catch (e) {
        failure(ack, (e as Error).message);
      }
    });
    socket.on('emote', (raw) => {
      const room = rooms.get(socket.data.code),
        m = room?.members.get(socket.data.playerId);
      if (!room || !m || !['GG', 'NOPE', 'HELP!'].includes(raw) || room.now - m.lastEmote < 1500)
        return;
      m.lastEmote = room.now;
      m.player.emote = raw;
      m.player.emoteUntil = room.now + 1200;
    });
    socket.on('leave', (_raw, ack) => {
      remove(socket);
      respond(ack, { ok: true });
    });
    socket.on('pingCheck', (ack) => {
      if (actions.take() && typeof ack === 'function') ack();
    });
    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code),
        m = room?.members.get(socket.data.playerId);
      if (room && m && m.socketId === socket.id) {
        m.socketId = null;
        m.disconnectedAt = room.now;
        m.player.connected = false;
        m.player.tagQueuedUntil = 0;
        m.player.tagUntil = 0;
        m.player.dashUntil = 0;
        m.queue = [];
        m.latest = idleInput(m.lastSeq);
        room.rehost();
        publish(room);
      }
    });
  });
  let last = performance.now(),
    accumulator = 0,
    tick = 0;
  const epoch = Date.now() - performance.now();
  const timer = setInterval(() => {
    const current = performance.now();
    accumulator += Math.min(current - last, STEP * 5);
    last = current;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const now = epoch + current - accumulator;
      for (const [code, room] of rooms) {
        room.tick(now);
        for (const [id, m] of room.members) {
          if (m.disconnectedAt !== null && now - m.disconnectedAt > RECONNECT_MS) room.remove(id);
          else if (
            room.isPublic &&
            room.phase === 'playing' &&
            !m.player.bot &&
            now - m.lastActive > 45000
          ) {
            if (m.socketId) {
              const s = io.sockets.sockets.get(m.socketId);
              s?.emit('removed', 'You were inactive. Join again when you’re ready.');
              if (s) remove(s);
            } else room.remove(id);
          }
        }
        if (![...room.members.values()].some((m) => !m.player.bot)) {
          rooms.delete(code);
          continue;
        }
        if (
          room.isPublic &&
          room.phase === 'lobby' &&
          [...room.members.values()].filter((m) => m.player.connected).length >= 2 &&
          now - room.createdAt > 8000
        )
          room.start();
        if (tick % 2 === 0) publish(room);
      }
      tick++;
    }
    if (tick % 300 === 0)
      for (const [ip, entry] of admissions)
        if (Date.now() - entry.seen > 120000) admissions.delete(ip);
  }, 8);
  return {
    app,
    http,
    io,
    rooms,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
