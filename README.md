# BOMB PASS — core multiplayer MVP

A playable, server-authoritative browser game. Two to ten real guests can join the same arena, move, dash, tag rivals to pass a hidden-fuse bomb, lose lives, and rematch. Bots are optional and always labelled **BOT**.

This delivery prioritizes networking, collision validation, and touch controls. It is a tested MVP, not a claim of production-scale readiness or completed art/audio direction.

**Android, Wi-Fi and ads update:** See [ANDROID-AND-WIFI.md](ANDROID-AND-WIFI.md) for the computer-hosted Wi-Fi mode (`npm run lan`), optional Google test ads, APK build instructions, and Android online-server configuration. Browser ads are labelled previews. Native ads use only Google's demo IDs.

## Run locally

Install Node.js 22 or later, then from this folder:

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Create a room, open its link in another tab/browser, join, then start. Or add a bot in the lobby to practice. Quick Play groups real guests and automatically starts after a short wait once at least two players join; it never invents human opponents.

For reproducible dependency installation, the supplied pnpm lockfile is supported:

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

On a phone on the **same Wi-Fi**, open `http://YOUR_COMPUTER_LAN_IP:5173`. Use that address on both devices before sharing links. Keep the computer and both local servers running; allow the development server through the computer firewall. Copy/share may be restricted by the browser on plain HTTP; the visible room code always works.

## What is implemented

- Private room codes and deep links, guest names, quick matchmaking, 2–10-player capacity, host-only start, automatic host migration.
- FFA and automatically balanced teams; 1/2/3-minute rounds, 3/5/7 lives, optional power-ups.
- One portrait arena with four large obstacles and two smaller barriers. Geometry and spawn points live in `shared/game.ts`.
- A 30 Hz authoritative simulation; 15 Hz snapshots; 30 Hz input; local prediction/reconciliation; remote player interpolation with a 100 ms buffer.
- Directional 240 ms tag lunge, wall/line-of-sight checks, 650 ms tag cooldown, 800 ms receive protection; 3-second dash cooldown.
- Secret 8–14-second fuse (shorter late in a round), coarse danger cues, life loss, short respawn, collision-checked knockback, 1.2-second bomb replacement delay.
- Double-bomb and three-bomb endgame scaled to duration and player count. Duels keep one bomb.
- Zero-life danger mode, lives-first winner calculation, points tiebreaker, shared ties, MVP and statistics, fast rematch.
- Separate pointer capture for the movement joystick; tag/dash work with another finger held on movement. Pointer cancel, blur and backgrounding clear input. Safe-area-aware, no-scroll gameplay, portrait and landscape layouts.
- Resume tokens scoped to a browser tab, 20-second reserved seats after disconnect, visible reconnect feedback, AFK warning at 30 seconds, removal from public matches after 45 seconds of inactivity.
- Optional shield, nearby freeze and super dash; server validates pickups and activation. Simple bots use the same inputs, movement, collisions and cooldowns as humans; they cannot read hidden fuses.
- Original procedural Web Audio music/SFX, started by interaction; persistent volume/mute/effects/haptics settings. No commercial audio or large art downloads.
- Desktop emotes with server rate limits; invite/result sharing with clipboard/code fallback.

## Controls and scoring

| Action         | Desktop                   | Touch         |
| -------------- | ------------------------- | ------------- |
| Move / face    | WASD or arrows            | Left joystick |
| Tag            | Space or left-click arena | TAG           |
| Dash           | Shift                     | DASH          |
| Use held power | E                         | Power button  |

Face an opponent and tag within range. Overlapping someone is insufficient. Teammates, existing bomb carriers, shielded/protected players, respawning players and AFK players cannot receive a tag. Players can move through one another; arena walls remain solid.

Most remaining lives wins; points resolve equal lives. Teams compare summed lives then summed points. A successful pass earns 2 points; a transfer in the last 1.5 seconds earns 1 extra; causing an explosion earns 5 (8 if the recipient was already at zero lives); each explosion costs 5. Zero lives never eliminates a casual player.

## Architecture and trust boundary

```text
client/  React menus/HUD, canvas renderer, input, audio, network prediction
server/  Room simulation, matchmaking, WebSocket validation and lifecycle
shared/  Types, constants, map geometry, deterministic movement/collision
tests/   Simulation, live Socket.IO integration, browser/multitouch checks
```

React handles menus and HUD; a small Canvas 2D renderer draws the arena directly. A custom shared movement implementation keeps server collision and client prediction identical without duplicating Phaser physics or shipping a second engine. No gameplay outcome is decided by the renderer.

Clients submit bounded direction/action inputs and monotonically increasing sequence numbers. Server ticks, not packet frequency or client elapsed time, determine movement. Input queues are capped; diagonal movement is normalized; dashes/knockback use short collision substeps to prevent tunnelling. Tags require a forward arc, distance, valid opponent and clear line of sight. Fuse expiry precedes tags on the same tick. Snapshots explicitly omit fuse deadlines, original fuse lengths and session secrets.

Socket messages use strict schemas, 4 KB payload limits, per-connection input/action budgets, admission limits and room capacity limits. Production rejects unlisted browser origins. Guest bearer tokens are random server-generated UUIDs kept in sessionStorage. A duplicated tab may inherit a session; resuming it moves that player to the new tab and informs the original one. Open a fresh tab/link or a separate browser context to play as another guest.

Networking reference: [Socket.IO server options](https://socket.io/docs/v4/server-options/). Touch reference: [MDN pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests launch the development servers if they are not running. They use isolated browser contexts and test actual Socket.IO connections. Coverage includes a full 60-second round and rematch, reload/offline recovery, simultaneous touch movement/tag/dash, pointer cancellation, 320×568 and 375×667 portrait plus 844×390 landscape, and a simulated 150 ms WebSocket round trip. They inspect the development client state as assertions; there are no gameplay test bypasses in the production server.

Manual device acceptance still matters:

1. Join one room from two physical phones on the same Wi-Fi. Start a match, hold the joystick and repeatedly alternate tag/dash with the other thumb.
2. Chase around all obstacle edges and corners; try tagging through each wall, tagging backwards, and immediately passing back.
3. Rotate both ways, background/foreground the tab, briefly disable Wi-Fi, and reload. Check that input stops when backgrounded and that a reconnect within 20 seconds preserves player ID/lives.
4. Test iPhone Safari, Android Chrome and Samsung Internet on physical devices. Check audio unlock, safe areas, browser gesture edges and thermal performance.
5. Run ten real devices/tabs through FFA and teams, including 5v5, the two-/three-bomb endgame, zero-life play and repeated rematches.

## Production deployment

### One persistent Node service (simplest)

The built server serves both static frontend files and Socket.IO. Use a service supporting **long-lived Node processes and WebSockets**, such as Render, Railway or Fly.io.

```sh
npm install
npm run build
NODE_ENV=production ALLOWED_ORIGINS=https://your-domain.example npm start
```

Set `PORT` if the host requires it (default 3001), `HOST=0.0.0.0`, and exact comma-separated `ALLOWED_ORIGINS`. Copy `.env.example` to `.env` for local configuration; never commit `.env`. Use HTTPS at the host's reverse proxy and forward WebSocket upgrades. `/health` is the health endpoint. The server shuts down on SIGTERM/SIGINT and warns clients; all rooms are in-memory and are lost on process restart.

### Separate frontend and realtime service

1. Deploy `server/` + `shared/` as the persistent service (the normal full build is also fine).
2. Build the frontend with `VITE_SERVER_URL=https://your-realtime-host.example`.
3. Publish **`dist/client`** to a static host such as Vercel; the included `vercel.json` rewrites room links to the SPA.
4. Add the frontend's exact HTTPS origin to the realtime server's `ALLOWED_ORIGINS`.
5. Confirm a two-device session on the public URL before inviting users.

Do **not** run Socket.IO inside a Vercel serverless function. Keep one server replica for this MVP. Multi-instance scaling needs room ownership/routing and shared session state; adding a Socket.IO Redis adapter alone does not distribute the authoritative game simulation.

The supplied Dockerfile is an alternative for persistent container hosts. Build from this directory and set `ALLOWED_ORIGINS` at runtime. It includes no secrets.

## Remaining before a wider release

- Physical iOS/Android testing and performance profiling; desktop emulation does not prove 60 FPS or gesture/audio behavior on a real phone.
- Soak/load tests, observability, durable/shared room infrastructure, multi-region routing and stronger edge abuse controls. Basic guest-name filtering is intentionally limited.
- Tuned bot navigation/difficulty, richer onboarding, additional maps/powers, professional art and richer music/animation. These were deferred in favor of the requested core.
- Reconciliation currently corrects directly and does not rewind tag hitboxes. Movement prediction is tested at 150 ms RTT, but tags use current server positions. At higher latency, visible close calls can disagree with server outcomes.
- No public deployment has been made by this delivery. A persistent hosting account and public domain/origin are needed to let remote friends join.
