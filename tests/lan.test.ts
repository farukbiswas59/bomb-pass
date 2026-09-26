import { it, expect } from 'vitest';
import { io } from 'socket.io-client';
import { createGameServer } from '../server/app';

it('LAN host accepts APK and private-network origins, rejects public web origins', async () => {
  const game = createGameServer({ production: true, lan: true });
  await new Promise<void>((resolve) => game.http.listen(0, '127.0.0.1', resolve));
  const port = (game.http.address() as { port: number }).port;
  try {
    for (const origin of [
      'http://localhost',
      'http://192.168.1.9:3001',
      'http://172.20.5.4:3001',
    ]) {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        extraHeaders: { Origin: origin },
        reconnection: false,
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const joined = await new Promise<any>((resolve) =>
        socket.emit('join', { kind: 'quick', name: 'WiFi' }, resolve),
      );
      expect(joined.ok).toBe(true);
      socket.disconnect();
    }
    const bad = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      extraHeaders: { Origin: 'https://unlisted.example' },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      bad.once('connect', () => reject(new Error('Public origin must be rejected')));
      bad.once('connect_error', () => resolve());
    });
    bad.disconnect();
  } finally {
    await game.close();
  }
});
