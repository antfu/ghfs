<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Daily activity buckets, oldest-first. Length defines the x-axis range. */
  points: number[]
  /**
   * Bucket index where the item was created. The polyline starts here and a
   * solid vertical line marks the position. `undefined` ⇒ created before
   * the window, so the polyline spans the full width and no line is drawn.
   */
  createdIndex?: number
  color?: string
  /** Stroke color for the createdAt vertical line. */
  createdLineColor?: string
}>(), {
  color: 'currentColor',
  createdLineColor: '#22c55e',
})

// Floor the y-axis so a quiet item (1–2 events) doesn't visually
// match a busy one — the line stays low until activity climbs above
// MIN_SCALE.
const MIN_SCALE = 4

// Cap peaks at 60% of the container height so the sparkline never reaches
// the very top edge — keeps it visually a background flourish rather than
// a primary chart. Lift the baseline off the bottom edge so the flat
// "no activity" stretches are clearly visible as a line rather than
// dissolving into the row's bottom border. In the 0–100 viewBox: baseline
// at y=85, peaks at y=40 (60% up from the bottom).
const BASELINE_Y = 85
const PEAK_Y = 40
const USABLE_H = BASELINE_Y - PEAK_Y

interface Pt { x: number, y: number }

const polyPoints = computed<Pt[]>(() => {
  const pts = props.points
  if (pts.length < 2)
    return []
  const start = Math.max(0, Math.min(pts.length - 1, props.createdIndex ?? 0))
  if (pts.length - start < 2)
    return []
  const max = Math.max(MIN_SCALE, ...pts)

  return pts.slice(start).map((v, i) => {
    const x = start + i
    // The createdIndex bucket always includes the createdAt event itself;
    // subtract that one tally so the line doesn't spike at item birth.
    const value = i === 0 && props.createdIndex != null ? Math.max(0, v - 1) : v
    const y = BASELINE_Y - (value / max) * USABLE_H
    return { x, y }
  })
})

// Build a smooth cubic-Bezier path through the points using the
// Catmull-Rom → Bezier conversion (tension = 1, no overshoot).
const pathD = computed(() => {
  const pts = polyPoints.value
  if (pts.length < 2)
    return ''
  const parts: string[] = [`M${pts[0].x},${pts[0].y.toFixed(2)}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    parts.push(`C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`)
  }
  return parts.join('')
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
      :stroke="createdLineColor"
      stroke-width="1"
      vector-effect="non-scaling-stroke"
    />
    <path
      v-if="pathD"
      :d="pathD"
      fill="none"
      :stroke="color"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
