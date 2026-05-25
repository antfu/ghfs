<script setup lang="ts">
import { computed } from 'vue'
import { useHubQueue } from '../../composables/useHubQueue'
import { useHubState } from '../../composables/useHubState'
import { useHubUiState } from '../../composables/useHubUiState'
import { useOnlineState } from '../../composables/useOnlineState'
import UiIconButton from '../ui/IconButton.vue'
import UiModal from '../ui/Modal.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import HubQueueList from './QueueList.vue'

const hubUi = useHubUiState()
const hub = useHubState()
const hubQueue = useHubQueue()
const { offline } = useOnlineState()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')

const executeAllConfirmOpen = computed({
  get() {
    return hubUi.executeAllConfirmOpen.value
  },
  set(value: boolean) {
    if (value) hubUi.openExecuteAllConfirm()
    else hubUi.closeExecuteAllConfirm()
  },
})

async function confirmExecuteAll() {
  hubUi.closeExecuteAllConfirm()
  await hubQueue.executeAll()
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
        <UiWithCommand v-slot="{ execute }" command="action.queue">
          <UiIconButton
            icon="i-ph-x"
            tooltip="Close panel"
            @click="execute"
          />
        </UiWithCommand>
      </header>

      <div class="flex-1 overflow-y-auto p-3">
        <HubQueueList />
      </div>

      <footer class="border-t border-base px-4 py-3 bg-#8881 flex items-center gap-2">
        <div class="text-xs color-muted flex-1">
          Each project's queue executes independently.
        </div>
        <UiWithCommand v-slot="{ execute }" command="hub.execute-all">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="hubQueue.totalCount.value === 0 || hubQueue.executing.value !== null || offline"
            :title="offline ? 'Offline — execute paused' : undefined"
            data-testid="hub-queue-execute-all"
            @click="execute"
          >
            <span :class="hubQueue.executing.value === 'all' ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
            <span>Execute all</span>
          </button>
        </UiWithCommand>
      </footer>
    </aside>
  </Transition>

  <UiModal
    v-model:open="executeAllConfirmOpen"
    icon="i-ph-play-duotone"
    width="w-[min(92vw,30rem)]"
    :title="`Execute ${hubQueue.totalCount.value} operation${hubQueue.totalCount.value === 1 ? '' : 's'}?`"
  >
    <div class="px-5 py-4">
      <p class="text-sm color-muted">
        These changes will be applied to GitHub across {{ hubQueue.groups.value.length }}
        project{{ hubQueue.groups.value.length === 1 ? '' : 's' }} immediately. This cannot be undone from here — you'll need to revert on GitHub if needed.
      </p>
    </div>
    <template #footer>
      <button class="btn-action-sm" @click="hubUi.closeExecuteAllConfirm()">Cancel</button>
      <button
        class="btn-primary text-sm"
        :disabled="hubQueue.executing.value !== null || offline"
        :title="offline ? 'Offline — execute paused' : undefined"
        data-testid="hub-queue-execute-all-confirm"
        @click="confirmExecuteAll"
      >
        <span class="i-ph-play-duotone" />
        Execute
      </button>
    </template>
  </UiModal>
</template>
