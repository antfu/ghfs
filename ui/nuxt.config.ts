import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
    '@vueuse/nuxt',
    'reka-ui/nuxt',
  ],

  ssr: false,

  app: {
    baseURL: './',
    head: {
      title: 'ghfs',
      link: [
        { rel: 'icon', href: './favicon.svg', type: 'image/svg+xml' },
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
        '/__ws': { target: 'ws://localhost:7710', ws: true, changeOrigin: true },
        '/api': { target: 'http://localhost:7710', changeOrigin: true },
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
