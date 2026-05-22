<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const { currentUser, override, setOverride } = useCurrentUser()

const login = ref('')
const name = ref('')
const avatarUrl = ref('')

watch(open, (isOpen) => {
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
  open.value = false
}

function resetToAuthenticated() {
  setOverride(null)
  open.value = false
}
</script>

<template>
  <UiModal
    v-model:open="open"
    title="Override user"
    icon="i-ph-user-circle-duotone"
    width="w-[min(92vw,28rem)]"
    description="Override the handle, name, and avatar shown for your pending comments."
  >
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
    </form>
    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        @click="resetToAuthenticated"
      >
        Reset to gh user
      </button>
      <div class="flex-1" />
      <button
        type="button"
        class="btn-action-sm"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary text-sm"
        :disabled="avatarUrlInvalid"
        @click="apply"
      >
        Save
      </button>
    </template>
  </UiModal>
</template>
