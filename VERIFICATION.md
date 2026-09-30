# Physics, tagging and Android package update — 26 September 2026

Version `0.3.0-test` (version code 4), package `com.bombpass.farukbiswas`.

Implemented reliable action packets, preservation of taps across bounded queue overflow, a 220 ms cooldown/protection input buffer, nearest-eligible-target assistance within 78 arena units and a 260 ms active window. Tagging no longer forces movement; a small joystick deadzone prevents drift. Server validation still enforces walls, range, protection, shields and opposing teams. Bots move at 82% of human speed and use slower movement decisions and 450–600 ms tag reactions. Green TAG markers share the server eligibility rules; cooldown/protection feedback stays visible on phones.

Verification passed:

- TypeScript, production client/server builds, Capacitor sync and Gradle debug APK compilation.
- 41 simulation, real Socket.IO, connection and LAN tests, including one-tap passes, nearest-target selection, cooldown buffering, expired inputs, overflow retention, drift/steering, eligibility and bot reactions.
- All 8 browser scenarios passed: full match/rematch, recovery, mobile multitouch/cancel/orientation, 150 ms latency, LAN, ads, connection selection and the new real touch test. The touch/marker test uses an isolated server, briefly makes the transport busy, taps once and verifies exactly one authoritative pass without moving the player. It also checks the mobile WAIT label. The two affected mobile tests were rerun after the final label fix and passed.
- Screenshot `test-results/mobile-tag-marker.png` inspected at 375×667.
- APK signature, ZIP alignment, package/version and SDK metadata checked. The package change installs this as a separate app from the previous `com.bombpass.game` APK.

APK SHA-256: `4618222c2c0c49571a84a36eefa9d769a1f4e2dcb0e1aafb21b8f07d59c2d879`.

The matching source must be deployed to Render for these server-side rules to apply to online play. This verification covers local servers; this gameplay revision has not yet been published to GitHub/Render. The previously approved live CORS configuration remains unchanged. Ads remain Google's demo units. Physical Android installation, gameplay and native ads are not yet device-tested. This is a debug build, not a signed Play Store release.

# Live connection fix — 26 September 2026

The Render service previously allowed only `https://bomb-pass-puce.vercel.app`, producing HTTP 403 for the Android origin and the service's own website. Following explicit user approval, `ALLOWED_ORIGINS` was changed to `https://bomb-pass-puce.vercel.app,https://bomb-pass-ugre.onrender.com,http://localhost` and deployed. Render reported deployment `dep-darsfqm0tbcc73csdjj0` live. No source commit, hosting-plan upgrade or wildcard origin was needed.

Post-deploy live checks passed for all three origins. Two Socket.IO clients using the APK's `http://localhost` origin joined a private room, started a match and received playing snapshots. A separate two-context Chromium check loaded the actual production frontend at that same origin, enforcing browser CORS, and joined/started a match against Render. Test players left their rooms afterward. An unlisted website origin still returned HTTP 403.

APK `0.2.2-test` (version code 3) retains the default Render endpoint and adds a 65-second online connection timeout plus clearer startup/rejection messages. Wi-Fi attempts retain their 5-second timeout. TypeScript, production builds, Capacitor sync and Gradle packaging passed. Signature and alignment checks passed; the certificate matches prior APKs. SHA-256: `49b1982953d36e5d13987e9eca33bd69d6f846a5af1a84ab428fa4145ce6bfe8`.

AdMob remains in demo mode. [ADMOB-PLAY-STORE.md](ADMOB-PLAY-STORE.md) documents the account and release work still required; no live IDs, consent flow or store signing credentials were added. Physical Android installation, gameplay and native ad display still need device testing.

Regression verification: 33 simulation/network tests and all 7 browser tests passed, including mobile multitouch, a complete match/rematch, simulated latency, LAN recovery and ad preferences. The local development proxy was restarted after its configuration had been disrupted by earlier file/dependency replacement. The LAN check now recognizes all supported private IPv4 ranges, including the current 10.x network. Formatting and TypeScript checks passed.

# Default backend update — 26 September 2026 (before the live fix above)

Version `0.2.1-test` (version code 2) bundles `https://bomb-pass-ugre.onrender.com` as the default online backend through `.env.production`. Development uses the local proxy, private-network browser hosts keep LAN mode, and saved server preferences still take priority.

TypeScript, the production web/server build, Capacitor sync and Gradle `:app:assembleDebug` passed. A production Chromium smoke check verified the displayed default, initial connection target, online address prefill and Wi-Fi selector. External requests were intercepted in this UI check; it does not establish successful multiplayer admission.

The delivered `outputs/bomb-pass-0.2.1-test.apk` passed signature and ZIP alignment checks. Its package metadata is `com.bombpass.game`, code 2, minimum API 24 and target API 36. Its signing certificate matches the earlier APK, and inspection of the packaged JavaScript confirmed the requested URL. SHA-256: `4cd59bfa0aa635a7b34152a9b3980cb6647e71c2cc2a6d260401255d865d61e7`.

The live backend `/health` returned `{"ok":true,"rooms":0}`, but its Socket.IO endpoint returned HTTP 403 (`Forbidden`) for `Origin: http://localhost`, the APK's WebView origin. The backend operator must append `http://localhost` to the existing `ALLOWED_ORIGINS` and restart/redeploy the service before the APK can connect. No Render settings were changed. Physical Android testing remains outstanding.

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
