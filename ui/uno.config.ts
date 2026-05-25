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
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans:200,400,500,700',
        mono: 'DM Mono:300,400,500',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  shortcuts: [
    {
      'color-base': 'text-[#1f2328] dark:text-[#e6edf3]',
      'color-muted': 'text-[#59636e] dark:text-[#8b949e]',
      'color-faint': 'text-[#818b98] dark:text-[#6e7681]',
      'color-active': 'color-primary-600 dark:color-primary-400',

      'bg-base': 'bg-white dark:bg-#111',
      'bg-secondary': 'bg-[#f6f8fa] dark:bg-[#181818]',
      'bg-active': 'bg-#8881',

      'border-base': 'border-#8882',
      'border-active': 'border-primary-500/25 dark:border-primary-400/25',

      'bg-tooltip': 'bg-white dark:bg-#111',
      'bg-gradient-more': 'bg-gradient-to-t from-white via-white:80 to-white:0 dark:from-#111 dark:via-#111:80 dark:to-#111:0',

      'op-fade': 'op65 dark:op55',
      'op-mute': 'op30 dark:op25',

      'panel-card': 'border border-base rounded-xl bg-base',
      'panel-floating': 'bg-base border border-base shadow-sm',

      // <DisplayDurationBadge> base chip — rectangular, subtle background, no border.
      // Visually distinct from <DisplayLabel> (rounded-full pill with border).
      'date-chip': 'inline-flex items-baseline gap-0.5 px-1.5 py-0.25 rounded-sm text-xs font-mono tabular-nums leading-tight',

      // <DisplayDurationBadge> color scales. Each picks a text-color + matching
      // background tint. Used by <DisplayDateBadge>.
      //
      // `freshness` (e.g. "last updated"): newer is better, bright green fading to gray.
      // Renders pure gray once the age crosses ~3 months.
      'date-chip-fresh-now': 'date-chip text-green-700 bg-green-500/12 dark:text-green-300 dark:bg-green-400/10',
      'date-chip-fresh-recent': 'date-chip text-green-700 bg-green-500/10 dark:text-green-300 dark:bg-green-400/8',
      'date-chip-fresh-mature': 'date-chip color-muted bg-#8881',
      'date-chip-fresh-stale': 'date-chip color-faint bg-#8881',
      //
      // `staleness` (e.g. "last synced"): newer is fine, severity grows with age.
      // Mirrors node-modules-inspector's package-age palette.
      'date-chip-stale-fresh': 'date-chip color-muted bg-#8881',
      'date-chip-stale-warm': 'date-chip text-yellow-700 bg-yellow-500/15 dark:text-yellow-300 dark:bg-yellow-400/10',
      'date-chip-stale-warning': 'date-chip text-orange-700 bg-orange-500/15 dark:text-orange-300 dark:bg-orange-400/10',
      'date-chip-stale-critical': 'date-chip text-red-700 bg-red-500/15 dark:text-red-300 dark:bg-red-400/10',

      'btn-action': 'border border-base rounded flex gap-2 items-center px2 py1 op75 hover:op100 hover:bg-active transition disabled:pointer-events-none disabled:op30! outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'btn-action-sm': 'btn-action text-sm',
      'btn-action-active': 'color-active border-active! bg-active op100!',
      'btn-icon': 'w-9 h-9 rounded-full op-fade hover:op100 hover:bg-active transition flex items-center justify-center disabled:pointer-events-none disabled:op30 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'btn-circle': 'btn-icon w-10 h-10',
      'btn-primary': 'px3 py1.5 rounded flex gap-2 items-center text-sm bg-primary-500 hover:bg-primary-600 text-white transition disabled:op50 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'btn-toggle-pill': 'inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:op50 disabled:pointer-events-none',
      'btn-toggle-pill-on': 'border-primary-500/40 bg-primary-500/12 color-active hover:bg-primary-500/20',
      'btn-toggle-pill-off': 'border-base bg-base color-muted hover:color-base hover:border-active hover:bg-active',

      'badge': 'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium leading-none',
      'kbd': 'inline-flex items-center justify-center h-4 min-w-4 px-1.5 rounded border border-base bg-secondary font-mono text-[10px] color-muted leading-none shadow-[inset_0_-1px_0_0_#8882]',

      'tab-trigger': 'px-3 py-2 -mb-px flex items-center gap-1.5 text-sm color-muted border-b-2 border-transparent hover:color-active data-[state=active]:color-active data-[state=active]:border-primary-500 dark:data-[state=active]:border-primary-400 transition rounded-t outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'tab-count': 'inline-flex items-center px-1.5 min-w-5 h-5 rounded-full bg-#8881 text-[10px] font-mono color-muted tabular-nums',

      'panel-active': 'relative before:(content-[""] absolute inset-0.5px blur-1.5px border border-primary-400/50 dark:border-primary-300/50 pointer-events-none z-100)',
      'hover-fade': 'op0 group-hover:op100 transition',

      // Named z-index layers — never use raw z-30/40/50 in components.
      'z-nav': 'z-30',
      'z-dropdown': 'z-40',
      'z-toast': 'z-50',
      'z-modal-backdrop': 'z-60',
      'z-modal-content': 'z-70',
      'z-drawer-backdrop': 'z-85',
      'z-drawer-content': 'z-90',
    },
    [/^badge-color-(\w+)$/, ([, color]) => `badge bg-${color}-400/20 dark:bg-${color}-400/10 text-${color}-700 dark:text-${color}-300 border border-${color}-600/15 dark:border-${color}-300/15`],
  ],
  theme: {
    colors: {
      primary: {
        50: '#ddf4ff',
        100: '#b6e3ff',
        200: '#80ccff',
        300: '#54aeff',
        400: '#218bff',
        500: '#0969da',
        600: '#0550ae',
        700: '#033d8b',
        800: '#0a3069',
        900: '#002155',
        950: '#001034',
        DEFAULT: '#0969da',
      },
    },
  },
  safelist: [
    // Dynamic badge colors (constructed at runtime via PanelQueue actionColor + DisplayLabel colors)
    'badge-color-green',
    'badge-color-purple',
    'badge-color-orange',
    'badge-color-red',
    'badge-color-blue',
    'badge-color-yellow',
    'badge-color-pink',
    'badge-color-neutral',
    'badge-color-gray',
    // Dynamic octicons constructed at runtime (PanelDetailTimeline eventIcon map, PanelQueue)
    'i-octicon-issue-opened-16',
    'i-octicon-issue-closed-16',
    'i-octicon-issue-reopened-16',
    'i-octicon-git-pull-request-16',
    'i-octicon-git-pull-request-closed-16',
    'i-octicon-git-merge-16',
    'i-octicon-git-pull-request-draft-16',
    'i-octicon-skip-16',
    'i-octicon-comment-16',
    'i-octicon-comment-discussion-16',
    'i-octicon-tag-16',
    'i-octicon-milestone-16',
    'i-octicon-person-16',
    'i-octicon-people-16',
    'i-octicon-cross-reference-16',
    'i-octicon-bookmark-16',
    'i-octicon-lock-16',
    'i-octicon-eye-16',
    'i-octicon-eye-closed-16',
    'i-octicon-history-16',
    'i-octicon-pencil-16',
    'i-octicon-dot-16',
    'i-octicon-check-circle-fill-16',
    'i-octicon-x-circle-16',
    'i-octicon-hourglass-16',
    'i-octicon-git-commit-16',
    'i-octicon-repo-push-16',
    'i-octicon-mention-16',
    'i-octicon-pin-16',
    'i-octicon-pin-slash-16',
    'i-octicon-arrow-right-16',
    'i-octicon-copy-16',
    'i-octicon-link-16',
    'i-octicon-link-slash-16',
    'i-octicon-git-branch-16',
    'i-octicon-bell-16',
    'i-octicon-bell-slash-16',
    'i-octicon-trash-16',
    // Sync/progress toast pipeline icons
    'i-octicon-repo-16',
    'i-octicon-search-16',
    'i-octicon-download-16',
    'i-octicon-file-16',
    'i-octicon-database-16',
    'i-octicon-alert-fill-16',
    'i-octicon-x-16',
    'i-octicon-play-16',
  ],
})
