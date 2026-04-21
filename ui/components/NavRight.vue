<script setup lang="ts">
const state = useAppState()
const rpc = useRpc()
const isDark = useDark()

const upCount = computed(() => state.payload.value?.queue.upCount ?? 0)
const downCount = computed(() => state.payload.value?.remote.downCount ?? 0)
const remoteStale = computed(() => state.payload.value?.remote.stale ?? true)
const remoteMessage = computed(() => state.payload.value?.remote.message)
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
const syncing = state.syncing
const executing = state.executing

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

function toggleQueue() {
  state.queueOpen.value = !state.queueOpen.value
}
</script>

<template>
  <nav class="nav-right">
    <TooltipButton :tooltip="remoteStale ? (remoteMessage || 'Not yet checked') : 'Updates available on GitHub since last sync'">
      <button class="btn-circle relative" :class="{ 'op-fade': remoteStale }" @click="checkRemote">
        <span class="i-ph-arrow-circle-down-duotone text-lg" />
        <span
          v-if="downCount > 0"
          class="absolute -top-0.5 -right-0.5 badge-color-blue !px-1.5 !py-0 font-mono tabular-nums text-[10px]"
        >{{ downCount }}</span>
      </button>
    </TooltipButton>

    <TooltipButton :tooltip="hasToken ? 'Sync from GitHub' : 'No GitHub token available'">
      <button class="btn-circle" :disabled="syncing.value || !hasToken" @click="triggerSync">
        <span :class="syncing.value ? 'i-carbon-renew animate-spin text-lg' : 'i-carbon-cloud-download text-lg'" />
      </button>
    </TooltipButton>

    <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />

    <TooltipButton tooltip="Queue">
      <button class="btn-circle relative" @click="toggleQueue">
        <span class="i-ph-list-bullets-duotone text-lg" />
        <span
          v-if="upCount > 0"
          class="absolute -top-0.5 -right-0.5 badge-color-green !px-1.5 !py-0 font-mono tabular-nums text-[10px]"
        >{{ upCount }}</span>
      </button>
    </TooltipButton>

    <TooltipButton :tooltip="hasToken ? `Execute ${upCount} queued op${upCount === 1 ? '' : 's'}` : 'No GitHub token available'">
      <button class="btn-circle" :disabled="upCount === 0 || executing.value || !hasToken" @click="runQueue">
        <span :class="executing.value ? 'i-carbon-renew animate-spin text-lg' : 'i-ph-play-circle-duotone text-lg'" />
      </button>
    </TooltipButton>

    <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />

    <TooltipButton :tooltip="isDark ? 'Light mode' : 'Dark mode'">
      <button class="btn-circle" @click="isDark = !isDark">
        <span :class="isDark ? 'i-ph-sun-duotone text-lg' : 'i-ph-moon-duotone text-lg'" />
      </button>
    </TooltipButton>
  </nav>
</template>
