<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

useRpc()

const state = useAppState()
const { filteredEntries } = useFilteredItems()

installShortcuts(createAppShortcuts())
useShortcutsHandler()

// If filter changes remove the current selection from the list, clear it.
watch(filteredEntries, (entries) => {
  if (state.selectedNumber.value == null)
    return
  if (!entries.some(e => e.number === state.selectedNumber.value))
    state.selectItem(null)
}, { flush: 'post' })
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="h-screen flex flex-col bg-base color-base font-sans overflow-hidden">
      <Navbar />

      <main class="flex-1 flex min-h-0">
        <section class="w-[28rem] max-w-[45vw] shrink-0 border-r border-base overflow-y-auto bg-base">
          <div v-if="!state.payload.value" class="flex flex-col items-center justify-center py-32 color-muted">
            <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
            <p class="text-sm">Connecting…</p>
          </div>
          <template v-else>
            <ItemList :entries="filteredEntries" />
          </template>
        </section>

        <section class="flex-1 overflow-y-auto min-w-0 bg-secondary/30">
          <DetailPanel />
        </section>
      </main>

      <QueuePanel />
      <ProgressToast />
    </div>
  </TooltipProvider>
</template>

<style>
html, body, #app {
  height: 100vh;
  overflow: hidden;
}
</style>
