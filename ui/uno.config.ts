import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans:300,400,500,600,700',
        mono: 'DM Mono:300,400,500',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  shortcuts: {
    'color-base': 'text-neutral-900 dark:text-neutral-100',
    'color-muted': 'text-neutral-500 dark:text-neutral-400',
    'bg-base': 'bg-white dark:bg-neutral-950',
    'bg-secondary': 'bg-neutral-50 dark:bg-neutral-900',
    'bg-hover': 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
    'border-base': 'border-neutral-200 dark:border-neutral-800',
    'bg-glass': 'bg-white/70 dark:bg-neutral-950/70 backdrop-blur-md border border-neutral-200/60 dark:border-neutral-800/60',
    'btn-action': 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-secondary bg-hover border border-base transition disabled:op50 disabled:pointer-events-none',
    'btn-primary': 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary-500 hover:bg-primary-600 text-white transition disabled:op50 disabled:pointer-events-none',
    'badge': 'inline-flex items-center px1.5 py0.5 rounded text-xs font-medium',
    'badge-open': 'badge text-green-700 dark:text-green-400 bg-green-500/10',
    'badge-closed': 'badge text-purple-700 dark:text-purple-400 bg-purple-500/10',
    'badge-merged': 'badge text-purple-700 dark:text-purple-400 bg-purple-500/10',
    'badge-draft': 'badge text-neutral-600 dark:text-neutral-400 bg-neutral-500/15',
    'badge-label': 'badge bg-neutral-200 dark:bg-neutral-800 color-base',
    'kbd': 'px1.5 py0.5 rounded border border-base bg-secondary font-mono text-xs',
  },
  theme: {
    colors: {
      primary: {
        50: '#eef6ff',
        100: '#d9eaff',
        200: '#bcdaff',
        300: '#8ec2ff',
        400: '#589fff',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a',
      },
    },
  },
  safelist: [
    'badge-open',
    'badge-closed',
    'badge-merged',
    'badge-draft',
    'i-carbon-chevron-up',
    'i-carbon-chevron-down',
    'i-carbon-renew',
    'i-carbon-play-filled-alt',
    'i-carbon-list',
    'i-carbon-trash-can',
    'i-carbon-moon',
    'i-carbon-sun',
    'i-carbon-warning',
    'i-carbon-launch',
    'i-carbon-close',
  ],
})
