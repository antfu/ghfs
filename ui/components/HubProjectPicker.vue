<script setup lang="ts">
import type { HubScannedProject } from '../composables/useRpc'

const emit = defineEmits<{
  close: []
}>()

const rpc = useRpc()
const hub = useHubState()

const items = ref<HubScannedProject[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const busyPath = ref<string | null>(null)

async function refresh() {
  loading.value = true
  error.value = null
  try {
    items.value = await rpc.hubScan()
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    loading.value = false
  }
}

async function toggle(entry: HubScannedProject) {
  if (busyPath.value)
    return
  busyPath.value = entry.path
  try {
    if (entry.enabled) {
      const project = hub.projects.value.find(p => p.path === entry.path)
      if (project) {
        await rpc.hubDisable(project.id)
        entry.enabled = false
      }
    }
    else {
      await rpc.hubEnable(entry.path)
      entry.enabled = true
    }
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    busyPath.value = null
  }
}

onMounted(() => {
  refresh()
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q))
})

const enabledCount = computed(() => items.value.filter(i => i.enabled).length)

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget)
    emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    data-testid="hub-project-picker"
    @click="onBackdrop"
    @keydown="onKeydown"
  >
    <div
      class="bg-base border border-base rounded-lg max-w-2xl w-full mx-4 shadow-2xl flex flex-col"
      style="max-height: 80vh;"
    >
      <header class="flex items-center gap-3 px-5 py-4 border-b border-base">
        <span class="i-octicon-gear-16 color-active" />
        <h2 class="text-sm font-semibold">Manage hub projects</h2>
        <span class="text-xs color-muted">{{ enabledCount }} / {{ items.length }} enabled</span>
        <div class="flex-1" />
        <TooltipButton tooltip="Re-scan directory">
          <button
            class="btn-icon"
            :disabled="loading"
            aria-label="Re-scan"
            @click="refresh"
          >
            <span class="i-octicon-sync-16" :class="loading ? 'animate-spin' : ''" />
          </button>
        </TooltipButton>
        <button
          class="btn-icon"
          aria-label="Close"
          data-testid="hub-picker-close"
          @click="emit('close')"
        >
          <span class="i-octicon-x-16" />
        </button>
      </header>

      <div class="px-5 py-2 border-b border-base/60">
        <label class="flex items-center gap-2 border border-base rounded bg-base/50 px-2 py-1 transition focus-within:border-active focus-within:ring-2 focus-within:ring-primary-500/30">
          <span class="i-octicon-search-16 color-muted shrink-0" />
          <input
            v-model="search"
            type="text"
            placeholder="Filter by name or path…"
            class="bg-transparent outline-none w-full font-sans text-sm"
          >
          <button
            v-if="search"
            class="color-muted hover:color-base shrink-0"
            aria-label="Clear"
            @click="search = ''"
          ><span class="i-octicon-x-16 text-sm" /></button>
        </label>
      </div>

      <main class="flex-1 overflow-y-auto">
        <div v-if="loading" class="px-5 py-10 color-muted text-sm flex items-center justify-center gap-2">
          <span class="i-octicon-sync-16 animate-spin" />
          <span>Scanning for git repositories…</span>
        </div>
        <div v-else-if="error" class="px-5 py-6 color-muted text-sm">
          <span class="i-octicon-alert-16 mr-1 color-yellow-600" />
          {{ error }}
        </div>
        <ul v-else-if="filtered.length" class="flex flex-col">
          <li
            v-for="entry in filtered"
            :key="entry.path"
            class="flex items-center gap-3 px-5 py-3 border-b border-base/30 last:border-b-0 hover:bg-secondary/30 transition"
            :data-testid="entry.enabled ? 'hub-picker-enabled' : 'hub-picker-disabled'"
            :data-path="entry.path"
          >
            <span
              class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md"
              :class="entry.enabled ? 'bg-primary-500/15 color-active' : 'bg-secondary/40 color-muted'"
            >
              <span class="i-octicon-repo-16" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium font-mono truncate">{{ entry.name }}</div>
              <div class="text-xs color-muted font-mono truncate" :title="entry.path">{{ entry.path }}</div>
            </div>
            <button
              class="relative inline-flex items-center h-6 w-11 rounded-full border transition focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none"
              :class="entry.enabled ? 'bg-primary-500 border-primary-500' : 'bg-base border-base'"
              :disabled="busyPath === entry.path"
              :aria-checked="entry.enabled"
              :aria-label="entry.enabled ? `Disable ${entry.name}` : `Enable ${entry.name}`"
              role="switch"
              @click="toggle(entry)"
            >
              <span
                class="absolute top-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white shadow transition-all"
                :class="entry.enabled ? 'left-[1.4rem]' : 'left-0.5'"
              >
                <span
                  v-if="busyPath === entry.path"
                  class="i-octicon-sync-16 animate-spin text-[10px] text-neutral-500"
                />
              </span>
            </button>
          </li>
        </ul>
        <div v-else class="px-5 py-10 color-muted text-sm text-center flex flex-col items-center gap-2">
          <span class="i-octicon-search-16 text-2xl op60" />
          <span v-if="search">No projects match “{{ search }}”.</span>
          <span v-else>No git repositories found in the hub directory.</span>
        </div>
      </main>

      <footer class="px-5 py-3 border-t border-base text-xs color-muted bg-base/40">
        Toggle a project to add or remove it. Changes take effect immediately — your hub config is saved automatically.
      </footer>
    </div>
  </div>
</template>
