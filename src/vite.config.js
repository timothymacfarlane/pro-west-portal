import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.COMMIT_REF || 'dev')
  },

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/pro-west-192.png',
        'icons/pro-west-512.png'
      ],
      manifest: {
        name: 'Pro West Portal',
        short_name: 'Pro West',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b3954',
        icons: [
          {
            src: '/icons/pro-west-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/pro-west-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
