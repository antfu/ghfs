<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

// Trigger singleton construction; WebSocket connects on mount.
useRpc()

const state = useAppState()
const { filteredItems, allItems } = useFilteredItems()
</script>

<template>
  <div class="min-h-screen bg-base color-base font-sans flex flex-col">
    <TopBar />
    <FilterBar />

    <main class="flex-1 overflow-y-auto">
      <div v-if="!state.payload.value" class="flex flex-col items-center justify-center py-20 color-muted">
        <span class="i-carbon-renew animate-spin text-3xl mb-2" />
        <p class="text-sm">Connecting…</p>
      </div>
      <template v-else>
        <ItemList :items="filteredItems" />
        <div
          v-if="allItems.length > 0"
          class="px-4 py-3 text-xs color-muted"
        >
          Showing {{ filteredItems.length }} of {{ allItems.length }} tracked items.
        </div>
      </template>
    </main>

    <QueuePanel />
    <ProgressToast />
  </div>
</template>
