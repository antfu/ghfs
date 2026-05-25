<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { HubScannedProject } from '#ghfs/rpc-types'
import { useHubState } from '../../composables/useHubState'
import { useRpc } from '../../composables/useRpc'
import DisplayProjectIcon from '../display/ProjectIcon.vue'
import UiEmptyState from '../ui/EmptyState.vue'
import UiIconButton from '../ui/IconButton.vue'
import UiSearchField from '../ui/SearchField.vue'

const props = defineProps<{
  /** Whether the parent dialog is open — triggers an initial scan when shown. */
  active: boolean
}>()

const rpc = useRpc()
const hub = useHubState()

// ── Hub roots (top section) ───────────────────────────────────────────
const rootDraft = ref('')
const rootError = ref<string | null>(null)
const adding = ref(false)
const pendingRemove = ref<string | null>(null)
const removing = ref<string | null>(null)

async function addRoot() {
  const value = rootDraft.value.trim()
  if (!value || adding.value)
    return
  adding.value = true
  rootError.value = null
  try {
    const info = await rpc.$call('ghfs:hub-add-root', value)
    hub.setHubInfo(info)
    rootDraft.value = ''
    await refresh()
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
    const info = await rpc.$call('ghfs:hub-remove-root', path)
    hub.setHubInfo(info)
    pendingRemove.value = null
    await refresh()
  }
  catch (err) {
    rootError.value = (err as Error).message
  }
  finally {
    removing.value = null
  }
}

// ── Scanned projects (bottom section) ─────────────────────────────────
const items = ref<HubScannedProject[]>([])
const loading = ref(false)
const scanError = ref<string | null>(null)
const search = ref('')
const busyPath = ref<string | null>(null)

async function refresh() {
  if (hub.hubRoots.value.length === 0) {
    items.value = []
    scanError.value = null
    return
  }
  loading.value = true
  scanError.value = null
  try {
    items.value = await rpc.$call('ghfs:hub-scan')
  }
  catch (err) {
    scanError.value = (err as Error).message
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
        await rpc.$call('ghfs:hub-disable', project.id)
        entry.enabled = false
      }
    }
    else {
      await rpc.$call('ghfs:hub-enable', entry.path)
      entry.enabled = true
    }
  }
  catch (err) {
    scanError.value = (err as Error).message
  }
  finally {
    busyPath.value = null
  }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q))
})

const enabledCount = computed(() => items.value.filter(i => i.enabled).length)

watch(() => props.active, (value) => {
  if (!value) {
    pendingRemove.value = null
    return
  }
  rootError.value = null
  rootDraft.value = ''
  void refresh()
}, { immediate: true })

// Re-scan whenever the hub-roots list changes, even if mutated outside this
// component (e.g. another tab, another window, or the CLI).
watch(() => hub.hubRoots.value.join('|'), () => {
  if (props.active)
    void refresh()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Hub roots -->
    <section class="flex flex-col gap-2">
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

    <!-- Scanned projects -->
    <section class="flex flex-col gap-2" data-testid="hub-project-picker">
      <header class="flex items-center gap-1.5">
        <span class="i-ph-sliders-duotone color-active text-sm" />
        <h3 class="text-sm font-medium">Projects</h3>
        <span class="text-xs color-muted">{{ enabledCount }} / {{ items.length }} enabled</span>
        <div class="flex-1" />
        <UiIconButton
          icon="i-octicon-sync-16"
          size="sm"
          tooltip="Re-scan hub roots"
          aria-label="Re-scan"
          :disabled="loading"
          :spinning="loading"
          @click="refresh"
        />
      </header>

      <div class="sticky top-12 z-1 bg-base -mx-1 px-1 py-1">
        <UiSearchField v-model="search" placeholder="Filter by name or path…" />
      </div>

      <UiEmptyState v-if="loading" size="sm">
        <span class="i-octicon-sync-16 animate-spin text-xl color-active mb-2" />
        <p class="text-sm color-muted">Scanning for git repositories…</p>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="scanError"
        icon="i-ph-warning-duotone"
        color="yellow"
        :title="scanError"
      />

      <ul
        v-else-if="filtered.length"
        class="flex flex-col border border-base rounded bg-base/40 overflow-hidden"
      >
        <li
          v-for="entry in filtered"
          :key="entry.path"
          class="flex items-center gap-3 px-3 py-2 border-b border-base last:border-b-0 hover:bg-active transition"
          :data-testid="entry.enabled ? 'hub-picker-enabled' : 'hub-picker-disabled'"
          :data-path="entry.path"
        >
          <DisplayProjectIcon
            :project="{ id: entry.path, repo: entry.repo }"
            :icon-data-url="entry.iconDataUrl"
            :size="28"
            :class="entry.enabled ? 'ring-1 ring-primary-500/30' : ''"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium font-mono truncate" :class="entry.enabled ? '' : 'color-muted'">{{ entry.repo }}</div>
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

      <UiEmptyState
        v-else-if="hub.hubRoots.value.length === 0"
        icon="i-ph-folder-duotone"
        title="No hub roots configured."
        message="Add a hub root above to scan for projects."
      />

      <UiEmptyState
        v-else
        icon="i-ph-magnifying-glass-duotone"
        :title="search ? `No projects match “${search}”.` : 'No git repositories found in the configured hub roots.'"
      />
    </section>
  </div>
</template>
