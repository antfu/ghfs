<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import { ACTIONS_COLOR_HEX } from '#ghfs/action-colors'

const hubQueue = useHubQueue()
const router = useRouter()

function actionColor(action: string): string {
  return (ACTIONS_COLOR_HEX as Record<string, string>)[action] ?? '#6b7280'
}

function summarize(op: Record<string, unknown>): string {
  const details: string[] = []
  if ('labels' in op && Array.isArray(op.labels))
    details.push((op.labels as string[]).join(', '))
  if ('assignees' in op && Array.isArray(op.assignees))
    details.push((op.assignees as string[]).map(a => `@${a}`).join(', '))
  if ('title' in op && typeof op.title === 'string')
    details.push(`"${op.title}"`)
  if ('body' in op && typeof op.body === 'string')
    details.push(`"${(op.body as string).slice(0, 60)}${(op.body as string).length > 60 ? '…' : ''}"`)
  if ('milestone' in op && op.milestone != null)
    details.push(String(op.milestone))
  return details.join(' ')
}

function openItem(repo: string, number: number) {
  router.push(`/${repo}/${number}`)
}
</script>

<template>
  <EmptyState
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
        <ProjectIcon :project="{ id: group.projectId, repo: group.repo }" :size="16" />
        <span class="font-mono text-sm font-medium">{{ group.repo }}</span>
        <span class="color-muted text-xs font-mono tabular-nums">{{ group.total }}</span>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-primary text-xs flex items-center gap-1.5"
          :disabled="hubQueue.executing.value === group.projectId || hubQueue.executing.value === 'all'"
          data-testid="hub-queue-execute-project"
          @click="hubQueue.executeProject(group.projectId)"
        >
          <span :class="hubQueue.executing.value === group.projectId ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
          <span>Execute</span>
        </button>
      </header>
      <ul class="flex flex-col divide-y divide-#8882">
        <li
          v-for="entry in group.queue.entries.filter((e: QueueEntry) => e.source !== 'per-item')"
          :key="entry.id"
          class="flex items-start gap-2 px-4 py-2 hover:bg-active transition cursor-pointer"
          @click="openItem(group.repo, entry.op.number)"
        >
          <span
            class="badge font-mono text-xs flex-none"
            :style="{ backgroundColor: `${actionColor(entry.op.action)}22`, color: actionColor(entry.op.action) }"
          >{{ entry.op.action }}</span>
          <span class="font-mono text-xs color-muted tabular-nums flex-none">#{{ entry.op.number }}</span>
          <span class="text-xs color-muted truncate flex-1">{{ summarize(entry.op as unknown as Record<string, unknown>) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
