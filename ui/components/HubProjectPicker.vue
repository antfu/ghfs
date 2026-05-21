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

async function toggle(entry: HubScannedProject, next: boolean) {
  if (busyPath.value)
    return
  busyPath.value = entry.path
  try {
    if (!next && entry.enabled) {
      const project = hub.projects.value.find(p => p.path === entry.path)
      if (project) {
        await rpc.hubDisable(project.id)
        entry.enabled = false
      }
    }
    else if (next && !entry.enabled) {
      await rpc.hubEnable(entry.path)
      entry.enabled = true
    }
  }
  catch (err) {
    error.value = (err as Error).message
    entry.enabled = !next
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
        tooltip="Re-scan directory"
        aria-label="Re-scan"
        :disabled="loading"
        :spinning="loading"
        @click="refresh"
      />
      <IconButton
        icon="i-ph-x"
        size="sm"
        aria-label="Close"
        data-testid="hub-picker-close"
        @click="open = false"
      />
    </template>

    <div class="px-5 py-2 border-b border-base">
      <SearchField v-model="search" placeholder="Filter by name or path…" />
    </div>

    <EmptyState
      v-if="loading"
      size="sm"
    >
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
        class="flex items-center gap-3 px-5 py-3 border-b border-base last:border-b-0 hover:bg-active transition"
        :data-testid="entry.enabled ? 'hub-picker-enabled' : 'hub-picker-disabled'"
        :data-path="entry.path"
      >
        <span
          class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md"
          :class="entry.enabled ? 'bg-primary-500/12 color-active' : 'bg-#8881 color-muted'"
        >
          <span class="i-octicon-repo-16" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium font-mono truncate">{{ entry.name }}</div>
          <div class="text-xs color-muted font-mono truncate" :title="entry.path">{{ entry.path }}</div>
        </div>
        <Toggle
          :model-value="entry.enabled"
          :busy="busyPath === entry.path"
          :aria-label="entry.enabled ? `Disable ${entry.name}` : `Enable ${entry.name}`"
          @update:model-value="toggle(entry, $event)"
        />
      </li>
    </ul>

    <EmptyState
      v-else
      icon="i-ph-magnifying-glass-duotone"
      :title="search ? `No projects match “${search}”.` : 'No git repositories found in the hub directory.'"
    />

    <template #footer>
      <span class="text-xs color-muted flex-1">
        Toggle a project to add or remove it. Changes take effect immediately — your hub config is saved automatically.
      </span>
    </template>
  </Modal>
</template>
