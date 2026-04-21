<script setup lang="ts">
const state = useAppState()
const rpc = useRpc()
const isDark = useDark()

const repoName = computed(() => state.payload.value?.repo.repo ?? '…')
const upCount = computed(() => state.payload.value?.queue.upCount ?? 0)
const downCount = computed(() => state.payload.value?.remote.downCount ?? 0)
const remoteStale = computed(() => state.payload.value?.remote.stale ?? true)
const remoteMessage = computed(() => state.payload.value?.remote.message)
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)

async function triggerSync() {
  state.setError(null)
  state.setSyncing(true)
  try {
    await rpc.triggerSync({})
  }
  catch (error) {
    state.setError(`Sync failed: ${(error as Error).message}`)
    state.setSyncing(false)
  }
}

async function checkRemote() {
  try {
    await rpc.checkRemote()
  }
  catch (error) {
    state.setError(`Remote check failed: ${(error as Error).message}`)
  }
}

async function runQueue() {
  if (upCount.value === 0)
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
  <header class="sticky top-0 z-30 bg-glass flex items-center gap-3 px-4 py-3 border-b border-base">
    <div class="flex items-center gap-2 font-mono text-sm flex-1 min-w-0">
      <span class="i-carbon-ibm-cloud-pak-network-automation op60" />
      <span class="truncate">{{ repoName }}</span>
    </div>

    <button
      class="btn-action"
      :class="{ 'op60': remoteStale }"
      :title="remoteStale ? (remoteMessage || 'Not yet checked') : 'Items updated on GitHub since last sync'"
      @click="checkRemote"
    >
      <span class="i-carbon-chevron-down" />
      <span class="font-mono tabular-nums">{{ downCount }}</span>
    </button>

    <button
      class="btn-action"
      :disabled="state.syncing.value || !hasToken"
      :title="hasToken ? 'Sync from GitHub' : 'No GitHub token available'"
      @click="triggerSync"
    >
      <span :class="state.syncing.value ? 'i-carbon-renew animate-spin' : 'i-carbon-cloud-download'" />
      <span>Sync</span>
    </button>

    <button
      class="btn-action"
      :class="{ 'font-medium': upCount > 0 }"
      @click="state.queueOpen.value = !state.queueOpen.value"
    >
      <span class="i-carbon-chevron-up" />
      <span class="font-mono tabular-nums">{{ upCount }}</span>
      <span>Queue</span>
    </button>

    <button
      class="btn-primary"
      :disabled="upCount === 0 || state.executing.value || !hasToken"
      :title="hasToken ? 'Execute queued operations' : 'No GitHub token available'"
      @click="runQueue"
    >
      <span :class="state.executing.value ? 'i-carbon-renew animate-spin' : 'i-carbon-play-filled-alt'" />
      <span>Execute</span>
    </button>

    <button
      class="btn-action !px-2"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="isDark = !isDark"
    >
      <span :class="isDark ? 'i-carbon-sun' : 'i-carbon-moon'" />
    </button>
  </header>
</template>
