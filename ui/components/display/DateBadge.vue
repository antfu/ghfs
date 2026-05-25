<script setup lang="ts">
import type { ColorizeMode } from './DurationBadge.vue'
import { computed } from 'vue'
import DisplayDurationBadge from './DurationBadge.vue'

const props = withDefaults(
  defineProps<{
    time?: number | Date | string | null
    colorize?: ColorizeMode | true
  }>(),
  {
    colorize: 'freshness',
  },
)

const date = computed(() => {
  if (props.time == null)
    return null
  const d = props.time instanceof Date ? props.time : new Date(props.time)
  return Number.isNaN(d.getTime()) ? null : d
})

const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const dateTitle = computed(() => (date.value ? formatter.format(date.value) : ''))
const ms = computed(() => (date.value ? Date.now() - date.value.getTime() : 0))
</script>

<template>
  <DisplayDurationBadge
    v-if="date"
    v-tooltip="dateTitle"
    :title="dateTitle"
    :ms="ms"
    :colorize="colorize"
    data-testid="date-badge"
  />
</template>
