<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

useRpc()

const state = useAppState()
const { filteredItems } = useFilteredItems()
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="min-h-screen bg-base color-base font-sans">
      <Sidepanel />
      <NavRight />

      <main class="page-padding">
        <div v-if="!state.payload.value" class="flex flex-col items-center justify-center py-32 color-muted">
          <span class="i-carbon-renew animate-spin text-3xl mb-3 color-active" />
          <p class="text-sm">Connecting…</p>
        </div>
        <template v-else>
          <ItemList :items="filteredItems" />
        </template>
      </main>

      <QueuePanel />
      <ProgressToast />
    </div>
  </TooltipProvider>
</template>
