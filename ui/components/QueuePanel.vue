<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import { ACTIONS_COLOR_HEX } from '#ghfs/action-colors'

const state = useAppState()
const rpc = useRpc()

const entries = computed<QueueEntry[]>(() => state.payload.value?.queue.entries ?? [])
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

function sourceLabel(source: QueueEntry['source']): string {
  if (source === 'execute.yml') return 'yml'
  if (source === 'execute.md') return 'md'
  return 'frontmatter'
}

function actionColor(action: string): string {
  return (ACTIONS_COLOR_HEX as Record<string, string>)[action] ?? '#6b7280'
}

function summarize(entry: QueueEntry): string {
  const op = entry.op as Record<string, unknown>
  const details: string[] = []
  if ('labels' in op && Array.isArray(op.labels))
    details.push((op.labels as string[]).join(', '))
  if ('assignees' in op && Array.isArray(op.assignees))
    details.push((op.assignees as string[]).map(a => `@${a}`).join(', '))
  if ('title' in op && typeof op.title === 'string')
    details.push(`"${op.title}"`)
  if ('body' in op && typeof op.body === 'string')
    details.push(`"${op.body.slice(0, 60)}${op.body.length > 60 ? '…' : ''}"`)
  if ('milestone' in op && op.milestone != null)
    details.push(String(op.milestone))
  return details.join(' ')
}

async function remove(entry: QueueEntry) {
  state.setError(null)
  try {
    await rpc.removeQueueOp(entry.id)
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}

async function openFile(entry: QueueEntry) {
  if (!entry.filePath)
    return
  try {
    await rpc.openInEditor(entry.filePath)
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}

async function confirmClear() {
  clearDialogOpen.value = false
  state.setError(null)
  try {
    await rpc.clearQueue()
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
  if (entries.value.length === 0)
    return
  state.setError(null)
  state.setExecuting(true)
  try {
    await rpc.executeQueue({ continueOnError: true })
  }
  catch (error) {
    state.setError(`Execute failed: ${(error as Error).message}`)
    state.setExecuting(false)
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="op0 translate-x-4"
    enter-to-class="op100 translate-x-0"
    leave-active-class="transition duration-150"
    leave-from-class="op100 translate-x-0"
    leave-to-class="op0 translate-x-4"
  >
    <aside
      v-if="state.queueOpen.value"
      class="fixed top-18 right-4 bottom-4 w-[30rem] max-w-[calc(100vw-2rem)] bg-glass rounded-lg shadow-xl z-40 flex flex-col overflow-hidden"
    >
      <header class="flex items-center gap-2 px-4 py-3 border-b border-base">
        <span class="i-octicon-list-unordered-16 color-active" />
        <h2 class="font-medium">Queue</h2>
        <span class="color-muted text-sm font-mono tabular-nums">{{ entries.length }}</span>
        <div class="flex-1" />
        <TooltipButton tooltip="Clear execute.yml">
          <button class="btn-action text-xs" :disabled="entries.length === 0" @click="clearDialogOpen = true">
            <span class="i-octicon-trash-16" />
            <span>Clear</span>
          </button>
        </TooltipButton>
        <TooltipButton tooltip="Close panel">
          <button class="btn-icon" aria-label="Close panel" @click="state.closeQueue()">
            <span class="i-octicon-x-16" />
          </button>
        </TooltipButton>
      </header>

      <div v-if="warnings.length" class="px-4 py-2 bg-yellow-500/10 border-b border-base text-xs color-muted">
        <div v-for="(w, i) in warnings" :key="i" class="flex items-start gap-2 py-0.5">
          <span class="i-octicon-alert-16 mt-0.5 flex-none color-yellow-600" />
          <span>{{ w }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="entries.length === 0" class="px-6 py-16 color-muted text-sm text-center">
          <span class="i-octicon-inbox-16 text-3xl block mb-3 op-fade mx-auto" />
          No operations queued.<br>
          <span class="text-xs color-faint">Open an item and use the footer actions to queue close/reopen/comment.</span>
        </div>
        <div v-else class="divide-y divide-neutral-200 dark:divide-neutral-800">
          <div
            v-for="entry in entries"
            :key="entry.id"
            class="group flex items-start gap-3 px-4 py-2.5 hover:bg-active transition"
          >
            <span
              class="badge font-mono text-xs flex-none"
              :style="{ backgroundColor: `${actionColor(entry.op.action)}22`, color: actionColor(entry.op.action) }"
            >{{ entry.op.action }}</span>

            <div class="flex-1 min-w-0">
              <div class="font-mono text-sm">#{{ entry.op.number }}</div>
              <div v-if="summarize(entry)" class="text-xs color-muted truncate mt-0.5">{{ summarize(entry) }}</div>
              <div class="text-[10px] color-faint font-mono mt-0.5 uppercase tracking-wide">
                {{ sourceLabel(entry.source) }}
              </div>
            </div>

            <div class="hover-fade flex items-center gap-1">
              <TooltipButton v-if="entry.source === 'per-item' && entry.filePath" tooltip="Open file">
                <button class="btn-icon" @click="openFile(entry)">
                  <span class="i-octicon-link-external-16" />
                </button>
              </TooltipButton>
              <TooltipButton v-else tooltip="Remove from queue">
                <button class="btn-icon" @click="remove(entry)">
                  <span class="i-octicon-trash-16" />
                </button>
              </TooltipButton>
            </div>
          </div>
        </div>
      </div>

      <footer class="border-t border-base px-4 py-3 bg-base/50 flex items-center gap-2">
        <div class="text-xs color-muted flex-1">
          Runs every op against GitHub.
        </div>
        <button
          class="btn-primary text-sm"
          :disabled="entries.length === 0 || state.executing.value || !hasToken"
          :title="!hasToken ? 'No GitHub token available' : undefined"
          @click="askExecute"
        >
          <span :class="state.executing.value ? 'i-octicon-sync-16 animate-spin' : 'i-octicon-play-16'" />
          <span>Execute {{ entries.length }} op{{ entries.length === 1 ? '' : 's' }}</span>
          <Kbd shortcut-id="action.execute" />
        </button>
      </footer>
    </aside>
  </Transition>

  <DialogRoot v-model:open="clearDialogOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40 backdrop-blur-sm z-60" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base border border-base rounded-lg shadow-xl p-6 w-[min(90vw,24rem)] z-60"
      >
        <DialogTitle class="font-medium text-base mb-2">Clear execute.yml?</DialogTitle>
        <DialogDescription class="text-sm color-muted mb-4">
          This removes all operations in <span class="font-mono">.ghfs/execute.yml</span>.
          <span class="font-mono">execute.md</span> and per-item edits are not affected.
        </DialogDescription>
        <div class="flex justify-end gap-2">
          <DialogClose as-child>
            <button class="btn-action">Cancel</button>
          </DialogClose>
          <button class="btn-primary" @click="confirmClear">Clear</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="executeConfirmOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40 backdrop-blur-sm z-60" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base border border-base rounded-lg shadow-xl p-6 w-[min(92vw,28rem)] z-60"
      >
        <DialogTitle class="font-medium text-base mb-2 flex items-center gap-2">
          <span class="i-octicon-play-16 color-primary-500" />
          Execute {{ entries.length }} operation{{ entries.length === 1 ? '' : 's' }}?
        </DialogTitle>
        <DialogDescription class="text-sm color-muted mb-4">
          These changes will be applied to GitHub immediately. This cannot be undone from here — you'll need to revert on GitHub if needed.
        </DialogDescription>
        <div class="flex justify-end gap-2">
          <DialogClose as-child>
            <button class="btn-action">Cancel</button>
          </DialogClose>
          <button class="btn-primary" :disabled="state.executing.value" @click="confirmExecute">
            <span class="i-octicon-play-16" />
            Execute
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
