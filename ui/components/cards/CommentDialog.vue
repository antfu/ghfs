<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  itemNumber: number | null
  kind: 'issue' | 'pull'
  /** True when the close action is meaningful (item still open, no pending close). */
  canClose?: boolean
}>()

const emit = defineEmits<{
  submit: [body: string, options: { close: boolean }]
  cancel: []
}>()

const body = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const kindLabel = computed(() => (props.kind === 'pull' ? 'pull request' : 'issue'))
const hasBody = computed(() => body.value.trim().length > 0)

watch(open, async (next) => {
  if (next) {
    body.value = ''
    await nextTick()
    textarea.value?.focus()
  }
})

function submitComment() {
  emit('submit', body.value, { close: false })
  open.value = false
}

function submitCloseWithComment() {
  emit('submit', body.value, { close: true })
  open.value = false
}

function cancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="`Comment on ${kindLabel}${itemNumber != null ? ` #${itemNumber}` : ''}`"
    icon="i-octicon-comment-16"
    width="w-[min(92vw,38rem)]"
  >
    <div class="px-5 py-4 flex flex-col gap-3">
      <textarea
        ref="textarea"
        v-model="body"
        rows="7"
        :placeholder="`Leave a comment on this ${kindLabel}…`"
        class="w-full border border-base rounded-lg bg-base outline-none px-3 py-2 text-sm resize-none font-sans focus:border-active focus:ring-2 focus:ring-primary-500/30"
        @keydown.meta.enter.prevent="submitComment"
        @keydown.ctrl.enter.prevent="submitComment"
      />
      <p class="text-xs color-faint">
        Submit as a comment, or close the {{ kindLabel }} together with your comment.
      </p>
    </div>
    <template #footer>
      <button type="button" class="btn-action text-sm" @click="cancel">
        Cancel
      </button>
      <button
        type="button"
        class="btn-action text-sm"
        :disabled="!canClose"
        :title="canClose ? `Close this ${kindLabel} together with the comment` : `This ${kindLabel} is already closed or has a pending close`"
        data-testid="comment-dialog-close-with-comment"
        @click="submitCloseWithComment"
      >
        <span class="i-octicon-x-circle-16 color-red-500 dark:color-red-400" />
        Close in the comment
      </button>
      <button
        type="button"
        class="btn-primary text-sm"
        :disabled="!hasBody"
        data-testid="comment-dialog-comment"
        @click="submitComment"
      >
        <span class="i-octicon-comment-16" />
        Comment
        <UiKbd keys="⌘ ↵" tone="muted" />
      </button>
    </template>
  </UiModal>
</template>
