<script setup lang="ts">
import type { HubScannedProject } from '../composables/useRpc'

const emit = defineEmits<{
  close: []
}>()

const rpc = useRpc()
const hub = useHubState()

const open = ref(true)
const items = ref<HubScannedProject[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const busyPath = ref<string | null>(null)

async function refresh() {
  if (hub.hubRoots.value.length === 0) {
    items.value = []
    error.value = null
    return
  }
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
  const next = !entry.enabled
  busyPath.value = entry.path
  try {
    if (!next) {
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

watch(open, (value) => {
  if (!value)
    emit('close')
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q))
})

const enabledCount = computed(() => items.value.filter(i => i.enabled).length)
</script>

<template>
  <Modal
    v-model:open="open"
    icon="i-ph-sliders-duotone"
    width="w-[min(92vw,42rem)]"
    max-height="max-h-[80vh]"
    data-testid="hub-project-picker"
  >
    <template #header>
      <span class="i-ph-sliders-duotone color-active shrink-0" />
      <span class="font-medium text-sm">Manage hub projects</span>
      <span class="text-xs color-muted">{{ enabledCount }} / {{ items.length }} enabled</span>
    </template>
    <template #actions>
      <IconButton
        icon="i-octicon-sync-16"
        size="sm"
        tooltip="Re-scan hub roots"
        aria-label="Re-scan"
        :disabled="loading"
        :spinning="loading"
        @click="refresh"
      />
    </template>

    <div class="px-5 py-2 border-b border-base">
      <SearchField v-model="search" placeholder="Filter by name or path…" />
    </div>

    <EmptyState v-if="loading" size="sm">
      <span class="i-octicon-sync-16 animate-spin text-xl color-active mb-2" />
      <p class="text-sm color-muted">Scanning for git repositories…</p>
    </EmptyState>

    <EmptyState
      v-else-if="error"
      icon="i-ph-warning-duotone"
      color="yellow"
      :title="error"
    />

    <ul v-else-if="filtered.length" class="flex flex-col">
      <li
        v-for="entry in filtered"
        :key="entry.path"
        class="flex items-center gap-3 px-5 py-2.5 border-b border-base last:border-b-0 hover:bg-active transition"
        :data-testid="entry.enabled ? 'hub-picker-enabled' : 'hub-picker-disabled'"
        :data-path="entry.path"
      >
        <span
          class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md overflow-hidden bg-#8881"
          :class="entry.enabled ? 'ring-1 ring-primary-500/30' : ''"
        >
          <img
            v-if="entry.iconDataUrl"
            :src="entry.iconDataUrl"
            :alt="entry.name"
            class="w-full h-full object-contain"
            loading="lazy"
          >
          <span v-else class="i-octicon-repo-16 color-muted" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium font-mono truncate" :class="entry.enabled ? '' : 'color-muted'">{{ entry.name }}</div>
          <div class="text-[11px] color-faint font-mono truncate" :title="entry.path">{{ entry.path }}</div>
        </div>
        <button
          type="button"
          class="btn-toggle-pill shrink-0"
          :class="entry.enabled ? 'btn-toggle-pill-on' : 'btn-toggle-pill-off'"
          :disabled="busyPath === entry.path"
          :aria-label="entry.enabled ? `Remove ${entry.name}` : `Add ${entry.name}`"
          :data-testid="entry.enabled ? 'hub-picker-toggle-remove' : 'hub-picker-toggle-add'"
          @click="toggle(entry)"
        >
          <template v-if="busyPath === entry.path">
            <span class="i-octicon-sync-16 animate-spin" />
            <span>{{ entry.enabled ? 'Removing…' : 'Adding…' }}</span>
          </template>
          <template v-else-if="entry.enabled">
            <span class="i-ph-check-bold" />
            <span>Enabled</span>
          </template>
          <template v-else>
            <span class="i-ph-plus-bold" />
            <span>Add</span>
          </template>
        </button>
      </li>
    </ul>

    <EmptyState
      v-else-if="hub.hubRoots.value.length === 0"
      icon="i-ph-folder-duotone"
      title="No hub roots configured."
      message="Add a hub root in Settings to scan for projects."
    />

    <EmptyState
      v-else
      icon="i-ph-magnifying-glass-duotone"
      :title="search ? `No projects match “${search}”.` : 'No git repositories found in the configured hub roots.'"
    />

    <template #footer>
      <span class="text-xs color-muted flex-1">
        Changes save automatically.
      </span>
    </template>
  </Modal>
</template>
