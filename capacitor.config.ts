import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bombpass.game',
  appName: 'BOMB PASS',
  webDir: 'dist/client',
  server: { androidScheme: 'http' },
  android: { backgroundColor: '#0b101a' },
};
export default config;
