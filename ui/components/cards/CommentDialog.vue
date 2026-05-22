<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  /** Card project the composer should target. */
  projectId: string
  itemNumber: number
  kind: 'issue' | 'pull'
}>()

const emit = defineEmits<{
  /** Any composer action (comment / close-with-comment / reopen / etc.) successfully queued.
   *  Forwards the new queue entry id when the composer reported one. */
  submitted: [opId: string | null]
}>()

// Provide a detail scope locally so PanelDetailComposer reads the right
// project's pending ops + state.
provideDetailScope({ projectId: props.projectId })

const composerRef = ref<{ focus: () => void } | null>(null)

watch(open, async (next) => {
  if (next) {
    await nextTick()
    composerRef.value?.focus()
  }
})

function onSubmitted(opId: string | null) {
  open.value = false
  emit('submitted', opId)
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="`Comment on ${kind === 'pull' ? 'pull request' : 'issue'} #${itemNumber}`"
    icon="i-octicon-comment-16"
    width="w-[min(92vw,40rem)]"
  >
    <div class="px-5 py-4 flex flex-col gap-2">
      <PanelDetailComposer
        ref="composerRef"
        :number="itemNumber"
        :kind="kind"
        @submitted="onSubmitted"
      />
      <p class="text-xs color-faint">
        <span class="kbd">Esc</span> to cancel.
      </p>
    </div>
  </UiModal>
</template>
