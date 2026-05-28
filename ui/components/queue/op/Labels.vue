<script setup lang="ts">
import DisplayLabel from '../../display/Label.vue'

defineProps<{
  labels: string[]
  projectId?: string
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" data-testid="queue-op-labels">
    <DisplayLabel
      v-for="name in labels"
      :key="name"
      :name="name"
      :project-id="projectId"
    />
    <span v-if="labels.length === 0" class="text-xs color-faint italic">(no labels)</span>
  </div>
</template>
