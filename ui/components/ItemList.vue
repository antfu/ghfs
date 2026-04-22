<script setup lang="ts">
import type { SyncItemState } from '../../src/types/sync-state'

defineProps<{ entries: SyncItemState[] }>()

const state = useAppState()
</script>

<template>
  <div v-if="entries.length === 0" class="flex flex-col items-center justify-center py-24 color-muted">
    <span class="i-octicon-inbox-16 text-4xl mb-3 op-fade" />
    <p class="text-sm">No items match the current filter.</p>
    <p class="text-xs mt-1 color-faint">
      Change filters, or click <span class="i-octicon-download-16 inline-block align-middle mx-0.5" /> to sync from GitHub.
    </p>
  </div>
  <div v-else>
    <ItemRow
      v-for="entry in entries"
      :key="`${entry.kind}-${entry.number}`"
      :entry="entry"
      :selected="state.selectedNumber.value === entry.number"
    />
  </div>
</template>
