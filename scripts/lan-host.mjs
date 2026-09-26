import { networkInterfaces } from 'node:os';
import { createGameServer } from '../dist/server/server/app.js';

const port = Number(process.env.PORT) || 3001;
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);
const game = createGameServer({ production: true, lan: true });
game.http.listen(port, '0.0.0.0', () => {
  console.log('\nBOMB PASS · SAME WI-FI HOST\n');
  console.log('Keep this computer awake and connect all players to the same Wi-Fi.');
  for (const ip of ips) console.log(`Phone browser / APK server address: http://${ip}:${port}`);
  console.log('Open one address, create a room, then share its code. No internet required.\n');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => void game.close().then(() => process.exit(0)));
