<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'

const props = defineProps<{
  project: ProjectSummary
}>()

const state = useAppState(props.project.id)
const activity = useProjectActivity(() => props.project.id)

const syncing = computed(() => state.syncing.value)
const progress = computed(() => state.progress.value)
const percent = computed(() => {
  const p = progress.value?.percent
  if (typeof p !== 'number')
    return null
  return Math.round(Math.max(0, Math.min(1, p)) * 100)
})

const sparklinePoints = computed(() => activity.data.value?.buckets ?? [])
</script>

<template>
  <button
    type="button"
    class="panel-card text-left flex flex-col p-4 transition hover:border-active hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none relative overflow-hidden min-h-[120px]"
  >
    <div
      v-if="syncing"
      class="absolute top-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none z-2"
    >
      <div
        v-if="percent != null"
        class="h-full bg-primary-500 transition-all duration-300"
        :style="{ width: `${percent}%` }"
      />
      <div v-else class="h-full bg-primary-500/60 animate-pulse" style="width: 100%;" />
    </div>

    <div
      class="absolute inset-0 op-25 dark:op-20 pointer-events-none color-active"
      style="mask-image: linear-gradient(to bottom, transparent 0%, black 55%, black 88%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 55%, black 88%, transparent 100%);"
    >
      <DisplayActivitySparkline :points="sparklinePoints" />
    </div>

    <div class="relative z-1 flex items-center gap-2 min-w-0">
      <DisplayProjectIcon :project="project" :size="20" fallback-class="color-active" />
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

    <div class="relative z-1 mt-3 flex items-center gap-3 text-xs">
      <span class="flex items-center gap-1 color-muted" :title="`${project.openIssues} open issue${project.openIssues === 1 ? '' : 's'}`">
        <span class="i-octicon-issue-opened-16" />
        <span class="font-mono tabular-nums color-base">{{ project.openIssues }}</span>
      </span>
      <span class="flex items-center gap-1 color-muted" :title="`${project.openPulls} open pull request${project.openPulls === 1 ? '' : 's'}`">
        <span class="i-octicon-git-pull-request-16" />
        <span class="font-mono tabular-nums color-base">{{ project.openPulls }}</span>
      </span>
    </div>

    <div class="relative z-1 mt-2 flex flex-col gap-1 text-xs">
      <div class="flex items-center gap-1.5 color-muted">
        <span class="w-13 shrink-0">updated</span>
        <template v-if="project.lastActivityAt">
          <DisplayDateBadge :time="project.lastActivityAt" mode="day" colorize="freshness" />
        </template>
        <span v-else class="color-faint">—</span>
      </div>
      <div class="flex items-center gap-1.5 color-muted">
        <span class="w-13 shrink-0">synced</span>
        <template v-if="syncing">
          <span class="color-active">
            <template v-if="progress?.stage">{{ progress.stage }}</template>
            <template v-else>now…</template>
          </span>
          <span v-if="percent != null" class="font-mono tabular-nums color-active">{{ percent }}%</span>
        </template>
        <template v-else-if="project.lastSyncedAt">
          <DisplayDateBadge :time="project.lastSyncedAt" mode="day" colorize="staleness" />
        </template>
        <span v-else class="color-faint">never</span>
      </div>
    </div>
  </button>
</template>
