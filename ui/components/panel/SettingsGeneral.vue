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
const { offline } = useOnlineState()

const mode = computed<'hub' | 'project'>(() => (hub.capabilities.value?.mode === 'hub' ? 'hub' : 'project'))

// Auto-sync: minutes (UI) ↔ ms (RPC). 0 means disabled.
const intervalMinutes = ref<number>(0)

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
  if (value)
    void refreshIntervalFromSource()
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
      <p
        v-if="offline"
        class="text-[11px] color-yellow-700 dark:color-yellow-300 flex items-center gap-1"
        data-testid="settings-auto-sync-offline"
      >
        <span class="i-ph-cloud-slash-duotone" />
        <span>Auto-sync paused while offline.</span>
      </p>
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
