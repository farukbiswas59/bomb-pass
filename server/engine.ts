import { randomInt, randomUUID } from 'node:crypto';
import {
  ARENA,
  COLORS,
  DEFAULT_SETTINGS,
  STEP,
  advancePlayer,
  idleInput,
  lineOfSight,
  move,
  type Player,
  type Input,
  type Settings,
  type Snapshot,
  type GameEvent,
  type Pickup,
  type Results,
  type Power,
} from '../shared/game.js';
import { cleanName } from './validation.js';
type Bomb = {
  id: string;
  owner: string;
  detonatesAt: number;
  assignedAt: number;
  heldAt: number;
  from: string | null;
};
export type Member = {
  player: Player;
  token: string;
  socketId: string | null;
  queue: Input[];
  latest: Input;
  receivedAt: number;
  lastActive: number;
  disconnectedAt: number | null;
  tagHit: boolean;
  lastEmote: number;
  lastSeq: number;
};
export class Room {
  members = new Map<string, Member>();
  bombs: Bomb[] = [];
  pickups: Pickup[] = [];
  events: GameEvent[] = [];
  phase: Snapshot['phase'] = 'lobby';
  startsAt = 0;
  endsAt = 0;
  now: number;
  host = '';
  results: Results | null = null;
  nextBombAt = 0;
  nextPickupAt = 0;
  eventSeq = 0;
  createdAt: number;
  constructor(
    public code: string,
    public isPublic = false,
    public settings: Settings = { ...DEFAULT_SETTINGS },
    now = Date.now(),
    public random: () => number = Math.random,
  ) {
    this.now = now;
    this.createdAt = now;
  }
  add(name: string, socketId: string | null, bot = false) {
    if (this.phase !== 'lobby' && this.phase !== 'results')
      throw new Error('Match already started. Join the next round.');
    if (this.members.size >= this.settings.maxPlayers) throw new Error('This room is full.');
    const index = this.members.size,
      id = randomUUID(),
      spawn = ARENA.spawns[index];
    const used = new Set([...this.members.values()].map((m) => m.player.color));
    const p: Player = {
      id,
      name: cleanName(name),
      color: COLORS.find((c) => !used.has(c)) || COLORS[0],
      team: 0,
      bot,
      connected: true,
      ...spawn,
      dx: 0,
      dy: 1,
      lives: this.settings.lives,
      points: 0,
      passes: 0,
      caused: 0,
      exploded: 0,
      longest: 0,
      ack: 0,
      shieldUntil: 0,
      protectedUntil: 0,
      tagUntil: 0,
      tagReady: 0,
      dashUntil: 0,
      dashReady: 0,
      dashX: 0,
      dashY: 1,
      slowUntil: 0,
      respawnUntil: 0,
      power: null,
      superUntil: 0,
      emote: '',
      emoteUntil: 0,
      afk: false,
    };
    const m: Member = {
      player: p,
      token: randomUUID(),
      socketId,
      queue: [],
      latest: idleInput(),
      receivedAt: this.now,
      lastActive: this.now,
      disconnectedAt: null,
      tagHit: false,
      lastEmote: 0,
      lastSeq: 0,
    };
    this.members.set(id, m);
    if (!this.host && !bot) this.host = id;
    this.balance();
    return m;
  }
  balance() {
    if (this.phase === 'lobby' || this.phase === 'results')
      [...this.members.values()].forEach(
        (m, i) => (m.player.team = this.settings.mode === 'teams' ? i % 2 : 0),
      );
  }
  remove(id: string) {
    const member = this.members.get(id);
    if (!member) return;
    if (this.phase === 'playing')
      for (const b of [...this.bombs]) if (b.owner === id) this.explode(b);
    this.members.delete(id);
    this.bombs = this.bombs.filter((b) => b.owner !== id);
    this.rehost();
    this.balance();
  }
  rehost() {
    if (!this.members.get(this.host)?.player.connected)
      this.host =
        [...this.members.values()].find((m) => !m.player.bot && m.player.connected)?.player.id ||
        '';
  }
  start() {
    if (this.phase !== 'lobby' && this.phase !== 'results')
      throw new Error('A match is already running.');
    if ([...this.members.values()].filter((m) => m.player.connected).length < 2)
      throw new Error('You need at least 2 players. Add a friend or a bot.');
    for (const [id, m] of this.members) if (!m.player.connected) this.members.delete(id);
    this.balance();
    this.phase = 'countdown';
    this.startsAt = this.now + 3000;
    this.endsAt = this.startsAt + this.settings.duration * 1000;
    this.bombs = [];
    this.pickups = [];
    this.events = [];
    this.results = null;
    this.nextBombAt = this.startsAt;
    this.nextPickupAt = this.startsAt + 7000;
    [...this.members.values()].forEach((m, i) => {
      Object.assign(m.player, ARENA.spawns[i], {
        lives: this.settings.lives,
        points: 0,
        passes: 0,
        caused: 0,
        exploded: 0,
        longest: 0,
        tagUntil: 0,
        tagReady: 0,
        dashUntil: 0,
        dashReady: 0,
        shieldUntil: 0,
        protectedUntil: 0,
        slowUntil: 0,
        respawnUntil: 0,
        power: null,
        superUntil: 0,
        afk: false,
      });
      m.queue = [];
      m.latest = idleInput(m.lastSeq);
      m.lastActive = this.now;
    });
  }
  input(id: string, input: Input) {
    const m = this.members.get(id);
    if (!m || !m.player.connected || input.seq <= m.lastSeq || input.seq > m.lastSeq + 300) return;
    m.lastSeq = input.seq;
    m.receivedAt = this.now;
    if (input.x || input.y || input.tag || input.dash || input.power) {
      m.lastActive = this.now;
      m.player.afk = false;
    }
    // A flood cannot buy extra simulation time. Bound latency from queued packets.
    if (m.queue.length >= 5) m.queue.shift();
    m.queue.push(input);
  }
  emit(type: GameEvent['type'], p: Player, target?: string) {
    this.events.push({ id: ++this.eventSeq, type, x: p.x, y: p.y, player: p.id, target });
    if (this.events.length > 32) this.events.shift();
  }
  opponents(a: Player, b: Player) {
    return a.id !== b.id && (this.settings.mode === 'ffa' || a.team !== b.team);
  }
  tag(m: Member) {
    const p = m.player,
      bomb = this.bombs.find((b) => b.owner === p.id);
    if (!bomb || m.tagHit || this.now >= p.tagUntil || this.now < p.protectedUntil) return;
    const targets = [...this.members.values()]
      .map((m) => m.player)
      .filter(
        (t) =>
          this.opponents(p, t) &&
          t.connected &&
          !t.afk &&
          this.now >= t.protectedUntil &&
          this.now >= t.shieldUntil &&
          this.now >= t.respawnUntil &&
          !this.bombs.some((b) => b.owner === t.id),
      );
    targets.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const t of targets) {
      const x = t.x - p.x,
        y = t.y - p.y,
        d = Math.hypot(x, y);
      if (d > 64 || (d > 1 && (x * p.dx + y * p.dy) / d < 0.35) || !lineOfSight(p, t)) continue;
      p.longest = Math.max(p.longest, this.now - bomb.heldAt);
      p.passes++;
      p.points += 2;
      if (bomb.detonatesAt - this.now < 1500) p.points++;
      bomb.from = p.id;
      bomb.owner = t.id;
      bomb.heldAt = this.now;
      t.protectedUntil = this.now + 800;
      m.tagHit = true;
      p.tagUntil = 0;
      this.emit('pass', p, t.id);
      break;
    }
  }
  explode(bomb: Bomb) {
    const p = this.members.get(bomb.owner)?.player;
    if (p) {
      const inDanger = p.lives === 0;
      p.longest = Math.max(p.longest, this.now - bomb.heldAt);
      p.exploded++;
      p.lives = Math.max(0, p.lives - 1);
      p.points -= 5;
      const giver = bomb.from ? this.members.get(bomb.from)?.player : null;
      if (giver && this.opponents(giver, p) && p.connected && !p.afk) {
        giver.caused++;
        giver.points += inDanger ? 8 : 5;
      }
      this.emit('explode', p);
      for (const m of this.members.values()) {
        const q = m.player,
          d = Math.hypot(q.x - p.x, q.y - p.y);
        if (q.id !== p.id && d < 130 && d > 0)
          move(q, ((q.x - p.x) / d) * 45, ((q.y - p.y) / d) * 45);
      }
      const spawn = ARENA.spawns[Math.floor(this.random() * ARENA.spawns.length)];
      Object.assign(p, spawn);
      p.respawnUntil = this.now + 650;
      p.protectedUntil = this.now + 1400;
      p.tagUntil = 0;
      p.dashUntil = 0;
    }
    this.bombs = this.bombs.filter((b) => b.id !== bomb.id);
    this.nextBombAt = this.now + 1200;
  }
  get stage(): Snapshot['stage'] {
    if (this.phase === 'lobby' || this.phase === 'countdown') return 'WARM UP';
    const elapsed = (this.now - this.startsAt) / (this.settings.duration * 1000);
    return elapsed >= 11 / 12
      ? 'FINAL CHAOS'
      : elapsed >= 0.75
        ? 'DOUBLE TROUBLE'
        : elapsed >= 2 / 3
          ? 'HEATING UP'
          : 'PASS IT ON';
  }
  desiredBombs() {
    const n = this.members.size;
    return Math.min(
      Math.max(1, n - 1),
      this.stage === 'FINAL CHAOS' && n >= 6
        ? 3
        : this.stage === 'DOUBLE TROUBLE' || this.stage === 'FINAL CHAOS'
          ? 2
          : 1,
    );
  }
  spawnBomb() {
    const eligible = [...this.members.values()].filter(
      (m) =>
        m.player.connected &&
        !m.player.afk &&
        this.now >= m.player.protectedUntil &&
        !this.bombs.some((b) => b.owner === m.player.id),
    );
    if (!eligible.length) return;
    const p = eligible[Math.floor(this.random() * eligible.length)].player;
    const fuse = (8000 + this.random() * 6000) * (this.stage === 'PASS IT ON' ? 1 : 0.8);
    this.bombs.push({
      id: randomUUID(),
      owner: p.id,
      detonatesAt: this.now + fuse,
      assignedAt: this.now,
      heldAt: this.now,
      from: null,
    });
    p.protectedUntil = this.now + 800;
  }
  usePower(p: Player) {
    if (!p.power || this.now < p.respawnUntil) return;
    if (p.power === 'shield') p.shieldUntil = this.now + 2000;
    if (p.power === 'super') {
      p.superUntil = this.now + 4000;
      p.dashReady = this.now;
    }
    if (p.power === 'freeze') {
      const target = [...this.members.values()]
        .map((m) => m.player)
        .filter(
          (t) =>
            this.opponents(p, t) &&
            t.connected &&
            Math.hypot(t.x - p.x, t.y - p.y) < 160 &&
            lineOfSight(p, t),
        )
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (target) target.slowUntil = this.now + 1800;
    }
    this.emit('power', p);
    p.power = null;
  }
  botInput(m: Member): Input {
    const p = m.player,
      carrying = this.bombs.some((b) => b.owner === p.id);
    const others = [...this.members.values()]
      .map((m) => m.player)
      .filter(
        (t) =>
          this.opponents(p, t) &&
          t.connected &&
          !t.afk &&
          (!carrying || !this.bombs.some((b) => b.owner === t.id)),
      );
    const target = others.sort(
      (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
    )[0];
    if (!target) return idleInput();
    const sign = carrying ? 1 : -1,
      angle =
        Math.atan2(target.y - p.y, target.x - p.x) +
        (carrying ? 0 : Math.sin(this.now / 900 + p.x) * 0.8);
    let x = Math.cos(angle) * sign,
      y = Math.sin(angle) * sign;
    const probe = { x: p.x, y: p.y };
    move(probe, x * 28, y * 28);
    if (Math.hypot(probe.x - p.x, probe.y - p.y) < 12) {
      const turn = this.now / 700;
      x = Math.cos(turn);
      y = Math.sin(turn);
    }
    return {
      seq: 0,
      x,
      y,
      tag: carrying && Math.hypot(target.x - p.x, target.y - p.y) < 75 && this.random() < 0.3,
      dash: this.random() < 0.008,
      power: !!p.power && this.random() < 0.04,
    };
  }
  finish() {
    for (const b of this.bombs) {
      const p = this.members.get(b.owner)?.player;
      if (p) p.longest = Math.max(p.longest, this.now - b.heldAt);
    }
    this.phase = 'results';
    this.bombs = [];
    const rows = [...this.members.values()]
      .map((m) => ({ ...m.player }))
      .sort((a, b) => b.lives - a.lives || b.points - a.points);
    let winners: string[] = [],
      winningTeam: number | null = null,
      draw = false;
    if (this.settings.mode === 'teams') {
      const scores = [0, 1].map((team) =>
        rows
          .filter((p) => p.team === team)
          .reduce((a, p) => ({ lives: a.lives + p.lives, points: a.points + p.points }), {
            lives: 0,
            points: 0,
          }),
      );
      const diff = scores[0].lives - scores[1].lives || scores[0].points - scores[1].points;
      draw = diff === 0;
      winningTeam = draw ? null : diff > 0 ? 0 : 1;
      winners = rows.filter((p) => draw || p.team === winningTeam).map((p) => p.id);
    } else if (rows.length) {
      winners = rows
        .filter((p) => p.lives === rows[0].lives && p.points === rows[0].points)
        .map((p) => p.id);
      draw = winners.length > 1;
    }
    const mvp =
      [...rows].sort((a, b) => b.caused * 5 + b.passes - (a.caused * 5 + a.passes))[0]?.id || '';
    this.results = { rows, winners, winningTeam, draw, mvp };
  }
  tick(now: number, dt = STEP) {
    this.now = now;
    if (this.phase === 'countdown' && now >= this.startsAt) this.phase = 'playing';
    if (this.phase !== 'playing') return;
    if (now >= this.endsAt) {
      this.finish();
      return;
    }
    for (const m of this.members.values()) {
      const p = m.player;
      p.afk = !p.bot && now - m.lastActive > 30000;
      let input = m.player.bot ? this.botInput(m) : m.queue.shift();
      if (input) {
        m.latest = { ...input, tag: false, dash: false, power: false };
        p.ack = input.seq;
      } else input = now - m.receivedAt < 250 ? m.latest : idleInput(p.ack);
      if (!p.connected || p.afk) input = idleInput(p.ack);
      const dash = p.dashReady,
        tag = p.tagReady;
      if (input.power) this.usePower(p);
      advancePlayer(p, input, now, dt);
      if (p.dashReady !== dash) this.emit('dash', p);
      if (p.tagReady !== tag) {
        m.tagHit = false;
        this.emit('tag', p);
      }
    }
    // Expiry wins over tags in the same tick. Arrival timestamps never extend a fuse.
    for (const b of [...this.bombs]) if (now >= b.detonatesAt) this.explode(b);
    for (const m of this.members.values()) this.tag(m);
    if (now >= this.nextBombAt && this.bombs.length < this.desiredBombs()) this.spawnBomb();
    if (this.settings.powerups) {
      if (now >= this.nextPickupAt && this.pickups.length < 3) {
        const pos = ARENA.spawns[Math.floor(this.random() * ARENA.spawns.length)];
        this.pickups.push({
          id: randomUUID(),
          ...pos,
          kind: (['shield', 'freeze', 'super'] as Power[])[Math.floor(this.random() * 3)],
        });
        this.nextPickupAt = now + 8000;
      }
      for (const m of this.members.values())
        if (!m.player.power && m.player.connected && now >= m.player.respawnUntil) {
          const item = this.pickups.find(
            (k) => Math.hypot(k.x - m.player.x, k.y - m.player.y) < 30,
          );
          if (item) {
            m.player.power = item.kind;
            this.pickups = this.pickups.filter((k) => k.id !== item.id);
            this.emit('pickup', m.player);
          }
        }
    }
  }
  snapshot(): Snapshot {
    return {
      code: this.code,
      host: this.host,
      public: this.isPublic,
      settings: { ...this.settings },
      phase: this.phase,
      now: this.now,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      stage: this.stage,
      players: [...this.members.values()].map((m) => ({ ...m.player })),
      bombs: this.bombs.map((b) => ({
        id: b.id,
        owner: b.owner,
        danger: Math.min(
          3,
          Math.floor((1 - (b.detonatesAt - this.now) / (b.detonatesAt - b.assignedAt)) * 4),
        ),
      })),
      pickups: this.pickups.map((p) => ({ ...p })),
      events: [...this.events],
      results: this.results,
    };
  }
}
export function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[randomInt(chars.length)]).join('');
}
