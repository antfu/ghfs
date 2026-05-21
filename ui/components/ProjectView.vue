<script setup lang="ts">
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

const props = defineProps<{
  projectId: string
  initialNumber?: number | null
}>()

const activeId = useActiveProjectId()
// Set the active project id synchronously so descendant composables
// (Navbar, ItemList, DetailPanel) all read from the same bucket.
activeId.value = props.projectId

const state = useAppState(props.projectId)

useSelectedItemSync(() => props.projectId, () => props.initialNumber ?? null)
const ui = useUiState()
const { filteredEntries } = useFilteredItems()
const { activePanel, setPanel } = useActivePanel()

const listPaneSize = computed(() => ui.uiState.listPaneSize ?? 30)

function onResize(panes: Array<{ size: number }>) {
  const first = panes[0]?.size
  if (typeof first === 'number')
    ui.setListPaneSize(first)
}

watch(filteredEntries, (entries) => {
  if (state.selectedNumber.value == null)
    return
  if (!entries.some(e => e.number === state.selectedNumber.value))
    state.selectItem(null)
}, { flush: 'post' })

const rpc = useRpc()
const loading = ref(false)
const loadError = ref<string | null>(null)
// Tracks the project id for which we last started a fetch — late
// responses for stale requests are dropped to avoid clobbering newer state.
let inflightId: string | null = null

async function loadInitial(id: string) {
  loading.value = true
  loadError.value = null
  inflightId = id
  try {
    const payload = await rpc.initialPayload(id)
    if (inflightId !== id)
      return
    const bucket = useAppState(id)
    bucket.setPayload(payload)
    ui.hydrate(id, payload.uiState)
  }
  catch (error) {
    if (inflightId !== id)
      return
    loadError.value = (error as Error).message
  }
  finally {
    if (inflightId === id) {
      loading.value = false
      inflightId = null
    }
  }
}

watch(() => props.projectId, (id) => {
  activeId.value = id
  // Don't clear selection or payload — keep showing cached data so the
  // navigation feels instant. The bucket is per-project anyway, so any
  // previously-loaded data for *this* id is still correct.
  loadInitial(id)
}, { immediate: true })

const hasPayload = computed(() => Boolean(state.payload.value))
const showRefreshBadge = computed(() => loading.value && hasPayload.value)
const showFirstLoad = computed(() => loading.value && !hasPayload.value)
const showError = computed(() => Boolean(loadError.value) && !hasPayload.value)
</script>

<template>
  <div class="h-full flex flex-col relative">
    <AppNavbar mode="project" />

    <!-- Top progress bar shown while refreshing existing data; non-blocking. -->
    <div
      v-if="showRefreshBadge"
      class="absolute top-14 left-0 right-0 h-0.5 overflow-hidden z-20 pointer-events-none"
      data-testid="project-refresh-bar"
    >
      <div class="h-full bg-primary-500/60 animate-pulse" style="width: 100%;" />
    </div>

    <main class="flex-1 min-h-0">
      <Splitpanes class="h-full w-full ghfs-splitpanes" :dbl-click-splitter="false" @resize="onResize">
        <Pane :size="listPaneSize" min-size="20" max-size="60"
          class="bg-base"
            :class="activePanel === 'list' ? 'panel-active' : ''"
        >
          <div
            class="h-full transition flex flex-col"
            data-testid="item-list"
            @mousedown="setPanel('list')"
          >
            <div v-if="showFirstLoad" class="flex flex-col items-center justify-center py-32 color-muted flex-1" data-testid="project-loading">
              <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
              <p class="text-sm">Loading…</p>
            </div>
            <div v-else-if="showError" class="px-4 py-6 color-muted flex-1">
              <p class="text-sm">{{ loadError }}</p>
            </div>
            <VirtualItemList v-else :entries="filteredEntries" class="flex-1 min-h-0" />
          </div>
        </Pane>

        <Pane :size="100 - listPaneSize" class="bg-base">
          <div class="h-full" data-testid="detail-panel" @mousedown="setPanel('detail')">
            <DetailPanel />
          </div>
        </Pane>
      </Splitpanes>
    </main>

    <QueuePanel />
    <HelpOverlay />
    <ProgressToast />
  </div>
</template>
