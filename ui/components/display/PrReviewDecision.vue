<script setup lang="ts">
import type { ProviderReviewDecision } from '../../../src/types/provider'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  decision: ProviderReviewDecision | null | undefined
  /** Icon-only mode for the list row. */
  compact?: boolean
}>(), {
  compact: false,
})

interface Config {
  color: 'green' | 'red' | 'yellow'
  icon: string
  label: string
  shortLabel: string
}

const config = computed<Config | null>(() => {
  switch (props.decision) {
    case 'approved':
      return {
        color: 'green',
        icon: 'i-octicon-check-circle-fill-16',
        label: 'Approved',
        shortLabel: 'Approved',
      }
    case 'changes_requested':
      return {
        color: 'red',
        icon: 'i-octicon-file-diff-16',
        label: 'Changes requested',
        shortLabel: 'Changes',
      }
    case 'review_required':
      return {
        color: 'yellow',
        icon: 'i-octicon-eye-16',
        label: 'Review required',
        shortLabel: 'Review',
      }
  }
  return null
})
</script>

<template>
  <span
    v-if="config && compact"
    :class="[`color-${config.color}-600 dark:color-${config.color}-400`, config.icon, 'text-sm']"
    :title="config.label"
    :aria-label="config.label"
    data-testid="pr-review-decision-compact"
  />
  <span
    v-else-if="config"
    :class="`badge-color-${config.color}`"
    class="uppercase tracking-wide text-[10px] inline-flex items-center"
    :title="config.label"
    data-testid="pr-review-decision"
  >
    <span :class="config.icon" class="mr-1 text-[10px]" />
    {{ config.label }}
  </span>
</template>
