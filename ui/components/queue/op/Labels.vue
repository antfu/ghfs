<script setup lang="ts">
import type { PendingOpAiOrigin } from '#ghfs/execute-types'
import DisplayLabel from '../../display/Label.vue'

defineProps<{
  labels: string[]
  projectId?: string
  origin?: PendingOpAiOrigin
}>()

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" data-testid="queue-op-labels">
    <span
      v-for="name in labels"
      :key="name"
      class="inline-flex items-center gap-1"
    >
      <DisplayLabel
        :name="name"
        :project-id="projectId"
      />
      <span
        v-if="origin?.confidence[name] != null"
        class="text-[10px] color-faint tabular-nums"
        :title="`Model probability for ${name}`"
        data-testid="queue-op-label-confidence"
      >{{ percent(origin.confidence[name]!) }}</span>
    </span>
    <span v-if="labels.length === 0" class="text-xs color-faint italic">(no labels)</span>
  </div>
</template>
