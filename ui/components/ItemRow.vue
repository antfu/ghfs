<script setup lang="ts">
import type { ProviderItem } from '../../src/types/provider'

const props = defineProps<{ item: ProviderItem }>()

const rpc = useRpc()
const state = useAppState()

const relativeUpdated = computed(() => formatRelative(props.item.updatedAt))
const stateBadge = computed(() => {
  if (props.item.kind === 'pull')
    return props.item.state === 'open' ? 'badge-color-green' : 'badge-color-purple'
  return props.item.state === 'open' ? 'badge-color-green' : 'badge-color-purple'
})
const stateIcon = computed(() => {
  if (props.item.kind === 'pull')
    return 'i-ri-git-pull-request-fill'
  return 'i-ri-bug-fill'
})

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
    const diff = Date.now() - new Date(iso).getTime()
    const seconds = Math.round(diff / 1000)
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
  <div class="group flex items-start gap-3 px-4 py-2.5 border-b border-base hover:bg-active transition">
    <span
      :class="[stateIcon, props.item.state === 'open' ? 'color-green-500 dark:color-green-400' : 'color-purple-500 dark:color-purple-400']"
      class="text-lg mt-0.5 flex-none"
    />
    <span class="font-mono text-xs w-14 flex-none color-muted pt-1 tabular-nums">#{{ item.number }}</span>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <a
          v-if="item.url"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          class="font-medium hover:color-active truncate"
        >{{ item.title }}</a>
        <span v-else class="font-medium truncate">{{ item.title }}</span>
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-1">
        <span
          :class="stateBadge"
        >{{ item.kind === 'pull' ? 'pr' : 'issue' }}/{{ item.state }}</span>
        <span v-if="item.author" class="font-mono">@{{ item.author }}</span>
        <span>{{ relativeUpdated }}</span>
        <template v-if="item.labels.length">
          <span class="color-faint">·</span>
          <span
            v-for="label in item.labels"
            :key="label"
            class="badge-color-neutral"
          >{{ label }}</span>
        </template>
        <template v-if="item.assignees.length">
          <span class="color-faint">·</span>
          <span class="font-mono">{{ item.assignees.map(a => `@${a}`).join(', ') }}</span>
        </template>
        <template v-if="item.milestone">
          <span class="color-faint">·</span>
          <span class="font-mono italic">{{ item.milestone }}</span>
        </template>
      </div>
    </div>

    <div class="flex items-center gap-1 hover-fade">
      <TooltipButton v-if="item.state === 'open'" tooltip="Queue close">
        <button class="btn-action !px-2 !py-1 text-xs" @click="queueClose">
          <span class="i-carbon-close" />
          <span>close</span>
        </button>
      </TooltipButton>
      <TooltipButton v-else tooltip="Queue reopen">
        <button class="btn-action !px-2 !py-1 text-xs" @click="queueReopen">
          <span class="i-carbon-restart" />
          <span>reopen</span>
        </button>
      </TooltipButton>
    </div>
  </div>
</template>
