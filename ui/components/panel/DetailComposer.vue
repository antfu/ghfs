<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'

const props = defineProps<{
  /** Issue/PR number this composer is for. */
  number: number
  /** Item kind — drives the placeholder + close button label. */
  kind: 'issue' | 'pull'
}>()

const emit = defineEmits<{
  /**
   * Fired after a comment / close / reopen op has been queued successfully.
   * The payload is the id of the new queue entry (when one was created — an
   * edit-update returns the same id; reopen also returns its op id).
   */
  submitted: [opId: string | null]
  /** Fired when the user clicks Cancel while editing a pending comment. */
  cancelledEditing: []
}>()

const activeId = useActiveProjectId()
const scope = useDetailScope()
const effectiveProjectId = computed(() => scope?.projectId ?? activeId.value)
const state = useAppState(scope?.projectId)
const ui = useUiState()
const rpc = useRpc()
const pending = usePendingOps(computed(() => props.number), scope?.projectId)

const kindLabel = computed(() => (props.kind === 'pull' ? 'pull request' : 'issue'))

const item = computed(() => {
  return state.payload.value?.syncState.items[String(props.number)]?.data.item ?? null
})

const effectiveState = computed<'open' | 'closed'>(() => {
  if (!item.value) return 'open'
  if (pending.direction.value === 'close') return 'closed'
  if (pending.direction.value === 'reopen') return 'open'
  return item.value.state
})

const submitting = ref(false)
const editingCommentId = ref<string | null>(null)
const editingDraft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

// Persistent draft for new comments lives in `.ghfs/.ui.json`. While editing
// a pending comment we bind to `editingDraft` instead so the live edit doesn't
// clobber the persisted draft.
const commentDraft = computed<string>({
  get() {
    if (editingCommentId.value)
      return editingDraft.value
    return ui.getDraft(props.number)
  },
  set(value: string) {
    if (editingCommentId.value) {
      editingDraft.value = value
      return
    }
    ui.setDraft(props.number, value)
  },
})

const draftHasContent = computed(() => {
  if (editingCommentId.value)
    return false
  return commentDraft.value.trim().length > 0
})

// Reset editing state when the composer's subject changes (cards mode advances
// through different items reusing the same composer instance).
watch(() => props.number, () => {
  editingCommentId.value = null
  editingDraft.value = ''
})

async function submitComment() {
  if (submitting.value)
    return
  const body = (editingCommentId.value ? editingDraft.value : ui.getDraft(props.number)).trim()
  if (!body)
    return
  submitting.value = true
  state.setError(null)
  try {
    let opId: string | null = null
    if (editingCommentId.value) {
      const entry = pending.pendingComments.value.find(e => e.id === editingCommentId.value)
      if (entry) {
        const op = entry.op as { action: string, number: number, body: string }
        await rpc.$call(
          'ghfs:update-queue-op',
          effectiveProjectId.value ?? '__default__',
          entry.id,
          { ...op, body } as typeof op,
        )
        opId = entry.id
      }
      editingCommentId.value = null
      editingDraft.value = ''
    }
    else {
      const queue = await rpc.$call('ghfs:add-queue-op', effectiveProjectId.value ?? '__default__', {
        action: 'add-comment',
        number: props.number,
        body,
      })
      opId = findOpId(queue.entries, props.number, ['add-comment'])
      ui.clearDraft(props.number)
    }
    emit('submitted', opId)
  }
  catch (error) {
    state.setError((error as Error).message)
  }
  finally {
    submitting.value = false
  }
}

/** Close (with the current draft as a comment if there is one). */
async function closeWithComment() {
  if (submitting.value || !item.value)
    return
  submitting.value = true
  state.setError(null)
  try {
    const body = ui.getDraft(props.number).trim()
    let opId: string | null = null
    if (body) {
      const queue = await rpc.$call('ghfs:add-queue-op', effectiveProjectId.value ?? '__default__', {
        action: 'close-with-comment',
        number: props.number,
        body,
      })
      opId = findOpId(queue.entries, props.number, ['close-with-comment'])
      ui.clearDraft(props.number)
    }
    else {
      const queue = await rpc.$call('ghfs:add-queue-op', effectiveProjectId.value ?? '__default__', {
        action: 'close',
        number: props.number,
      })
      opId = findOpId(queue.entries, props.number, ['close'])
    }
    emit('submitted', opId)
  }
  catch (error) {
    state.setError((error as Error).message)
  }
  finally {
    submitting.value = false
  }
}

async function reopen() {
  if (submitting.value || !item.value)
    return
  submitting.value = true
  state.setError(null)
  try {
    const queue = await rpc.$call('ghfs:add-queue-op', effectiveProjectId.value ?? '__default__', {
      action: 'reopen',
      number: props.number,
    })
    const opId = findOpId(queue.entries, props.number, ['reopen'])
    emit('submitted', opId)
  }
  catch (error) {
    state.setError((error as Error).message)
  }
  finally {
    submitting.value = false
  }
}

function findOpId(
  entries: { id: string, op: { number: number, action: string } }[],
  number: number,
  actions: string[],
): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (!entry)
      continue
    if (entry.op.number === number && actions.includes(entry.op.action))
      return entry.id
  }
  return null
}

function startEditing(entry: QueueEntry) {
  const op = entry.op as { body?: string }
  editingDraft.value = op.body ?? ''
  editingCommentId.value = entry.id
  nextTick(() => textarea.value?.focus())
}

function cancelEditing() {
  editingCommentId.value = null
  editingDraft.value = ''
  emit('cancelledEditing')
}

function focus() {
  textarea.value?.focus()
}

defineExpose({ startEditing, focus })
</script>

<template>
  <div
    class="border border-base rounded-lg bg-base transition"
    :class="editingCommentId
      ? 'ring-2 ring-yellow-500/60 border-yellow-500/60'
      : 'focus-within:border-active focus-within:ring-2 focus-within:ring-primary-500/30'"
  >
    <div class="relative">
      <textarea
        ref="textarea"
        v-model="commentDraft"
        data-shortcut="comment-draft"
        :placeholder="editingCommentId ? 'Editing pending comment…' : `Leave a comment on this ${kindLabel}`"
        rows="3"
        class="peer w-full bg-transparent outline-none px-3 py-2 text-sm resize-none font-sans"
        @keydown.meta.enter.exact.prevent.stop="submitComment"
        @keydown.ctrl.enter.exact.prevent.stop="submitComment"
        @keydown.meta.shift.enter.prevent.stop="closeWithComment"
        @keydown.ctrl.shift.enter.prevent.stop="closeWithComment"
      />
      <UiWithCommand
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
        :disabled="submitting"
        @click="closeWithComment"
      >
        <span class="i-octicon-x-circle-16 color-red-500 dark:color-red-400" />
        <span v-if="pending.direction.value === 'reopen'">Cancel reopen</span>
        <span v-else-if="draftHasContent">Close with comment</span>
        <span v-else>Close {{ kindLabel }}</span>
        <UiKbd keys="⌘ ⇧ ↵" tone="muted" />
      </button>
      <button
        v-else
        type="button"
        class="btn-action text-sm"
        :disabled="submitting"
        @click="reopen"
      >
        <span class="i-octicon-issue-opened-16 color-green-500 dark:color-green-400" />
        {{ pending.direction.value === 'close' ? 'Cancel close' : `Reopen ${kindLabel}` }}
      </button>
      <button
        type="button"
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
</template>
