import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Payquick',
        short_name: 'Payquick',
        description: 'Utility payments and meter management',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f7fc',
        theme_color: '#153a9e',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: { proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
});
