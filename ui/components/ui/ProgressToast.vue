<script setup lang="ts">
import type { SyncStage } from '#ghfs/sync-contracts'
import { computed } from 'vue'
import { useTimestamp } from '@vueuse/core'
import { useAppState } from '../../composables/useAppState'
import type { ProgressState } from '../../composables/useAppState'
import UiIconButton from './IconButton.vue'

const state = useAppState()

const progress = computed<ProgressState | null>(() => state.progress.value)
const lastError = computed(() => state.lastError.value)

// Show the panel if we have a sync/execute progress event OR a stand-alone
// error from elsewhere in the app (label edit, reactions, etc.).
const visible = computed(() => progress.value !== null || lastError.value !== null)

const phase = computed(() => progress.value?.phase ?? 'running')

const SYNC_STAGES: SyncStage[] = ['metadata', 'pagination', 'fetch', 'materialize', 'prune', 'save']

const STAGE_LABELS: Record<SyncStage, string> = {
  metadata: 'Reading repository state',
  pagination: 'Scanning issues and PRs',
  fetch: 'Fetching items',
  materialize: 'Writing local files',
  prune: 'Cleaning up stale files',
  save: 'Saving index',
}

// Static icon strings so UnoCSS scans and bundles each glyph.
const STAGE_ICONS: Record<SyncStage, string> = {
  metadata: 'i-octicon-repo-16',
  pagination: 'i-octicon-search-16',
  fetch: 'i-octicon-download-16',
  materialize: 'i-octicon-file-16',
  prune: 'i-octicon-trash-16',
  save: 'i-octicon-database-16',
}

const ACTION_LABELS: Record<string, string> = {
  skip: 'unchanged',
  refetch: 'updated',
  create: 'new',
  move: 'moved',
  remove: 'removed',
}

// Tick the clock once a second so the elapsed timer updates while running.
const tick = useTimestamp({ interval: 1000 })

const elapsedMs = computed(() => {
  const startedAt = progress.value?.startedAt
  if (!startedAt)
    return 0
  // When the run is finished, prefer the summary's recorded duration so the
  // success state shows the exact value the server saw rather than a number
  // that keeps growing if the toast lingers.
  const summary = progress.value?.summary
  if (summary)
    return summary.durationMs
  return Math.max(0, tick.value - startedAt)
})

function formatElapsed(ms: number): string {
  if (ms < 10_000)
    return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.floor(ms / 1000)
  const mm = Math.floor(totalSeconds / 60)
  const ss = (totalSeconds % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

const elapsedLabel = computed(() => formatElapsed(elapsedMs.value))

const stageHistorySet = computed(() => new Set(progress.value?.stageHistory ?? []))

function dotClass(stage: SyncStage): string {
  const p = progress.value
  if (!p)
    return 'h-2 w-2 rounded-full bg-#8882'
  if (p.phase === 'error') {
    if (p.errorStage === stage)
      return 'h-2 w-2 rounded-full bg-red-500'
    if (stageHistorySet.value.has(stage))
      return 'h-2 w-2 rounded-full bg-primary-500'
    return 'h-2 w-2 rounded-full bg-#8882'
  }
  if (p.phase === 'success')
    return 'h-2 w-2 rounded-full bg-primary-500'
  if (p.stage === stage)
    return 'h-2 w-2 rounded-full bg-primary-500 ring-2 ring-primary-500/25 animate-pulse'
  if (stageHistorySet.value.has(stage))
    return 'h-2 w-2 rounded-full bg-primary-500'
  return 'h-2 w-2 rounded-full bg-#8882'
}

function connectorClass(stage: SyncStage): string {
  const p = progress.value
  if (!p)
    return 'flex-1 h-px bg-#8882 mx-1'
  if (p.phase === 'success')
    return 'flex-1 h-px bg-primary-500 mx-1'
  // The connector after `stage` is "lit" if `stage` has finished.
  const currentIdx = p.stage ? SYNC_STAGES.indexOf(p.stage) : -1
  const thisIdx = SYNC_STAGES.indexOf(stage)
  const lit = stageHistorySet.value.has(stage) || currentIdx > thisIdx
  return lit ? 'flex-1 h-px bg-primary-500 mx-1' : 'flex-1 h-px bg-#8882 mx-1'
}

const activeStageLabel = computed(() => {
  const p = progress.value
  if (!p)
    return ''
  if (p.phase === 'success')
    return 'Sync complete'
  if (p.phase === 'error')
    return `Sync failed${p.errorStage ? ` during ${p.errorStage}` : ''}`
  if (p.kind === 'execute')
    return 'Applying queued operations'
  return p.stage ? STAGE_LABELS[p.stage] : 'Starting…'
})

const activeStageIcon = computed(() => {
  const p = progress.value
  if (!p || p.kind !== 'sync' || !p.stage || p.phase !== 'running')
    return ''
  return STAGE_ICONS[p.stage]
})

const percentLabel = computed(() => {
  const pct = progress.value?.percent
  if (typeof pct !== 'number')
    return null
  return Math.round(Math.max(0, Math.min(1, pct)) * 100)
})

const progressBarWidth = computed(() => {
  const p = progress.value
  if (!p)
    return '0%'
  if (p.phase === 'success')
    return '100%'
  if (typeof p.percent === 'number')
    return `${Math.round(Math.max(0, Math.min(1, p.percent)) * 100)}%`
  return '0%'
})

const progressBarColor = computed(() => {
  if (phase.value === 'error')
    return 'bg-red-500'
  if (phase.value === 'success')
    return 'bg-green-500'
  return 'bg-primary-500'
})

const showProgressBar = computed(() => {
  const p = progress.value
  if (!p)
    return false
  if (p.phase === 'error')
    return false
  // Sync: show once a percent is known (i.e. after pagination).
  // Execute: show whenever we have a planned total.
  return typeof p.percent === 'number'
})

interface CounterChip {
  label: string
  value: number
}

const counterChips = computed<CounterChip[]>(() => {
  const p = progress.value
  if (!p || p.kind !== 'sync')
    return []
  const snap = p.snapshot
  if (!snap)
    return []
  const chips: CounterChip[] = []
  if (snap.scanned)
    chips.push({ label: 'scanned', value: snap.scanned })
  if (snap.written)
    chips.push({ label: 'written', value: snap.written })
  if (snap.moved)
    chips.push({ label: 'moved', value: snap.moved })
  if (snap.skipped)
    chips.push({ label: 'skipped', value: snap.skipped })
  if (snap.patchesDeleted)
    chips.push({ label: 'pruned', value: snap.patchesDeleted })
  return chips
})

const currentItem = computed(() => progress.value?.currentItem)
const currentItemActionLabel = computed(() => {
  const a = currentItem.value?.action
  if (!a)
    return ''
  return ACTION_LABELS[a] ?? a
})

function dismiss() {
  state.setProgress(null)
  state.setError(null)
}

function formatCount(n: number): string {
  return n.toLocaleString()
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="op0 translate-y-2"
    enter-to-class="op100 translate-y-0"
    leave-active-class="transition duration-150"
    leave-from-class="op100 translate-y-0"
    leave-to-class="op0 translate-y-2"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-toast w-[420px] h-[172px] panel-card shadow-lg overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <!-- Generic last-error fallback (label edits, reactions, etc.) -->
      <div v-if="!progress && lastError" class="h-full flex items-start gap-3 px-4 py-3">
        <span class="i-octicon-alert-fill-16 color-red-500 mt-0.5 flex-none" />
        <div class="flex-1 text-sm color-base">
          {{ lastError }}
        </div>
        <UiIconButton
          icon="i-octicon-x-16"
          size="sm"
          tooltip="Dismiss"
          @click="state.setError(null)"
        />
      </div>

      <!-- Sync / execute panel (running, success, error) -->
      <div v-else-if="progress" class="h-full flex flex-col">
        <!-- Header row (fixed 44px) -->
        <div class="flex items-center gap-2.5 px-4 pt-2.5 pb-1.5 h-[44px] flex-none">
          <span
            v-if="phase === 'success'"
            class="i-octicon-check-circle-fill-16 color-green-600 dark:color-green-400 flex-none"
          />
          <span
            v-else-if="phase === 'error'"
            class="i-octicon-alert-fill-16 color-red-500 flex-none"
          />
          <span
            v-else-if="progress.kind === 'sync'"
            class="i-octicon-sync-16 animate-spin color-active flex-none"
          />
          <span
            v-else
            class="i-octicon-play-16 color-active flex-none animate-pulse"
          />

          <div class="flex-1 min-w-0 flex items-baseline gap-2">
            <span class="text-sm font-medium color-base">
              {{ progress.kind === 'execute' ? (phase === 'success' ? 'Execute complete' : phase === 'error' ? 'Execute failed' : 'Executing') : (phase === 'success' ? 'Sync complete' : phase === 'error' ? 'Sync failed' : 'Syncing') }}
            </span>
            <span
              v-if="phase !== 'error'"
              class="font-mono text-xs color-faint tabular-nums"
              :title="phase === 'success' ? 'Total duration' : 'Elapsed'"
            >{{ elapsedLabel }}</span>
          </div>

          <UiIconButton
            icon="i-octicon-x-16"
            size="sm"
            tooltip="Dismiss"
            @click="dismiss"
          />
        </div>

        <!-- Stage pipeline (fixed 20px; empty when execute) -->
        <div class="flex items-center px-4 pb-2.5 h-[20px] flex-none">
          <template v-if="progress.kind === 'sync'">
            <template v-for="(stage, idx) in SYNC_STAGES" :key="stage">
              <span :class="dotClass(stage)" :title="STAGE_LABELS[stage]" />
              <span v-if="Number(idx) < SYNC_STAGES.length - 1" :class="connectorClass(stage)" />
            </template>
          </template>
        </div>

        <!-- Active stage label + current item subtitle (fixed 48px) -->
        <div class="px-4 pb-2 flex items-start gap-2 h-[48px] flex-none">
          <span
            v-if="activeStageIcon"
            :class="activeStageIcon"
            class="color-active flex-none mt-0.5"
          />
          <div class="flex-1 min-w-0">
            <div :class="phase === 'error' ? 'text-sm color-red-600 dark:color-red-400 truncate' : 'text-sm color-base truncate'">
              {{ activeStageLabel }}
            </div>
            <div class="text-xs color-muted mt-0.5 h-[16px] leading-[16px]">
              <span
                v-if="phase === 'error' && progress.message"
                class="block truncate"
              >{{ progress.message }}</span>
              <span
                v-else-if="currentItem"
                class="flex items-center gap-1.5 min-w-0"
              >
                <span
                  :class="currentItem.kind === 'pull' ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16'"
                  class="color-faint flex-none text-[12px]"
                />
                <span class="font-mono tabular-nums">#{{ currentItem.number }}</span>
                <span class="color-faint">·</span>
                <span class="truncate">{{ currentItemActionLabel }}</span>
              </span>
              <span
                v-else-if="progress.kind === 'execute' && progress.message"
                class="block truncate"
              >{{ progress.message }}</span>
            </div>
          </div>
        </div>

        <!-- Progress bar with numeric counter (fixed 24px) -->
        <div class="px-4 pb-2 h-[24px] flex-none">
          <div class="flex items-center gap-2.5 h-full">
            <div class="flex-1 h-1.5 bg-#8882 rounded-full overflow-hidden">
              <div
                v-if="showProgressBar || phase === 'success'"
                class="h-full rounded-full transition-all duration-300"
                :class="progressBarColor"
                :style="{ width: progressBarWidth }"
              />
            </div>
            <span
              v-if="progress.total != null && progress.processed != null"
              class="font-mono tabular-nums text-xs color-muted whitespace-nowrap"
            >
              {{ formatCount(progress.processed) }} / {{ formatCount(progress.total) }}
              <span v-if="percentLabel != null" class="color-faint">· {{ percentLabel }}%</span>
            </span>
          </div>
        </div>

        <!-- Live counter strip / success summary (fixed 32px) -->
        <div class="px-4 pb-3 pt-1 h-[32px] flex-none flex flex-nowrap items-baseline gap-x-2 text-xs color-muted overflow-hidden">
          <!-- Success summary -->
          <template v-if="phase === 'success' && progress.summary">
            <span class="color-base font-medium whitespace-nowrap">
              {{ progress.summary.updatedIssues + progress.summary.updatedPulls }} item{{ progress.summary.updatedIssues + progress.summary.updatedPulls === 1 ? '' : 's' }} updated
            </span>
            <template v-if="progress.summary.updatedIssues">
              <span class="color-faint">·</span>
              <span class="whitespace-nowrap"><span class="font-mono tabular-nums color-base">{{ progress.summary.updatedIssues }}</span> issue{{ progress.summary.updatedIssues === 1 ? '' : 's' }}</span>
            </template>
            <template v-if="progress.summary.updatedPulls">
              <span class="color-faint">·</span>
              <span class="whitespace-nowrap"><span class="font-mono tabular-nums color-base">{{ progress.summary.updatedPulls }}</span> PR{{ progress.summary.updatedPulls === 1 ? '' : 's' }}</span>
            </template>
            <template v-if="progress.summary.requestCount">
              <span class="color-faint">·</span>
              <span class="whitespace-nowrap"><span class="font-mono tabular-nums color-base">{{ progress.summary.requestCount }}</span> API</span>
            </template>
          </template>
          <!-- Running counter chips -->
          <template v-else-if="counterChips.length > 0 && phase === 'running'">
            <template v-for="(chip, idx) in counterChips" :key="chip.label">
              <span v-if="Number(idx) > 0" class="color-faint">·</span>
              <span class="whitespace-nowrap">
                <span class="font-mono tabular-nums color-base">{{ formatCount(chip.value) }}</span>
                <span class="ml-0.5">{{ chip.label }}</span>
              </span>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>
