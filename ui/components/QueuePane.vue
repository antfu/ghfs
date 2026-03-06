<script setup lang="ts">
import type { UiBootstrap } from '~/types/rpc'

defineProps<{
  bootstrap?: UiBootstrap
  executing?: boolean
}>()

const emit = defineEmits<{
  remove: [index: number]
  selectItem: [number]
  refresh: []
  executeNow: []
}>()
</script>

<template>
  <section class="panel-card p-4 fade-in">
    <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="mono text-xs text-muted">
        Queue: {{ bootstrap?.queueSummary.total ?? 0 }}
        · yml {{ bootstrap?.queueSummary.executeYml ?? 0 }}
        · md {{ bootstrap?.queueSummary.executeMd ?? 0 }}
        · per-item {{ bootstrap?.queueSummary.perItem ?? 0 }}
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-ghost"
          :disabled="executing"
          @click="emit('refresh')"
        >
          Refresh
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="executing || (bootstrap?.queue.length ?? 0) === 0"
          @click="emit('executeNow')"
        >
          {{ executing ? 'Executing...' : 'Execute Now' }}
        </button>
      </div>
    </header>

    <div
      v-if="(bootstrap?.queue.length ?? 0) === 0"
      class="panel-soft p-5 text-sm text-muted"
    >
      Queue is empty.
    </div>

    <div
      v-else
      class="space-y-2"
    >
      <QueueRow
        v-for="entry in bootstrap?.queue"
        :key="entry.id"
        :entry="entry"
        :executing="executing"
        @remove="emit('remove', $event)"
        @select-item="emit('selectItem', $event)"
      />
    </div>
  </section>
</template>
