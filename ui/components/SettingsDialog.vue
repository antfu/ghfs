<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const isDark = useDark()
const hub = useHubState()
const hubSettings = useHubSettings()
const ui = useUiState()

const mode = computed<'hub' | 'project'>(() => (hub.capabilities.value?.mode === 'hub' ? 'hub' : 'project'))

// Hub root section
const rootDraft = ref('')
const rootError = ref<string | null>(null)
const savingRoot = ref(false)

// Auto-sync section: minutes (UI) ↔ ms (RPC). 0 means disabled.
const intervalMinutes = ref<number>(0)

watch(open, async (value) => {
  if (!value)
    return
  rootError.value = null
  rootDraft.value = hub.hubCwd.value ?? ''
  if (mode.value === 'hub') {
    await hubSettings.load()
    const ms = hubSettings.settings.value?.autoSyncIntervalMs
    intervalMinutes.value = ms ? Math.round(ms / 60_000) : 0
  }
  else {
    const ms = ui.uiState.autoSyncIntervalMs
    intervalMinutes.value = ms ? Math.round(ms / 60_000) : 0
  }
})

async function applyRoot() {
  const value = rootDraft.value.trim()
  if (!value || value === hub.hubCwd.value)
    return
  savingRoot.value = true
  rootError.value = null
  try {
    const rpc = useRpc()
    await rpc.hubSetRoot(value)
  }
  catch (err) {
    rootError.value = (err as Error).message
  }
  finally {
    savingRoot.value = false
  }
}

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
  <Modal
    v-model:open="open"
    title="Settings"
    icon="i-ph-gear-six-duotone"
    width="w-[min(92vw,36rem)]"
    data-testid="settings-dialog"
  >
    <div class="px-5 py-4 flex flex-col gap-6">
      <!-- Hub root (hub mode only) -->
      <section v-if="mode === 'hub'" class="flex flex-col gap-2">
        <header class="flex items-center gap-1.5">
          <span class="i-ph-folder-duotone color-active text-sm" />
          <h3 class="text-sm font-medium">Hub root</h3>
        </header>
        <p class="text-xs color-muted">Parent directory the hub scans for projects. Each hub root remembers its own enabled-project list.</p>
        <div class="flex gap-2">
          <input
            v-model="rootDraft"
            type="text"
            class="flex-1 border border-base rounded bg-base px-2.5 py-1.5 text-sm font-mono outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            placeholder="/Users/me/projects"
            data-testid="settings-hub-root-input"
          >
          <button
            type="button"
            class="btn-action-sm"
            data-testid="settings-hub-root-apply"
            :disabled="savingRoot || !rootDraft.trim() || rootDraft.trim() === hub.hubCwd.value"
            @click="applyRoot"
          >
            <span :class="savingRoot ? 'i-octicon-sync-16 animate-spin' : 'i-ph-check-bold'" />
            <span>Apply</span>
          </button>
        </div>
        <p v-if="rootError" class="text-xs color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
          <span class="i-ph-warning-duotone mt-0.5 shrink-0" />
          <span>{{ rootError }}</span>
        </p>
      </section>

      <!-- Auto-sync -->
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

      <!-- UI -->
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
      </section>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        @click="open = false"
      >
        Close
      </button>
    </template>
  </Modal>
</template>
