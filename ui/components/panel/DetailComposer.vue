<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { QueueEntry } from '#ghfs/server-types'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useDetailScope } from '../../composables/useDetailScope'
import { usePendingOps } from '../../composables/usePendingOps'
import { useRpc } from '../../composables/useRpc'
import { useUiState } from '../../composables/useUiState'
import UiKbd from '../ui/Kbd.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import PanelDetailTemplatePicker from './DetailTemplatePicker.vue'

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
const templatePickerOpen = ref(false)
const templatePicker = ref<{
  next: () => void
  prev: () => void
  confirm: () => boolean
  close: () => void
} | null>(null)

const templateContext = computed(() => ({
  author: item.value?.author ?? null,
  number: props.number,
  title: item.value?.title ?? null,
}))

// ───── Slash command (`/foo`) ────────────────────────────────────────
// When the user types `/` at the start of the textarea or right after
// whitespace, open the picker and feed it the characters that follow until
// a space, newline, or cursor jump ends slash mode.

const slashStart = ref<number | null>(null)
const slashQuery = ref('')
const slashActive = computed(() => slashStart.value !== null)

function checkSlash() {
  const el = textarea.value
  if (!el)
    return
  const text = el.value
  const pos = el.selectionStart

  if (slashStart.value !== null) {
    // Existing slash session: extend while still consecutive non-whitespace
    // text after `/`.
    if (text[slashStart.value] === '/' && pos > slashStart.value) {
      const suffix = text.slice(slashStart.value + 1, pos)
      if (/\s/.test(suffix)) {
        endSlash()
        return
      }
      slashQuery.value = suffix
      return
    }
    endSlash()
    return
  }

  // New slash session: must be at start-of-textarea or after whitespace.
  if (pos > 0 && text[pos - 1] === '/') {
    const before = pos >= 2 ? text[pos - 2] : ''
    const validBefore = before === '' || /\s/.test(before)
    if (validBefore) {
      slashStart.value = pos - 1
      slashQuery.value = ''
      templatePickerOpen.value = true
    }
  }
}

function endSlash() {
  slashStart.value = null
  slashQuery.value = ''
  templatePickerOpen.value = false
}

function onTextareaInput() {
  checkSlash()
}

function onTextareaSelectionChange() {
  if (slashStart.value !== null)
    checkSlash()
}

function insertTemplate(text: string) {
  const el = textarea.value
  // Slash insertion: replace the `/...` query with the body.
  if (slashStart.value !== null && el) {
    const start = slashStart.value
    const end = start + 1 + slashQuery.value.length
    const before = el.value.slice(0, start)
    const after = el.value.slice(end)
    el.focus()
    el.value = before + text + after
    const cursor = before.length + text.length
    el.setSelectionRange(cursor, cursor)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    endSlash()
    return
  }
  if (!el) {
    const current = commentDraft.value
    commentDraft.value = current ? `${current}\n\n${text}` : text
    return
  }
  el.focus()
  const cursorStart = el.selectionStart
  const cursorEnd = el.selectionEnd
  el.setRangeText(text, cursorStart, cursorEnd, 'end')
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function onTextareaKeydown(event: KeyboardEvent) {
  // Forward navigation keys to the picker when slash mode is active.
  if (!slashActive.value || !templatePicker.value)
    return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    templatePicker.value.next()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    templatePicker.value.prev()
    return
  }
  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (templatePicker.value.confirm()) {
      event.preventDefault()
      event.stopPropagation()
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    endSlash()
  }
}

function onTemplatePickerCancel() {
  // Picker was dismissed by user (Esc, click-outside). Drop slash mode but
  // leave the `/...` text in the textarea — user can keep editing.
  slashStart.value = null
  slashQuery.value = ''
}

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
  <PanelDetailTemplatePicker
    ref="templatePicker"
    v-model:open="templatePickerOpen"
    :context="templateContext"
    :external-query="slashActive ? slashQuery : undefined"
    :external-focus="slashActive"
    @pick="insertTemplate"
    @cancel="onTemplatePickerCancel"
  >
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
        @input="onTextareaInput"
        @keyup.arrow-left="onTextareaSelectionChange"
        @keyup.arrow-right="onTextareaSelectionChange"
        @keyup.arrow-up="onTextareaSelectionChange"
        @keyup.arrow-down="onTextareaSelectionChange"
        @click="onTextareaSelectionChange"
        @keydown="onTextareaKeydown"
        @keydown.meta.enter.exact.prevent.stop="submitComment"
        @keydown.ctrl.enter.exact.prevent.stop="submitComment"
        @keydown.meta.shift.enter.prevent.stop="closeWithComment"
        @keydown.ctrl.shift.enter.prevent.stop="closeWithComment"
        @keydown.meta.period.exact.prevent.stop="templatePickerOpen = true"
        @keydown.ctrl.period.exact.prevent.stop="templatePickerOpen = true"
      />
      <UiWithCommand
        command="comment.focus"
        tone="muted"
        class="absolute bottom-2 right-2 pointer-events-none peer-focus:op0 transition-opacity"
      />
    </div>
    <div class="flex items-center gap-2 px-2 py-1.5 border-t border-base">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs color-muted hover:color-active hover:bg-active focus-visible:bg-active focus-visible:color-active outline-none transition"
        :class="{ 'bg-active color-active': templatePickerOpen }"
        :aria-haspopup="true"
        :aria-expanded="templatePickerOpen"
        aria-label="Insert saved reply (⌘.)"
        data-testid="comment-template-trigger"
        title="Insert saved reply (⌘.)"
        @click="templatePickerOpen = !templatePickerOpen"
      >
        <span class="i-ph-chat-circle-text-duotone text-base" />
        <span>Saved replies</span>
      </button>
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
  </PanelDetailTemplatePicker>
</template>
