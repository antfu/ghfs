<script setup lang="ts">
const props = defineProps<{
  current: string
}>()

const emit = defineEmits<{
  close: []
  changed: [cwd: string]
}>()

const rpc = useRpc()

const input = ref(props.current)
const submitting = ref(false)
const error = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

async function submit() {
  const value = input.value.trim()
  if (!value || value === props.current) {
    emit('close')
    return
  }
  submitting.value = true
  error.value = null
  try {
    const result = await rpc.hubSetRoot(value)
    emit('changed', result.cwd)
    emit('close')
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    submitting.value = false
  }
}

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget)
    emit('close')
}

onMounted(() => {
  inputEl.value?.focus()
  inputEl.value?.select()
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    data-testid="hub-root-dialog"
    @click="onBackdrop"
    @keydown.escape="emit('close')"
  >
    <form
      class="bg-base border border-base rounded-lg max-w-lg w-full mx-4 shadow-2xl flex flex-col"
      @submit.prevent="submit"
    >
      <header class="flex items-center gap-3 px-5 py-4 border-b border-base">
        <span class="i-octicon-file-directory-16 color-active" />
        <h2 class="text-sm font-semibold">Change hub root</h2>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-icon"
          aria-label="Close"
          @click="emit('close')"
        >
          <span class="i-octicon-x-16" />
        </button>
      </header>
      <main class="px-5 py-4 flex flex-col gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs color-muted">Absolute path to the parent directory of your projects</span>
          <input
            ref="inputEl"
            v-model="input"
            type="text"
            data-testid="hub-root-input"
            placeholder="/Users/me/projects"
            class="border border-base rounded bg-base/50 px-2.5 py-1.5 text-sm font-mono outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            :disabled="submitting"
          >
        </label>
        <p class="text-xs color-muted">
          Tip: use <code class="kbd">~</code> for your home directory. Enabled projects are remembered per hub root, so switching back returns to the previous selection.
        </p>
        <div v-if="error" class="text-xs color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
          <span class="i-octicon-alert-16 mt-0.5 shrink-0" />
          <span>{{ error }}</span>
        </div>
      </main>
      <footer class="px-5 py-3 border-t border-base flex items-center justify-end gap-2 bg-base/40">
        <button
          type="button"
          class="btn-action text-xs"
          :disabled="submitting"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary text-xs flex items-center gap-1.5"
          data-testid="hub-root-apply"
          :disabled="submitting || !input.trim() || input.trim() === current"
        >
          <span :class="submitting ? 'i-octicon-sync-16 animate-spin' : 'i-octicon-check-16'" />
          <span>{{ submitting ? 'Applying…' : 'Apply' }}</span>
        </button>
      </footer>
    </form>
  </div>
</template>
