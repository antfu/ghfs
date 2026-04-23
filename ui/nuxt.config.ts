import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'

const rootDir = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
    '@vueuse/nuxt',
    'reka-ui/nuxt',
  ],

  css: [
    '@unocss/reset/tailwind.css',
    'floating-vue/dist/style.css',
    '~/assets/floating-vue.css',
    '~/assets/markdown.css',
  ],

  ssr: false,

  experimental: {
    payloadExtraction: false,
  },

  features: {
    inlineStyles: false,
  },

  app: {
    baseURL: isDev ? '/' : './',
    head: {
      title: 'ghfs',
      link: [
        { rel: 'icon', href: isDev ? '/favicon.svg' : './favicon.svg', type: 'image/svg+xml' },
      ],
    },
  },

  nitro: {
    preset: 'static',
    output: {
      dir: resolve(rootDir, 'dist'),
      publicDir: resolve(rootDir, 'dist/public'),
    },
  },

  vite: {
    resolve: {
      alias: {
        '#ghfs/server-types': resolve(rootDir, '../src/server/types.ts'),
        '#ghfs/action-colors': resolve(rootDir, '../src/execute/actions.ts'),
      },
    },
    server: {
      proxy: {
        // Dev-only HTTP passthrough for /api/*. The WebSocket at /__ws is
        // connected to directly by the client (see useRpc) to avoid Vite's
        // proxy layer crashing Nuxt on ECONNRESET during reconnects.
        '/api': {
          target: 'http://localhost:7710',
          changeOrigin: true,
          configure(proxy) {
            proxy.on('error', () => {})
          },
        },
      },
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  imports: {
    dirs: ['composables'],
  },

  compatibilityDate: '2025-01-01',
})
