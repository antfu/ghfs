<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
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

// Delay first render until after layout settles. Otherwise vue-data-ui's
// responsive observer measures the container before its parent flex layout
// has resolved, then snaps to the real width on the next frame — visible as
// a one-frame flicker on mount.
const ready = ref(false)
onMounted(async () => {
  await nextTick()
  ready.value = true
})

const dataset = computed(() =>
  props.points.map((value: number, i: number) => ({
    period: String(i),
    value,
  })),
)

// Extend the y-scale below 0 so the plotted line floats above the bottom
// edge while the area fill still reaches the panel bottom — much easier
// to read than a line that kisses the container edge on zero-activity days.
const scaleMin = computed(() => {
  const peak = Math.max(0, ...props.points)
  return peak > 0 ? -peak * 0.15 : -1
})

// vue-data-ui sparkline expects `area`, `plot`, etc. at the top level of
// `style` — NOT nested under `line`. Color must be a real hex value because
// the library derives gradient stops from it via JS; `currentColor` won't work.
const config = computed(() => ({
  responsive: true,
  type: 'line' as const,
  style: {
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    // Padding must be the object form — the library destructures
    // `{ top, right, bottom, left }`; an array silently becomes all-undefined.
    padding: { top: 4, right: 0, bottom: 0, left: 0 },
    scaleMin: scaleMin.value,
    animation: { show: false },
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
  <div class="absolute inset-0 overflow-hidden" data-testid="activity-sparkline">
    <VueUiSparkline v-if="ready" :dataset="dataset" :config="config" />
  </div>
</template>
