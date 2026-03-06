import { defineConfig, presetWind4, transformerVariantGroup } from 'unocss'

export default defineConfig({
  theme: {
    colors: {
      canvas: '#0A0F18',
      panel: '#111A28',
      panelSoft: '#162233',
      line: '#293A52',
      text: '#E7EEF7',
      muted: '#9AB0C9',
      accent: '#3DDC97',
      accent2: '#5EA9FF',
      warning: '#F5B83D',
      danger: '#FF6B6B',
    },
  },
  shortcuts: {
    'panel-card': 'rounded-4 border border-line bg-panel/84 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.25)]',
    'panel-soft': 'rounded-3 border border-line bg-panelSoft/92',
    'btn-base': 'inline-flex items-center gap-2 rounded-2 px-3 py-2 text-sm font-600 transition',
    'btn-primary': 'btn-base bg-accent text-#06210F hover:bg-#66e7b0',
    'btn-ghost': 'btn-base border border-line bg-transparent text-text hover:bg-panelSoft',
    'field-base': 'w-full rounded-2 border border-line bg-#0E1624 px-3 py-2 text-sm text-text outline-none focus:border-accent',
  },
  presets: [
    presetWind4(),
  ],
  transformers: [
    transformerVariantGroup(),
  ],
})
