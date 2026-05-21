<script setup lang="ts">
import type { SyncItemState } from '../../src/types/sync-state'

defineProps<{ entries: SyncItemState[] }>()

const state = useAppState()
</script>

<template>
  <EmptyState
    v-if="entries.length === 0"
    icon="i-octicon-inbox-16"
    title="No items match the current filter"
    message="Change filters, or use the sync icon to pull from GitHub."
  />
  <div v-else>
    <ItemRow
      v-for="entry in entries"
      :key="`${entry.kind}-${entry.number}`"
      :entry="entry"
      :selected="state.selectedNumber.value === entry.number"
    />
  </div>
</template>
