<script setup lang="ts">
const props = defineProps<{
  current: string
}>()

const emit = defineEmits<{
  changed: [cwd: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const rpc = useRpc()
const input = ref(props.current)
const submitting = ref(false)
const error = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

watch(open, (value) => {
  if (value) {
    input.value = props.current
    error.value = null
    nextTick(() => {
      inputEl.value?.focus()
      inputEl.value?.select()
    })
  }
})

async function submit() {
  const value = input.value.trim()
  if (!value || value === props.current) {
    open.value = false
    return
  }
  submitting.value = true
  error.value = null
  try {
    const result = await rpc.hubSetRoot(value)
    emit('changed', result.cwd)
    open.value = false
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    title="Change hub root"
    icon="i-ph-folder-duotone"
    width="w-[min(92vw,32rem)]"
    data-testid="hub-root-dialog"
  >
    <form class="px-5 py-4 flex flex-col gap-3" @submit.prevent="submit">
      <label class="flex flex-col gap-1.5">
        <span class="text-xs color-muted">Absolute path to the parent directory of your projects</span>
        <input
          ref="inputEl"
          v-model="input"
          type="text"
          data-testid="hub-root-input"
          placeholder="/Users/me/projects"
          class="border border-base rounded bg-base px-2.5 py-1.5 text-sm font-mono outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
          :disabled="submitting"
        >
      </label>
      <p class="text-xs color-muted">
        Tip: use <code class="kbd">~</code> for your home directory. Enabled projects are remembered per hub root, so switching back returns to the previous selection.
      </p>
      <div v-if="error" class="text-xs color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
        <span class="i-ph-warning-duotone mt-0.5 shrink-0" />
        <span>{{ error }}</span>
      </div>
    </form>
    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        :disabled="submitting"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary text-xs flex items-center gap-1.5"
        data-testid="hub-root-apply"
        :disabled="submitting || !input.trim() || input.trim() === current"
        @click="submit"
      >
        <span :class="submitting ? 'i-octicon-sync-16 animate-spin' : 'i-ph-check-bold'" />
        <span>{{ submitting ? 'Applying…' : 'Apply' }}</span>
      </button>
    </template>
  </Modal>
</template>
