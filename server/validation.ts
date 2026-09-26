import { z } from 'zod';
export const settingsSchema = z
  .object({
    mode: z.enum(['ffa', 'teams']),
    duration: z.union([z.literal(60), z.literal(120), z.literal(180)]),
    maxPlayers: z.number().int().min(2).max(10),
    lives: z.union([z.literal(3), z.literal(5), z.literal(7)]),
    powerups: z.boolean(),
  })
  .strict();
export const inputSchema = z
  .object({
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    x: z.number().finite().min(-1).max(1),
    y: z.number().finite().min(-1).max(1),
    tag: z.boolean(),
    dash: z.boolean(),
    power: z.boolean(),
  })
  .strict();
export const joinSchema = z
  .object({
    name: z.string().max(40),
    kind: z.enum(['quick', 'create', 'join']),
    code: z
      .string()
      .regex(/^[A-Z2-9]{5}$/)
      .optional(),
    settings: settingsSchema.optional(),
  })
  .strict();
export const resumeSchema = z
  .object({ code: z.string().regex(/^[A-Z2-9]{5}$/), token: z.string().uuid() })
  .strict();
export function cleanName(raw: string) {
  const name = raw
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return !name || /fuck|shit|nigg|cunt|hitler/i.test(name) ? 'PanicMode' : name;
}
export class RateLimit {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private perSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now = Date.now()) {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) * this.perSecond) / 1000,
    );
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
