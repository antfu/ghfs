<script setup lang="ts">
import type { ProviderItem } from '../../src/types/provider'

defineProps<{ items: ProviderItem[] }>()
</script>

<template>
  <div v-if="items.length === 0" class="flex flex-col items-center justify-center py-24 color-muted">
    <span class="i-ph-circle-dashed text-5xl mb-3 op-fade" />
    <p class="text-sm">No items match the current filter.</p>
    <p class="text-xs mt-1 color-faint">Change filters or click <span class="i-carbon-cloud-download inline-block align-middle mx-1" />sync to fetch from GitHub.</p>
  </div>
  <div v-else class="bg-base rounded-1em border border-base shadow-sm overflow-hidden">
    <ItemRow v-for="item in items" :key="`${item.kind}-${item.number}`" :item="item" />
  </div>
</template>
