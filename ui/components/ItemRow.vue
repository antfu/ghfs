<script setup lang="ts">
import type { ProviderItem } from '../../src/types/provider'

const props = defineProps<{ item: ProviderItem }>()

const rpc = useRpc()
const state = useAppState()

const relativeUpdated = computed(() => formatRelative(props.item.updatedAt))

async function queueClose() {
  state.setError(null)
  try {
    await rpc.addQueueOp({ action: 'close', number: props.item.number })
  }
  catch (error) {
    state.setError(`Failed to queue: ${(error as Error).message}`)
  }
}

async function queueReopen() {
  state.setError(null)
  try {
    await rpc.addQueueOp({ action: 'reopen', number: props.item.number })
  }
  catch (error) {
    state.setError(`Failed to queue: ${(error as Error).message}`)
  }
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const seconds = Math.round(diffMs / 1000)
    const minutes = Math.round(seconds / 60)
    const hours = Math.round(minutes / 60)
    const days = Math.round(hours / 24)
    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 60) return `${days}d ago`
    const months = Math.round(days / 30)
    if (months < 24) return `${months}mo ago`
    return `${Math.round(days / 365)}y ago`
  }
  catch {
    return iso
  }
}
</script>

<template>
  <div class="group flex items-start gap-3 px-4 py-2 border-b border-base hover:bg-secondary transition">
    <span
      class="font-mono text-xs w-16 flex-none color-muted pt-0.5 tabular-nums"
    >#{{ item.number }}</span>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span
          :class="item.state === 'open' ? 'badge-open' : 'badge-closed'"
        >
          {{ item.kind === 'pull' ? `PR ${item.state}` : item.state }}
        </span>
        <a
          v-if="item.url"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          class="font-medium hover:underline"
        >{{ item.title }}</a>
        <span v-else class="font-medium">{{ item.title }}</span>
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-1">
        <span v-if="item.author" class="font-mono">@{{ item.author }}</span>
        <span>{{ relativeUpdated }}</span>
        <template v-if="item.labels.length">
          <span class="opacity-50">·</span>
          <span
            v-for="label in item.labels"
            :key="label"
            class="badge-label"
          >{{ label }}</span>
        </template>
        <template v-if="item.assignees.length">
          <span class="opacity-50">·</span>
          <span class="font-mono">{{ item.assignees.map(a => `@${a}`).join(', ') }}</span>
        </template>
        <template v-if="item.milestone">
          <span class="opacity-50">·</span>
          <span class="font-mono">{{ item.milestone }}</span>
        </template>
      </div>
    </div>

    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
      <button
        v-if="item.state === 'open'"
        class="btn-action !px-2 !py-1 text-xs"
        title="Queue close"
        @click="queueClose"
      >
        <span class="i-carbon-close" />
        <span>close</span>
      </button>
      <button
        v-else
        class="btn-action !px-2 !py-1 text-xs"
        title="Queue reopen"
        @click="queueReopen"
      >
        <span class="i-carbon-restart" />
        <span>reopen</span>
      </button>
    </div>
  </div>
</template>
