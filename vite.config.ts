import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest }), nodePolyfills()],
  resolve: {
    alias: { '@shared': '/src/shared', '@storage': '/src/storage' },
  },
  build: {
    rollupOptions: {
      input: {
        settings: 'src/settings/settings.html',
      },
    },
  },
})
