<script setup lang="ts">
import { computed } from 'vue'

/**
 * Color scales:
 * - `freshness` — newer is better. Bright green when recent; desaturates to
 *   gray once the duration crosses ~3 months. Pair with "last updated" times.
 * - `staleness` — newer is boring. Gray when recent; warms to yellow,
 *   orange, then red as the duration grows. Pair with "last synced" / "last
 *   pushed" times that get worse with age.
 * - `text` — plain text; no chip background, no padding. Use inside prose
 *   (e.g. timeline event lines).
 * - `false` — neutral gray chip (no color emphasis).
 */
export type ColorizeMode = 'freshness' | 'staleness' | 'text' | false

const props = withDefaults(
  defineProps<{
    ms?: number
    colorize?: ColorizeMode | true
  }>(),
  {
    colorize: 'freshness',
  },
)

const MS_PER_DAY = 24 * 60 * 60 * 1000

const daysAgo = computed(() => {
  if (props.ms == null)
    return 0
  return Math.floor(props.ms / MS_PER_DAY)
})

const timeAgo = computed<[string | number, string]>(() => {
  if (!props.ms)
    return ['', '']
  if (daysAgo.value < 1) {
    const minutesAgo = Math.floor(props.ms / (1000 * 60))
    if (minutesAgo < 1)
      return ['just now', '']
    if (minutesAgo < 60)
      return [minutesAgo, 'min']
    const hoursAgo = Math.floor(props.ms / (1000 * 60 * 60))
    return [hoursAgo, 'hr']
  }
  if (daysAgo.value > 365)
    return [+(daysAgo.value / 365).toFixed(1), 'yr']
  if (daysAgo.value > 30)
    return [Math.round(daysAgo.value / 30), 'mo']
  return [daysAgo.value, 'd']
})

const mode = computed(() => (props.colorize === true ? 'freshness' : props.colorize))

const isText = computed(() => mode.value === 'text')

const chipClass = computed(() => {
  if (!mode.value)
    return 'date-chip-fresh-stale'
  const days = daysAgo.value
  if (mode.value === 'freshness') {
    if (days < 1)
      return 'date-chip-fresh-now'
    if (days < 7)
      return 'date-chip-fresh-recent'
    if (days < 90)
      return 'date-chip-fresh-mature'
    return 'date-chip-fresh-stale'
  }
  // staleness: gray → yellow → orange → red
  if (days < 7)
    return 'date-chip-stale-fresh'
  if (days < 30)
    return 'date-chip-stale-warm'
  if (days < 90)
    return 'date-chip-stale-warning'
  return 'date-chip-stale-critical'
})
</script>

<template>
  <span
    v-if="ms"
    :class="isText ? 'inline-flex items-baseline gap-0.5 font-mono tabular-nums' : chipClass"
  >
    <span>{{ timeAgo[0] }}</span>
    <span v-if="timeAgo[1]" class="text-[10px] op-fade">{{ timeAgo[1] }}</span>
  </span>
</template>
