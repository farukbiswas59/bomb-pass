import { describe, it, expect } from 'vitest';
import { Room } from '../server/engine';
import {
  ARENA,
  DEFAULT_SETTINGS,
  STEP,
  SPEED,
  BOT_SPEED,
  TAG_RANGE,
  tagTargets,
  advancePlayer,
  blocked,
  idleInput,
  move,
  type Settings,
} from '../shared/game';
import { inputSchema, settingsSchema, cleanName, RateLimit } from '../server/validation';
function match(count = 2, settings: Partial<Settings> = {}) {
  const r = new Room('ABCDE', false, { ...DEFAULT_SETTINGS, ...settings }, 1000, () => 0.4);
  for (let i = 0; i < count; i++) r.add(`P${i}`, `socket${i}`);
  r.start();
  r.tick(r.startsAt);
  return r;
}
function setupTag() {
  const r = match();
  const [a, b] = [...r.members.values()];
  const bomb = r.bombs[0];
  bomb.owner = a.player.id;
  Object.assign(a.player, { x: 280, y: 350, dx: 1, dy: 0, protectedUntil: 0 });
  Object.assign(b.player, { x: 325, y: 350, protectedUntil: 0 });
  return { r, a, b, bomb };
}
describe('authoritative simulation', () => {
  it('assigns one random bomb, with a private 8–14 second fuse', () => {
    const r = match();
    expect(r.bombs).toHaveLength(1);
    expect(r.bombs[0].detonatesAt - r.now).toBeGreaterThanOrEqual(8000);
    expect(r.bombs[0].detonatesAt - r.now).toBeLessThanOrEqual(14000);
    const s = JSON.stringify(r.snapshot());
    expect(s).not.toContain('detonatesAt');
    expect(s).not.toContain('token');
    expect(s).not.toContain('heldAt');
  });
  it('overlap alone cannot pass; a forward tag can', () => {
    const { r, a, b, bomb } = setupTag();
    r.tick(r.now + STEP);
    expect(bomb.owner).toBe(a.player.id);
    r.input(a.player.id, { ...idleInput(1), x: 1, tag: true });
    r.tick(r.now + STEP);
    expect(bomb.owner).toBe(b.player.id);
    expect(a.player.passes).toBe(1);
    expect(b.player.protectedUntil).toBe(r.now + 800);
  });
  it('receiving blocks return tags for 800ms', () => {
    const { r, a, b, bomb } = setupTag();
    r.input(a.player.id, { ...idleInput(1), x: 1, tag: true });
    r.tick(r.now + STEP);
    Object.assign(b.player, { dx: -1, dy: 0 });
    r.input(b.player.id, { ...idleInput(1), x: -1, tag: true });
    r.tick(r.now + STEP);
    expect(bomb.owner).toBe(b.player.id);
    expect(b.player.tagUntil).toBe(0);
  });
  it('cannot tag through a wall or beyond reach', () => {
    const { r, a, b, bomb } = setupTag();
    a.player.tagUntil = r.now + 260;
    Object.assign(a.player, { x: 70, y: 330, dx: 0, dy: 1 });
    Object.assign(b.player, { x: 70, y: 390 });
    r.tag(a);
    expect(bomb.owner).toBe(a.player.id);
    Object.assign(a.player, { x: 280, y: 350, dx: 1, dy: 0 });
    Object.assign(b.player, { x: 480, y: 350 });
    r.tag(a);
    expect(bomb.owner).toBe(a.player.id);
  });
  it('one stationary tap selects the nearest valid rival regardless of facing', () => {
    const { r, a, b, bomb } = setupTag();
    a.player.dx = -1;
    const start = { x: a.player.x, y: a.player.y };
    const farther = { ...b.player, id: 'farther', x: a.player.x + TAG_RANGE };
    expect(
      tagTargets(a.player, [farther, b.player], r.bombs, 'ffa', r.now).map((p) => p.id),
    ).toEqual([b.player.id, farther.id]);
    r.input(a.player.id, { ...idleInput(1), tag: true });
    r.tick(r.now + STEP);
    expect(bomb.owner).toBe(b.player.id);
    expect(a.player).toMatchObject(start);
    expect(a.player.passes).toBe(1);
    for (let i = 0; i < 30; i++) r.tick(r.now + STEP);
    expect(a.player.passes).toBe(1);
  });
  it('buffers one tap near cooldown/protection expiry without requiring another tap', () => {
    for (const field of ['tagReady', 'protectedUntil'] as const) {
      const { r, a, b, bomb } = setupTag();
      a.player[field] = r.now + 150;
      r.input(a.player.id, { ...idleInput(1), tag: true });
      r.tick(r.now + STEP);
      expect(bomb.owner).toBe(a.player.id);
      for (let i = 0; i < 5; i++) r.tick(r.now + STEP);
      expect(bomb.owner).toBe(b.player.id);
      expect(a.player.tagQueuedUntil).toBe(0);
    }
  });
  it('expires a premature tap instead of firing much later', () => {
    const { r, a, bomb } = setupTag();
    a.player.protectedUntil = r.now + 800;
    r.input(a.player.id, { ...idleInput(1), tag: true });
    for (let i = 0; i < 30; i++) r.tick(r.now + STEP);
    expect(bomb.owner).toBe(a.player.id);
    expect(a.player.tagUntil).toBe(0);
    expect(a.player.tagQueuedUntil).toBe(0);
  });
  it('retains a single action when later movement fills the input queue', () => {
    const { r, a, b, bomb } = setupTag();
    r.input(a.player.id, { ...idleInput(1), tag: true });
    for (let seq = 2; seq < 100; seq++) r.input(a.player.id, idleInput(seq));
    r.tick(r.now + STEP);
    expect(bomb.owner).toBe(b.player.id);
    expect(a.player.passes).toBe(1);
    expect(a.queue.length).toBeLessThanOrEqual(4);
  });
  it('ignores joystick drift and preserves steering during a tag', () => {
    const { r, a } = setupTag();
    advancePlayer(a.player, { ...idleInput(), x: 0.03, y: -0.03 }, r.now);
    expect(a.player.x).toBe(280);
    expect(a.player.y).toBe(350);
    advancePlayer(a.player, { ...idleInput(), tag: true, y: 1 }, r.now + STEP);
    expect(a.player.x).toBe(280);
    expect(a.player.y).toBeCloseTo(350 + SPEED / 30);
    advancePlayer(a.player, { ...idleInput(), x: -1 }, r.now + 2 * STEP);
    expect(a.player.x).toBeCloseTo(280 - SPEED / 30);
    expect(a.player.y).toBeCloseTo(350 + SPEED / 30);
  });
  it('marks only eligible opponents and uses the exact server reach', () => {
    const { r, a, b } = setupTag();
    const targets = () => tagTargets(a.player, [a.player, b.player], r.bombs, 'ffa', r.now);
    b.player.x = a.player.x + TAG_RANGE;
    expect(targets()).toEqual([b.player]);
    b.player.x += 0.01;
    expect(targets()).toEqual([]);
    b.player.x = 325;
    for (const field of ['protectedUntil', 'shieldUntil', 'respawnUntil'] as const) {
      b.player[field] = r.now + 1;
      expect(targets()).toEqual([]);
      b.player[field] = 0;
    }
    b.player.afk = true;
    expect(targets()).toEqual([]);
    b.player.afk = false;
    b.player.connected = false;
    expect(targets()).toEqual([]);
    b.player.connected = true;
    expect(tagTargets(a.player, [b.player], r.bombs, 'teams', r.now)).toEqual([]);
    Object.assign(a.player, { x: 70, y: 330 });
    Object.assign(b.player, { x: 70, y: 390 });
    expect(targets()).toEqual([]);
    r.bombs = [];
    expect(targets()).toEqual([]);
  });
  it('bots run slower, wait before tagging, and lose their reaction progress when dodged', () => {
    const { r, a, b } = setupTag();
    a.player.bot = true;
    const start = a.player.x;
    advancePlayer(a.player, { ...idleInput(), x: 1 }, r.now);
    expect(a.player.x - start).toBeCloseTo((SPEED * BOT_SPEED) / 30);
    expect(r.botInput(a).tag).toBe(false);
    r.now += 400;
    expect(r.botInput(a).tag).toBe(false);
    r.now += 201;
    expect(r.botInput(a).tag).toBe(true);
    b.player.x = 500;
    expect(r.botInput(a).tag).toBe(false);
    b.player.x = 325;
    expect(r.botInput(a).tag).toBe(false);
    r.now += 601;
    expect(r.botInput(a).tag).toBe(true);
  });
  it('expiry wins over a same-tick tag, costs life and preserves danger-mode play', () => {
    const { r, a, b, bomb } = setupTag();
    a.player.lives = 1;
    bomb.detonatesAt = r.now + STEP;
    r.input(a.player.id, { ...idleInput(1), x: 1, tag: true });
    r.tick(r.now + STEP);
    expect(a.player.lives).toBe(0);
    expect(a.player.exploded).toBe(1);
    expect(b.player.lives).toBe(5);
    expect(r.members.size).toBe(2);
    expect(r.bombs).toHaveLength(0);
    r.tick(r.now + 1500);
    expect(r.bombs).toHaveLength(1);
  });
  it('credits the last passer when the target explodes', () => {
    const { r, a, b, bomb } = setupTag();
    r.input(a.player.id, { ...idleInput(1), x: 1, tag: true });
    r.tick(r.now + STEP);
    bomb.detonatesAt = r.now + STEP;
    r.tick(r.now + STEP);
    expect(a.player.caused).toBe(1);
    expect(a.player.points).toBe(7);
    expect(b.player.lives).toBe(4);
  });
  it('spawns two then three distinct bombs in a six-player endgame', () => {
    const r = match(6);
    r.bombs = [];
    for (const m of r.members.values()) m.lastActive = r.startsAt + 111000;
    r.tick(r.startsAt + 91000);
    r.tick(r.now + STEP);
    expect(r.bombs).toHaveLength(2);
    r.bombs = [];
    r.tick(r.startsAt + 111000);
    r.tick(r.now + STEP);
    r.tick(r.now + STEP);
    expect(r.bombs).toHaveLength(3);
    expect(new Set(r.bombs.map((b) => b.owner)).size).toBe(3);
  });
  it('retains a valid pass target for duels', () => {
    const r = match();
    r.bombs = [];
    for (const m of r.members.values()) m.lastActive = r.startsAt + 111000;
    r.tick(r.startsAt + 111000);
    r.tick(r.now + STEP);
    expect(r.bombs).toHaveLength(1);
  });
  it('balances 5v5 and rejects teammates as targets', () => {
    const r = match(10, { mode: 'teams' });
    expect([...r.members.values()].filter((m) => m.player.team === 0)).toHaveLength(5);
    const [a, , b] = [...r.members.values()];
    const bomb = r.bombs[0];
    bomb.owner = a.player.id;
    Object.assign(a.player, {
      x: 280,
      y: 350,
      dx: 1,
      dy: 0,
      protectedUntil: 0,
      tagUntil: r.now + 200,
    });
    Object.assign(b.player, { x: 320, y: 350, protectedUntil: 0 });
    r.tag(a);
    expect(bomb.owner).toBe(a.player.id);
  });
  it('enforces capacity and lobby-only admission', () => {
    const r = new Room('ABCDE', false, { ...DEFAULT_SETTINGS, maxPlayers: 2 });
    r.add('a', 'a');
    r.add('b', 'b');
    expect(() => r.add('c', 'c')).toThrow('full');
    r.start();
    expect(() => r.add('d', 'd')).toThrow('started');
  });
  it('stops simulation at timeout and resolves lives then points', () => {
    const r = match();
    const [a, b] = [...r.members.values()];
    a.player.lives = 4;
    a.player.points = 100;
    b.player.lives = 5;
    r.tick(r.endsAt);
    expect(r.phase).toBe('results');
    expect(r.results?.winners).toEqual([b.player.id]);
    const x = a.player.x;
    r.input(a.player.id, { ...idleInput(1), x: 1 });
    r.tick(r.now + 1000);
    expect(a.player.x).toBe(x);
  });
  it('resolves team totals and honest ties', () => {
    const r = match(4, { mode: 'teams' });
    r.tick(r.endsAt);
    expect(r.results?.draw).toBe(true);
    expect(r.results?.winningTeam).toBeNull();
    r.start();
    const p = [...r.members.values()][0].player;
    p.points = 3;
    r.tick(r.endsAt);
    expect(r.results?.winningTeam).toBe(0);
  });
  it('rematch resets lives, bombs, scores and powers', () => {
    const r = match();
    const p = [...r.members.values()][0].player;
    p.lives = 0;
    p.points = 99;
    p.power = 'shield';
    r.tick(r.endsAt);
    r.start();
    expect(p.lives).toBe(5);
    expect(p.points).toBe(0);
    expect(p.power).toBeNull();
    expect(r.bombs).toHaveLength(0);
    expect(r.phase).toBe('countdown');
  });
  it('dash and knockback cannot tunnel through obstacles', () => {
    const p = { x: 60, y: 180 };
    move(p, 450, 0);
    expect(p.x).toBeLessThanOrEqual(90);
    expect(blocked(p.x, p.y)).toBe(false);
    const r = match();
    const a = [...r.members.values()][0].player;
    Object.assign(a, { x: 60, y: 180, dx: 1, dy: 0 });
    for (let i = 0; i < 10; i++)
      advancePlayer(a, { ...idleInput(), x: 1, dash: i === 0 }, r.now + i * STEP);
    expect(a.x).toBeLessThanOrEqual(90);
  });
  it('diagonal movement is normalized and packet floods do not increase speed', () => {
    const r = match();
    const a = [...r.members.values()][0];
    Object.assign(a.player, { x: 280, y: 300, protectedUntil: 0 });
    for (let seq = 1; seq <= 100; seq++) r.input(a.player.id, { ...idleInput(seq), x: 1, y: 1 });
    const before = { x: a.player.x, y: a.player.y };
    r.tick(r.now + STEP);
    expect(Math.hypot(a.player.x - before.x, a.player.y - before.y)).toBeCloseTo(SPEED / 30, 4);
    expect(a.queue.length).toBeLessThanOrEqual(4);
  });
  it('drops stale input and never repeats action flags', () => {
    const r = match();
    const a = [...r.members.values()][0];
    r.input(a.player.id, { ...idleInput(2), x: 1, dash: true });
    r.input(a.player.id, { ...idleInput(1), x: -1 });
    r.tick(r.now + STEP);
    expect(a.player.ack).toBe(2);
    expect(a.latest.dash).toBe(false);
    r.tick(r.now + 4000);
    expect(a.player.dashReady).toBeLessThan(r.now);
  });
  it('disconnect immobilizes player, reassigns host, and removal clears owned bomb', () => {
    const { r, a, b, bomb } = setupTag();
    a.player.connected = false;
    r.rehost();
    expect(r.host).toBe(b.player.id);
    r.input(a.player.id, { ...idleInput(1), x: 1 });
    const x = a.player.x;
    r.tick(r.now + STEP);
    expect(a.player.x).toBe(x);
    r.remove(a.player.id);
    expect(r.bombs.find((b) => b.id === bomb.id)).toBeUndefined();
  });
  it('validates pickups and shield immunity on the server', () => {
    const { r, a, b, bomb } = setupTag();
    r.settings.powerups = true;
    r.pickups = [{ id: 's', kind: 'shield', x: b.player.x, y: b.player.y }];
    r.tick(r.now + STEP);
    expect(b.player.power).toBe('shield');
    r.usePower(b.player);
    a.player.tagUntil = r.now + 200;
    r.tag(a);
    expect(bomb.owner).toBe(a.player.id);
    expect(b.player.power).toBeNull();
  });
  it('AFK targets cannot be farmed for pass points', () => {
    const { r, a, b, bomb } = setupTag();
    b.player.afk = true;
    a.player.tagUntil = r.now + 200;
    r.tag(a);
    expect(bomb.owner).toBe(a.player.id);
  });
  it('awards danger bonus only for an additional explosion at zero lives', () => {
    const { r, a, b, bomb } = setupTag();
    bomb.owner = b.player.id;
    bomb.from = a.player.id;
    b.player.lives = 1;
    r.explode(bomb);
    expect(a.player.points).toBe(5);
    r.bombs.push(bomb);
    r.explode(bomb);
    expect(a.player.points).toBe(13);
  });
  it('includes an unfinished bomb hold in the final survival statistic', () => {
    const r = match();
    const bomb = r.bombs[0],
      p = r.members.get(bomb.owner)!.player;
    r.now += 1200;
    r.finish();
    expect(r.results?.rows.find((row) => row.id === p.id)?.longest).toBe(1200);
  });
});
describe('input safety', () => {
  it('rejects forged positions, scores, nonfinite and oversized input', () => {
    expect(inputSchema.safeParse({ ...idleInput(), x: NaN }).success).toBe(false);
    expect(inputSchema.safeParse({ ...idleInput(), x: 100 }).success).toBe(false);
    expect(inputSchema.safeParse({ ...idleInput(), lives: 99 }).success).toBe(false);
    expect(inputSchema.safeParse({ ...idleInput(), position: { x: 100, y: 100 } }).success).toBe(
      false,
    );
  });
  it('rejects impossible room configurations and strips markup', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxPlayers: 11 }).success).toBe(false);
    expect(cleanName('<script>alert(1)</script>')).not.toContain('<');
    expect(cleanName('fuck')).toBe('PanicMode');
  });
  it('bounds action bursts and refills with elapsed time', () => {
    const l = new RateLimit(2, 1, 0);
    expect(l.take(0)).toBe(true);
    expect(l.take(0)).toBe(true);
    expect(l.take(0)).toBe(false);
    expect(l.take(1000)).toBe(true);
  });
});
