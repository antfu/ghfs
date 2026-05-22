<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useRpc()

const repoName = computed(() => state.payload.value?.repo.repo ?? '')
const queueCount = computed(() => state.payload.value?.queue.upCount ?? 0)
const itemCount = computed(() => Object.keys(state.payload.value?.syncState.items ?? {}).length)

async function confirm() {
  if (state.executing.value)
    return
  const projectId = activeId.value
  if (!projectId)
    return
  open.value = false
  state.setError(null)
  state.selectItem(null)
  state.setSyncing(true)
  try {
    await rpc.$call('ghfs:force-sync', projectId)
  }
  catch (error) {
    state.setError(`Force sync failed: ${(error as Error).message}`)
    state.setSyncing(false)
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    title="Force sync"
    icon="i-ph-warning-duotone"
    width="w-[min(92vw,30rem)]"
    description="Wipe all local data and re-fetch from GitHub from scratch."
    data-testid="force-sync-dialog"
  >
    <div class="px-5 py-4 flex flex-col gap-3 text-sm">
      <p>
        This will wipe local data for
        <span class="font-mono font-medium">{{ repoName }}</span>
        and re-fetch everything from GitHub.
      </p>
      <ul class="flex flex-col gap-1.5 pl-4 list-disc color-muted text-xs leading-relaxed">
        <li>
          <span class="color-base">{{ itemCount }}</span> synced issues / PRs and their patches will be deleted.
        </li>
        <li>
          <span class="color-base">{{ queueCount }}</span> pending queue operations will be cleared.
        </li>
        <li>Per-item label and comment edits in markdown files will be lost.</li>
        <li>Your <code class="font-mono">.ui.json</code> preferences (user override etc.) will be preserved.</li>
      </ul>
      <p class="text-xs color-muted">
        This cannot be undone. Make sure you have executed any operations you want to keep.
      </p>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        data-testid="force-sync-cancel"
        @click="open = false"
      >
        Cancel
      </button>
      <div class="flex-1" />
      <button
        type="button"
        class="px-3 py-1.5 rounded text-sm bg-red-500 hover:bg-red-600 text-white transition disabled:op50 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        :disabled="state.executing.value || !activeId"
        data-testid="force-sync-confirm"
        @click="confirm"
      >
        Force sync
      </button>
    </template>
  </UiModal>
</template>
