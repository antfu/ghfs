<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/shared-rpc'

const props = defineProps<{
  project: ProjectSummary
}>()

const state = useAppState(props.project.id)

const syncing = computed(() => state.syncing.value)
const progress = computed(() => state.progress.value)
const percent = computed(() => {
  const p = progress.value?.percent
  if (typeof p !== 'number')
    return null
  return Math.round(Math.max(0, Math.min(1, p)) * 100)
})
</script>

<template>
  <button
    type="button"
    class="panel-card text-left flex flex-col p-4 transition hover:border-active hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none relative overflow-hidden"
  >
    <div
      v-if="syncing"
      class="absolute top-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none"
    >
      <div
        v-if="percent != null"
        class="h-full bg-primary-500 transition-all duration-300"
        :style="{ width: `${percent}%` }"
      />
      <div v-else class="h-full bg-primary-500/60 animate-pulse" style="width: 100%;" />
    </div>

    <div class="flex items-center gap-2 min-w-0">
      <ProjectIcon :project="project" :size="20" fallback-class="color-active" />
      <span class="font-mono text-sm font-medium truncate" :title="project.repo">{{ project.repo }}</span>
      <div class="flex-1" />
      <span
        v-if="syncing"
        class="i-octicon-sync-16 animate-spin color-active text-sm"
        title="Syncing…"
      />
      <span
        v-else-if="!project.hasToken"
        class="i-octicon-key-16 color-yellow-600 dark:color-yellow-400"
        title="No GitHub token; sync disabled"
      />
    </div>

    <div class="mt-3 flex items-center gap-3 text-xs">
      <span class="flex items-center gap-1 color-muted">
        <span class="i-octicon-issue-opened-16" />
        <span class="font-mono tabular-nums color-base">{{ project.openIssues }}</span>
      </span>
      <span class="flex items-center gap-1 color-muted">
        <span class="i-octicon-git-pull-request-16" />
        <span class="font-mono tabular-nums color-base">{{ project.openPulls }}</span>
      </span>
      <span class="flex items-center gap-1 color-muted">
        <span class="i-octicon-database-16" />
        <span class="font-mono tabular-nums color-base">{{ project.itemCount }}</span>
      </span>
    </div>

    <div class="mt-2 text-[11px] color-muted truncate font-mono" :title="project.path">{{ project.path }}</div>

    <div
      class="mt-1 text-[11px] flex items-center gap-2"
      :class="syncing ? 'color-active' : 'color-muted'"
      :title="project.lastActivityAt ?? project.lastSyncedAt ?? ''"
    >
      <template v-if="syncing">
        <span class="font-medium">
          <template v-if="progress?.stage">{{ progress.stage }}</template>
          <template v-else>Syncing…</template>
        </span>
        <span v-if="percent != null" class="font-mono tabular-nums">{{ percent }}%</span>
        <span v-else-if="progress?.processed != null && progress?.total" class="font-mono tabular-nums">
          {{ progress.processed }} / {{ progress.total }}
        </span>
      </template>
      <template v-else-if="project.lastActivityAt">updated {{ formatRelative(project.lastActivityAt) }}</template>
      <template v-else-if="project.lastSyncedAt">synced {{ formatRelative(project.lastSyncedAt) }}</template>
      <span v-else class="flex items-center gap-1">
        <span class="i-ph-clock-duotone text-[10px]" />
        <span>never synced</span>
      </span>
    </div>
  </button>
</template>
