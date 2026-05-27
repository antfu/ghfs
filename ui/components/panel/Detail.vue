<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import type { QueueEntry } from '#ghfs/server-types'
import type { SyncItemState } from '../../../src/types/sync-state'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { provideDetailScope } from '../../composables/useDetailScope'
import { renderMarkdownInline } from '../../composables/useMarkdown'
import { useOnlineState } from '../../composables/useOnlineState'
import { usePendingOps } from '../../composables/usePendingOps'
import { useRpc } from '../../composables/useRpc'
import { useSeenHistory } from '../../composables/useSeenHistory'
import { useSwrSync } from '../../composables/useSwrSync'
import { useUiState } from '../../composables/useUiState'
import DisplayAuthor from '../display/Author.vue'
import DisplayDateBadge from '../display/DateBadge.vue'
import DisplayItemStateIcon from '../display/ItemStateIcon.vue'
import DisplayLabel from '../display/Label.vue'
import DisplayPrReviewDecision from '../display/PrReviewDecision.vue'
import DisplayProjectIcon from '../display/ProjectIcon.vue'
import DisplayStatePill from '../display/StatePill.vue'
import UiBadge from '../ui/Badge.vue'
import UiEmptyState from '../ui/EmptyState.vue'
import UiIconButton from '../ui/IconButton.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import PanelDetailComposer from './DetailComposer.vue'
import PanelDetailConversationTab from './DetailConversationTab.vue'
import PanelDetailLabelEditor from './DetailLabelEditor.vue'
import PanelDetailPrChangesTab from './DetailPrChangesTab.vue'
import PanelDetailPrCommitsTab from './DetailPrCommitsTab.vue'

const props = withDefaults(defineProps<{
  /** Override `state.selectedNumber` (used by cards mode). */
  number?: number | null
  /** Override the active project id (used by cards mode for cross-project rendering). */
  projectId?: string | null
  /** Compact mode hides the footer composer and the inline execute/discard bar. */
  compact?: boolean
  /** Show the project icon + owner/repo above the title. Enabled in cross-project views. */
  showRepo?: boolean
}>(), {
  number: null,
  projectId: null,
  compact: false,
  showRepo: false,
})

const activeId = useActiveProjectId()
const effectiveProjectId = computed(() => props.projectId ?? activeId.value)
provideDetailScope({ projectId: effectiveProjectId.value })

const state = useAppState(props.projectId)
const rpc = useRpc()
const ui = useUiState()
const seenHistory = useSeenHistory()
const { offline } = useOnlineState()

const effectiveNumber = computed<number | null>(() =>
  props.number != null ? props.number : state.selectedNumber.value,
)

const selected = computed<SyncItemState | null>(() => {
  const num = effectiveNumber.value
  if (num == null)
    return null
  return state.payload.value?.syncState.items[String(num)] ?? null
})

const item = computed(() => selected.value?.data.item ?? null)
const comments = computed(() => selected.value?.data.comments ?? [])
const pullMeta = computed(() => selected.value?.data.pull)
const commits = computed(() => selected.value?.data.commits ?? [])
const timeline = computed(() => selected.value?.data.timeline ?? [])
const reviewComments = computed(() => selected.value?.data.reviewComments ?? [])
const hasPatch = computed(() => Boolean(selected.value?.patchPath))
const labels = computed(() => item.value?.labels ?? [])
const assignees = computed(() => item.value?.assignees ?? [])

type PrTab = 'conversation' | 'commits' | 'changes'
const prTab = computed<PrTab>({
  get() {
    return ui.uiState.lastPrTab ?? 'conversation'
  },
  set(next: PrTab) {
    ui.setLastPrTab(next)
  },
})

const pending = usePendingOps(computed(() => item.value?.number ?? null), props.projectId)

const effectiveState = computed<'open' | 'closed'>(() => {
  if (!item.value) return 'open'
  if (pending.direction.value === 'close') return 'closed'
  if (pending.direction.value === 'reopen') return 'open'
  return item.value.state
})

const stateLabel = computed(() => {
  if (!item.value)
    return 'open'
  const eff = effectiveState.value
  if (item.value.kind === 'pull') {
    if (eff === 'open')
      return pullMeta.value?.isDraft ? 'draft' : 'open'
    if (pullMeta.value?.merged) return 'merged'
    return 'closed'
  }
  if (eff === 'closed')
    return item.value.stateReason === 'not_planned' ? 'not planned' : 'closed'
  return 'open'
})

const kindLabel = computed(() => item.value?.kind === 'pull' ? 'pull request' : 'issue')
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)

const repoProject = computed(() => {
  const payload = state.payload.value
  if (!payload)
    return null
  return { id: payload.projectId, repo: payload.repo.repo }
})

const titleText = computed(() => {
  const op = pending.pendingTitle.value?.op
  if (op && op.action === 'set-title')
    return (op as { title: string }).title
  return item.value?.title ?? ''
})
const titleIsPending = computed(() => !!pending.pendingTitle.value)
const titleHtml = computed(() => renderMarkdownInline(titleText.value))

const scrollContainer = ref<HTMLElement | null>(null)
const composerRef = ref<{ startEditing: (entry: QueueEntry) => void } | null>(null)

const swr = useSwrSync()
const isRefreshing = swr.isRefreshing(effectiveProjectId, effectiveNumber)

watch(effectiveNumber, () => {
  nextTick(() => {
    if (scrollContainer.value)
      scrollContainer.value.scrollTop = 0
  })
})

// Background-refresh the currently-viewed item if its cached data is older
// than the SWR TTL. Runs on every selection change including initial mount.
watch(
  [effectiveNumber, effectiveProjectId],
  ([number, projectId]) => {
    swr.checkAndRefresh(projectId, number)
  },
  { immediate: true },
)

// Mark the currently-viewed item as "seen". Fires on initial mount, every
// item switch, and whenever the comment count changes so a fresh sync that
// lands while the user is still on the item updates the last-seen point
// instead of leaving an old position behind.
watch(
  [effectiveNumber, effectiveProjectId, () => selected.value?.data.comments?.length ?? 0],
  () => {
    const num = effectiveNumber.value
    const projectId = effectiveProjectId.value
    const entry = selected.value
    if (num == null || !projectId || !entry)
      return
    const comments = entry.data.comments ?? []
    let lastCommentId: number | null = null
    let latestAt = ''
    for (const c of comments) {
      if (!c.createdAt)
        continue
      if (c.createdAt > latestAt) {
        latestAt = c.createdAt
        lastCommentId = c.id
      }
    }
    seenHistory.markSeen(`${projectId}#${num}`, {
      lastCommentId,
      lastSeenAt: new Date().toISOString(),
    })
  },
  { immediate: true },
)

function startEditingPendingComment(entry: QueueEntry) {
  composerRef.value?.startEditing(entry)
}

async function removePendingComment(entry: QueueEntry) {
  state.setError(null)
  try {
    await rpc.$call('ghfs:remove-queue-op', effectiveProjectId.value ?? '__default__', entry.id)
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function executeThisItem() {
  if (!item.value || state.executing.value)
    return
  if (offline.value)
    return
  const ids = pending.entries.value.map(e => e.id)
  if (!ids.length)
    return
  state.setError(null)
  state.setExecuting(true)
  try {
    await rpc.$call('ghfs:execute-queue', effectiveProjectId.value ?? '__default__', { entryIds: ids, continueOnError: true })
  }
  catch (error) {
    state.setError(`Execute failed: ${(error as Error).message}`)
    state.setExecuting(false)
  }
}

async function discardThisItem() {
  state.setError(null)
  for (const entry of pending.entries.value) {
    try {
      await rpc.$call('ghfs:remove-queue-op', effectiveProjectId.value ?? '__default__', entry.id)
    }
    catch (error) {
      state.setError((error as Error).message)
      return
    }
  }
}

</script>

<template>
  <div v-if="!item" class="h-full flex flex-col items-center justify-center">
    <UiEmptyState
      icon="i-octicon-inbox-16"
      title="Select an item on the left to view it here"
      size="lg"
    >
      <template #hint>
        <p class="text-xs color-faint">
          Use <span class="kbd">j</span> <span class="kbd">k</span> to navigate items, <span class="kbd">↑</span> <span class="kbd">↓</span> to scroll.
        </p>
      </template>
    </UiEmptyState>
  </div>

  <article v-else class="h-full flex flex-col min-h-0 bg-base">
    <div
      v-if="showRepo && repoProject"
      class="flex items-center gap-2 px-6 pt-3 pb-1 text-xs color-muted"
      data-testid="detail-repo-line"
    >
      <DisplayProjectIcon :project="repoProject" :size="16" />
      <span class="font-mono">{{ repoProject.repo }}</span>
    </div>
    <header class="flex items-center gap-2 px-6 py-2.5 border-b border-base">
      <DisplayItemStateIcon :item="item" :pull="pullMeta" :pending="pending.direction.value" class="shrink-0" />
      <div class="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
        <h2
          class="font-medium text-lg leading-tight"
          :class="{ italic: titleIsPending }"
          data-testid="detail-title"
          v-html="titleHtml"
        />
        <span class="font-mono text-sm color-muted tabular-nums">#{{ item.number }}</span>
        <DisplayStatePill :state="(stateLabel as any)" :kind="item.kind" />
        <DisplayPrReviewDecision
          v-if="item.kind === 'pull' && pullMeta?.reviewDecision"
          :decision="pullMeta.reviewDecision"
        />
        <UiBadge
          v-if="pending.direction.value"
          color="yellow"
          icon="i-octicon-hourglass-16"
          size="xs"
          class="uppercase tracking-wide"
        >
          pending
        </UiBadge>
        <DisplayAuthor
          v-if="item.author"
          :author="{ login: item.author, avatarUrl: item.authorAvatarUrl }"
          :size="14"
        />
        <span class="text-xs color-muted flex items-center gap-1">
          <span class="color-faint">·</span>
          <DisplayDateBadge :time="item.createdAt" />
        </span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span
          v-if="isRefreshing"
          class="i-octicon-sync-16 animate-spin color-muted text-sm"
          :title="`Refreshing #${item.number} from GitHub…`"
          data-testid="detail-swr-indicator"
        />
        <UiWithCommand v-if="item?.url" command="list.open">
          <UiIconButton
            as="a"
            :href="item?.url"
            target="_blank"
            rel="noreferrer"
            icon="i-ph-arrow-square-out-duotone"
            size="sm"
            tooltip="Open on GitHub"
          />
        </UiWithCommand>
      </div>
    </header>

    <div class="border-b border-base text-xs">
      <UiWithCommand v-slot="{ execute, disabled }" command="item.labels" tone="muted" class="!flex w-full pr-4">
        <button
          type="button"
          class="flex-1 min-w-0 px-6 py-1.5 flex items-center gap-1.5 flex-wrap text-left hover:bg-active transition outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
          data-testid="detail-labels-row"
          :title="'Edit labels'"
          :disabled="disabled"
          @click="execute"
        >
          <span class="i-octicon-tag-16 color-muted" />
          <DisplayLabel v-for="label in labels" :key="label" :name="label" />
          <span v-if="!labels.length" class="color-faint italic">no labels</span>
        </button>
      </UiWithCommand>
      <div
        v-if="assignees.length || item.milestone"
        class="px-6 py-1.5 flex items-center gap-1.5 flex-wrap"
      >
        <template v-if="assignees.length">
          <span class="i-octicon-person-16 color-muted" />
          <DisplayAuthor
            v-for="a in assignees"
            :key="a"
            :author="a"
            :size="14"
          />
        </template>
        <template v-if="item.milestone">
          <span class="i-octicon-milestone-16 color-muted ml-2" />
          <span class="font-mono italic">{{ item.milestone }}</span>
        </template>
      </div>
    </div>

    <div
      v-if="pending.hasPending.value"
      class="px-6 py-2 border-b border-yellow-500/30 bg-yellow-500/8 flex items-center gap-3 text-sm"
    >
      <span class="i-octicon-hourglass-16 color-yellow-600 dark:color-yellow-400 shrink-0" />
      <div class="flex-1 min-w-0">
        <span class="font-medium">
          {{ pending.entries.value.length }} pending change{{ pending.entries.value.length === 1 ? '' : 's' }}
        </span>
        <span class="color-muted"> queued for this {{ kindLabel }}</span>
      </div>
      <template v-if="!compact">
        <button
          type="button"
          class="btn-action-sm"
          :disabled="state.executing.value || !hasToken || offline"
          :title="offline ? 'Offline — execute paused' : (hasToken ? 'Execute the pending changes for this item only' : 'No GitHub token available')"
          @click="executeThisItem"
        >
          <span :class="state.executing.value ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
          Execute
        </button>
        <button
          type="button"
          class="btn-action-sm"
          @click="discardThisItem"
        >
          <span class="i-ph-trash-duotone" />
          Discard
        </button>
      </template>
    </div>

    <TabsRoot
      v-if="item.kind === 'pull'"
      v-model="prTab"
      class="flex-1 flex flex-col min-h-0"
    >
      <TabsList class="flex items-stretch gap-1 px-4 pt-3 border-b border-base">
        <TabsTrigger
          value="conversation"
          class="tab-trigger"
        >
          <span class="i-octicon-comment-discussion-16" />
          Conversation
          <span v-if="comments.length + timeline.length" class="tab-count">{{ comments.length + timeline.length }}</span>
          <UiWithCommand command="pr.tab.conversation" tone="muted" />
        </TabsTrigger>
        <TabsTrigger
          value="commits"
          class="tab-trigger"
        >
          <span class="i-octicon-git-commit-16" />
          Commits
          <span v-if="commits.length" class="tab-count">{{ commits.length }}</span>
          <UiWithCommand command="pr.tab.commits" tone="muted" />
        </TabsTrigger>
        <TabsTrigger
          value="changes"
          class="tab-trigger"
        >
          <span class="i-octicon-file-diff-16" />
          Changes
          <UiWithCommand command="pr.tab.changes" tone="muted" />
        </TabsTrigger>
      </TabsList>
      <div ref="scrollContainer" data-scroll="detail" class="flex-1 overflow-y-auto">
        <TabsContent value="conversation">
          <PanelDetailConversationTab
            :item="item"
            :comments="comments"
            :timeline="timeline"
            :review-comments="reviewComments"
            :pending-comments="pending.pendingComments.value"
            @edit-pending="startEditingPendingComment"
            @remove-pending="removePendingComment"
          />
        </TabsContent>
        <TabsContent value="commits">
          <PanelDetailPrCommitsTab :commits="commits" />
        </TabsContent>
        <TabsContent value="changes">
          <PanelDetailPrChangesTab :number="item.number" :has-patch="hasPatch" />
        </TabsContent>
      </div>
    </TabsRoot>

    <div v-else ref="scrollContainer" data-scroll="detail" class="flex-1 overflow-y-auto">
      <PanelDetailConversationTab
        :item="item"
        :comments="comments"
        :timeline="timeline"
        :pending-comments="pending.pendingComments.value"
        @edit-pending="startEditingPendingComment"
        @remove-pending="removePendingComment"
      />
    </div>

    <footer v-if="!compact" class="border-t border-base px-6 py-3 bg-base">
      <PanelDetailComposer
        ref="composerRef"
        :number="item.number"
        :kind="item.kind"
      />
    </footer>
    <PanelDetailLabelEditor />
  </article>
</template>
