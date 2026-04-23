<script setup lang="ts">
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

useRpc()

const state = useAppState()
const ui = useUiState()
const { filteredEntries } = useFilteredItems()

installShortcuts(createAppShortcuts())
useShortcutsHandler()

const listPaneSize = computed(() => ui.uiState.listPaneSize ?? 30)

function onResize(panes: Array<{ size: number }>) {
  const first = panes[0]?.size
  if (typeof first === 'number')
    ui.setListPaneSize(first)
}

// If filter changes remove the current selection from the list, clear it.
watch(filteredEntries, (entries) => {
  if (state.selectedNumber.value == null)
    return
  if (!entries.some(e => e.number === state.selectedNumber.value))
    state.selectItem(null)
}, { flush: 'post' })
</script>

<template>
  <div class="h-screen flex flex-col bg-base color-base font-sans overflow-hidden">
    <Navbar />

    <main class="flex-1 min-h-0">
      <Splitpanes class="h-full w-full ghfs-splitpanes" :dbl-click-splitter="false" @resize="onResize">
        <Pane :size="listPaneSize" min-size="20" max-size="60" class="bg-base">
          <div class="h-full overflow-y-auto">
            <div v-if="!state.payload.value" class="flex flex-col items-center justify-center py-32 color-muted">
              <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
              <p class="text-sm">Connecting…</p>
            </div>
            <template v-else>
              <ItemList :entries="filteredEntries" />
            </template>
          </div>
        </Pane>

        <Pane :size="100 - listPaneSize" class="bg-secondary/30">
          <DetailPanel />
        </Pane>
      </Splitpanes>
    </main>

    <QueuePanel />
    <ProgressToast />
  </div>
</template>

<style>
html, body, #app {
  height: 100vh;
  overflow: hidden;
}

.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter {
  width: 4px;
  min-width: 4px;
  background: transparent;
  border-left: 1px solid var(--un-border, #d1d9e0);
  cursor: col-resize;
  transition: background 0.15s;
}
.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter:hover,
.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter.splitpanes__splitter--active {
  background: rgb(9 105 218 / 0.3);
}
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter {
  border-left-color: #3d444d;
}
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter:hover,
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter.splitpanes__splitter--active {
  background: rgb(68 147 248 / 0.3);
}
</style>
