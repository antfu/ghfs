<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type { SyncItemState } from '../../src/types/sync-state'

const state = useAppState()
const rpc = useRpc()
const ui = useUiState()

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
const labelMap = useLabelColorMap()

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

const closeWithComment = ref(false)
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
  closeWithComment.value = false
  editingCommentId.value = null
  editingDraft.value = ''
  nextTick(() => {
    if (scrollContainer.value)
      scrollContainer.value.scrollTop = 0
  })
})

async function queueClose() {
  if (!item.value)
    return
  state.setError(null)
  try {
    await rpc.addQueueOp({ action: 'close', number: item.value.number })
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
    await rpc.addQueueOp({ action: 'reopen', number: item.value.number })
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function submitComment() {
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
        await rpc.updateQueueOp(entry.id, { ...op, body } as typeof op)
      }
      editingCommentId.value = null
      editingDraft.value = ''
    }
    else if (closeWithComment.value && effectiveState.value === 'open') {
      await rpc.addQueueOp({
        action: 'close-with-comment',
        number: item.value.number,
        body,
      })
      ui.clearDraft(item.value.number)
      closeWithComment.value = false
    }
    else {
      await rpc.addQueueOp({
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
  closeWithComment.value = false
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
    await rpc.removeQueueOp(entry.id)
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
    await rpc.executeQueue({ entryIds: ids, continueOnError: true })
  }
  catch (error) {
    state.setError(`Execute failed: ${(error as Error).message}`)
    state.setExecuting(false)
  }
}

async function discardThisItem() {
  state.setError(null)
  const entries = pending.entries.value
  const skipped: string[] = []
  for (const entry of entries) {
    if (entry.source === 'per-item') {
      skipped.push(entry.filePath ?? '(per-item)')
      continue
    }
    try {
      await rpc.removeQueueOp(entry.id)
    }
    catch (error) {
      state.setError((error as Error).message)
      return
    }
  }
  if (skipped.length)
    state.setError(`Left ${skipped.length} frontmatter edit(s) in place; edit the markdown to undo them.`)
}
</script>

<template>
  <div v-if="!item" class="h-full flex flex-col items-center justify-center color-muted">
    <span class="i-octicon-inbox-16 text-5xl mb-4 op-fade" />
    <p class="text-sm">Select an item on the left to view it here.</p>
    <p class="text-xs mt-2 color-faint">Use <span class="kbd">j</span> <span class="kbd">k</span> or <span class="kbd">↑</span> <span class="kbd">↓</span> to navigate.</p>
  </div>

  <article v-else class="h-full flex flex-col min-h-0 bg-base">
    <header class="flex items-start gap-3 px-6 py-4 border-b border-base">
      <ItemStateIcon :item="item" :pull="pullMeta" :pending="pending.direction.value" size="lg" class="mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h2
            class="font-medium text-xl leading-tight"
            :class="{ italic: titleIsPending }"
            v-html="titleHtml"
          />
          <a
            v-if="item.url"
            :href="item.url"
            target="_blank"
            rel="noreferrer"
            tabindex="-1"
            class="font-mono text-base color-muted hover:color-active tabular-nums"
            :aria-label="`Open #${item.number} on GitHub`"
          >#{{ item.number }}</a>
          <span v-else class="font-mono text-base color-muted tabular-nums">#{{ item.number }}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-2">
          <span class="badge-color-neutral uppercase tracking-wide text-[10px]">{{ stateLabel }}</span>
          <span v-if="pending.direction.value" class="badge-color-yellow uppercase tracking-wide text-[10px] flex items-center gap-1">
            <span class="i-octicon-hourglass-16 text-[10px]" /> pending
          </span>
          <Avatar v-if="item.author" :login="item.author" :size="16" />
          <span v-if="item.author" class="font-mono">@{{ item.author }}</span>
          <span class="color-faint">·</span>
          <span>opened {{ formatRelative(item.createdAt) }}</span>
          <span v-if="item.updatedAt !== item.createdAt" class="color-faint">·</span>
          <span v-if="item.updatedAt !== item.createdAt">updated {{ formatRelative(item.updatedAt) }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <TooltipButton v-if="item.url" tooltip="Open on GitHub">
          <a
            :href="item.url"
            target="_blank"
            rel="noreferrer"
            class="btn-icon"
            aria-label="Open on GitHub"
          >
            <span class="i-octicon-link-external-16" />
          </a>
        </TooltipButton>
        <Kbd shortcut-id="list.open" />
      </div>
    </header>

    <div v-if="labels.length || assignees.length || item.milestone" class="px-6 py-2 border-b border-base flex items-center gap-2 flex-wrap text-xs">
      <template v-if="labels.length">
        <span class="i-octicon-tag-16 color-muted" />
        <span
          v-for="label in labels"
          :key="label"
          class="badge border"
          :style="labelMap.get(label) ? labelStyle(labelMap.get(label)!.color) : undefined"
          :class="{ 'badge-color-neutral border-transparent': !labelMap.get(label) }"
        >{{ label }}</span>
      </template>
      <template v-if="assignees.length">
        <span class="i-octicon-person-16 color-muted ml-2" />
        <span v-for="a in assignees" :key="a" class="flex items-center gap-1">
          <Avatar :login="a" :size="14" />
          <span class="font-mono">@{{ a }}</span>
        </span>
      </template>
      <template v-if="item.milestone">
        <span class="i-octicon-milestone-16 color-muted ml-2" />
        <span class="font-mono italic">{{ item.milestone }}</span>
      </template>
    </div>

    <div
      v-if="pending.hasPending.value"
      class="px-6 py-3 border-b border-yellow-500/30 bg-yellow-500/10 flex items-center gap-3 text-sm"
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
        class="btn-action text-sm"
        :disabled="state.executing.value || !hasToken"
        :title="hasToken ? 'Execute the pending changes for this item only' : 'No GitHub token available'"
        @click="executeThisItem"
      >
        <span :class="state.executing.value ? 'i-octicon-sync-16 animate-spin' : 'i-octicon-play-16'" />
        Execute
      </button>
      <button
        type="button"
        class="btn-action text-sm"
        @click="discardThisItem"
      >
        <span class="i-octicon-trash-16" />
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
        </TabsTrigger>
        <TabsTrigger
          value="commits"
          class="tab-trigger"
        >
          <span class="i-octicon-git-commit-16" />
          Commits
          <span v-if="commits.length" class="tab-count">{{ commits.length }}</span>
        </TabsTrigger>
        <TabsTrigger
          value="changes"
          class="tab-trigger"
        >
          <span class="i-octicon-file-diff-16" />
          Changes
        </TabsTrigger>
      </TabsList>
      <div ref="scrollContainer" class="flex-1 overflow-y-auto">
        <TabsContent value="conversation">
          <ConversationTab
            :item="item"
            :comments="comments"
            :timeline="timeline"
            :pending-comments="pending.pendingComments.value"
            @edit-pending="startEditingPendingComment"
            @remove-pending="removePendingComment"
          />
        </TabsContent>
        <TabsContent value="commits">
          <PrCommitsTab :commits="commits" />
        </TabsContent>
        <TabsContent value="changes">
          <PrChangesTab :number="item.number" :has-patch="hasPatch" />
        </TabsContent>
      </div>
    </TabsRoot>

    <div v-else ref="scrollContainer" class="flex-1 overflow-y-auto">
      <ConversationTab
        :item="item"
        :comments="comments"
        :timeline="timeline"
        :pending-comments="pending.pendingComments.value"
        @edit-pending="startEditingPendingComment"
        @remove-pending="removePendingComment"
      />
    </div>

    <footer class="border-t border-base px-6 py-3 bg-base flex flex-col gap-3">
      <div class="border border-base rounded-lg bg-base" :class="{ 'ring-2 ring-yellow-500/60 border-yellow-500/60': editingCommentId }">
        <textarea
          v-model="commentDraft"
          data-shortcut="comment-draft"
          :placeholder="editingCommentId ? 'Editing pending comment…' : `Leave a comment on this ${kindLabel}`"
          rows="3"
          class="w-full bg-transparent outline-none px-3 py-2 text-sm resize-none font-sans"
        />
        <div class="flex items-center gap-2 px-2 py-1.5 border-t border-base">
          <label v-if="!editingCommentId && effectiveState === 'open'" class="flex items-center gap-1.5 text-xs color-muted cursor-pointer select-none">
            <input v-model="closeWithComment" type="checkbox" class="accent-primary-500">
            Close with comment
          </label>
          <span v-else-if="editingCommentId" class="text-xs color-muted">Editing a queued comment</span>
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
            {{ pending.direction.value === 'reopen' ? 'Cancel reopen' : `Close ${kindLabel}` }}
            <Kbd shortcut-id="item.close" />
          </button>
          <button
            v-else
            type="button"
            class="btn-action text-sm"
            @click="queueReopen"
          >
            <span class="i-octicon-issue-opened-16 color-green-500 dark:color-green-400" />
            {{ pending.direction.value === 'close' ? 'Cancel close' : `Reopen ${kindLabel}` }}
            <Kbd shortcut-id="item.reopen" />
          </button>
          <button
            class="btn-primary text-sm"
            :disabled="!commentDraft.trim() || submitting"
            @click="submitComment"
          >
            <span class="i-octicon-comment-16" />
            <span v-if="editingCommentId">Update comment</span>
            <span v-else-if="closeWithComment && effectiveState === 'open'">Close with comment</span>
            <span v-else>Comment</span>
          </button>
        </div>
      </div>
    </footer>
  </article>
</template>
