<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { VueUiSparkline } from 'vue-data-ui'
import 'vue-data-ui/style.css'

const props = withDefaults(
  defineProps<{
    points: number[]
    /** Hex color for the line. */
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

// Pin the y-axis to a minimum range so quiet projects don't visually
// scream: when the peak is small (or zero), low activity still maps to
// the bottom of the chart instead of filling the whole container.
// Extend the scale slightly below zero so the line floats above the edge.
const MIN_SCALE = 10
const scaleMax = computed(() => Math.max(MIN_SCALE, ...props.points))
const scaleMin = computed(() => -scaleMax.value * 0.05)

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
    padding: { top: 4, right: 0, bottom: 5, left: 0 },
    scaleMin: scaleMin.value,
    scaleMax: scaleMax.value,
    animation: { show: false },
    line: {
      color: props.color,
      strokeWidth: 1.25,
      smooth: true,
    },
    area: {
      show: false,
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
  <div class="absolute inset-0 overflow-hidden pointer-none" data-testid="activity-sparkline">
    <!--
      forced-padding defaults to 30 in vue-data-ui's Sparkline and is
      applied only on the left side of the chart drawing area — that's
      the unfilled gap you'd otherwise see at the left edge.
    -->
    <VueUiSparkline v-if="ready" :dataset="dataset" :config="config" :forced-padding="0" />
  </div>
</template>
