<script setup lang="ts">
const hubUi = useHubUiState()
const hub = useHubState()
const hubQueue = useHubQueue()
const router = useRouter()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')

function close() {
  hubUi.closeQueueDrawer()
}

function openQueuePage() {
  close()
  router.push('/queue')
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
    enter-from-class="op0 translate-x-4"
    enter-to-class="op100 translate-x-0"
    leave-active-class="transition duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
    leave-from-class="op100 translate-x-0"
    leave-to-class="op0 translate-x-4"
  >
    <aside
      v-if="isHubMode && hubUi.queueDrawerOpen.value"
      class="fixed top-18 right-4 bottom-4 w-[32rem] max-w-[calc(100vw-2rem)] panel-floating rounded-xl z-drawer-content flex flex-col overflow-hidden"
      data-testid="hub-queue-drawer"
    >
      <header class="flex items-center gap-2 px-4 py-3 border-b border-base">
        <span class="i-octicon-list-unordered-16 color-active" />
        <h2 class="font-medium">Queue</h2>
        <span class="color-muted text-sm font-mono tabular-nums">{{ hubQueue.totalCount.value }}</span>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-action-sm"
          data-testid="hub-queue-open-page"
          @click="openQueuePage"
        >
          <span class="i-ph-arrows-out-duotone" />
          <span>Open</span>
        </button>
        <UiIconButton
          icon="i-ph-x"
          tooltip="Close panel"
          @click="close"
        />
      </header>

      <div class="flex-1 overflow-y-auto p-3">
        <HubQueueList />
      </div>

      <footer class="border-t border-base px-4 py-3 bg-#8881 flex items-center gap-2">
        <div class="text-xs color-muted flex-1">
          Each project's queue executes independently.
        </div>
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="hubQueue.totalCount.value === 0 || hubQueue.executing.value !== null"
          data-testid="hub-queue-execute-all"
          @click="hubQueue.executeAll()"
        >
          <span :class="hubQueue.executing.value === 'all' ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
          <span>Execute all</span>
        </button>
      </footer>
    </aside>
  </Transition>
</template>
