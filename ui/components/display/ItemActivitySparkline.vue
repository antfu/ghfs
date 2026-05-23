<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Daily activity buckets, oldest-first. Length defines the x-axis range. */
  points: number[]
  /**
   * Bucket index where the item was created. The polyline starts here and
   * a dashed vertical line marks the position. `undefined` ⇒ created before
   * the window, so the polyline spans the full width and no line is drawn.
   */
  createdIndex?: number
  color?: string
}>(), {
  color: 'currentColor',
})

// Floor the y-axis so a quiet item (1–2 events) doesn't visually
// match a busy one — the line stays low until activity climbs above
// MIN_SCALE.
const MIN_SCALE = 4

const polylinePoints = computed(() => {
  const pts = props.points
  if (pts.length < 2)
    return ''
  // Start at the item's creation point (or the left edge if it was created
  // before the window). The container's full width always represents the
  // sparkline window regardless of how much of it the item has "lived".
  const start = Math.max(0, Math.min(pts.length - 1, props.createdIndex ?? 0))
  if (pts.length - start < 2)
    return ''
  const max = Math.max(MIN_SCALE, ...pts)
  // Leave 2 units of padding so the stroke isn't clipped at the edges.
  const usableH = 96
  return pts.slice(start).map((v, i) => {
    const x = start + i
    const y = 98 - (v / max) * usableH
    return `${x},${y.toFixed(2)}`
  }).join(' ')
})

const showCreatedLine = computed(() =>
  props.createdIndex != null
  && props.createdIndex >= 0
  && props.createdIndex < props.points.length,
)

const total = computed(() => props.points.reduce((sum, v) => sum + v, 0))
const tooltipText = computed(() =>
  total.value === 0
    ? 'No activity in the last 6 months'
    : `${total.value} event${total.value === 1 ? '' : 's'} in the last 6 months`,
)
</script>

<template>
  <svg
    width="100%"
    height="100%"
    :viewBox="`0 0 ${points.length} 100`"
    preserveAspectRatio="none"
    class="absolute inset-0"
    data-testid="item-activity-sparkline"
  >
    <title>{{ tooltipText }}</title>
    <line
      v-if="showCreatedLine"
      :x1="createdIndex"
      :x2="createdIndex"
      y1="0"
      y2="100"
      :stroke="color"
      stroke-width="1"
      stroke-dasharray="3 2"
      vector-effect="non-scaling-stroke"
      opacity="0.4"
    />
    <polyline
      v-if="polylinePoints"
      :points="polylinePoints"
      fill="none"
      :stroke="color"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
