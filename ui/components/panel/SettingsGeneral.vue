<script setup lang="ts">
const props = defineProps<{
  /** Whether the parent dialog is open — triggers initial load of interval value. */
  active: boolean
}>()

const isDark = useDark()
const collapseBotComments = useCollapseBotComments()
const hub = useHubState()
const hubSettings = useHubSettings()
const ui = useUiState()
const { currentUser, override, setOverride } = useCurrentUser()

const mode = computed<'hub' | 'project'>(() => (hub.capabilities.value?.mode === 'hub' ? 'hub' : 'project'))

// Auto-sync: minutes (UI) ↔ ms (RPC). 0 means disabled.
const intervalMinutes = ref<number>(0)

// Identity override (login / name / avatar URL) — persisted in `.ghfs/.ui.json`.
const identityLogin = ref('')
const identityName = ref('')
const identityAvatarUrl = ref('')

function syncIdentityFromState() {
  identityLogin.value = override.value?.login ?? currentUser.value?.login ?? ''
  identityName.value = override.value?.name ?? currentUser.value?.name ?? ''
  identityAvatarUrl.value = override.value?.avatarUrl ?? ''
}

const identityAvatarInvalid = computed(() => {
  const v = identityAvatarUrl.value.trim()
  return v.length > 0 && !v.startsWith('https://')
})

const identityDirty = computed(() => {
  return (override.value?.login ?? currentUser.value?.login ?? '') !== identityLogin.value.trim()
    || (override.value?.name ?? currentUser.value?.name ?? '') !== identityName.value.trim()
    || (override.value?.avatarUrl ?? '') !== identityAvatarUrl.value.trim()
})

function applyIdentity() {
  if (identityAvatarInvalid.value)
    return
  const next = {
    login: identityLogin.value.trim() || undefined,
    name: identityName.value.trim() || undefined,
    avatarUrl: identityAvatarUrl.value.trim() || undefined,
  }
  if (!next.login && !next.name && !next.avatarUrl)
    setOverride(null)
  else
    setOverride(next)
}

function resetIdentity() {
  setOverride(null)
  // syncIdentityFromState will pick up the new state via the watcher below.
}

watch([override, currentUser], syncIdentityFromState, { deep: true })

async function refreshIntervalFromSource() {
  if (mode.value === 'hub') {
    await hubSettings.load()
    const ms = hubSettings.settings.value?.autoSyncIntervalMs
    intervalMinutes.value = ms ? Math.round(ms / 60_000) : 0
  }
  else {
    const ms = ui.uiState.autoSyncIntervalMs
    intervalMinutes.value = ms ? Math.round(ms / 60_000) : 0
  }
}

watch(() => props.active, (value) => {
  if (value) {
    void refreshIntervalFromSource()
    syncIdentityFromState()
  }
}, { immediate: true })

async function applyInterval(rawMinutes: number) {
  const minutes = Math.max(0, Math.round(rawMinutes))
  intervalMinutes.value = minutes
  const ms = minutes === 0 ? undefined : Math.min(Math.max(minutes * 60_000, 60_000), 3_600_000)
  if (mode.value === 'hub')
    await hubSettings.setAutoSyncIntervalMs(ms)
  else
    ui.setAutoSyncIntervalMs(ms)
}

const intervalDisplay = computed(() => {
  if (intervalMinutes.value <= 0)
    return 'Off — sync only when triggered manually.'
  if (intervalMinutes.value === 1)
    return 'Every minute.'
  return `Every ${intervalMinutes.value} minutes.`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2" data-testid="settings-identity">
      <header class="flex items-center gap-1.5">
        <span class="i-ph-user-circle-duotone color-active text-sm" />
        <h3 class="text-sm font-medium">Identity</h3>
      </header>
      <p class="text-xs color-muted">
        Handle, name, and avatar shown next to your pending comments. Leave blank to use the <code class="font-mono">gh auth</code> identity. Stored in <code class="font-mono">.ghfs/.ui.json</code>.
      </p>
      <div class="flex items-center gap-3">
        <DisplayAuthor
          v-if="currentUser?.login"
          :author="{ login: currentUser.login, avatarUrl: currentUser.avatarUrl, name: currentUser.name }"
          :size="28"
          :link="false"
        />
        <span v-else class="text-sm color-muted">No authenticated user</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-sm">
          <span class="color-muted text-xs">Handle</span>
          <input
            v-model="identityLogin"
            type="text"
            placeholder="octocat"
            class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            data-testid="settings-identity-login"
          >
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="color-muted text-xs">Display name</span>
          <input
            v-model="identityName"
            type="text"
            placeholder="The Octocat"
            class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            data-testid="settings-identity-name"
          >
        </label>
      </div>
      <label class="flex flex-col gap-1 text-sm">
        <span class="color-muted text-xs">Avatar URL (https only)</span>
        <input
          v-model="identityAvatarUrl"
          type="url"
          placeholder="https://…"
          class="bg-transparent border border-base rounded px-2 py-1 outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
          :class="{ 'border-red-500/60': identityAvatarInvalid }"
          data-testid="settings-identity-avatar"
        >
        <span v-if="identityAvatarInvalid" class="text-xs color-red-500">Must start with https://</span>
      </label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-action-sm text-xs"
          data-testid="settings-identity-reset"
          @click="resetIdentity"
        >
          <span class="i-ph-arrow-counter-clockwise-duotone" />
          Reset to gh user
        </button>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-action-sm text-xs"
          :disabled="!identityDirty || identityAvatarInvalid"
          data-testid="settings-identity-save"
          @click="applyIdentity"
        >
          <span class="i-ph-floppy-disk-duotone" />
          Save
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <header class="flex items-center gap-1.5">
        <span class="i-octicon-sync-16 color-active text-sm" />
        <h3 class="text-sm font-medium">Auto-sync</h3>
      </header>
      <p class="text-xs color-muted">{{ mode === 'hub' ? 'Re-sync every project with a token on a fixed interval.' : 'Re-sync this project on a fixed interval.' }}</p>
      <div class="flex items-center gap-2">
        <input
          :value="intervalMinutes"
          type="number"
          min="0"
          max="60"
          step="1"
          class="w-20 border border-base rounded bg-base px-2.5 py-1.5 text-sm font-mono tabular-nums outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
          data-testid="settings-auto-sync-input"
          @change="applyInterval(Number(($event.target as HTMLInputElement).value))"
        >
        <span class="text-sm color-muted">min</span>
        <span class="text-xs color-faint">·</span>
        <span class="text-xs color-muted" data-testid="settings-auto-sync-display">{{ intervalDisplay }}</span>
      </div>
      <p class="text-[11px] color-faint">Range: 1–60 minutes. Set to 0 to disable.</p>
    </section>

    <section class="flex flex-col gap-2">
      <header class="flex items-center gap-1.5">
        <span class="i-ph-paint-brush-duotone color-active text-sm" />
        <h3 class="text-sm font-medium">UI</h3>
      </header>
      <label class="flex items-center justify-between gap-3 text-sm">
        <span class="color-muted">Theme</span>
        <button
          type="button"
          class="btn-action-sm"
          data-testid="settings-theme-toggle"
          @click="isDark = !isDark"
        >
          <span :class="isDark ? 'i-ph-moon-duotone' : 'i-ph-sun-duotone'" />
          <span>{{ isDark ? 'Dark' : 'Light' }}</span>
        </button>
      </label>
      <label class="flex items-center justify-between gap-3 text-sm">
        <span class="color-muted">Collapse bot comments</span>
        <button
          type="button"
          class="btn-action-sm"
          data-testid="settings-collapse-bot-comments-toggle"
          @click="collapseBotComments = !collapseBotComments"
        >
          <span :class="collapseBotComments ? 'i-ph-toggle-right-fill color-active' : 'i-ph-toggle-left-fill color-muted'" />
          <span>{{ collapseBotComments ? 'On' : 'Off' }}</span>
        </button>
      </label>
    </section>
  </div>
</template>
