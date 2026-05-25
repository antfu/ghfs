import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { nostics, nosticsServer } from 'nostics/unplugin'
import { dirname, resolve } from 'pathe'

const rootDir = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
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

  alias: {
    '#ghfs/server-types': resolve(rootDir, '../src/server/types.ts'),
    '#ghfs/action-colors': resolve(rootDir, '../src/execute/actions.ts'),
    '#ghfs/rpc-types': resolve(rootDir, '../src/devframe/rpc/types.ts'),
    '#ghfs/execute-types': resolve(rootDir, '../src/execute/types.ts'),
    '#ghfs/execution-types': resolve(rootDir, '../src/types/execution.ts'),
    '#ghfs/sync-contracts': resolve(rootDir, '../src/sync/contracts.ts'),
    '#ghfs/sync-state': resolve(rootDir, '../src/types/sync-state.ts'),
  },

  vite: {
    plugins: [
      nostics.vite(),
      nosticsServer.vite({ logFile: resolve(rootDir, '../.diagnostics.log') }),
    ],
    optimizeDeps: {
      include: [
        '@tanstack/vue-virtual',
        '@vueuse/core',
        'colorjs.io',
        'devframe/client',
        'floating-vue',
        'marked',
        'nostics',
        'nostics/reporters/dev',
        'parse-diff', // CJS
        'reka-ui',
        'shiki',
        'splitpanes',
        'vue-data-ui',
        'whenexpr',
      ],
    },
    server: {
      proxy: {
        // Dev-only HTTP passthrough for /api/*. The WebSocket at /__ws is
        // connected to directly by the client (see useRpc) to avoid Vite's
        // proxy layer crashing Nuxt on ECONNRESET during reconnects.
        // `VITE_GHFS_WS_PORT` is set by `scripts/dev.ts` so the proxy
        // follows whichever port the paired ghfs server actually got
        // (necessary when multiple workspaces run dev in parallel).
        '/api': {
          target: `http://127.0.0.1:${process.env.VITE_GHFS_WS_PORT ?? 47710}`,
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
    autoImport: false,
    scan: false,
  },

  components: {
    dirs: [],
  },

  pages: true,

  hooks: {
    'pages:extend'(pages) {
      pages.push(
        { name: 'hub-redirect', path: '/hub', redirect: '/' },
        { name: 'hub-recent-redirect', path: '/hub/recent', redirect: '/recent' },
      )
      // GitHub URL shapes (/owner/repo/issues/123, /pull/, /pulls/) are
      // handled by middleware/github-url.global.ts — function-form redirects
      // get stripped during Nuxt's static build.
    },
  },

  compatibilityDate: '2025-01-01',
})
