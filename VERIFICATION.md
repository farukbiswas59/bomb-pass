# Ads, Wi-Fi and Android update — 26 September 2026

Verified on macOS with the bundled Node runtime and headless Chromium:

| Check                                                                           | Result                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| TypeScript and production client/server build                                   | Pass                                                |
| Capacitor Android asset/plugin sync                                             | Pass                                                |
| Simulation, Socket.IO, endpoint validation and LAN origin rules                 | 33 tests passed                                     |
| Browser gameplay, mobile touch, latency, LAN selection/recovery and ad settings | 7 tests passed                                      |
| Built Wi-Fi host on a private network address                                   | Pass                                                |
| Mobile browser match with external HTTP requests blocked                        | Pass; no external assets requested                  |
| APK compilation                                                                 | Pass: Gradle `assembleDebug`, 125 tasks executed    |
| APK signature and ZIP alignment                                                 | Pass: APK Signature Scheme v2 and `zipalign` checks |
| Native ad rendering and physical Android devices                                | Not verified                                        |

Two independent browser contexts joined one room through the computer's private IPv4 address. The client resumed after a browser offline signal (including `navigator.onLine = false`) and after reload. This checks local transport recovery, not a physical router disconnection. The built LAN host served all fonts and game assets locally.

The update also scopes saved player sessions to their chosen server and sends only room code/token when resuming. Browser test ads are labelled placeholders; Android is configured with Google's demo banner and app IDs. No live monetization or public deployment was performed.

After the user accepted Google's Android SDK license, the APK was compiled using Java 21, Gradle 8.14.3, Android Gradle Plugin 8.13.0, Android SDK Platform 36 and Build Tools 35. The Gradle distribution was checked against its official SHA-256 checksum. The delivered file is `outputs/bomb-pass-0.2-test.apk`.

Package inspection confirmed `com.bombpass.game`, version `0.2-test` (code 1), minimum API 24, target API 36, the BOMB PASS launcher activity, the AdMob plugin, Google's demo app ID, and local HTTP support for Wi-Fi hosts. The APK has a valid Android debug signature. It is an installable test build, not a store-signed release.

APK SHA-256: `ec9bb44f3a9622d0eb59cdf31024cdea24df6ecd7fbfd0f48798ea9695f6f124`.

No physical Android device or emulator was used. Installation, launch, native ad rendering and actual phone-to-phone gameplay through a computer host still need device verification. See [ANDROID-AND-WIFI.md](ANDROID-AND-WIFI.md).

# Original MVP verification — 17 September 2026

Verified locally on macOS using Node 24 and headless Chromium. The live preview was also inspected in the Codex browser with two independent guest players.

| Check                                   | Result          |
| --------------------------------------- | --------------- |
| TypeScript validation                   | Pass            |
| Production client and Node server build | Pass            |
| Code formatting                         | Pass            |
| Frozen-lockfile dependency installation | Pass            |
| Game simulation / input validation      | 24 tests passed |
| Real Socket.IO integration              | 5 tests passed  |
| Browser gameplay / networking / touch   | 4 tests passed  |
| Built server smoke check                | Pass            |

The simulation tests cover bomb assignment, private fuse serialization, directional passes, protection, walls, same-tick fuse expiry, life loss, danger scoring, bomb replacement, multiple bombs, team balance, room capacity, timeout, winners/ties, rematch, collision substeps, normalized movement, flood limits, disconnects, shields/pickups, AFK targets and held-bomb survival statistics.

Integration tests exercise real local sockets, ten connected clients, shared snapshots, host authorization, capacity, hostile input, reserved-seat resume, expiry and host migration.

Browser tests exercise:

- Two independent browser contexts playing a complete 60-second match with a labelled bot, seeing each other's movement, reloading/reconnecting, reaching results and rematching.
- Moving a guest session to another tab while allowing the original tab to join a new game.
- Real browser touch dispatch with one finger holding the joystick and another pressing TAG, then DASH, followed by pointer cancellation.
- 375×667 and 320×568 portrait layouts and 844×390 landscape: no horizontal overflow, controls remain in view, arena proportions remain intact.
- 75 ms delay in each direction on the WebSocket, confirmed by the ping measurement: movement predicts immediately and converges to the server position after stopping.

The built production server was started separately and checked for static room-link routing, health response, successful real player admission from a configured origin, and rejection of an unlisted origin.

One bug found during verification was that a disconnected browser could wait for the transport heartbeat before showing recovery UI. The fix handles offline/online events immediately and reconnects when room snapshots stop arriving. A regression test now covers the offline/online path.

## Not verified or not delivered

- Physical iPhone/Android/Samsung devices, measured mobile frame rates and battery/thermal behavior.
- WebKit/Safari/Firefox automated runs.
- Public internet deployment, multi-server scaling, long-running load/soak tests or production monitoring.
- Docker image execution; the included Dockerfile is a deployment recipe.

The public-release checklist and deployment instructions are in README.md. This is a core gameplay MVP, with simple functional visuals and procedural audio.
