export default defineNuxtConfig({
  ssr: false,
  modules: [
    '@unocss/nuxt',
    '@vueuse/nuxt',
  ],
  unocss: {
    configFile: 'uno.config.ts',
  },
  css: [
    '@unocss/reset/tailwind.css',
    '~/assets/main.css',
  ],
  srcDir: '.',
  app: {
    head: {
      title: 'ghfs ui',
      meta: [
        { name: 'viewport', content: 'width=device-width,initial-scale=1' },
      ],
    },
  },
  compatibilityDate: '2024-07-17',
})
