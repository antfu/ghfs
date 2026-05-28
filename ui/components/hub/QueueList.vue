<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import { useRouter } from '#imports'
import { useAppState } from '../../composables/useAppState'
import { useHubQueue } from '../../composables/useHubQueue'
import { useOnlineState } from '../../composables/useOnlineState'
import { useRpc } from '../../composables/useRpc'
import DisplayProjectIcon from '../display/ProjectIcon.vue'
import QueueEntryCard from '../queue/EntryCard.vue'
import UiEmptyState from '../ui/EmptyState.vue'

const hubQueue = useHubQueue()
const router = useRouter()
const rpc = useRpc()
const state = useAppState()
const { offline } = useOnlineState()

function openItem(repo: string, number: number) {
  router.push(`/${repo}/${number}`)
}

async function remove(projectId: string, entry: QueueEntry) {
  state.setError(null)
  try {
    await rpc.$call('ghfs:remove-queue-op', projectId, entry.id)
    await hubQueue.load()
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}
</script>

<template>
  <UiEmptyState
    v-if="hubQueue.groups.value.length === 0"
    icon="i-octicon-inbox-16"
    title="No queued operations across any project"
    message="Open an item in any project and use the footer actions to queue close/reopen/comment."
  />
  <div v-else class="flex flex-col gap-4">
    <section
      v-for="group in hubQueue.groups.value"
      :key="group.projectId"
      class="panel-card overflow-hidden"
      data-testid="hub-queue-group"
      :data-project-id="group.projectId"
    >
      <header class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1">
        <DisplayProjectIcon :project="{ id: group.projectId, repo: group.repo }" :size="16" />
        <span class="font-mono text-sm font-medium">{{ group.repo }}</span>
        <span class="color-muted text-xs font-mono tabular-nums">{{ group.total }}</span>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-primary text-xs flex items-center gap-1.5"
          :disabled="hubQueue.executing.value === group.projectId || hubQueue.executing.value === 'all' || offline"
          :title="offline ? 'Offline — execute paused' : undefined"
          data-testid="hub-queue-execute-project"
          @click="hubQueue.executeProject(group.projectId)"
        >
          <span :class="hubQueue.executing.value === group.projectId ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
          <span>Execute</span>
        </button>
      </header>
      <ul class="flex flex-col gap-2 px-4 py-3">
        <li
          v-for="entry in group.queue.entries"
          :key="entry.id"
          class="group cursor-pointer"
          data-testid="hub-queue-entry"
          :data-entry-id="entry.id"
          @click="openItem(group.repo, entry.op.number)"
        >
          <QueueEntryCard
            :entry="entry"
            :project-id="group.projectId"
            :show-number="true"
            @remove="remove(group.projectId, $event)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
