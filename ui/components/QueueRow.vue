<script setup lang="ts">
import type { UiQueueEntry } from '~/types/rpc'

const props = defineProps<{
  entry: UiQueueEntry
  executing?: boolean
}>()

const emit = defineEmits<{
  remove: [index: number]
  selectItem: [number]
}>()

const sourceClass = computed(() => {
  if (props.entry.source === 'execute.yml')
    return 'bg-accent/15 text-accent'
  if (props.entry.source === 'execute.md')
    return 'bg-accent2/15 text-accent2'
  return 'bg-warning/18 text-warning'
})
</script>

<template>
  <article class="panel-soft flex flex-wrap items-start justify-between gap-2 p-3">
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex flex-wrap items-center gap-2">
        <span
          class="mono rounded-full px-2 py-0.5 text-[11px]"
          :class="sourceClass"
        >
          {{ entry.source }}
        </span>
        <span class="mono rounded-full bg-panel px-2 py-0.5 text-[11px] text-muted">
          merged #{{ entry.mergedIndex + 1 }}
        </span>
        <button
          type="button"
          class="mono rounded-full bg-panel px-2 py-0.5 text-[11px] text-accent2 hover:bg-panelSoft"
          @click="emit('selectItem', entry.op.number)"
        >
          #{{ entry.op.number }}
        </button>
      </div>
      <p class="mono break-words text-sm leading-relaxed">
        {{ entry.description }}
      </p>
    </div>

    <button
      v-if="entry.editable"
      type="button"
      class="btn-ghost"
      :disabled="executing"
      @click="emit('remove', entry.sourceIndex)"
    >
      Remove
    </button>
  </article>
</template>
