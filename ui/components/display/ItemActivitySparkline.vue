<script setup lang="ts">
const props = withDefaults(defineProps<{
  points: number[]
  width?: number
  height?: number
  color?: string
}>(), {
  width: 60,
  height: 14,
  color: 'currentColor',
})

// Floor the y-axis so a quiet item (1–2 events) doesn't visually
// match a busy one — the line stays low until activity climbs above
// MIN_SCALE. Smaller than the project-level sparkline's MIN_SCALE
// because per-item event counts are lower in absolute terms.
const MIN_SCALE = 4

const polylinePoints = computed(() => {
  const pts = props.points
  if (pts.length === 0)
    return ''
  const max = Math.max(MIN_SCALE, ...pts)
  const stepX = props.width / Math.max(1, pts.length - 1)
  // Leave 1px of padding at top and bottom so the stroke isn't clipped.
  const usableH = props.height - 2
  return pts.map((v, i) => {
    const x = i * stepX
    const y = (props.height - 1) - (v / max) * usableH
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
})

const total = computed(() => props.points.reduce((sum, v) => sum + v, 0))
const tooltipText = computed(() =>
  total.value === 0
    ? `No activity in the last ${props.points.length} days`
    : `${total.value} event${total.value === 1 ? '' : 's'} in the last ${props.points.length} days`,
)
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="shrink-0 op-70"
    data-testid="item-activity-sparkline"
  >
    <title>{{ tooltipText }}</title>
    <polyline
      :points="polylinePoints"
      fill="none"
      :stroke="color"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
