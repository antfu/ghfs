<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import { ACTIONS_COLOR_HEX } from '#ghfs/action-colors'

const state = useAppState()
const rpc = useRpc()

const entries = computed<QueueEntry[]>(() => state.payload.value?.queue.entries ?? [])
const warnings = computed<string[]>(() => state.payload.value?.queue.warnings ?? [])

function sourceLabel(source: QueueEntry['source']): string {
  if (source === 'execute.yml') return 'yml'
  if (source === 'execute.md') return 'md'
  return 'file'
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

async function clearAll() {
  if (!confirm('Clear all ops in execute.yml? (execute.md and per-item edits are not affected.)'))
    return
  state.setError(null)
  try {
    await rpc.clearQueue()
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition"
    enter-from-class="opacity-0 translate-x-4"
    enter-to-class="opacity-100 translate-x-0"
    leave-active-class="transition"
    leave-from-class="opacity-100 translate-x-0"
    leave-to-class="opacity-0 translate-x-4"
  >
    <aside
      v-if="state.queueOpen.value"
      class="fixed top-0 right-0 bottom-0 w-100 bg-glass border-l border-base z-40 flex flex-col shadow-xl"
    >
      <div class="flex items-center gap-2 px-4 py-3 border-b border-base">
        <span class="i-carbon-list-checked" />
        <h2 class="font-medium">Queue</h2>
        <span class="color-muted text-sm font-mono">{{ entries.length }}</span>
        <div class="flex-1" />
        <button
          class="btn-action text-xs"
          :disabled="entries.length === 0"
          @click="clearAll"
        >
          <span class="i-carbon-trash-can" />
          Clear yml
        </button>
        <button
          class="btn-action !px-2 !py-1"
          aria-label="Close panel"
          @click="state.queueOpen.value = false"
        >
          <span class="i-carbon-close" />
        </button>
      </div>

      <div v-if="warnings.length" class="px-4 py-2 bg-yellow-500/10 border-b border-base text-xs color-muted">
        <div v-for="(w, i) in warnings" :key="i" class="flex items-start gap-2 py-0.5">
          <span class="i-carbon-warning mt-0.5" />
          <span>{{ w }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="entries.length === 0" class="px-4 py-10 color-muted text-sm text-center">
          No operations queued.<br>
          Click <span class="kbd">close</span> / <span class="kbd">reopen</span> on an item to queue one.
        </div>
        <div v-else class="divide-y divide-base">
          <div
            v-for="entry in entries"
            :key="entry.id"
            class="flex items-start gap-3 px-4 py-2"
          >
            <span
              class="badge font-mono text-xs"
              :style="{ backgroundColor: `${actionColor(entry.op.action)}22`, color: actionColor(entry.op.action) }"
            >{{ entry.op.action }}</span>

            <div class="flex-1 min-w-0">
              <div class="font-mono text-sm">#{{ entry.op.number }}</div>
              <div v-if="summarize(entry)" class="text-xs color-muted truncate">{{ summarize(entry) }}</div>
              <div class="text-xs color-muted mt-0.5 font-mono opacity-60">source: {{ sourceLabel(entry.source) }}</div>
            </div>

            <button
              v-if="entry.source === 'per-item' && entry.filePath"
              class="btn-action !px-2 !py-1 text-xs"
              title="Open file"
              @click="openFile(entry)"
            >
              <span class="i-carbon-launch" />
            </button>
            <button
              v-else
              class="btn-action !px-2 !py-1 text-xs"
              title="Remove from queue"
              @click="remove(entry)"
            >
              <span class="i-carbon-trash-can" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>
