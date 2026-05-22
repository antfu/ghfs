<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type { SyncItemState } from '../../../src/types/sync-state'
import { ACTIONS_COLOR_HEX } from '#ghfs/action-colors'
import { summarizeQueueOp } from '../../utils/queueSummary'

interface Group {
  number: number
  item: SyncItemState | null
  entries: QueueEntry[]
}

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useRpc()
const { entries } = useQueue()

const warnings = computed<string[]>(() => state.payload.value?.queue.warnings ?? [])
const hasToken = computed<boolean>(() => state.payload.value?.repo.hasToken ?? false)
const clearDialogOpen = ref(false)

const executeConfirmOpen = computed({
  get() {
    return state.executeConfirmOpen.value
  },
  set(value: boolean) {
    state.executeConfirmOpen.value = value
  },
})

const groups = computed<Group[]>(() => {
  const items = state.payload.value?.syncState.items ?? {}
  const byNumber = new Map<number, Group>()
  for (const entry of entries.value) {
    const number = entry.op.number
    const group = byNumber.get(number)
    if (group) {
      group.entries.push(entry)
      continue
    }
    byNumber.set(number, {
      number,
      item: items[String(number)] ?? null,
      entries: [entry],
    })
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number)
})

function actionColor(action: string): string {
  return (ACTIONS_COLOR_HEX as Record<string, string>)[action] ?? '#6b7280'
}

function summarize(entry: QueueEntry): string {
  return summarizeQueueOp(entry.op as unknown as Record<string, unknown>)
}

function selectItem(number: number) {
  state.selectItem(number)
  state.closeQueue()
}

async function remove(entry: QueueEntry) {
  state.setError(null)
  try {
    await rpc.$call('ghfs:remove-queue-op', activeId.value ?? '__default__', entry.id)
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}

async function confirmClear() {
  clearDialogOpen.value = false
  state.setError(null)
  try {
    await rpc.$call('ghfs:clear-queue', activeId.value ?? '__default__')
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}

function askExecute() {
  if (!hasToken.value || entries.value.length === 0 || state.executing.value)
    return
  executeConfirmOpen.value = true
}

async function confirmExecute() {
  executeConfirmOpen.value = false
  const ids = entries.value.map(e => e.id)
  if (ids.length === 0)
    return
  state.setError(null)
  state.setExecuting(true)
  try {
    await rpc.$call('ghfs:execute-queue', activeId.value ?? '__default__', { entryIds: ids, continueOnError: true })
  }
  catch (error) {
    state.setError(`Execute failed: ${(error as Error).message}`)
    state.setExecuting(false)
  }
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
      v-if="state.queueOpen.value"
      class="fixed top-18 right-4 bottom-4 w-[30rem] max-w-[calc(100vw-2rem)] panel-card shadow-xl z-drawer-content flex flex-col overflow-hidden"
      data-testid="queue-panel"
    >
      <header class="flex items-center gap-2 px-4 py-3 border-b border-base">
        <span class="i-octicon-list-unordered-16 color-active" />
        <h2 class="font-medium">Queue</h2>
        <span class="color-muted text-sm font-mono tabular-nums">{{ entries.length }}</span>
        <div class="flex-1" />
        <button
          class="btn-action-sm"
          :disabled="entries.length === 0"
          @click="clearDialogOpen = true"
        >
          <span class="i-ph-trash-duotone" />
          <span>Clear</span>
        </button>
        <UiIconButton
          icon="i-ph-x"
          tooltip="Close panel"
          @click="state.closeQueue()"
        />
      </header>

      <div v-if="warnings.length" class="px-4 py-2 bg-yellow-500/10 border-b border-base text-xs color-muted">
        <div v-for="(w, i) in warnings" :key="i" class="flex items-start gap-2 py-0.5">
          <span class="i-ph-warning-duotone mt-0.5 flex-none color-yellow-600" />
          <span>{{ w }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <UiEmptyState
          v-if="entries.length === 0"
          icon="i-octicon-inbox-16"
          title="No operations queued"
          message="Open an item and use the footer actions to queue close/reopen/comment."
        />
        <div v-else class="divide-y divide-#8882">
          <section v-for="group in groups" :key="group.number" class="flex flex-col">
            <button
              type="button"
              class="flex items-start gap-2 px-4 py-2 bg-#8881 hover:bg-#8882 transition text-left"
              @click="selectItem(group.number)"
            >
              <DisplayItemStateIcon
                v-if="group.item"
                :item="group.item.data.item"
                :pull="group.item.data.pull"
                size="sm"
                class="mt-0.5 shrink-0"
              />
              <span v-else class="i-octicon-question-16 color-muted mt-0.5 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-sm">
                  <span v-if="group.item" class="truncate font-medium">{{ group.item.data.item.title }}</span>
                  <span v-else class="color-muted italic">Unknown item</span>
                </div>
                <div class="flex items-center gap-2 text-xs color-muted mt-0.5 font-mono tabular-nums">
                  <span>#{{ group.number }}</span>
                  <template v-if="group.item">
                    <span class="color-faint">·</span>
                    <span>{{ group.item.data.item.kind === 'pull' ? 'pull request' : 'issue' }}</span>
                    <span v-if="group.item.data.item.author" class="color-faint">·</span>
                    <span v-if="group.item.data.item.author">@{{ group.item.data.item.author }}</span>
                  </template>
                </div>
              </div>
            </button>
            <ul class="flex flex-col">
              <li
                v-for="entry in group.entries"
                :key="entry.id"
                class="group flex items-start gap-2 px-4 py-1.5 pl-8 hover:bg-active transition"
                data-testid="queue-entry"
                :data-entry-id="entry.id"
              >
                <span
                  class="badge font-mono text-xs flex-none"
                  :style="{ backgroundColor: `${actionColor(entry.op.action)}22`, color: actionColor(entry.op.action) }"
                >{{ entry.op.action }}</span>
                <span v-if="summarize(entry)" class="text-xs color-muted truncate flex-1">{{ summarize(entry) }}</span>
                <span v-else class="flex-1" />
                <UiIconButton
                  icon="i-ph-trash-duotone"
                  size="sm"
                  tooltip="Remove from queue"
                  class="hover-fade"
                  @click="remove(entry)"
                />
              </li>
            </ul>
          </section>
        </div>
      </div>

      <footer class="border-t border-base px-4 py-3 bg-#8881 flex items-center gap-2">
        <div class="text-xs color-muted flex-1">
          Runs every op against GitHub.
        </div>
        <button
          class="btn-primary text-sm"
          :disabled="entries.length === 0 || state.executing.value || !hasToken"
          :title="!hasToken ? 'No GitHub token available' : undefined"
          @click="askExecute"
        >
          <span :class="state.executing.value ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
          <span>Execute {{ entries.length }} op{{ entries.length === 1 ? '' : 's' }}</span>
          <UiKbd command="action.execute" />
        </button>
      </footer>
    </aside>
  </Transition>

  <UiModal
    v-model:open="clearDialogOpen"
    title="Clear execute.yml?"
    icon="i-ph-trash-duotone"
    width="w-[min(90vw,26rem)]"
  >
    <div class="px-5 py-4">
      <p class="text-sm color-muted">
        This removes all operations in <span class="font-mono">.ghfs/execute.yml</span>.
        <span class="font-mono">execute.md</span> and per-item edits are not affected.
      </p>
    </div>
    <template #footer>
      <button class="btn-action-sm" @click="clearDialogOpen = false">Cancel</button>
      <button class="btn-primary text-sm" @click="confirmClear">Clear</button>
    </template>
  </UiModal>

  <UiModal
    v-model:open="executeConfirmOpen"
    icon="i-ph-play-duotone"
    width="w-[min(92vw,30rem)]"
    :title="`Execute ${entries.length} operation${entries.length === 1 ? '' : 's'}?`"
  >
    <div class="px-5 py-4">
      <p class="text-sm color-muted">
        These changes will be applied to GitHub immediately. This cannot be undone from here — you'll need to revert on GitHub if needed.
      </p>
    </div>
    <template #footer>
      <button class="btn-action-sm" @click="executeConfirmOpen = false">Cancel</button>
      <button class="btn-primary text-sm" :disabled="state.executing.value" @click="confirmExecute">
        <span class="i-ph-play-duotone" />
        Execute
      </button>
    </template>
  </UiModal>
</template>
