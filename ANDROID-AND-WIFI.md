# Android, same-Wi-Fi play, and test ads

This update adds an Android project for the existing multiplayer game, a server selector, a local network host command, and optional Google demo ads. The source lives in `outputs/bomb-pass`; the separate `bomb-pass 2` folder has not been edited.

## Install the delivered APK

The compiled test build is supplied separately as `bomb-pass-0.2-test.apk` in `outputs`. Transfer it to an Android 7.0 or newer phone, open it, and allow installation from the app you used to open the file if Android asks. The package is `com.bombpass.game`, version `0.2-test`.

Launch **BOMB PASS** and select a same-Wi-Fi host or your deployed online server. This APK does not have a public game server baked in. For Wi-Fi play, follow the computer-host steps below. Enable demo ads with **Settings → Test ads**; ads remain disabled in Wi-Fi mode.

The APK build, signature and alignment checks passed. This is a debug-signed test build; native installation, gameplay and ad rendering have not yet been tested on a physical phone. Build details and the APK checksum are in [VERIFICATION.md](VERIFICATION.md).

## Same-Wi-Fi play

One computer hosts the authoritative game server. Phones join using either the APK or their browser. The APK does **not** host the Node server on a phone; this version is not Wi-Fi Direct, Bluetooth, or phone-to-phone hosting.

On the host computer, install Node.js 22 or newer. From the project folder:

```sh
npm install
npm run lan
```

The terminal prints addresses such as `http://192.168.1.20:3001`. Keep that terminal open and the computer awake. Choose the address of the Wi-Fi adapter if several addresses are listed.

On each phone:

1. Connect to the same Wi-Fi as the computer.
2. In the APK, choose **SAME WI-FI / ONLINE SERVER → SAME WI-FI**, then enter `192.168.1.20:3001` using the actual address from the computer.
3. Alternatively, open the complete `http://…:3001` address directly in the phone browser.
4. One player creates a room. Everyone else joins with that room code.

After dependencies are installed and the frontend is built, matches do not require internet access. Fonts and interface assets are bundled locally. Test ads are disabled in Wi-Fi mode. The host needs firewall access for its chosen port (3001 by default). A guest network that isolates connected devices will prevent local play.

An HTTPS website cannot generally connect directly to a plain-HTTP Wi-Fi server; the web interface explains how to open the local address directly. The Android app is configured to permit the local HTTP connection. Its server selector restricts HTTP addresses to private IPv4 ranges; public online servers require HTTPS.

## Online play in the APK

Choose **ONLINE** in the server selector and enter the deployed server's HTTPS URL. Players must select the same server.

The persistent server must include the Android WebView origin in its allowed origins, for example:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://your-game.vercel.app,http://localhost
```

Do not add a trailing slash to either origin. This is needed only on your public backend; the dedicated Wi-Fi host already accepts the native app and private-network browser origins.

Optionally bake defaults into the web build before syncing Android:

```env
VITE_SERVER_URL=https://your-server.onrender.com
VITE_PUBLIC_URL=https://your-game.vercel.app
```

Without these values, the APK lets you choose a server. It contains the frontend assets but needs a running local or online multiplayer server to play.

## Test ads

Open **Settings → Test ads** to enable or disable ads. The choice is remembered on the device.

- Android uses the Capacitor community AdMob plugin and Google's official demo banner/app IDs, with test mode forced on.
- Browser builds show a clearly labelled **TEST AD PREVIEW**, not a real Google ad.
- Ads are shown only on the home/results screens, never in a lobby or active match, and never in Wi-Fi mode.
- A native banner needs internet access. Ad failure does not block playing.
- This build cannot earn advertising revenue and includes no live publisher IDs.

Live monetization is a separate configuration step: supply your publisher IDs, add the appropriate Google consent/privacy flow and audience configuration, and test the native behavior before release. Do not simply remove the `isTesting` flag from this demo build.

References: [AdMob plugin](https://github.com/capacitor-community/admob), [Google demo ad units](https://developers.google.com/admob/android/test-ads).

## Build an installable test APK

Requirements: Node 22+, Java 21, Android SDK Platform 36 and Build Tools, and accepted Android SDK licenses. Android Studio can install these. The generated project targets Android 16 (API 36) and supports Android 7 (API 24) or newer, subject to an updated Android System WebView.

```sh
npm install
npm run android:apk
```

This builds the web assets, syncs them into the Android project and runs Gradle's `assembleDebug`. The output is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

To use Android Studio instead:

```sh
npm run android:sync
npm run android:open
```

The app ID is `com.bombpass.game`. The debug APK is for installation/testing, not a Play Store release. A store release requires your own signing key and store setup; no release signing key is included in the project.

After installing, choose a local or online server. Android may ask you to allow installation from the app used to open the APK. Only install the APK you built or received from this project.

## Verification scope

The automated checks cover endpoint validation, private network origin admission, server selection, browser ad preferences, removal of ads on room entry, original multiplayer gameplay, reconnection, and mobile touch controls. Browser tests also connect two clients through this computer's private Wi-Fi interface when one is available.

The delivered APK compiled successfully and passed signature/alignment checks. Native ad display, Android navigation, screen safe areas, and gameplay with two physical Android devices still need device verification. No store release or live advertising has been enabled.
