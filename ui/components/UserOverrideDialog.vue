<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { currentUser, override, setOverride } = useCurrentUser()

const login = ref('')
const name = ref('')
const avatarUrl = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen)
    return
  login.value = override.value?.login ?? currentUser.value?.login ?? ''
  name.value = override.value?.name ?? currentUser.value?.name ?? ''
  avatarUrl.value = override.value?.avatarUrl ?? ''
}, { immediate: true })

const avatarUrlInvalid = computed(() => {
  const v = avatarUrl.value.trim()
  return v.length > 0 && !v.startsWith('https://')
})

function apply() {
  if (avatarUrlInvalid.value)
    return
  const next = {
    login: login.value.trim() || undefined,
    name: name.value.trim() || undefined,
    avatarUrl: avatarUrl.value.trim() || undefined,
  }
  if (!next.login && !next.name && !next.avatarUrl)
    setOverride(null)
  else
    setOverride(next)
  emit('update:open', false)
}

function resetToAuthenticated() {
  setOverride(null)
  emit('update:open', false)
}

function openModel(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="openModel">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40 backdrop-blur-sm z-60" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base border border-base rounded-lg shadow-xl w-[min(92vw,26rem)] z-60 flex flex-col overflow-hidden"
      >
        <header class="px-5 py-3 border-b border-base flex items-center gap-2">
          <span class="i-octicon-person-16 color-active" />
          <DialogTitle class="font-medium">Override user</DialogTitle>
        </header>
        <DialogDescription class="sr-only">Override the handle, name, and avatar shown for your pending comments.</DialogDescription>

        <form class="px-5 py-4 flex flex-col gap-3" @submit.prevent="apply">
          <label class="flex flex-col gap-1 text-sm">
            <span class="color-muted text-xs">Handle</span>
            <input
              v-model="login"
              type="text"
              placeholder="octocat"
              class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active"
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="color-muted text-xs">Display name (optional)</span>
            <input
              v-model="name"
              type="text"
              placeholder="The Octocat"
              class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active"
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="color-muted text-xs">Avatar URL (optional, https only)</span>
            <input
              v-model="avatarUrl"
              type="url"
              placeholder="https://…"
              class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active"
              :class="{ 'border-red-500/60': avatarUrlInvalid }"
            >
            <span v-if="avatarUrlInvalid" class="text-xs color-red-500">Must start with https://</span>
          </label>
          <p class="text-xs color-muted">
            Leave empty to use the <code class="font-mono">gh auth</code> identity.
            Stored in <code class="font-mono">.ghfs/.ui.json</code>.
          </p>
          <div class="flex items-center gap-2 pt-1">
            <button
              type="button"
              class="btn-action text-sm"
              @click="resetToAuthenticated"
            >
              Reset to gh user
            </button>
            <div class="flex-1" />
            <button
              type="button"
              class="btn-action text-sm"
              @click="openModel(false)"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn-primary text-sm"
              :disabled="avatarUrlInvalid"
            >
              Save
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
