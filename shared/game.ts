export const STEP = 1000 / 30;
export const RADIUS = 15;
export const SPEED = 180;
export const RECONNECT_MS = 20_000;
export const COLORS = [
  '#beff55',
  '#65dfff',
  '#ff6b9d',
  '#c39aff',
  '#ffaf59',
  '#fff17b',
  '#5df5bb',
  '#819fff',
  '#ff7b6b',
  '#e4aaff',
];
export type Rect = { x: number; y: number; w: number; h: number };
export const ARENA = {
  id: 'neon-yard',
  width: 600,
  height: 720,
  obstacles: [
    { x: 105, y: 140, w: 105, h: 100 },
    { x: 390, y: 140, w: 105, h: 100 },
    { x: 105, y: 480, w: 105, h: 100 },
    { x: 390, y: 480, w: 105, h: 100 },
    { x: 30, y: 345, w: 90, h: 30 },
    { x: 480, y: 345, w: 90, h: 30 },
  ] as Rect[],
  spawns: [
    { x: 300, y: 95 },
    { x: 300, y: 625 },
    { x: 70, y: 275 },
    { x: 530, y: 445 },
    { x: 530, y: 275 },
    { x: 70, y: 445 },
    { x: 220, y: 360 },
    { x: 380, y: 360 },
    { x: 60, y: 70 },
    { x: 540, y: 650 },
  ],
};
export type Settings = {
  mode: 'ffa' | 'teams';
  duration: 60 | 120 | 180;
  maxPlayers: number;
  lives: 3 | 5 | 7;
  powerups: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  mode: 'ffa',
  duration: 120,
  maxPlayers: 10,
  lives: 5,
  powerups: false,
};
export type Input = {
  seq: number;
  x: number;
  y: number;
  tag: boolean;
  dash: boolean;
  power: boolean;
};
export type Power = 'shield' | 'freeze' | 'super';
export type Player = {
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
  connected: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  lives: number;
  points: number;
  passes: number;
  caused: number;
  exploded: number;
  longest: number;
  ack: number;
  shieldUntil: number;
  protectedUntil: number;
  tagUntil: number;
  tagReady: number;
  dashUntil: number;
  dashReady: number;
  dashX: number;
  dashY: number;
  slowUntil: number;
  respawnUntil: number;
  power: Power | null;
  superUntil: number;
  emote: string;
  emoteUntil: number;
  afk: boolean;
};
export type BombView = { id: string; owner: string; danger: number };
export type Pickup = { id: string; x: number; y: number; kind: Power };
export type GameEvent = {
  id: number;
  type: 'pass' | 'explode' | 'dash' | 'tag' | 'pickup' | 'power';
  x: number;
  y: number;
  player: string;
  target?: string;
};
export type Results = {
  winners: string[];
  winningTeam: number | null;
  draw: boolean;
  mvp: string;
  rows: Player[];
};
export type Snapshot = {
  code: string;
  host: string;
  public: boolean;
  settings: Settings;
  phase: 'lobby' | 'countdown' | 'playing' | 'results';
  now: number;
  startsAt: number;
  endsAt: number;
  stage: 'WARM UP' | 'PASS IT ON' | 'HEATING UP' | 'DOUBLE TROUBLE' | 'FINAL CHAOS';
  players: Player[];
  bombs: BombView[];
  pickups: Pickup[];
  events: GameEvent[];
  results: Results | null;
};
export type Reply = {
  ok: boolean;
  error?: string;
  id?: string;
  token?: string;
  snapshot?: Snapshot;
};
export const idleInput = (seq = 0): Input => ({
  seq,
  x: 0,
  y: 0,
  tag: false,
  dash: false,
  power: false,
});

export function normalized(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
export function blocked(x: number, y: number, radius = RADIUS) {
  return ARENA.obstacles.some(
    (o) =>
      Math.hypot(
        x - Math.max(o.x, Math.min(x, o.x + o.w)),
        y - Math.max(o.y, Math.min(y, o.y + o.h)),
      ) < radius,
  );
}
// Substeps prevent tunnelling through thin walls even during a dash or knockback.
export function move(p: { x: number; y: number }, mx: number, my: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / (RADIUS / 2)));
  for (let i = 0; i < steps; i++) {
    const x = Math.max(RADIUS, Math.min(ARENA.width - RADIUS, p.x + mx / steps));
    if (!blocked(x, p.y)) p.x = x;
    const y = Math.max(RADIUS, Math.min(ARENA.height - RADIUS, p.y + my / steps));
    if (!blocked(p.x, y)) p.y = y;
  }
}
export function lineOfSight(a: { x: number; y: number }, b: { x: number; y: number }) {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 5);
  for (let i = 1; i < steps; i++)
    if (blocked(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, 1)) return false;
  return true;
}
// Shared deterministic movement. Client predicts only this; outcomes remain on server.
export function advancePlayer(p: Player, input: Input, now: number, dt = STEP) {
  if (now < p.respawnUntil) return;
  const v = normalized(input.x, input.y);
  if (Math.hypot(v.x, v.y) > 0.08) {
    const l = Math.hypot(v.x, v.y);
    p.dx = v.x / l;
    p.dy = v.y / l;
  }
  if (input.dash && now >= p.dashReady) {
    p.dashReady = now + 3000;
    p.dashUntil = now + (p.superUntil > now ? 270 : 160);
    p.dashX = p.dx;
    p.dashY = p.dy;
  }
  if (input.tag && now >= p.tagReady && now >= p.protectedUntil) {
    p.tagReady = now + 650;
    p.tagUntil = now + 240;
  }
  const dash = now < p.dashUntil,
    lunge = now < p.tagUntil;
  const speed = (dash ? 650 : lunge ? 260 : SPEED) * (now < p.slowUntil ? 0.45 : 1);
  move(
    p,
    ((dash ? p.dashX : lunge ? p.dx : v.x) * speed * dt) / 1000,
    ((dash ? p.dashY : lunge ? p.dy : v.y) * speed * dt) / 1000,
  );
}
