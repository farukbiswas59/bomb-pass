import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export function savedAdsEnabled() {
  try {
    return localStorage.getItem('bp.testAds') === 'true';
  } catch {
    return false;
  }
}

// Demo IDs only. This build cannot request revenue-generating ads.
export const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
let chain = Promise.resolve();
let initialized = false;
let wanted = false;
async function nativeBanner(show: boolean) {
  wanted = show;
  chain = chain
    .catch(() => {})
    .then(async () => {
      const { AdMob, BannerAdSize, BannerAdPosition, MaxAdContentRating } =
        await import('@capacitor-community/admob');
      if (!wanted) {
        if (initialized) await AdMob.removeBanner();
        return;
      }
      if (!initialized) {
        await AdMob.initialize({
          initializeForTesting: true,
          tagForUnderAgeOfConsent: true,
          maxAdContentRating: MaxAdContentRating.General,
        });
        initialized = true;
      }
      if (!wanted) return;
      await AdMob.showBanner({
        adId: TEST_BANNER_ID,
        adSize: BannerAdSize.BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        isTesting: true,
        npa: true,
      });
      if (!wanted) await AdMob.removeBanner();
    });
  return chain;
}
export function AdSlot({ visible }: { visible: boolean }) {
  const native = Capacitor.isNativePlatform();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (native)
      void nativeBanner(visible).catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (native) void nativeBanner(false).catch(() => {});
    };
  }, [visible, native]);
  if (!visible) return null;
  return (
    <aside
      className={native ? 'native-ad-space' : 'test-ad-preview'}
      aria-label="Test advertisement"
    >
      <strong>{native ? 'GOOGLE TEST AD' : 'TEST AD PREVIEW'}</strong>
      <small>
        {failed
          ? 'Ad unavailable. You can still play.'
          : native
            ? 'Demo ads only · Internet required'
            : 'The Android APK displays Google demo ads here. No live ads or revenue.'}
      </small>
    </aside>
  );
}
