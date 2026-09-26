import { createGameServer } from './app.js';
try {
  process.loadEnvFile();
} catch {
  /* Environment may be supplied by the host. */
}
const production = process.env.NODE_ENV === 'production';
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
if (production && !origins.length)
  throw new Error('Set ALLOWED_ORIGINS to the frontend origin before starting in production.');
const game = createGameServer({
  production,
  origins,
  maxRooms: Number(process.env.MAX_ROOMS) || 200,
});
const port = Number(process.env.PORT) || 3001;
game.http.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`BOMB PASS server ready on port ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    game.io.emit('removed', 'Server restarting. Please join again shortly.');
    void game.close().then(() => process.exit(0));
  });
