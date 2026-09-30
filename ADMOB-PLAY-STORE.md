# BOMB PASS: AdMob and Google Play setup

Prepared 26 September 2026 for the intended audience: teenagers and adults.

## What works now

The APK already includes Google's Mobile Ads SDK through the Capacitor AdMob plugin. Settings → Test ads enables Google's demo banner on the home/results screens. Ads are hidden in rooms, matches and same-Wi-Fi mode. Browser builds show a labelled preview. No publisher account or live ad IDs have been added, and this build cannot earn ad revenue.

The supplied APK is debug-signed for testing. It is not a Play Store release. Live consent handling, audience-specific ad treatment, privacy links and release signing are still required before a monetized store build.

## 1. Create your AdMob account

Visit [AdMob](https://admob.google.com/), sign in with the Google account you want to own the game, and complete the publisher setup. Choose your real country carefully; Google says it cannot be changed later. Complete any requested account verification and payment-profile details in Google's dashboard. [Official signup steps](https://support.google.com/admob/answer/7356219?hl=en).

AdMob manages advertising revenue; Google Play Console separately manages distribution of the Android app. Firebase and a Google Ads advertiser campaign are not required for the existing banner integration.

## 2. Register BOMB PASS and create a banner

In AdMob, choose **Apps → Add app → Android**. If the game is not yet published, select **No** when asked whether it is listed in a supported store. Use **BOMB PASS** as the name. The current Android package is `com.bombpass.farukbiswas`. Link the exact Play listing after publication. [App setup](https://support.google.com/admob/answer/9989980?hl=en).

Under the app, create a **Banner** ad unit, for example `HomeAndResults`. Keep banners outside the controls and active arena. The existing implementation supports banners; rewarded or interstitial ads would require additional implementation and device testing.

Keep these two different identifiers:

| Identifier           | Example shape    | Where it belongs                      |
| -------------------- | ---------------- | ------------------------------------- |
| AdMob Android App ID | `ca-app-pub-…~…` | Android manifest application metadata |
| Banner ad-unit ID    | `ca-app-pub-…/…` | Banner request in `client/ads.tsx`    |

These are not the Android package name. [Find your IDs](https://support.google.com/admob/answer/7356431?hl=en).

## 3. Prepare privacy and age handling before live ads

Publish a real privacy policy describing the game, developer/contact details, hosting, guest sessions and Google advertising data. Include it both in the app and Play listing. Complete Play's **Data safety**, **Contains ads**, target audience and content-rating declarations based on the actual app and SDK behavior. [User data requirements](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en-GB), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

Your audience includes minors. The release must not treat every player as an adult. Define an age-handling design for teens and unknown ages; apply the corresponding ad restrictions and content rating. The current test build uses conservative demo settings, not a complete age/consent system for live monetization. [Ad targeting and age treatment](https://developers.google.com/admob/android/targeting).

In AdMob **Privacy & messaging**, configure the relevant messages for the regions where you will distribute the game. The app then needs Google's UMP flow: refresh consent information at launch, show required forms, request ads only when `canRequestAds` allows it, and expose privacy options when required. Non-personalized ads do not replace this consent work. The installed plugin exposes these APIs, but they have not been wired into the test build. [Google's UMP integration guide](https://developers.google.com/admob/android/privacy).

## 4. Verify advertising ownership

Create a developer website and include it in your Play listing. Copy the exact app-ads.txt entry from your AdMob account to `https://YOUR-DEVELOPER-DOMAIN/app-ads.txt`; do not use Google's demo publisher ID. Then complete AdMob's app verification. New apps require app-ads.txt verification and app-readiness approval before full serving. [Verification steps](https://support.google.com/admob/answer/14538460?hl=en).

For this Vite project, a future `public/app-ads.txt` file can be included in the frontend deployment. Do not publish a placeholder; the line must come from your account, and the store's developer website must point to the matching domain.

## 5. Create the Google Play developer account

Register in [Play Console](https://play.google.com/console/signup), choose the appropriate account type, and complete Google's identity/device checks. Google's current registration fee is US$25 once. Create the app as a game and prepare its store description, icon, screenshots, support contact and privacy-policy URL. [Registration requirements](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).

Keep the intended Android package name stable before the first store upload. The supplied project currently targets API 36; verify the current target-API requirement when submitting. [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

## 6. Produce and test a signed release bundle

After the live-ad and privacy work is implemented:

```sh
npm install
npm run android:sync
npm run android:open
```

In Android Studio choose **Build → Generate Signed Bundle / APK → Android App Bundle**. Create and securely retain your upload key, select the release variant and enable Play App Signing through Play Console. Do not reuse the development debug key. Upload the signed `.aab` to an internal test first. Increase Android `versionCode` for subsequent uploads. [Signing guide](https://developer.android.com/studio/publish/app-signing).

Test actual Android devices, consent acceptance/refusal/privacy changes, slow startup, background/reconnect, mobile controls and banner placement. Use demo IDs or registered test devices throughout development; never test by clicking live ads. [Google test ads](https://developers.google.com/admob/android/test-ads).

New personal developer accounts created after 13 November 2023 generally need a closed test with at least 12 testers continuously opted in for 14 days before applying for production access. Completing the test is followed by a production-access application, not automatic approval. [Testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## What to provide for the monetized build

Once your accounts are set up, provide the Android AdMob App ID, Banner ad-unit ID, published privacy-policy URL and developer website/app-ads.txt entry. The remaining implementation is UMP consent/privacy options, age-appropriate treatment, live/test configuration separation and a signed release AAB. The test APK stays on demo ads until that work is complete.

The Render backend is on a free instance that can sleep after inactivity; the updated APK allows longer startup. For a public game launch, evaluate an always-on server and test capacity with real players. No hosting plan was upgraded. [Render free-instance behavior](https://render.com/docs/free).
