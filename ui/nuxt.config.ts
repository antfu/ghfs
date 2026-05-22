import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { nostics, nosticsServer } from 'nostics/unplugin'
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
    '~/assets/global.css',
    '~/assets/markdown.css',
    '~/assets/splitpanes.css',
  ],

  ssr: false,

  experimental: {
    payloadExtraction: false,
  },

  features: {
    inlineStyles: false,
  },

  app: {
    baseURL: '/',
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
    plugins: [
      nostics.vite(),
      nosticsServer.vite({ logFile: resolve(rootDir, '../.diagnostics.log') }),
    ],
    optimizeDeps: {
      include: [
        '@tanstack/vue-virtual',
        'colorjs.io',
        'devframe/rpc/client',
        'devframe/rpc/transports/ws-client',
        'floating-vue',
        'marked',
        'nostics',
        'nostics/reporters/dev',
        'parse-diff', // CJS
        'shiki',
        'splitpanes',
        'vue-data-ui',
        'whenexpr',
      ],
    },
    resolve: {
      alias: {
        '#ghfs/server-types': resolve(rootDir, '../src/server/types.ts'),
        '#ghfs/action-colors': resolve(rootDir, '../src/execute/actions.ts'),
        '#ghfs/rpc-types': resolve(rootDir, '../src/devframe/rpc/types.ts'),
        '#ghfs/execute-types': resolve(rootDir, '../src/execute/types.ts'),
        '#ghfs/execution-types': resolve(rootDir, '../src/types/execution.ts'),
        '#ghfs/sync-contracts': resolve(rootDir, '../src/sync/contracts.ts'),
        '#ghfs/sync-state': resolve(rootDir, '../src/types/sync-state.ts'),
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

  pages: true,

  hooks: {
    'pages:extend'(pages) {
      pages.push(
        { name: 'hub-redirect', path: '/hub', redirect: '/' },
        { name: 'hub-recent-redirect', path: '/hub/recent', redirect: '/recent' },
        { name: 'hub-queue-redirect', path: '/hub/queue', redirect: '/queue' },
      )
      // GitHub URL shapes (/owner/repo/issues/123, /pull/, /pulls/) are
      // handled by middleware/github-url.global.ts — function-form redirects
      // get stripped during Nuxt's static build.
    },
  },

  compatibilityDate: '2025-01-01',
})
