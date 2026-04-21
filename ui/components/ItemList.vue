<script setup lang="ts">
import type { ProviderItem } from '../../src/types/provider'

defineProps<{ items: ProviderItem[] }>()
</script>

<template>
  <div v-if="items.length === 0" class="flex flex-col items-center justify-center py-24 color-muted">
    <span class="i-carbon-list text-4xl mb-2" />
    <p class="text-sm">No items match the current filter.</p>
    <p class="text-xs mt-1">Try changing the filters or click Sync to fetch from GitHub.</p>
  </div>
  <div v-else>
    <ItemRow v-for="item in items" :key="`${item.kind}-${item.number}`" :item="item" />
  </div>
</template>
