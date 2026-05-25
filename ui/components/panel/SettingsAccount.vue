<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCurrentUser } from '../../composables/useCurrentUser'
import DisplayAuthor from '../display/Author.vue'

const props = defineProps<{
  /** Whether the parent dialog is open and this tab is active. */
  active: boolean
}>()

const { currentUser, override, setOverride } = useCurrentUser()

const editing = ref(false)
const login = ref('')
const name = ref('')
const avatarUrl = ref('')

const avatarInvalid = computed(() => {
  const v = avatarUrl.value.trim()
  return v.length > 0 && !v.startsWith('https://')
})

const isOverridden = computed(() => override.value !== null)

function syncFromState() {
  login.value = override.value?.login ?? currentUser.value?.login ?? ''
  name.value = override.value?.name ?? currentUser.value?.name ?? ''
  avatarUrl.value = override.value?.avatarUrl ?? ''
}

watch(() => props.active, (value) => {
  if (value) {
    syncFromState()
    editing.value = false
  }
}, { immediate: true })

// Keep view-mode display in sync if state changes outside (e.g., another tab).
watch([override, currentUser], () => {
  if (!editing.value)
    syncFromState()
}, { deep: true })

function startEdit() {
  syncFromState()
  editing.value = true
}

function cancelEdit() {
  syncFromState()
  editing.value = false
}

function applyEdit() {
  if (avatarInvalid.value)
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
  editing.value = false
}

function resetToAuthenticated() {
  setOverride(null)
  editing.value = false
}
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="settings-account">
    <header class="flex items-center gap-1.5">
      <span class="i-ph-user-circle-duotone color-active text-sm" />
      <h3 class="text-sm font-medium">Account</h3>
    </header>
    <p class="text-xs color-muted">
      Identity used for pending comments. By default, ghfs uses your <code class="font-mono">gh auth</code> identity — override it here when needed. Stored in <code class="font-mono">.ghfs/.ui.json</code>.
    </p>

    <!-- View mode -->
    <template v-if="!editing">
      <div class="flex items-center gap-3 mt-1 p-3 border border-base rounded bg-base/40">
        <DisplayAuthor
          v-if="currentUser?.login"
          :author="{ login: currentUser.login, avatarUrl: currentUser.avatarUrl, name: currentUser.name }"
          :size="40"
          :link="false"
        />
        <span v-else class="i-ph-user-circle-duotone text-4xl color-muted" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate" data-testid="settings-account-login">
            {{ currentUser?.login ? `@${currentUser.login}` : 'No authenticated user' }}
          </div>
          <div v-if="currentUser?.name" class="text-xs color-muted truncate" data-testid="settings-account-name">
            {{ currentUser.name }}
          </div>
          <div v-if="isOverridden" class="text-[11px] color-yellow-700 dark:color-yellow-300 flex items-center gap-1 mt-0.5">
            <span class="i-ph-user-switch-duotone" />
            <span>Overridden</span>
          </div>
        </div>
        <button
          type="button"
          class="btn-action-sm shrink-0"
          data-testid="settings-account-edit"
          @click="startEdit"
        >
          <span class="i-ph-pencil-duotone" />
          <span>Edit</span>
        </button>
      </div>
    </template>

    <!-- Edit mode -->
    <template v-else>
      <div class="flex flex-col gap-2 mt-1 p-3 border border-base rounded bg-base/40">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-sm">
            <span class="color-muted text-xs">Handle</span>
            <input
              v-model="login"
              type="text"
              placeholder="octocat"
              class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
              data-testid="settings-account-input-login"
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="color-muted text-xs">Display name</span>
            <input
              v-model="name"
              type="text"
              placeholder="The Octocat"
              class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
              data-testid="settings-account-input-name"
            >
          </label>
        </div>
        <label class="flex flex-col gap-1 text-sm">
          <span class="color-muted text-xs">Avatar URL (https only)</span>
          <input
            v-model="avatarUrl"
            type="url"
            placeholder="https://…"
            class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            :class="{ 'border-red-500/60': avatarInvalid }"
            data-testid="settings-account-input-avatar"
          >
          <span v-if="avatarInvalid" class="text-xs color-red-500">Must start with https://</span>
        </label>
        <div class="flex items-center gap-2 mt-1">
          <button
            type="button"
            class="btn-action-sm text-xs"
            data-testid="settings-account-reset"
            @click="resetToAuthenticated"
          >
            <span class="i-ph-arrow-counter-clockwise-duotone" />
            Reset to gh user
          </button>
          <div class="flex-1" />
          <button
            type="button"
            class="btn-action-sm text-xs"
            data-testid="settings-account-cancel"
            @click="cancelEdit"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary text-xs"
            :disabled="avatarInvalid"
            data-testid="settings-account-save"
            @click="applyEdit"
          >
            <span class="i-ph-floppy-disk-duotone" />
            Save
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
