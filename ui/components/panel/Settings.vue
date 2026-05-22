<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const isDark = useDark()
const collapseBotComments = useCollapseBotComments()
const hub = useHubState()
const hubSettings = useHubSettings()
const ui = useUiState()

const mode = computed<'hub' | 'project'>(() => (hub.capabilities.value?.mode === 'hub' ? 'hub' : 'project'))

const rootDraft = ref('')
const rootError = ref<string | null>(null)
const adding = ref(false)
const pendingRemove = ref<string | null>(null)
const removing = ref<string | null>(null)

// Auto-sync section: minutes (UI) ↔ ms (RPC). 0 means disabled.
const intervalMinutes = ref<number>(0)

watch(open, async (value) => {
  if (!value) {
    pendingRemove.value = null
    return
  }
  rootError.value = null
  rootDraft.value = ''
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

async function addRoot() {
  const value = rootDraft.value.trim()
  if (!value || adding.value)
    return
  adding.value = true
  rootError.value = null
  try {
    const rpc = useRpc()
    const info = await rpc.$call('ghfs:hub-add-root', value)
    hub.setHubInfo(info)
    rootDraft.value = ''
  }
  catch (err) {
    rootError.value = (err as Error).message
  }
  finally {
    adding.value = false
  }
}

function requestRemove(path: string) {
  pendingRemove.value = path
}

function cancelRemove() {
  pendingRemove.value = null
}

async function confirmRemove(path: string) {
  if (removing.value)
    return
  removing.value = path
  rootError.value = null
  try {
    const rpc = useRpc()
    const info = await rpc.$call('ghfs:hub-remove-root', path)
    hub.setHubInfo(info)
    pendingRemove.value = null
  }
  catch (err) {
    rootError.value = (err as Error).message
  }
  finally {
    removing.value = null
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
  <UiModal
    v-model:open="open"
    title="Settings"
    icon="i-ph-gear-six-duotone"
    width="w-[min(92vw,36rem)]"
    data-testid="settings-dialog"
  >
    <div class="px-5 py-4 flex flex-col gap-6">
      <!-- Projects (hub mode only) -->
      <section v-if="mode === 'hub'" class="flex flex-col gap-2">
        <header class="flex items-center gap-1.5">
          <span class="i-ph-sliders-duotone color-active text-sm" />
          <h3 class="text-sm font-medium">Projects</h3>
        </header>
        <p class="text-xs color-muted">Choose which scanned repositories appear in the hub.</p>
        <div>
          <UiWithCommand v-slot="{ execute, disabled }" command="hub.manage">
            <button
              type="button"
              class="btn-action-sm"
              data-testid="settings-manage-projects"
              :disabled="disabled"
              @click="execute"
            >
              <span class="i-ph-sliders-duotone" />
              <span>Manage projects</span>
            </button>
          </UiWithCommand>
        </div>
      </section>

      <!-- Hub roots (hub mode only) -->
      <section v-if="mode === 'hub'" class="flex flex-col gap-2">
        <header class="flex items-center gap-1.5">
          <span class="i-ph-folder-duotone color-active text-sm" />
          <h3 class="text-sm font-medium">Hub roots</h3>
        </header>
        <p class="text-xs color-muted">Directories the hub scans for projects. Add as many as you like — all of their enabled projects appear together on the hub home.</p>

        <ul
          v-if="hub.hubRoots.value.length > 0"
          class="flex flex-col gap-1 border border-base rounded bg-base/40"
          data-testid="settings-hub-roots-list"
        >
          <li
            v-for="path in hub.hubRoots.value"
            :key="path"
            class="flex items-center gap-2 px-2.5 py-1.5 border-b border-base last:border-b-0"
            data-testid="settings-hub-root-row"
            :data-path="path"
          >
            <span class="i-ph-folder-duotone color-muted shrink-0 text-sm" />
            <span class="flex-1 truncate text-xs font-mono" :title="path">{{ path }}</span>
            <template v-if="pendingRemove === path">
              <button
                type="button"
                class="btn-action-sm text-xs"
                data-testid="settings-hub-root-remove-cancel"
                :disabled="removing === path"
                @click="cancelRemove"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-action-sm text-xs color-yellow-700 dark:color-yellow-300"
                data-testid="settings-hub-root-remove-confirm"
                :disabled="removing === path"
                @click="confirmRemove(path)"
              >
                <span :class="removing === path ? 'i-octicon-sync-16 animate-spin' : 'i-ph-trash-duotone'" />
                <span>Confirm</span>
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn-action-sm text-xs"
              data-testid="settings-hub-root-remove"
              :aria-label="`Remove ${path}`"
              @click="requestRemove(path)"
            >
              <span class="i-ph-x-bold" />
              <span>Remove</span>
            </button>
          </li>
        </ul>
        <p v-else class="text-xs color-muted italic">
          No hub roots configured. Add one to start scanning for projects.
        </p>

        <div class="flex gap-2">
          <input
            v-model="rootDraft"
            type="text"
            class="flex-1 border border-base rounded bg-base px-2.5 py-1.5 text-sm font-mono outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
            placeholder="/Users/me/projects"
            data-testid="settings-hub-root-add-input"
            @keydown.enter="addRoot"
          >
          <button
            type="button"
            class="btn-action-sm"
            data-testid="settings-hub-root-add"
            :disabled="adding || !rootDraft.trim()"
            @click="addRoot"
          >
            <span :class="adding ? 'i-octicon-sync-16 animate-spin' : 'i-ph-plus-bold'" />
            <span>Add</span>
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

    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        @click="open = false"
      >
        Close
      </button>
    </template>
  </UiModal>
</template>
