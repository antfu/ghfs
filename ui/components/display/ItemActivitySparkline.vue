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
// match a busy one — the curve stays low until activity climbs above
// MIN_SCALE.
const MIN_SCALE = 4

// Baseline sits at the very bottom of the viewBox so flat "no activity"
// stretches blend with the row's bottom border instead of looking like
// a second border. Peaks top out at y=40 (60% of container height up
// from the bottom).
const BASELINE_Y = 100
const PEAK_Y = 40
const USABLE_H = BASELINE_Y - PEAK_Y

// Half-window for moving-average smoothing. Window size = 2*HW+1.
// Smooths out daily spikes into gentle hills.
const SMOOTH_HW = 3

interface Pt { x: number, y: number }

const adjustedPoints = computed<number[]>(() => {
  const pts = props.points.slice()
  // The createdIndex bucket includes the createdAt event itself; subtract
  // that one tally so the curve doesn't spike at item birth.
  if (props.createdIndex != null && props.createdIndex >= 0 && props.createdIndex < pts.length)
    pts[props.createdIndex] = Math.max(0, pts[props.createdIndex] - 1)
  return pts
})

const smoothedPoints = computed<number[]>(() => {
  const pts = adjustedPoints.value
  return pts.map((_, i) => {
    let sum = 0
    let count = 0
    const lo = Math.max(0, i - SMOOTH_HW)
    const hi = Math.min(pts.length - 1, i + SMOOTH_HW)
    for (let j = lo; j <= hi; j++) {
      sum += pts[j]
      count += 1
    }
    return sum / count
  })
})

function curveY(value: number, max: number): number {
  return BASELINE_Y - (value / max) * USABLE_H
}

const polyPoints = computed<Pt[]>(() => {
  const pts = smoothedPoints.value
  if (pts.length < 2)
    return []
  const start = Math.max(0, Math.min(pts.length - 1, props.createdIndex ?? 0))
  if (pts.length - start < 2)
    return []
  const max = Math.max(MIN_SCALE / (2 * SMOOTH_HW + 1), ...pts)
  return pts.slice(start).map((v, i) => ({
    x: start + i,
    y: curveY(v, max),
  }))
})

// Build a smooth cubic-Bezier path through the points using Catmull-Rom
// → Bezier conversion. With pre-smoothed data the result is doubly soft.
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
