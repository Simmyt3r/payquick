import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ng.payquick.app',
  appName: 'Payquick',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
