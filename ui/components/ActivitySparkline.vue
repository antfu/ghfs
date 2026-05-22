<script setup lang="ts">
import { computed } from 'vue'
import { VueUiSparkline } from 'vue-data-ui'
import 'vue-data-ui/style.css'

const props = withDefaults(
  defineProps<{
    points: number[]
    /** Hex color for the line + area fill. */
    color?: string
  }>(),
  {
    color: '#0969da',
  },
)

const dataset = computed(() =>
  props.points.map((value: number, i: number) => ({
    period: String(i),
    value,
  })),
)

// vue-data-ui sparkline expects `area`, `plot`, etc. at the top level of
// `style` — NOT nested under `line`. Color must be a real hex value because
// the library derives gradient stops from it via JS; `currentColor` won't work.
const config = computed(() => ({
  responsive: true,
  type: 'line' as const,
  style: {
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    padding: [4, 0, 0, 0],
    line: {
      color: props.color,
      strokeWidth: 1.25,
      smooth: true,
    },
    area: {
      show: true,
      useGradient: true,
      opacity: 40,
      color: props.color,
    },
    plot: { show: false, radius: 0, stroke: 'transparent', strokeWidth: 0 },
    zeroLine: { color: 'transparent', strokeWidth: 0 },
    verticalIndicator: { show: false, color: 'transparent', strokeWidth: 0, strokeDasharray: 0 },
    dataLabel: { show: false },
    title: { show: false, text: '' },
    tooltip: { show: false },
  },
}))
</script>

<template>
  <div class="w-full h-full overflow-hidden" data-testid="activity-sparkline">
    <VueUiSparkline :dataset="dataset" :config="config" />
  </div>
</template>
