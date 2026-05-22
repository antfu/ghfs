<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type { SyncItemState } from '../../../src/types/sync-state'

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useRpc()
const ui = useUiState()
const { currentUser } = useCurrentUser()
const userOverrideOpen = ref(false)

const selected = computed<SyncItemState | null>(() => {
  const num = state.selectedNumber.value
  if (num == null)
    return null
  return state.payload.value?.syncState.items[String(num)] ?? null
})

const item = computed(() => selected.value?.data.item ?? null)
const comments = computed(() => selected.value?.data.comments ?? [])
const pullMeta = computed(() => selected.value?.data.pull)
const commits = computed(() => selected.value?.data.commits ?? [])
const timeline = computed(() => selected.value?.data.timeline ?? [])
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

const pending = usePendingOps(computed(() => item.value?.number ?? null))

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

const titleText = computed(() => {
  const op = pending.pendingTitle.value?.op
  if (op && op.action === 'set-title')
    return (op as { title: string }).title
  return item.value?.title ?? ''
})
const titleIsPending = computed(() => !!pending.pendingTitle.value)
const titleHtml = computed(() => renderMarkdownInline(titleText.value))

const submitting = ref(false)
const editingCommentId = ref<string | null>(null)
const editingDraft = ref('')

// Persistent draft for NEW comments — routed through .ghfs/.ui.json.
// While editing a pending comment, we bind to `editingDraft` instead so
// the edit doesn't clobber the persisted draft.
const commentDraft = computed<string>({
  get() {
    if (editingCommentId.value)
      return editingDraft.value
    return ui.getDraft(item.value?.number)
  },
  set(value: string) {
    if (editingCommentId.value) {
      editingDraft.value = value
      return
    }
    if (item.value?.number == null)
      return
    ui.setDraft(item.value.number, value)
  },
})

const scrollContainer = ref<HTMLElement | null>(null)

watch(() => state.selectedNumber.value, () => {
  editingCommentId.value = null
  editingDraft.value = ''
  nextTick(() => {
    if (scrollContainer.value)
      scrollContainer.value.scrollTop = 0
  })
})

const draftHasContent = computed(() => {
  if (editingCommentId.value)
    return false
  return commentDraft.value.trim().length > 0
})

async function queueClose() {
  if (!item.value)
    return
  state.setError(null)
  const number = item.value.number
  const body = ui.getDraft(number).trim()
  try {
    if (body) {
      await rpc.$call('ghfs:add-queue-op', activeId.value ?? '__default__', { action: 'close-with-comment', number, body })
      ui.clearDraft(number)
    }
    else {
      await rpc.$call('ghfs:add-queue-op', activeId.value ?? '__default__', { action: 'close', number })
    }
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function queueReopen() {
  if (!item.value)
    return
  state.setError(null)
  try {
    await rpc.$call('ghfs:add-queue-op', activeId.value ?? '__default__', { action: 'reopen', number: item.value.number })
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function submitComment() {
  if (submitting.value)
    return
  if (!item.value)
    return
  const body = (editingCommentId.value ? editingDraft.value : ui.getDraft(item.value.number)).trim()
  if (!body)
    return
  submitting.value = true
  state.setError(null)
  try {
    if (editingCommentId.value) {
      const entry = pending.pendingComments.value.find(e => e.id === editingCommentId.value)
      if (entry) {
        const op = entry.op as { action: string, number: number, body: string }
        await rpc.$call('ghfs:update-queue-op', activeId.value ?? '__default__', entry.id, { ...op, body } as typeof op)
      }
      editingCommentId.value = null
      editingDraft.value = ''
    }
    else {
      await rpc.$call('ghfs:add-queue-op', activeId.value ?? '__default__', {
        action: 'add-comment',
        number: item.value.number,
        body,
      })
      ui.clearDraft(item.value.number)
    }
  }
  catch (error) {
    state.setError((error as Error).message)
  }
  finally {
    submitting.value = false
  }
}

function startEditingPendingComment(entry: QueueEntry) {
  const op = entry.op as { body?: string }
  editingDraft.value = op.body ?? ''
  editingCommentId.value = entry.id
  nextTick(() => {
    const el = document.querySelector<HTMLTextAreaElement>('[data-shortcut="comment-draft"]')
    el?.focus()
  })
}

function cancelEditing() {
  editingCommentId.value = null
  editingDraft.value = ''
}

async function removePendingComment(entry: QueueEntry) {
  state.setError(null)
  try {
    await rpc.$call('ghfs:remove-queue-op', activeId.value ?? '__default__', entry.id)
    if (editingCommentId.value === entry.id)
      cancelEditing()
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function executeThisItem() {
  if (!item.value || state.executing.value)
    return
  const ids = pending.entries.value.map(e => e.id)
  if (!ids.length)
    return
  state.setError(null)
  state.setExecuting(true)
  try {
    await rpc.$call('ghfs:execute-queue', activeId.value ?? '__default__', { entryIds: ids, continueOnError: true })
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
      await rpc.$call('ghfs:remove-queue-op', activeId.value ?? '__default__', entry.id)
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
          :author="item.author"
          :size="14"
        />
        <span class="text-xs color-muted flex items-center gap-1">
          <span class="color-faint">·</span>
          <DisplayDateBadge :time="item.createdAt" mode="day" />
        </span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <UiIconButton
          v-if="item.url"
          as="a"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          icon="i-ph-arrow-square-out-duotone"
          size="sm"
          tooltip="Open on GitHub"
        />
        <UiKbd command="list.open" />
      </div>
    </header>

    <div class="border-b border-base text-xs">
      <button
        type="button"
        class="w-full px-6 py-1.5 flex items-center gap-1.5 flex-wrap text-left hover:bg-active transition outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
        data-testid="detail-labels-row"
        :title="'Edit labels'"
        @click="ui.labelEditorOpen.value = true"
      >
        <span class="i-octicon-tag-16 color-muted" />
        <DisplayLabel v-for="label in labels" :key="label" :name="label" />
        <span v-if="!labels.length" class="color-faint italic">no labels</span>
        <UiKbd command="item.labels" tone="muted" class="ml-auto" />
      </button>
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
      <button
        type="button"
        class="btn-action-sm"
        :disabled="state.executing.value || !hasToken"
        :title="hasToken ? 'Execute the pending changes for this item only' : 'No GitHub token available'"
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
          <UiKbd command="pr.tab.conversation" tone="muted" />
        </TabsTrigger>
        <TabsTrigger
          value="commits"
          class="tab-trigger"
        >
          <span class="i-octicon-git-commit-16" />
          Commits
          <span v-if="commits.length" class="tab-count">{{ commits.length }}</span>
          <UiKbd command="pr.tab.commits" tone="muted" />
        </TabsTrigger>
        <TabsTrigger
          value="changes"
          class="tab-trigger"
        >
          <span class="i-octicon-file-diff-16" />
          Changes
          <UiKbd command="pr.tab.changes" tone="muted" />
        </TabsTrigger>
      </TabsList>
      <div ref="scrollContainer" data-scroll="detail" class="flex-1 overflow-y-auto">
        <TabsContent value="conversation">
          <PanelDetailConversationTab
            :item="item"
            :comments="comments"
            :timeline="timeline"
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

    <footer class="border-t border-base px-6 py-3 bg-base flex flex-col gap-2">
      <div class="flex items-center gap-2 text-xs color-muted">
        <DisplayAuthor
          v-if="currentUser?.login"
          :author="{ login: currentUser.login, avatarUrl: currentUser.avatarUrl, name: currentUser.name }"
          :size="18"
          :link="false"
        />
        <span v-else class="font-mono">(no user)</span>
        <span v-if="currentUser?.name" class="color-faint">· {{ currentUser.name }}</span>
        <div class="flex-1" />
        <UiIconButton
          icon="i-ph-user-switch-duotone"
          size="sm"
          tooltip="Override user"
          aria-label="Override user identity"
          @click="userOverrideOpen = true"
        />
      </div>
      <div
        class="border border-base rounded-lg bg-base transition"
        :class="editingCommentId
          ? 'ring-2 ring-yellow-500/60 border-yellow-500/60'
          : 'focus-within:border-active focus-within:ring-2 focus-within:ring-primary-500/30'"
      >
        <div class="relative">
          <textarea
            v-model="commentDraft"
            data-shortcut="comment-draft"
            :placeholder="editingCommentId ? 'Editing pending comment…' : `Leave a comment on this ${kindLabel}`"
            rows="3"
            class="peer w-full bg-transparent outline-none px-3 py-2 text-sm resize-none font-sans"
            @keydown.meta.enter.prevent.stop="submitComment"
            @keydown.ctrl.enter.prevent.stop="submitComment"
          />
          <UiKbd
            command="comment.focus"
            tone="muted"
            class="absolute bottom-2 right-2 pointer-events-none peer-focus:op0 transition-opacity"
          />
        </div>
        <div class="flex items-center gap-2 px-2 py-1.5 border-t border-base">
          <span v-if="editingCommentId" class="text-xs color-muted">Editing a queued comment</span>
          <div class="flex-1" />
          <button
            v-if="editingCommentId"
            type="button"
            class="btn-action text-sm"
            @click="cancelEditing"
          >
            Cancel
          </button>
          <button
            v-if="effectiveState === 'open'"
            type="button"
            class="btn-action text-sm"
            @click="queueClose"
          >
            <span class="i-octicon-x-circle-16 color-red-500 dark:color-red-400" />
            <span v-if="pending.direction.value === 'reopen'">Cancel reopen</span>
            <span v-else-if="draftHasContent">Close with comment</span>
            <span v-else>Close {{ kindLabel }}</span>
            <UiKbd command="item.close" />
          </button>
          <button
            v-else
            type="button"
            class="btn-action text-sm"
            @click="queueReopen"
          >
            <span class="i-octicon-issue-opened-16 color-green-500 dark:color-green-400" />
            {{ pending.direction.value === 'close' ? 'Cancel close' : `Reopen ${kindLabel}` }}
            <UiKbd command="item.reopen" />
          </button>
          <button
            class="btn-primary text-sm"
            :disabled="!commentDraft.trim() || submitting"
            @click="submitComment"
          >
            <span class="i-octicon-comment-16" />
            <span v-if="editingCommentId">Update comment</span>
            <span v-else>Comment</span>
            <UiKbd keys="⌘ ↵" tone="muted" />
          </button>
        </div>
      </div>
    </footer>
    <PanelDetailUserOverrideDialog v-model:open="userOverrideOpen" />
    <PanelDetailLabelEditor />
  </article>
</template>
